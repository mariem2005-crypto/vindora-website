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
let currentCity = 'all';
let searchQuery = '';

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
            reportsCount: 0 
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
    const postsRef = collection(db, "posts");
    onSnapshot(postsRef, (snapshot) => {
        allPosts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderFilteredPosts();
        updateAdminStats();
    });

    const usersRef = collection(db, "users");
    onSnapshot(usersRef, (snapshot) => {
        const users = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderUsers(users);
        const userCountEl = document.getElementById("admin-stat-users");
        if (userCountEl) userCountEl.textContent = users.length;
    });
}

/**
 * MOTEUR DE FILTRAGE UNIFIÉ
 */
window.setAdminFilter = function(filter) {
    currentFilter = filter;
    
    // 1. Sync Tabs UI
    document.querySelectorAll('.stab').forEach(btn => {
        const typeMatch = btn.getAttribute('onclick').match(/'([^']+)'/);
        if (typeMatch) {
            const type = typeMatch[1];
            btn.classList.toggle('active', type === filter);
        }
    });

    // 2. Sync Dropdown UI
    const statusSelect = document.getElementById("admin-status-dropdown");
    if (statusSelect) statusSelect.value = filter;

    renderFilteredPosts();
};

window.setAdminCity = function(city) {
    currentCity = city === "Toutes les villes" ? "all" : city;
    renderFilteredPosts();
};

window.setAdminSearch = function(query) {
    searchQuery = query.toLowerCase().trim();
    renderFilteredPosts();
};

function renderFilteredPosts() {
    const pubBody = document.getElementById("pub-tbody");
    if (!pubBody) return;

    let filtered = allPosts;

    // 1. Filtre par Statut (Onglets)
    if (currentFilter === 'pending') {
        filtered = filtered.filter(p => (p.status || 'active') === 'en_attente');
    } else if (currentFilter === 'flagged') {
        filtered = filtered.filter(p => (p.reportsCount || 0) > 0);
    } else if (currentFilter === 'removed') {
        filtered = filtered.filter(p => p.status === 'blocked');
    } else if (currentFilter === 'active') {
        filtered = filtered.filter(p => (p.status || 'active') === 'active');
    }

    // 2. Filtre par Ville
    if (currentCity !== 'all') {
        filtered = filtered.filter(p => p.city === currentCity);
    }

    // 3. Filtre par Recherche (Titre ou Description)
    if (searchQuery) {
        filtered = filtered.filter(p => 
            (p.title || '').toLowerCase().includes(searchQuery) || 
            (p.description || '').toLowerCase().includes(searchQuery)
        );
    }

    // Tri (Signalés en premier si onglet signalé)
    if (currentFilter === 'flagged') {
        filtered.sort((a,b) => (b.reportsCount || 0) - (a.reportsCount || 0));
    } else {
        filtered.sort((a,b) => {
            const d1 = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
            const d2 = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
            return d2 - d1;
        });
    }

    renderTable(filtered);
}

function renderTable(data) {
    const pubBody = document.getElementById("pub-tbody");
    pubBody.innerHTML = "";

    if (data.length === 0) {
        pubBody.innerHTML = "<tr><td colspan='7' style='text-align:center; padding:40px; color:var(--ink-light)'>Aucun résultat ne correspond à vos filtres.</td></tr>";
        return;
    }

    data.forEach(item => {
        const title = item.title || "Sans titre";
        let typeText = item.postType === 'perdu' ? "Perdu" : "Trouvé";
        let typeClass = item.postType === 'perdu' ? "badge-lost" : "badge-found";
        const date = item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString("fr-FR") : "-";
        
        let statusText = "Active";
        let statusClass = "badge-active";
        const st = item.status || 'active';
        if (st === 'en_attente') { statusText = "En attente"; statusClass = "badge-flagged"; }
        if (st === 'blocked') { statusText = "Bloqué"; statusClass = "badge-removed"; }
        if ((item.reportsCount || 0) > 0) { statusText = `Signalé (${item.reportsCount})`; statusClass = "badge-flagged"; }

        const html = `
            <tr>
                <td>
                    <div class="post-title-sm">${title}</div>
                    <div class="post-sub-sm">${item.category || 'Autres'}</div>
                </td>
                <td><span class="badge ${typeClass}">${typeText}</span></td>
                <td>${item.city || 'N/A'}</td>
                <td style="font-size:11px">${(item.authorPrenom || 'Vindora') + ' ' + (item.authorNom || 'User')}</td>
                <td>${date}</td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td>
                    <div class="actions-cell">
                        ${st === 'en_attente' ? `<button class="act-btn" onclick="adminApprovePost('${item.id}')">Approuver</button>` : ''}
                        ${(item.reportsCount || 0) > 0 ? `<button class="act-btn warn-btn" onclick="ignorerSignalements('${item.id}')">Ignorer</button>` : ''}
                        ${st !== 'blocked' ? `<button class="act-btn" onclick="bloquerPost('${item.id}')">Bloquer</button>` : ''}
                        <button class="act-btn danger" onclick="adminDeletePost('${item.id}')">Supprimer</button>
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

    const badgePending = document.getElementById("badge-pending-count");
    if (badgePending) {
        badgePending.textContent = pending;
        badgePending.style.display = pending > 0 ? 'block' : 'none';
    }

    setText("admin-stat-total", total);
    setText("admin-stat-pending", pending);
    setText("admin-stat-flagged", flagged);
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
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
