import { auth, db } from "./firebase-config.js";
import { 
    collection, getDocs, doc, deleteDoc, updateDoc, addDoc, 
    onSnapshot, query, where, orderBy, serverTimestamp, getCountFromServer 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { populateCitySelect } from "./locationService.js";

// Global data store
let allPosts = [];
let fStatus = 'all'; 
let fCity = 'all';
let fSearch = '';

// Variables pour le modal Avertir
let currentWarnUserId = null;
let currentWarnPostId = null;

// Initialisation des villes dans le filtre admin
populateCitySelect("admin-filter-city", { includeAll: true, defaultText: "Toutes les villes" });

/**
 * MODÉRATION : Actions Firestore
 */
window.adminDeletePost = async function(postId) {
    if (!confirm("Voulez-vous vraiment supprimer cette publication définitivement ?")) return;
    try {
        await updateDoc(doc(db, "posts", postId), { status: "deleted" });
        if (window.showToast) window.showToast("Publication marquée comme supprimée.");
    } catch (error) {
        console.error("Erreur suppression post :", error);
    }
};

window.adminApprovePost = async function(postId) {
    try {
        await updateDoc(doc(db, "posts", postId), { 
            status: "active",
            reportsCount: 0 
        });
        if (window.showToast) window.showToast("Publication approuvée !");
    } catch (error) {
        console.error("Erreur approbation post :", error);
    }
};

window.adminToggleSignal = async function(postId, currentStatus) {
    try {
        const newStatus = currentStatus === "blocked" ? "active" : "blocked";
        await updateDoc(doc(db, "posts", postId), { status: newStatus });
        const msg = newStatus === "blocked" ? "Publication signalée et masquée." : "Publication réactivée.";
        if (window.showToast) window.showToast(msg);
    } catch (error) {
        console.error("Erreur toggle signal :", error);
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
 * SYSTÈME D'ALERTES (PRÉVENTIVES OU GÉNÉRALES)
 */
window.openWarnModal = function(userId, postId = null) {
    currentWarnUserId = userId;
    currentWarnPostId = postId;
    
    // UI elements de la modal
    const title = document.getElementById("warn-modal-title");
    const desc = document.getElementById("warn-modal-desc");
    const motifWrapper = document.getElementById("warn-motif-wrapper");
    const customMsg = document.getElementById("warn-custom-msg");

    if (postId) {
        if (title) title.textContent = "Avertir pour la publication";
        if (desc) desc.textContent = "Choisissez un motif pour informer l'utilisateur de l'anomalie :";
        if (motifWrapper) motifWrapper.style.display = "block";
        if (customMsg) customMsg.style.display = "none";
    } else {
        if (title) title.textContent = "Envoyer une alerte générale";
        if (desc) desc.textContent = "Saisissez le message d'avertissement que l'utilisateur recevra :";
        if (motifWrapper) motifWrapper.style.display = "none";
        if (customMsg) {
            customMsg.style.display = "block";
            customMsg.value = "";
        }
    }

    const overlay = document.getElementById("modal-warn-overlay");
    if (overlay) overlay.classList.add("show");
};

window.closeWarnModal = function() {
    currentWarnUserId = null;
    currentWarnPostId = null;
    const overlay = document.getElementById("modal-warn-overlay");
    if (overlay) overlay.classList.remove("show");
};

window.confirmSendAlert = async function() {
    if (!currentWarnUserId) return;
    
    let motif = "";
    const motifSelect = document.getElementById("warn-motif");
    const customMsgArea = document.getElementById("warn-custom-msg");

    if (currentWarnPostId) {
        motif = motifSelect ? motifSelect.value : "Avertissement administratif";
    } else {
        motif = customMsgArea ? customMsgArea.value.trim() : "";
        if (!motif) {
            if (window.showToast) window.showToast("Veuillez saisir un message !");
            return;
        }
    }
    
    try {
        // 1. Ajouter l'alerte dans la collection 'alerts' (pour la bannière temps réel)
        await addDoc(collection(db, "alerts"), {
            destinataireId: currentWarnUserId,
            postId: currentWarnPostId || "",
            motif: motif,
            date: serverTimestamp(),
            lu: false
        });

        // 2. Ajouter une notification dans 'notifications' (pour l'historique permanent)
        await addDoc(collection(db, "notifications"), {
            userUid: currentWarnUserId,
            message: currentWarnPostId ? `Signalement : ${motif}` : `Note de l'administration : ${motif}`,
            type: "alert",
            status: "unread",
            createdAt: serverTimestamp()
        });

        // 3. Marquer le post comme 'sous_surveillance' si applicable
        if (currentWarnPostId) {
            await updateDoc(doc(db, "posts", currentWarnPostId), {
                status: "sous_surveillance",
                averti: true
            });
        }

        if (window.showToast) window.showToast("Alerte envoyée !");
        closeWarnModal();
    } catch (error) {
        console.error("Erreur envoi alerte :", error);
    }
};

/**
 * ÉCOUTEURS TEMPS RÉEL (onSnapshot)
 */
function listenToAdminData() {
    const postsRef = collection(db, "posts");
    onSnapshot(postsRef, (snapshot) => {
        allPosts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderAllTableRows(); 
        updateAdminStats();
    });

    const usersRef = collection(db, "users");
    onSnapshot(usersRef, (snapshot) => {
        const users = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderUsers(users);
    });
}

/**
 * MOTEUR DE FILTRAGE INSTANTANÉ (Toggle DOM)
 */
window.setAdminFilter = function(status) {
    fStatus = status;
    
    // Sync UI Tabs
    document.querySelectorAll('.stab').forEach(btn => {
        const typeMatch = btn.getAttribute('onclick')?.match(/'([^']+)'/);
        if (typeMatch) btn.classList.toggle('active', typeMatch[1] === status);
    });

    // Sync Dropdown
    const dropdown = document.getElementById("admin-status-dropdown");
    if (dropdown) dropdown.value = status;

    applyDomFilters();
};

window.setAdminCity = function(city) {
    fCity = city === "Toutes les villes" ? "all" : city;
    applyDomFilters();
};

window.setAdminSearch = function(query) {
    fSearch = query.toLowerCase().trim();
    applyDomFilters();
};

function applyDomFilters() {
    const rows = document.querySelectorAll("#pub-tbody tr");
    rows.forEach(row => {
        const status = row.dataset.status;
        const reports = parseInt(row.dataset.reports || 0);
        const city = row.dataset.city;
        const searchPool = row.dataset.search;

        // Condition Statut
        let matchStatus = fStatus === 'all';
        if (fStatus === 'active') matchStatus = status === 'active';
        if (fStatus === 'flagged') matchStatus = (reports > 0 || status === 'blocked' || status === 'sous_surveillance');
        if (fStatus === 'deleted') matchStatus = status === 'deleted';
        if (fStatus === 'pending') matchStatus = status === 'pending'; // Updated to match user request

        // Condition Ville
        let matchCity = fCity === 'all' || city === fCity;

        // Condition Recherche
        let matchSearch = !fSearch || searchPool.includes(fSearch);

        // Affichage final (Logic AND)
        row.style.display = (matchStatus && matchCity && matchSearch) ? "" : "none";
    });
}

/**
 * RENDU COMPLET (Une seule fois par snapshot)
 */
function renderAllTableRows() {
    const pubBody = document.getElementById("pub-tbody");
    if (!pubBody) return;
    pubBody.innerHTML = "";

    // Tri par date
    const sorted = [...allPosts].sort((a,b) => {
        const d1 = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
        const d2 = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
        return d2 - d1;
    });

    sorted.forEach(data => {
        const title = data.title || "Sans titre";
        let typeText = data.postType === 'perdu' ? "Perdu" : "Trouvé";
        let typeClass = data.postType === 'perdu' ? "badge-lost" : "badge-found";
        const dateStr = data.createdAt?.toDate ? data.createdAt.toDate().toLocaleDateString("fr-FR") : "-";
        
        let statusText = "Active";
        let statusClass = "badge-active";
        const st = data.status || 'active';
        if (st === 'pending' || st === 'en_attente') { statusText = "En attente"; statusClass = "badge-flagged"; }
        if (st === 'deleted') { statusText = "Supprimé"; statusClass = "badge-removed"; }
        if (st === 'blocked') { statusText = "Signalé"; statusClass = "badge-flagged"; }
        if (st === 'sous_surveillance') { statusText = "Surveillé"; statusClass = "badge-flagged"; }
        if ((data.reportsCount || 0) > 0 && st !== 'blocked') { 
            statusText = `Signalé (${data.reportsCount})`; 
            statusClass = "badge-flagged"; 
        }

        const searchPool = `${title} ${data.category || ''} ${data.description || ''}`.toLowerCase();

        const tr = document.createElement("tr");
        tr.dataset.status = (st === 'blocked' || st === 'sous_surveillance' || (data.reportsCount || 0) > 0) ? 'flagged' : (st === 'deleted' ? 'deleted' : 'active');
        tr.dataset.city = data.city || 'all';
        tr.dataset.reports = data.reportsCount || 0;
        tr.dataset.search = searchPool;

        tr.innerHTML = `
            <td>
                <div class="post-title-sm">${title}</div>
                <div class="post-sub-sm">${data.category || 'Autres'}</div>
            </td>
            <td><span class="badge ${typeClass}">${typeText}</span></td>
            <td>${data.city || 'N/A'}</td>
            <td style="font-size:11px">${(data.authorPrenom || 'Vindora') + ' ' + (data.authorNom || 'User')}</td>
            <td>${dateStr}</td>
            <td><span class="badge ${statusClass}">${statusText}</span></td>
            <td>
                <div class="actions-cell">
                    ${(st === 'en_attente' || st === 'pending') ? `<button class="act-btn" onclick="adminApprovePost('${data.id}')">Approuver</button>` : ''}
                    ${((data.reportsCount || 0) > 0 || st === 'blocked') ? `
                        <button class="act-btn warn-btn" onclick="ignorerSignalements('${data.id}')">Ignorer</button>
                    ` : ''}
                    
                    ${(st === 'active' || st === 'en_attente' || st === 'pending' || st === 'blocked' || st === 'sous_surveillance') ? `
                        <button class="act-btn" style="color:var(--warn)" onclick="openWarnModal('${data.authorUid}', '${data.id}')">Avertir</button>
                    ` : ''}

                    ${(st === 'active' || st === 'en_attente' || st === 'pending') ? `<button class="act-btn" onclick="adminToggleSignal('${data.id}', '${st}')">Signaler</button>` : ''}
                    ${st === 'blocked' ? `<button class="act-btn" onclick="adminToggleSignal('${data.id}', 'blocked')">Activer</button>` : ''}
                    
                    <button class="act-btn danger" onclick="adminDeletePost('${data.id}')">Supprimer</button>
                </div>
            </td>
        `;
        pubBody.appendChild(tr);
    });

    applyDomFilters();
}

/**
 * TASK: DYNAMIC DASHBOARD COUNTERS (OPTIMIZED)
 * Utilise getCountFromServer() pour économiser les ressources.
 */
async function updateAdminStats() {
    const tEl = document.getElementById("admin-stat-total");
    const fEl = document.getElementById("admin-stat-flagged");
    const pEl = document.getElementById("admin-stat-pending");
    const badgePending = document.getElementById("badge-pending-count");

    if (tEl) tEl.textContent = "...";
    if (fEl) fEl.textContent = "...";
    if (pEl) pEl.textContent = "...";

    try {
        const postsRef = collection(db, "posts");

        // 1. Total Publications
        const totalSnap = await getCountFromServer(postsRef);
        const totalCount = totalSnap.data().count;

        // 2. Signalées (reportsCount > 0)
        const flaggedQuery = query(postsRef, where("reportsCount", ">", 0));
        const flaggedSnap = await getCountFromServer(flaggedQuery);
        const flaggedCount = flaggedSnap.data().count;

        // 3. En attente (status == "pending")
        const pendingQuery = query(postsRef, where("status", "==", "pending"));
        const pendingSnap = await getCountFromServer(pendingQuery);
        const pendingCount = pendingSnap.data().count;

        if (tEl) tEl.textContent = totalCount;
        if (fEl) fEl.textContent = flaggedCount;
        if (pEl) pEl.textContent = pendingCount;

        if (badgePending) {
            badgePending.textContent = pendingCount;
            badgePending.style.display = pendingCount > 0 ? 'block' : 'none';
        }

    } catch (error) {
        console.error("Dashboard Stats Error:", error);
        if (tEl) tEl.textContent = "0";
        if (fEl) fEl.textContent = "0";
        if (pEl) pEl.textContent = "0";
        
        if (error.code === 'failed-precondition') {
            console.warn("⚠️ Index composite manquant. Cliquez sur le lien bleu ci-dessus.");
        }
    }
}

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
                        <button class="act-btn warn-btn" onclick="openWarnModal('${data.id}')">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                            Alerte
                        </button>
                        <button class="act-btn danger" onclick="adminDeleteUser('${data.id}')">Supprimer</button>
                    </div>
                </td>
            </tr>
        `;
        userBody.insertAdjacentHTML("beforeend", html);
    });
}

onAuthStateChanged(auth, (user) => {
    if (user) listenToAdminData();
});
