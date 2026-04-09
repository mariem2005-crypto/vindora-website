

import { auth, db } from "./firebase-config.js";
import { collection, query, where, getDocs, doc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { populateCitySelect } from "./locationService.js";

// Initialisation dynamique des villes
populateCitySelect("filter-city", { includeAll: true, defaultText: "Toutes les villes" });
populateCitySelect("edit-city");

// ====== VARIABLES GLOBALES ======
let currentEditDocId = null;
let allMyPosts = [];
let activeTabFilter = 'all';

// ====== TASK: DELETE POST ======
window.deleteMyPost = async function(postId) {
    if (!confirm("Voulez-vous vraiment supprimer cette publication ?")) return;
    try {
        await deleteDoc(doc(db, "posts", postId));
        if (window.showToast) window.showToast("Publication supprimée avec succès.");
        loadMyPublications(); 
    } catch (error) {
        console.error("Erreur de suppression:", error);
        if (error.code === "permission-denied") {
            alert("Accès refusé. Vérifiez les règles de sécurité Firestore.");
        }
    }
};

// ====== TASK: EDIT POST DRAWER ======
window.openEdit = function(docId, title, desc, city, status) {
    currentEditDocId = docId;
    document.getElementById("edit-title").value = title;
    document.getElementById("edit-desc").value = desc;
    document.getElementById("edit-city").value = city;
    const statusSelect = document.getElementById("edit-status");
    if (statusSelect) {
        statusSelect.value = (status.includes("resolu") || status === "resolved") ? "resolu" : "active";
    }
    document.getElementById("edit-drawer").classList.add("show");
    document.getElementById("drawer-overlay").classList.add("show");
};

window.closeEdit = function() {
    currentEditDocId = null;
    document.getElementById("edit-drawer").classList.remove("show");
    document.getElementById("drawer-overlay").classList.remove("show");
};

window.saveEdit = async function() {
    if (!currentEditDocId) return;
    try {
        await updateDoc(doc(db, "posts", currentEditDocId), {
            title: document.getElementById("edit-title").value,
            description: document.getElementById("edit-desc").value,
            city: document.getElementById("edit-city").value,
            status: document.getElementById("edit-status").value
        });
        window.closeEdit();
        if (window.showToast) window.showToast("Mise à jour réussie.");
        loadMyPublications(); 
    } catch (error) {
        console.error("Erreur mise à jour:", error);
    }
};

// ====== DYNAMIC TEMPLATE GENERATION ======
function renderPost(documentSnapshot) {
    const data = documentSnapshot.data();
    const docId = documentSnapshot.id; 

    const title = data.title || "Titre indisponible";
    const description = data.description || "Aucune description fournie";
    const category = data.category || "Général";
    const city = data.city || "Ville inconnue";
    const location = data.location || "";
    
    const postStatus = (data.status || "active").toLowerCase(); 
    let pt = (data.postType || "").toLowerCase();
    
    // Simplifier les valeurs postType pour le filtrage DOM ("perdu" ou "trouve")
    const internalPostType = (pt === "lost" || pt === "perdu") ? "perdu" : "trouve";
    
    const badgeType = internalPostType === "perdu" ? "badge-lost" : "badge-found";
    const badgeText = internalPostType === "perdu" ? "Perdu" : "Trouvé";

    let resolutionBadge = "<span class='badge badge-active'>Active</span>";
    if (postStatus.includes("resolu") || postStatus === "resolved") {
        resolutionBadge = "<span class='badge badge-resolved'>Résolu</span>";
    }

    let dateStr = "Récemment";
    if (data.createdAt && data.createdAt.seconds) {
        dateStr = new Date(data.createdAt.seconds * 1000).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
    }
    
    const photoUrl = data.imageUrl || "https://images.unsplash.com/photo-1584916201218-f4242ceb4809?w=500&auto=format&fit=crop&q=60";
    let formattedLocation = city;
    if (location !== "") {
        formattedLocation = city + " - " + location;
    }

    const safeTitle = title.replace(/['"\\\n\r]/g, " ");
    const safeDesc = description.replace(/['"\\\n\r]/g, " ");
    const safeCity = city.replace(/['"\\\n\r]/g, " ");

    // CONCATÉNATION STRICte (Sans Backticks). Ajout des data-attributes stricts
    let html = "";
    html += "<div class='post-card dom-post' data-internal-type='" + internalPostType + "' data-status='" + postStatus + "' data-category='" + category + "' data-city='" + safeCity + "' onclick='window.location.href=\"post-detail.html?id=" + docId + "\"'>";
    html +=   "<div class='post-thumb' style='background: var(--bg); padding: 0; overflow: hidden;'>";
    html +=     "<img src='" + photoUrl + "' alt='" + category + "' style='width:100%; height:100%; object-fit:cover;' onerror='this.style.display=\"none\"'/>";
    html +=   "</div>";
    
    html +=   "<div class='post-info'>";
    html +=     "<div class='post-meta-top'>";
    html +=       "<span class='badge " + badgeType + "'>" + badgeText + "</span> ";
    html +=       resolutionBadge + " ";
    html +=       "<span class='post-category'>" + category + "</span>";
    html +=     "</div>";
    html +=     "<div class='post-title'>" + title + "</div>";
    
    html +=     "<div class='post-desc' style='display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;'>";
    html +=        description;
    html +=     "</div>";
    
    html +=     "<div class='post-footer-meta'>";
    html +=       "<div class='pmeta' title='" + formattedLocation + "'>";
    html +=          "<svg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round'><path d='M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z'/><circle cx='12' cy='9' r='2.5'/></svg> ";
    html +=          formattedLocation;
    html +=       "</div>";
    html +=       "<div class='pmeta' style='display:flex; align-items:center; gap:3px;'>";
    html +=          "<svg width='12' height='12' viewBox='0 0 24 24' fill='#E03B3B' stroke='#E03B3B'><path d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'/></svg> ";
    html +=          (data.likes ? data.likes.length : 0);
    html +=       "</div>";
    html +=     "</div>";
    html +=   "</div>";

    html +=   "<div class='post-actions' onclick='event.stopPropagation()'>";
    html +=     "<button class='btn-edit' onclick='openEdit(\"" + docId + "\", \"" + safeTitle + "\", \"" + safeDesc + "\", \"" + safeCity + "\", \"" + postStatus + "\")'>";
    html +=       "<svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round'><path d='M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7'/><path d='M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z'/></svg> ";
    html +=       "Modifier";
    html +=     "</button>";
    html +=     "<button class='btn-delete' onclick='deleteMyPost(\"" + docId + "\")'>";
    html +=       "<svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round'><polyline points='3 6 5 6 21 6'/><path d='M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'/><path d='M10 11v6M14 11v6'/><path d='M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2'/></svg> ";
    html +=       "Supprimer";
    html +=     "</button>";
    html +=   "</div>";
    html += "</div>";
    
    return html;
}

// ====== LOGIQUE PRINCIPALE ======
async function loadMyPublications() {
    const user = auth.currentUser;
    if (!user) {
        return;
    }

    try {
        const postsRef = collection(db, "posts");
        const q = query(postsRef, where("authorUid", "==", user.uid));
        
        const querySnapshot = await getDocs(q);

        allMyPosts = [];
        querySnapshot.forEach(function(documentSnapshot) {
            allMyPosts.push(documentSnapshot);
        });

        // Calcul initial pour les bulles des onglets sur l'ensemble
        updateTabsCountersFromSource(allMyPosts);

        // Appliquer directement les filtres, ce qui génèrera le DOM
        window.applyFilters();

    } catch (error) {
        console.error("Erreur lors de la récupération des publications:", error);
    }
}

// Update Top Boxes
function updateCounters(t, a, r) {
    const elTotal = document.getElementById("count-total");
    if (elTotal) {
        elTotal.textContent = t;
        const elActives = document.getElementById("count-actives");
        if (elActives) elActives.textContent = a;
        const elResolues = document.getElementById("count-resolues");
        if (elResolues) elResolues.textContent = r;
    }
}

// Update Tab Bubbles (TASK 1 & TASK 2)
function updateTabsCountersFromSource(sourceArray) {
    let total = sourceArray.length;
    let countLost = 0;
    let countFound = 0;
    let resolues = 0;

    sourceArray.forEach(docSnap => {
        const data = docSnap.data();
        let pt = (data.postType || "").toLowerCase();
        if (pt === "lost" || pt === "perdu") countLost++;
        else countFound++;
        
        const postStatus = (data.status || "active").toLowerCase(); 
        if (postStatus.includes("resolu") || postStatus === "resolved") resolues++;
    });

    const elAll = document.getElementById("count-all");
    const elLost = document.getElementById("count-lost");
    const elFound = document.getElementById("count-found");
    const elResolved = document.getElementById("count-resolved");

    if (elAll) elAll.innerText = "Toutes (" + total + ")";
    if (elLost) elLost.innerText = "Perdues (" + countLost + ")";
    if (elFound) elFound.innerText = "Trouvées (" + countFound + ")";
    if (elResolved) elResolved.innerText = "Résolues (" + resolues + ")";
}

// ====== TASK 3: REAL-TIME DOM FILTERING ======
window.applyFilters = function() {
    const elCat = document.getElementById("filter-category");
    const elCity = document.getElementById("filter-city");
    // Fallback to "filter-object" if the ID was updated
    const elType = document.getElementById("filter-object") || document.getElementById("filter-type");
    
    const selectedCategory = elCat ? elCat.value : "Tous";
    const selectedCity = elCity ? elCity.value : "Tous";
    const selectedObject = elType ? elType.value : "Tous";


    // Filter by dropdowns and tabs via .filter()
    const filteredPosts = allMyPosts.filter(docSnap => {
        const data = docSnap.data();
        
        // Category check
        const matchesCategory = (selectedCategory === "Tous" || selectedCategory === "all" || data.category === selectedCategory);
        
        // City check
        const matchesCity = (selectedCity === "Tous" || selectedCity === "all" || data.city === selectedCity);
        
        // Object Type check
        const matchesObject = (selectedObject === "Tous" || selectedObject === "all" || data.objType === selectedObject);

        // Tab Filter
        let tabMatch = true;
        const pt = (data.postType || "").toLowerCase();
        const internType = (pt === "lost" || pt === "perdu") ? "perdu" : "trouve";
        const pStatus = (data.status || "active").toLowerCase();
        
        if (activeTabFilter === 'lost') tabMatch = (internType === 'perdu');
        else if (activeTabFilter === 'found') tabMatch = (internType === 'trouve');
        else if (activeTabFilter === 'resolved') tabMatch = (pStatus.includes("resolu") || pStatus === "resolved");

        return matchesCategory && matchesCity && matchesObject && tabMatch;
    });

    // Rerender UI
    const container = document.getElementById("posts-wrapper");
    if (container) {
        container.innerHTML = "";
        
        if (filteredPosts.length === 0 && allMyPosts.length > 0) {
            const noResultMsg = document.getElementById("no-result-msg");
            if (noResultMsg) noResultMsg.style.display = "block";
        } else {
            const noResultMsg = document.getElementById("no-result-msg");
            if (noResultMsg) noResultMsg.style.display = "none";
        }
        
        if (allMyPosts.length === 0) {
             container.innerHTML = "<div style='text-align: center; padding: 60px 20px; color: var(--ink-light);'><p style='font-weight: 600;'>Vous n'avez pas encore de publications.</p></div>";
        } else {
            filteredPosts.forEach(docSnap => {
                const html = renderPost(docSnap);
                container.insertAdjacentHTML("beforeend", html);
            });
        }
    }

    // Update Totals Counter
    let actives = 0;
    let resolues = 0;
    filteredPosts.forEach(docSnap => {
        const pStatus = (docSnap.data().status || "active").toLowerCase(); 
        if (pStatus.includes("resolu") || pStatus === "resolved") resolues++;
        else actives++;
    });
    
    updateCounters(filteredPosts.length, actives, resolues);
    // Refresh tab bubbles based on current filter results
    updateTabsCountersFromSource(filteredPosts);
};

window.filterPosts = function(btnElement, filterType) {
    const allBtns = document.querySelectorAll('.tf-btn');
    if (btnElement) {
        allBtns.forEach(b => b.classList.remove('active'));
        btnElement.classList.add('active');
    }
    activeTabFilter = filterType || 'all';
    window.applyFilters();
};

window.resetAllFilters = function() {
    const elCat = document.getElementById('filter-category');
    const elCity = document.getElementById('filter-city');
    const elType = document.getElementById('filter-type');
    
    if (elCat) elCat.value = "Tous";
    if (elCity) elCity.value = "Tous";
    if (elType) elType.value = "Tous";
    
    const tabAll = document.getElementById('count-all');
    if (tabAll) {
        window.filterPosts(tabAll, 'all');
    } else {
        activeTabFilter = 'all';
        window.applyFilters();
    }
};

// ON AUTH STATE CHANGED WRAPPER
onAuthStateChanged(auth, function(user) {
    if (user) {
        loadMyPublications();
    }
});
