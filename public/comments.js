import { auth, db } from "./firebase-config.js";
import { collectionGroup, query, where, getDocs, deleteDoc, doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

let allComments = [];
let currentFilter = 'all';

/**
 * INITIALISATION
 */
onAuthStateChanged(auth, async (user) => {
    if (user) {
        await initSettings();
        await fetchComments();
    } else {
        window.location.href = "index.html";
    }
});

/**
 * RÉCUPÉRATION DES PARAMÈTRES (SETTINGS)
 */
async function initSettings() {
    if (!auth.currentUser) return;
    try {
        const userRef = doc(db, "users", auth.currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            const data = userSnap.data();
            const settings = data.settings || {};
            
            // Appliquer l'état aux toggles
            applyToggleState("toggle-replies", settings.replies !== false); // Par défaut true
            applyToggleState("toggle-useful", settings.useful !== false);
            applyToggleState("toggle-new-on-posts", settings.newOnPosts !== false);
        }
    } catch (e) {
        // Fallback muet
    }
}

function applyToggleState(id, isOn) {
    const el = document.getElementById(id);
    if (el) {
        if (isOn) el.classList.add("on");
        else el.classList.remove("on");
    }
}

/**
 * PERSISTANCE DES PARAMÈTRES
 */
window.toggleSetting = async (key) => {
    if (!auth.currentUser) return;
    
    const idMap = {
        'replies': 'toggle-replies',
        'useful': 'toggle-useful',
        'newOnPosts': 'toggle-new-on-posts'
    };
    
    const el = document.getElementById(idMap[key]);
    if (!el) return;
    
    const newState = !el.classList.contains("on");
    applyToggleState(idMap[key], newState);
    
    try {
        const userRef = doc(db, "users", auth.currentUser.uid);
        await updateDoc(userRef, {
            [`settings.${key}`]: newState
        });
        if (window.showToast) window.showToast("Préférence enregistrée.");
    } catch (e) {
        // En cas d'erreur Firestore (ex: permissions), revert l'UI
        applyToggleState(idMap[key], !newState);
    }
};

/**
 * RÉCUPÉRATION DES COMMENTAIRES (GROUP QUERY)
 */
async function fetchComments() {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;

    try {
        // 1. Commentaires écrits par moi
        const qMine = query(collectionGroup(db, "comments"), where("authorUid", "==", uid));
        const snapMine = await getDocs(qMine);
        
        // 2. Réponses reçues sur mes posts
        const qReplies = query(collectionGroup(db, "comments"), where("postOwnerUid", "==", uid));
        const snapReplies = await getDocs(qReplies);

        const map = new Map();

        snapMine.forEach(d => {
            const data = d.data();
            map.set(d.id, { id: d.id, docRef: d.ref, isMine: true, ...data });
        });

        snapReplies.forEach(d => {
            if (!map.has(d.id)) {
                const data = d.data();
                map.set(d.id, { id: d.id, docRef: d.ref, isMine: (data.authorUid === uid), ...data });
            }
        });

        allComments = Array.from(map.values()).sort((a, b) => {
            const tA = a.createdAt ? a.createdAt.toMillis() : 0;
            const tB = b.createdAt ? b.createdAt.toMillis() : 0;
            return tB - tA;
        });

        renderStats();
        renderActivity();
        renderComments(currentFilter);

    } catch (e) {
        if (e.message.includes("requires an index")) {
            if (window.showToast) window.showToast("Index Firestore manquant : voir console.");
            console.error("Index requis :", e.message);
        }
    }
}

/**
 * STATISTIQUES ET TABS
 */
function renderStats() {
    const total = allComments.length;
    const mine = allComments.filter(c => c.isMine).length;
    const replies = allComments.filter(c => !c.isMine).length;
    const threads = new Set(allComments.map(c => c.postId)).size;

    const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setText("stat-total", total);
    setText("stat-threads", threads);
    setText("stat-unread", replies); // Simulé comme "Non lus" pour l'exemple

    setText("btn-tab-all", `Tous (${total})`);
    setText("btn-tab-mine", `Mes commentaires (${mine})`);
    setText("btn-tab-replies", `Réponses reçues (${replies})`);
}

/**
 * ACTIVITÉ RÉCENTE (SIDEBAR)
 */
function renderActivity() {
    const activityList = document.getElementById("activity-list");
    if (!activityList) return;

    // Prendre les 4 derniers commentaires
    const recent = allComments.slice(0, 4);
    activityList.innerHTML = "";

    recent.forEach(c => {
        const dotBg = c.isMine ? "#8B5CF6" : "#0A9E6E";
        const text = c.isMine 
            ? `Vous avez commenté sur <strong>${c.postTitle || 'un post'}</strong>`
            : `<strong>${c.authorName}</strong> a répondu à votre publication <strong>${c.postTitle || ''}</strong>`;
        
        const date = c.createdAt ? c.createdAt.toDate().toLocaleDateString("fr-FR", { day: '2-digit', month: 'short' }) : "Récemment";

        const html = `
            <div class="activity-item">
                <div class="activity-dot" style="background:${dotBg}"></div>
                <div>
                    <div class="activity-text">${text}</div>
                    <div class="activity-time">${date}</div>
                </div>
            </div>
        `;
        activityList.insertAdjacentHTML("beforeend", html);
    });
}

/**
 * RENDU DES COMMENTAIRES
 */
function renderComments(filter) {
    const wrapper = document.getElementById("comments-wrapper");
    const emptyState = document.getElementById("empty-state");
    if (!wrapper) return;

    wrapper.innerHTML = "";
    
    const filtered = allComments.filter(c => {
        if (filter === 'all') return true;
        if (filter === 'mine') return c.isMine;
        if (filter === 'replies') return !c.isMine;
        return true;
    });

    if (filtered.length === 0) {
        if (emptyState) emptyState.style.display = "block";
        return;
    }
    if (emptyState) emptyState.style.display = "none";

    filtered.forEach((c, idx) => {
        const initials = c.authorName ? c.authorName.split(" ").map(n => n[0]).join("").toUpperCase() : "??";
        const date = c.createdAt ? c.createdAt.toDate().toLocaleDateString("fr-FR", { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : "Récent";
        
        const html = `
        <div class="thread-card" style="animation-delay:${idx * 0.05}s">
          <a class="thread-post" href="post-detail.html?id=${c.postId}">
            <div class="post-thumb" style="background:var(--grad-soft); font-size:18px;">📄</div>
            <div class="post-ref-info">
              <div class="post-ref-label">Publication</div>
              <div class="post-ref-title">${c.postTitle || 'Annonce'}</div>
            </div>
            <svg class="thread-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </a>
          <div class="thread-comments">
            <div class="comment-item ${c.isMine ? 'mine' : ''}">
              <div class="comment-av" style="background:var(--grad)">${initials}</div>
              <div class="comment-content">
                <div class="comment-header">
                  <span class="comment-name">${c.authorName}</span>
                  <span class="comment-time">${date}</span>
                  ${c.isMine ? '<span class="comment-mine-tag">Vous</span>' : ''}
                </div>
                <div class="comment-text">${c.text}</div>
                <div class="comment-footer">
                  <button class="comment-action" onclick="this.classList.toggle('active')">Utile</button>
                  ${c.isMine ? `<button class="comment-action" style="color:var(--lost-color)" onclick="window.deleteComment('${c.id}')">Supprimer</button>` : ''}
                </div>
              </div>
            </div>
          </div>
        </div>
        `;
        wrapper.insertAdjacentHTML("beforeend", html);
    });
}

/**
 * ACTIONS GLOBALES
 */
window.filterThreads = (btn, filter) => {
    document.querySelectorAll(".tf-btn").forEach(b => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
    currentFilter = filter;
    renderComments(filter);
};

window.deleteComment = async (id) => {
    if (!confirm("Supprimer ce commentaire ?")) return;
    const target = allComments.find(c => c.id === id);
    if (!target) return;

    try {
        await deleteDoc(target.docRef);
        allComments = allComments.filter(c => c.id !== id);
        renderStats();
        renderComments(currentFilter);
        if (window.showToast) window.showToast("Commentaire supprimé.");
    } catch (e) {
        if (window.showToast) window.showToast("Erreur de suppression.");
    }
};
