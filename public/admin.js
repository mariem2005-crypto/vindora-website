import { auth, db } from "./firebase-config.js";
import { 
    collection, getDocs, doc, deleteDoc, updateDoc, addDoc, 
    onSnapshot, query, where, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { populateCitySelect } from "./locationService.js";

// Global data store
let allPosts = [];
let fStatus = 'all'; 
let fCity = 'all';
let fSearch = '';

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
        if (fStatus === 'flagged') matchStatus = (reports > 0 || status === 'blocked');
        if (fStatus === 'deleted') matchStatus = status === 'deleted';
        if (fStatus === 'pending') matchStatus = status === 'en_attente';

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
        if (st === 'en_attente') { statusText = "En attente"; statusClass = "badge-flagged"; }
        if (st === 'deleted') { statusText = "Supprimé"; statusClass = "badge-removed"; }
        if (st === 'blocked') { statusText = "Signalé"; statusClass = "badge-flagged"; }
        if ((data.reportsCount || 0) > 0) { statusText = `Signalé (${data.reportsCount})`; statusClass = "badge-flagged"; }

        const searchPool = `${title} ${data.category || ''} ${data.description || ''}`.toLowerCase();

        const tr = document.createElement("tr");
        tr.dataset.status = st;
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
                    ${st === 'en_attente' ? `<button class="act-btn" onclick="adminApprovePost('${data.id}')">Approuver</button>` : ''}
                    ${(data.reportsCount || 0) > 0 ? `<button class="act-btn warn-btn" onclick="ignorerSignalements('${data.id}')">Ignorer</button>` : ''}
                    
                    ${(st === 'active' || st === 'en_attente') ? `<button class="act-btn" onclick="adminToggleSignal('${data.id}', '${st}')">Signaler</button>` : ''}
                    ${st === 'blocked' ? `<button class="act-btn" onclick="adminToggleSignal('${data.id}', 'blocked')">Activer</button>` : ''}
                    
                    <button class="act-btn danger" onclick="adminDeletePost('${data.id}')">Supprimer</button>
                </div>
            </td>
        `;
        pubBody.appendChild(tr);
    });

    // Re-appliqer les filtres sur les nouvelles lignes
    applyDomFilters();
}

function updateAdminStats() {
    const pending = allPosts.filter(p => (p.status || 'active') === 'en_attente').length;
    const flagged = allPosts.filter(p => (p.reportsCount || 0) > 0).length;

    const badgePending = document.getElementById("badge-pending-count");
    if (badgePending) {
        badgePending.textContent = pending;
        badgePending.style.display = pending > 0 ? 'block' : 'none';
    }

    const tEl = document.getElementById("admin-stat-total"); if(tEl) tEl.textContent = allPosts.length;
    const pEl = document.getElementById("admin-stat-pending"); if(pEl) pEl.textContent = pending;
    const fEl = document.getElementById("admin-stat-flagged"); if(fEl) fEl.textContent = flagged;
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
