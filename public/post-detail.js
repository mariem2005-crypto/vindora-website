console.log("Loading post-detail.js");

import { auth, db } from "./firebase-config.js";
import { doc, getDoc, collection, addDoc, onSnapshot, query, orderBy, updateDoc, arrayUnion, arrayRemove, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const urlParams = new URLSearchParams(window.location.search);
const postId = urlParams.get('id');

let currentPostData = null;
let currentUser = null;

// Initialize Auto-fetch
async function initPostDetail() {
    if (!postId) {
        console.warn("No Post ID provided in URL, redirecting...");
        window.location.href = "index.html";
        return;
    }

    try {
        const postRef = doc(db, "posts", postId);
        const postSnap = await getDoc(postRef);

        if (!postSnap.exists()) {
            console.error("Post not found, redirecting...");
            window.location.href = "index.html";
            return;
        }

        currentPostData = postSnap.data();
        injectPostData(currentPostData);
        listenToComments();

    } catch (error) {
        console.error("Error fetching post details:", error);
    }
}

// Inject Firestore Data to DOM
function injectPostData(data) {
    // Basic Details
    setText("detail-title", data.title || "Titre introuvable");
    setText("detail-category", data.category || "Inconnu");
    setText("detail-type", data.objType || data.obj || "Autre");
    setText("detail-category-grid", data.category || "Inconnu");
    setText("detail-city", data.city || "Non spécifié");
    setText("detail-desc", data.description || "Aucune description fournie.");

    // Date calculations
    let dateStr = "Récemment";
    let publishStr = "Récemment";
    if (data.createdAt) {
        const dateObj = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
        dateStr = dateObj.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
        publishStr = dateStr;
    }
    setText("detail-date", dateStr);
    setText("detail-publish-time", publishStr);

    // Badge styling (Perdu vs Trouvé)
    const badgeEl = document.getElementById("detail-badge");
    if (badgeEl) {
        const type = String(data.postType).toLowerCase();
        if (type === "lost" || type === "perdu") {
            badgeEl.className = "post-badge badge-lost";
            badgeEl.textContent = "Perdu";
        } else {
            badgeEl.className = "post-badge badge-found";
            badgeEl.textContent = "Trouvé";
        }
    }

    // Image Background
    const imgEl = document.getElementById("detail-image");
    if (imgEl) {
        const url = data.imageUrl || "https://images.unsplash.com/photo-1584916201218-f4242ceb4809?w=500&auto=format&fit=crop&q=60";
        imgEl.style.backgroundImage = `url('${url}')`;
        imgEl.style.backgroundColor = "var(--bg)";
    }

    // Author Basic Injection
    setText("detail-author-name", data.authorName || "Anonyme");
    
    // Heart Status Refresh
    refreshLikeUI();
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// ====== INTERACTIONS TRIGGERED FROM HTML ========

// WhatsApp Linking
window.contactAuthor = () => {
    if (!currentPostData || !currentPostData.contact) {
        if (window.showToast) window.showToast("Ce post n'a pas de contact lié.");
        return;
    }
    
    const c = currentPostData.contact.replace(/\s+/g, "");
    // Automatically open wa.me, passing the user contact. Adding 216 natively.
    // Ensure if they typed +216 or 00216 we cleanly manage it, simple assumption: purely domestic digits
    let link = `https://wa.me/216${c}`;
    if (c.startsWith("+") || c.startsWith("216")) {
         link = `https://wa.me/${c}`;
    }
    
    window.open(link, '_blank');
};

// Likes System 
window.toggleFav = async () => {
    if (!currentUser) {
        if (window.showToast) window.showToast("Veuillez vous authentifier pour liker.");
        return;
    }
    if (!currentPostData) return;

    // Check if user previously liked
    const uid = currentUser.uid;
    let likesArr = currentPostData.likes || [];
    const isLiked = likesArr.includes(uid);
    
    const postRef = doc(db, "posts", postId);

    try {
        if (isLiked) {
            // Un-like
            await updateDoc(postRef, {
                likes: arrayRemove(uid)
            });
            likesArr = likesArr.filter(i => i !== uid);
        } else {
            // Like
            await updateDoc(postRef, {
                likes: arrayUnion(uid)
            });
            likesArr.push(uid);

            // FIRE NOTIFICATION
            createNotification(currentPostData.authorUid, 'alert', `${currentUser.displayName || "Quelqu'un"} a ajouté votre objet "${currentPostData.title || ""}" à ses favoris.`);
        }

        // Optimistically update local array reference for UI
        currentPostData.likes = likesArr;
        refreshLikeUI();

    } catch (e) {
        console.error("Error toggling favorite", e);
    }
};

function refreshLikeUI() {
    if (!currentPostData) return;
    const btn = document.getElementById("fav-btn");
    const icon = document.getElementById("fav-icon");
    const count = document.getElementById("fav-count");
    if (!btn || !icon || !count) return;

    let likesArr = currentPostData.likes || [];
    count.textContent = `(${likesArr.length})`;

    if (currentUser && likesArr.includes(currentUser.uid)) {
        icon.style.fill = '#E03B3B';
        icon.style.stroke = '#E03B3B';
        btn.classList.add('liked');
    } else {
        icon.style.fill = 'none';
        icon.style.stroke = 'currentColor';
        btn.classList.remove('liked');
    }
}

// Comments System
window.sendComment = async () => {
    if (!currentUser) {
        if (window.showToast) window.showToast("Veuillez vous authentifier pour commenter.");
        return;
    }
    
    const input = document.getElementById('new-comment');
    if (!input) return;

    const val = input.value.trim();
    if (!val) return;

    try {
        // Clear box
        input.value = '';

        // Dispatch comment creation into posts -> {postId} -> comments
        const commRef = collection(db, "posts", postId, "comments");
        await addDoc(commRef, {
            postId: postId,
            postTitle: currentPostData.title || "Titre inconnu",
            postOwnerUid: currentPostData.authorUid || "",
            authorUid: currentUser.uid,
            authorName: currentUser.displayName || currentUser.prenom + " " + currentUser.nom || "Utilisateur Vindora",
            text: val,
            createdAt: serverTimestamp()
        });

        if (window.showToast) window.showToast("Commentaire envoyé !");

        // FIRE NOTIFICATION TO AUTHOR
        createNotification(currentPostData.authorUid, 'comment', `${currentUser.displayName || "Quelqu'un"} a commenté votre publication "${currentPostData.title}".`);

    } catch (error) {
        console.error("Error submitting comment:", error);
    }
};

// Snapshot Listener for Comments
function listenToComments() {
    const commRef = collection(db, "posts", postId, "comments");
    const q = query(commRef, orderBy("createdAt", "asc"));

    onSnapshot(q, (snapshot) => {
        const listEl = document.getElementById("comments-list");
        if (!listEl) return;
        listEl.innerHTML = ""; // Clear existing render

        const counterEl = document.querySelector(".comments-count");
        if (counterEl) counterEl.textContent = snapshot.size;

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const timeStr = data.createdAt ? 
                data.createdAt.toDate().toLocaleDateString("fr-FR", { 
                    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" 
                }) 
                : "À l'instant";
            
            const auName = data.authorName || "Anonyme";
            // Make badge purely stylistic (initials)
            const initials = auName.substring(0, 2).toUpperCase();

            // Author ownership badge tag dynamically
            const authorTag = (currentPostData && currentPostData.authorUid === data.authorUid) 
                ? `<span class="comment-owner">Auteur</span>` 
                : '';

            const item = document.createElement('div');
            item.className = 'comment-item';
            item.innerHTML = `
                <div class="comment-av" style="background: var(--grad)">${initials}</div>
                <div class="comment-content">
                    <div class="comment-header">
                    <span class="comment-name">${auName}</span>
                    <span class="comment-time">${timeStr}</span>
                    ${authorTag}
                    </div>
                    <div class="comment-text">${data.text}</div>
                </div>
            `;
            listEl.appendChild(item);
        });

        // Autoscroll bottom optionally...
    }, error => {
        console.error("Erreur de récupération des commentaires :", error);
    });
}

// ====== NOTIFICATIONS SUB-ROUTINE ======
async function createNotification(recipientUid, type, message) {
    if (!recipientUid || !currentUser) return;
    
    // Prevent notifying ourselves for our own actions
    if (recipientUid === currentUser.uid) return;
    
    try {
        await addDoc(collection(db, "notifications"), {
            userUid: recipientUid,
            type: type, // 'alert', 'comment', etc. 
            message: message,
            createdAt: serverTimestamp(),
            status: "unread",
            read: false,
            fromUid: currentUser.uid,
            postId: postId
        });
    } catch (e) {
        console.error("Failed executing notification dispatch", e);
    }
}

// Authentication Bootstrap
onAuthStateChanged(auth, user => {
    currentUser = user;
    refreshLikeUI(); // Re-trigger mapping so heart illuminates correctly if they logged in post-load.
});

// START
initPostDetail();
