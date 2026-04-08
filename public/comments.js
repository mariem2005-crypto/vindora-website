import { auth, db } from "./firebase-config.js";
import { collectionGroup, query, where, getDocs, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

let currentUser = null;
let allComments = [];

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await fetchComments();
    } else {
        window.location.href = "index.html";
    }
});

async function fetchComments() {
    if (!currentUser) return;

    try {
        const uid = currentUser.uid;
        
        // Fetch comments I wrote
        const myCommentsQuery = query(
            collectionGroup(db, "comments"),
            where("authorUid", "==", uid)
        );
        const myCommentsSnap = await getDocs(myCommentsQuery);
        
        // Fetch comments written to me (on posts I own)
        const myReceivedQuery = query(
            collectionGroup(db, "comments"),
            where("postOwnerUid", "==", uid)
        );
        const myReceivedSnap = await getDocs(myReceivedQuery);

        const fetchedMap = new Map();

        myCommentsSnap.forEach(docSnap => {
            const data = docSnap.data();
            data.id = docSnap.id;
            data.docRef = docSnap.ref; // For deletion
            data.isMine = true;
            fetchedMap.set(data.id, data);
        });

        myReceivedSnap.forEach(docSnap => {
            if (!fetchedMap.has(docSnap.id)) {
                const data = docSnap.data();
                data.id = docSnap.id;
                data.docRef = docSnap.ref;
                data.isMine = (data.authorUid === uid); 
                fetchedMap.set(data.id, data);
            }
        });

        allComments = Array.from(fetchedMap.values());
        
        // Sort descending by date
        allComments.sort((a, b) => {
            const timeA = a.createdAt ? a.createdAt.toMillis() : 0;
            const timeB = b.createdAt ? b.createdAt.toMillis() : 0;
            return timeB - timeA;
        });

        updateStats();
        renderComments('all');

    } catch (err) {
        console.error("Error fetching comments. Note: This requires a Firestore Composite Index if errors point to missing indexes.", err);
        if (err.message.includes("requires an index")) {
            console.error("Please click the Firebase link above in your console to build the index.");
            if (window.showToast) window.showToast("La construction de d'index Firebase est requise ! Vérifiez vos logs.");
        }
    }
}

function updateStats() {
    const totalCount = allComments.length;
    // Basic heuristics for stats purely for UI sake based on the DB layout
    const activeThreadsCount = new Set(allComments.map(c => c.postId)).size;
    
    const statNums = document.querySelectorAll(".hstat-num");
    if (statNums.length >= 3) {
        statNums[0].textContent = totalCount;
        statNums[1].textContent = "0"; // Non lus (Requires explicit read/unread boolean fields)
        statNums[2].textContent = activeThreadsCount;
    }

    const tBtnAll = document.querySelector(".tf-btn[onclick*=\"'all'\"]");
    const tBtnMine = document.querySelector(".tf-btn[onclick*=\"'mine'\"]");
    const tBtnReplies = document.querySelector(".tf-btn[onclick*=\"'replies'\"]");
    
    if (tBtnAll) tBtnAll.textContent = `Tous (${totalCount})`;
    if (tBtnMine) tBtnMine.textContent = `Mes commentaires (${allComments.filter(c => c.isMine).length})`;
    if (tBtnReplies) tBtnReplies.textContent = `Réponses reçues (${allComments.filter(c => !c.isMine).length})`;
}

function renderComments(filterType) {
    const wrapper = document.getElementById("comments-wrapper");
    if (!wrapper) return;

    wrapper.innerHTML = "";

    const filtered = allComments.filter(c => {
        if (filterType === 'all') return true;
        if (filterType === 'mine') return c.isMine;
        if (filterType === 'replies') return !c.isMine;
        return true;
    });

    const emptyState = document.getElementById("empty-state");
    if (filtered.length === 0) {
        if (emptyState) emptyState.style.display = "block";
        return;
    } else {
        if (emptyState) emptyState.style.display = "none";
    }

    filtered.forEach((comment, i) => {
        const timeStr = comment.createdAt ? 
            comment.createdAt.toDate().toLocaleDateString("fr-FR", { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) 
            : "Récemment";
            
        const auName = comment.authorName || "Anonyme";
        const initials = auName.substring(0, 2).toUpperCase();

        const tag = comment.isMine ? `<span class="comment-mine-tag">Vous</span>` : '';
        const title = comment.postTitle || "Publication Inconnue";
        
        let delBtn = "";
        if (comment.isMine) {
            delBtn = `
              <button class="comment-action delete-action" onclick="window.deleteMyComment('${comment.id}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                Supprimer
              </button>`;
        }

        const dom = `
        <div class="thread-card" style="animation-delay:${i * 0.05}s">
          <a class="thread-post" href="post-detail.html?id=${comment.postId}">
            <div class="post-thumb" style="background:#EEF2FF">
                <svg class="obj-icon" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="10" fill="#EEF2FF"/><rect x="10" y="5" width="12" height="22" rx="3" stroke="#3B3BDB" stroke-width="1.8"/><line x1="14" y1="23" x2="18" y2="23" stroke="#3B3BDB" stroke-width="2" stroke-linecap="round"/><rect x="13" y="8" width="6" height="1.5" rx="0.75" fill="#3B3BDB" opacity="0.35"/></svg>
            </div>
            <div class="post-ref-info">
              <div class="post-ref-label">Publication</div>
              <div class="post-ref-title">${title}</div>
            </div>
            <svg class="thread-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </a>
          <div class="thread-comments">
            <div class="comment-item ${comment.isMine ? 'mine' : ''}">
              <div class="comment-av" style="background:var(--grad)">${initials}</div>
              <div class="comment-content">
                <div class="comment-header">
                  <span class="comment-name">${auName}</span>
                  <span class="comment-time">${timeStr}</span>
                  ${tag}
                </div>
                <div class="comment-text">${comment.text}</div>
                <div class="comment-footer">
                  <button class="comment-action" onclick="this.classList.toggle('liked')">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
                    Utile
                  </button>
                  ${delBtn}
                </div>
              </div>
            </div>
          </div>
        </div>
        `;
        
        wrapper.insertAdjacentHTML('beforeend', dom);
    });
}

// Global Exports
window.filterThreads = function(btn, filter) {
    document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderComments(filter);
};

window.deleteMyComment = async function(commentId) {
    if (!confirm("Voulez-vous vraiment supprimer ce commentaire ?")) return;

    const cTarget = allComments.find(c => c.id === commentId);
    if (!cTarget || !cTarget.docRef) return;

    try {
        await deleteDoc(cTarget.docRef);
        allComments = allComments.filter(c => c.id !== commentId);
        
        if (window.showToast) window.showToast("Commentaire supprimé");
        
        updateStats();
        // Identify active filter
        const activeBtn = document.querySelector('.tf-btn.active');
        let filter = 'all';
        if (activeBtn) {
            if (activeBtn.textContent.includes("Mes")) filter = 'mine';
            if (activeBtn.textContent.includes("Réponses")) filter = 'replies';
        }
        renderComments(filter);
        
    } catch (e) {
        console.error("Error deleting comment", e);
    }
};
