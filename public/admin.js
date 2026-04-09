
import { auth, db } from "./firebase-config.js";
import { collection, getDocs, doc, deleteDoc, updateDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { populateCitySelect } from "./locationService.js";

// Initialisation des villes dans le filtre admin
populateCitySelect("admin-filter-city", { includeAll: true, defaultText: "Toutes les villes" });

// ====== POSTS MODERATION ======
window.adminDeletePost = async function(postId) {
    if (!confirm("Voulez-vous vraiment supprimer cette publication définitivement (Admin) ?")) return;
    try {
        await deleteDoc(doc(db, "posts", postId));
        if (window.showToast) window.showToast("Publication supprimée avec succès.");
        loadAllPosts();
    } catch (error) {
        console.error("Erreur suppression post :", error);
        alert("Erreur de suppression.");
    }
};

window.adminApprovePost = async function(postId) {
    try {
        await updateDoc(doc(db, "posts", postId), { status: "active" });
        if (window.showToast) window.showToast("Publication approuvée et rendue active.");
        loadAllPosts();
    } catch (error) {
        console.error("Erreur approbation post :", error);
    }
};

async function loadAllPosts() {
    const pubBody = document.getElementById("pub-tbody");
    if (!pubBody) return;
    pubBody.innerHTML = "";

    try {
        const querySnapshot = await getDocs(collection(db, "posts"));
        
        if (querySnapshot.empty) {
            pubBody.innerHTML = "<tr><td colspan='7' style='text-align:center;'>Aucune publication en base.</td></tr>";
            return;
        }

        querySnapshot.forEach(function(documentSnapshot) {
            const data = documentSnapshot.data();
            const docId = documentSnapshot.id;

            const title = data.title || "Sans titre";
            let typeText = "Trouvé";
            let typeBadgeClass = "badge-found";
            let pt = (data.postType || "").toLowerCase();
            if (pt === "lost" || pt === "perdu") {
                typeText = "Perdu";
                typeBadgeClass = "badge-lost";
            }

            const city = data.city || "N/A";
            const uidDisplay = data.authorUid ? data.authorUid.substring(0, 6) + "..." : "Inconnu";

            let statusText = "Active";
            let statusBadgeClass = "badge-active";
            const postStatus = (data.status || "active").toLowerCase();
            if (postStatus.includes("resolu") || postStatus === "resolved") {
                statusText = "Résolue";
                statusBadgeClass = "badge-active"; // fallback
            } else if (postStatus === "pending" || postStatus === "flagged") {
                statusText = "Signalée";
                statusBadgeClass = "badge-flagged";
            }

            let dateStr = "-";
            if (data.createdAt && data.createdAt.seconds) {
                dateStr = new Date(data.createdAt.seconds * 1000).toLocaleDateString("fr-FR");
            }

            // String Concatenation standard
            let html = "";
            html += "<tr data-status='" + postStatus + "'>";
            html += "  <td>";
            html += "    <div class='post-title-sm'>" + title + "</div>";
            html += "    <div class='post-sub-sm'>" + (data.category || "Catégorie") + "</div>";
            html += "  </td>";
            html += "  <td><span class='badge " + typeBadgeClass + "'>" + typeText + "</span></td>";
            html += "  <td>" + city + "</td>";
            html += "  <td style='font-size: 11px'>" + uidDisplay + "</td>";
            html += "  <td>" + dateStr + "</td>";
            html += "  <td><span class='badge " + statusBadgeClass + "'>" + statusText + "</span></td>";
            html += "  <td>";
            html += "    <div class='actions-cell'>";
            html += "      <button class='act-btn' onclick='adminApprovePost(\"" + docId + "\")'>Approuver</button>";
            html += "      <button class='act-btn danger' onclick='adminDeletePost(\"" + docId + "\")'>Supprimer</button>";
            html += "    </div>";
            html += "  </td>";
            html += "</tr>";

            pubBody.insertAdjacentHTML("beforeend", html);
        });
    } catch (error) {
        console.error("Erreur chargement all posts :", error);
    }
}

// ====== USERS MANAGEMENT ======
window.adminDeleteUser = async function(userId) {
    if (!confirm("Voulez-vous supprimer ce profil utilisateur ? Son accès à l'application sera corrompu.")) return;
    try {
        await deleteDoc(doc(db, "users", userId));
        if (window.showToast) window.showToast("Utilisateur supprimé Firestore.");
        loadAllUsers();
    } catch (error) {
        console.error("Erreur suppression user :", error);
    }
};

window.adminSendAlert = async function(userId) {
    try {
        // Ajouter un doc dans la collection 'notifications'
        await addDoc(collection(db, "notifications"), {
            userId: userId,
            message: "Avertissement de la modération : L'une de vos annonces a été signalée car elle enfreint nos règles d'utilisation.",
            read: false,
            createdAt: serverTimestamp()
        });
        if (window.showToast) window.showToast("Alerte envoyée à l'utilisateur.");
        loadAllUsers();
    } catch (error) {
        console.error("Erreur lors de l'envoi de l'alerte :", error);
    }
};

async function loadAllUsers() {
    const userBody = document.getElementById("users-tbody");
    if (!userBody) return;
    userBody.innerHTML = "";

    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        
        if (querySnapshot.empty) {
            userBody.innerHTML = "<tr><td colspan='5' style='text-align:center;'>Aucun utilisateur trouvé.</td></tr>";
            return;
        }

        querySnapshot.forEach(function(documentSnapshot) {
            const data = documentSnapshot.data();
            const docId = documentSnapshot.id;

            const prenom = data.prenom || "";
            const nom = data.nom || "";
            const fullName = prenom + " " + nom;
            const initiales = (prenom.charAt(0) + nom.charAt(0)).toUpperCase() || "?";
            const email = data.email || "Email inconnu";
            const role = data.role || "user";
            
            let statusText = role === "admin" ? "Admin" : "Normal";
            let statusClass = role === "admin" ? "badge-normal" : "badge-normal";

            let html = "";
            html += "<tr>";
            html += "  <td>";
            html += "    <div class='user-cell'>";
            html += "      <div class='user-av-sm' style='background:var(--grad)'>" + initiales + "</div>";
            html += "      <div>";
            html += "        <div class='user-name-sm'>" + fullName + "</div>";
            html += "        <div class='user-email-sm'>" + email + "</div>";
            html += "      </div>";
            html += "    </div>";
            html += "  </td>";
            html += "  <td>-</td>";
            html += "  <td>-</td>";
            html += "  <td><span class='badge " + statusClass + "'>" + statusText + "</span></td>";
            html += "  <td>";
            html += "    <div class='actions-cell'>";
            if (role !== "admin") {
                html += "      <button class='act-btn warn-btn' onclick='adminSendAlert(\"" + docId + "\")'>Alerter</button>";
                html += "      <button class='act-btn danger' onclick='adminDeleteUser(\"" + docId + "\")'>Supprimer</button>";
            } else {
                html += "      <span style='font-size:11px;color:gray'>Protégé</span>";
            }
            html += "    </div>";
            html += "  </td>";
            html += "</tr>";

            userBody.insertAdjacentHTML("beforeend", html);
        });
    } catch (error) {
        console.error("Erreur chargement users :", error);
    }
}

// ====== ORCHESTRATOR ======
onAuthStateChanged(auth, function(user) {
    if (user) {
        // Double security check to ensure loadAllPosts doesn't run for unauthorized UI glitching
        if(window.currentUser && window.currentUser.role === 'admin') {
            loadAllPosts();
            loadAllUsers();
        } else {
            // We can assume session.js will kick them out, but we let's wait a bit and load anyway 
            // since session.js sets window.currentUser asynchronously.
            // A safer approach:
            setTimeout(() => {
                loadAllPosts();
                loadAllUsers();
            }, 800);
        }
    }
});
