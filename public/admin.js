import { auth, db } from "./firebase-config.js";
import { 
    collection, getDocs, doc, deleteDoc, updateDoc, addDoc, 
    onSnapshot, query, where, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { populateCitySelect } from "./locationService.js";

// Global data store for filtering
let allPosts = [];
let currentFilter = 'all'; 

// Initialisation des villes dans le filtre admin
populateCitySelect("admin-filter-city", { includeAll: true, defaultText: "Toutes les villes" });

/**
 * MODÉRATION : Actions Firestore
 */
window.adminDeletePost = async function(postId) {
    if (!confirm("Voulez-vous vraiment supprimer cette publication définitivement ?")) return;
    try {
        await deleteDoc(doc(db, "posts", postId));
        if (window.showToast) window.showToast("Publication supprimée.");
    } catch (error) {
        console.error("Erreur suppression post :", error);
    }
};

window.adminApprovePost = async function(postId) {
    try {
        await updateDoc(doc(db, "posts", postId), { 
            status: "active",
            reportsCount: 0 // Reset reports if approving
        });
        if (window.showToast) window.showToast("Publication approuvée !");
    } catch (error) {
        console.error("Erreur approbation post :", error);
    }
};

window.bloquerPost = async function(postId) {
    if (!confirm("Bloquer cette publication ? Elle ne sera plus visible.")) return;
    try {
        await updateDoc(doc(db, "posts", postId), { status: "blocked" });
        if (window.showToast) window.showToast("Publication bloquée.");
    } catch (error) {
        console.error("Erreur blocage post :", error);
    }
};

window.ignorerSignalements = async function(postId) {
    try {
        await updateDoc(doc(db, "posts", postId), { 
            reportsCount: 0,
            reportedBy: []
        });
        if (window.showToast) window.showToast("Signalements ignorés.");
    } catch (error) {
        console.error("Erreur ignore signalements :", error);
    }
};

/**
 * ÉCOUTEURS TEMPS RÉEL
 */
function listenToAdminData() {
    // 1. Écouter les Posts
    const postsRef = collection(db, "posts");
    onSnapshot(postsRef, (snapshot) => {
        allPosts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderFilteredPosts();
        updateAdminStats();
    });

    // 2. Écouter les Utilisateurs
    const usersRef = collection(db, "users");
    onSnapshot(usersRef, (snapshot) => {
        const users = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderUsers(users);
        const userCountEl = document.getElementById("admin-stat-users");
        if (userCountEl) userCountEl.textContent = users.length;
    });
}

/**
 * RENDU DES PUBLICATIONS
 */
window.setAdminFilter = function(filter) {
    currentFilter = filter;
    renderFilteredPosts();
    
    // Update tabs UI
    document.querySelectorAll('.stab').forEach(btn => {
        const type = btn.getAttribute('onclick').match(/'([^']+)'/)[1];
        btn.classList.toggle('active', type === filter);
    });
};

function renderFilteredPosts() {
    const pubBody = document.getElementById("pub-tbody");
    if (!pubBody) return;

    let filtered = allPosts;
    if (currentFilter === 'pending') {
        filtered = allPosts.filter(p => (p.status || 'active') === 'en_attente');
    } else if (currentFilter === 'flagged') {
        filtered = allPosts.filter(p => (p.reportsCount || 0) > 0).sort((a,b) => (b.reportsCount || 0) - (a.reportsCount || 0));
    } else if (currentFilter === 'removed') {
        filtered = allPosts.filter(p => p.status === 'blocked');
    }

    pubBody.innerHTML = "";
    if (filtered.length === 0) {
        pubBody.innerHTML = "<tr><td colspan='7' style='text-align:center; padding:40px; color:var(--ink-light)'>Aucune publication trouvée dans cette catégorie.</td></tr>";
        return;
    }

    filtered.forEach(data => {
        const title = data.title || "Sans titre";
        let typeText = data.postType === 'perdu' ? "Perdu" : "Trouvé";
        let typeClass = data.postType === 'perdu' ? "badge-lost" : "badge-found";
        
        const date = data.createdAt?.toDate ? data.createdAt.toDate().toLocaleDateString("fr-FR") : "-";
        
        let statusText = "Active";
        let statusClass = "badge-active";
        const st = data.status || 'active';
        if (st === 'en_attente') { statusText = "En attente"; statusClass = "badge-flagged"; }
        if (st === 'blocked') { statusText = "Bloqué"; statusClass = "badge-removed"; }
        if ((data.reportsCount || 0) > 0) { statusText = `Signalé (${data.reportsCount})`; statusClass = "badge-flagged"; }

        const html = `
            <tr>
                <td>
                    <div class="post-title-sm">${title}</div>
                    <div class="post-sub-sm">${data.category || 'Autres'}</div>
                </td>
                <td><span class="badge ${typeClass}">${typeText}</span></td>
                <td>${data.city || 'N/A'}</td>
                <td style="font-size:11px">${(data.authorPrenom || 'Vindora') + ' ' + (data.authorNom || 'User')}</td>
                <td>${date}</td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td>
                    <div class="actions-cell">
                        ${st === 'en_attente' ? `<button class="act-btn" onclick="adminApprovePost('${data.id}')">Approuver</button>` : ''}
                        ${(data.reportsCount || 0) > 0 ? `<button class="act-btn warn-btn" onclick="ignorerSignalements('${data.id}')">Ignorer</button>` : ''}
                        ${st !== 'blocked' ? `<button class="act-btn" onclick="bloquerPost('${data.id}')">Bloquer</button>` : ''}
                        <button class="act-btn danger" onclick="adminDeletePost('${data.id}')">Supprimer</button>
                    </div>
                </td>
            </tr>
        `;
        pubBody.insertAdjacentHTML("beforeend", html);
    });
}

function updateAdminStats() {
    const total = allPosts.length;
    const pending = allPosts.filter(p => p.status === 'en_attente').length;
    const flagged = allPosts.filter(p => (p.reportsCount || 0) > 0).length;

    // Badges in sidebar
    const badgePending = document.getElementById("badge-pending-count");
    if (badgePending) {
        badgePending.textContent = pending;
        badgePending.style.display = pending > 0 ? 'block' : 'none';
    }

    // Stat cards
    setText("admin-stat-total", total);
    setText("admin-stat-pending", pending);
    setText("admin-stat-flagged", flagged);
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

/**
 * RENDU DES UTILISATEURS
 */
function renderUsers(users) {
    const userBody = document.getElementById("users-tbody");
    if (!userBody) return;
    userBody.innerHTML = "";

    users.forEach(data => {
        const name = `${data.prenom || ''} ${data.nom || ''}`.trim() || "Utilisateur Vindora";
        const initials = (name.split(' ').map(n => n[0]).join('') || "UV").toUpperCase();
        
        const html = `
            <tr>
                <td>
                    <div class="user-cell">
                        <div class="user-av-sm" style="background:var(--grad)">${initials}</div>
                        <div>
                            <div class="user-name-sm">${name}</div>
                            <div class="user-email-sm">${data.email || 'N/A'}</div>
                        </div>
                    </div>
                </td>
                <td>-</td>
                <td>-</td>
                <td><span class="badge badge-normal">${data.role || 'user'}</span></td>
                <td>
                    <div class="actions-cell">
                        <button class="act-btn danger" onclick="adminDeleteUser('${data.id}')">Supprimer</button>
                    </div>
                </td>
            </tr>
        `;
        userBody.insertAdjacentHTML("beforeend", html);
    });
}

// Orchestrator
onAuthStateChanged(auth, (user) => {
    if (user) {
        listenToAdminData();
    }
});
