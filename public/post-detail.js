import { auth, db } from "./firebase-config.js";
import { 
    doc, getDoc, getDocs, collection, addDoc, onSnapshot, query, where, orderBy, limit, 
    updateDoc, arrayUnion, arrayRemove, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const urlParams = new URLSearchParams(window.location.search);
const postId = urlParams.get('id');

let currentPostData = null;
let currentAuthorData = null;

/**
 * INITIALISATION : Récupération du post et de ses dépendances
 */
async function initPostDetail() {
    if (!postId) {
        window.location.href = "home.html";
        return;
    }

    try {
        const postRef = doc(db, "posts", postId);
        const postSnap = await getDoc(postRef);

        if (!postSnap.exists()) {
            window.location.href = "home.html";
            return;
        }

        currentPostData = { id: postSnap.id, ...postSnap.data() };
        
        // 1. Injecter les données du post immédiatement
        injectPostData(currentPostData);

        // 2. Charger les données de l'auteur (Profil complet)
        if (currentPostData.authorUid) {
            loadAuthorProfile(currentPostData.authorUid);
        }

        // 3. Charger les publications similaires
        loadSimilarPosts(currentPostData.category, postSnap.id);

        // 4. Écouter les commentaires en temps réel
        listenToComments();

    } catch (error) {
        console.error("Error initPostDetail:", error);
    }
}

/**
 * INJECTION DES DONNÉES DU POST DANS LE DOM
 */
function injectPostData(data) {
    const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val || "N/A";
    };

    setText("detail-title", data.title);
    setText("breadcrumb-title", data.title);
    setText("detail-category", data.category);
    setText("breadcrumb-category", data.category);
    setText("detail-category-grid", data.category);
    setText("detail-type", data.postType === "lost" || data.postType === "perdu" ? "Objet Perdu" : "Objet Trouvé");
    setText("detail-city", data.city);
    setText("detail-desc", data.description || data.content);

    // Dates
    if (data.createdAt) {
        const date = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
        const formattedDate = date.toLocaleDateString("fr-FR", { day: '2-digit', month: 'short', year: 'numeric' });
        setText("detail-date", formattedDate);
        setText("detail-publish-time", formattedDate);
    }

    // Badge
    const badge = document.getElementById("detail-badge");
    if (badge) {
        const isLost = data.postType === "lost" || data.postType === "perdu";
        badge.className = `post-badge ${isLost ? 'badge-lost' : 'badge-found'}`;
        badge.textContent = isLost ? "Perdu" : "Trouvé";
    }

    // Image
    const imgEl = document.getElementById("detail-image");
    if (imgEl) {
        if (data.imageUrl) {
            imgEl.style.backgroundImage = `url('${data.imageUrl}')`;
        } else {
            imgEl.innerHTML = "<div style='font-size:40px; opacity:0.3'>📷</div>";
        }
    }

    refreshLikeUI();
}

/**
 * CHARGEMENT DU PROFIL DE L'AUTEUR
 */
async function loadAuthorProfile(uid) {
    try {
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            currentAuthorData = userSnap.data();
            const fullName = `${currentAuthorData.prenom} ${currentAuthorData.nom}`;
            document.getElementById("detail-author-name").textContent = fullName;
            
            const initials = (currentAuthorData.prenom.charAt(0) + currentAuthorData.nom.charAt(0)).toUpperCase();
            document.getElementById("detail-author-av").textContent = initials;
        }
    } catch (error) {
        console.error("Error loading author profile:", error);
    }
}

/**
 * PUBLICATIONS SIMILAIRES
 */
async function loadSimilarPosts(category, currentId) {
    const listEl = document.getElementById("similar-posts-list");
    if (!listEl) return;

    try {
        const postsRef = collection(db, "posts");
        const q = query(
            postsRef, 
            where("category", "==", category), 
            limit(10)
        );

        const querySnapshot = await getDocs(q);

        let count = 0;
        listEl.innerHTML = "";

        querySnapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (docSnap.id !== currentId && count < 3) {
                const item = document.createElement("div");
                item.className = "related-item";
                item.onclick = () => window.location.href = `post-detail.html?id=${docSnap.id}`;
                
                item.innerHTML = `
                    <div class="related-thumb" style="background: var(--grad-soft); display:flex; align-items:center; justify-content:center;">
                        ${data.imageUrl ? `<img src="${data.imageUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:10px;">` : `<span style="font-size:20px; opacity:0.3;">📦</span>`}
                    </div>
                    <div class="related-info">
                        <div class="related-title">${data.title}</div>
                        <div class="related-meta">${data.city} · ${data.category}</div>
                    </div>
                `;
                listEl.appendChild(item);
                count++;
            }
        });

        if (count === 0) {
            listEl.innerHTML = "<p style='font-size:12px; color:var(--ink-light)'>Aucune publication similaire.</p>";
        }

    } catch (error) {
        console.error("Error loadSimilarPosts:", error);
    }
}

/**
 * COMMENTAIRES
 */
window.sendComment = async () => {
    // Sécurité : Vérifier que les données du post sont chargées
    if (!currentPostData || !postId) {
        if (window.showToast) window.showToast("Données du post non chargées. Réessayez.");
        return;
    }

    if (!window.currentUser) {
        if (window.showToast) window.showToast("Vous devez être connecté pour commenter.");
        return;
    }

    const input = document.getElementById("new-comment");
    const text = input.value.trim();
    if (!text) return;

    try {
        const commRef = collection(db, "comments");
        await addDoc(commRef, {
            postId: postId,
            postTitle: currentPostData.title || "Titre inconnu",
            postOwnerUid: currentPostData.authorUid || "",
            text: text,
            authorUid: window.currentUser.uid,
            authorName: `${window.currentUser.prenom || ''} ${window.currentUser.nom || ''}`.trim() || "Utilisateur",
            createdAt: serverTimestamp()
        });

        input.value = "";
        if (window.showToast) window.showToast("Commentaire ajouté !");
    } catch (error) {
        console.error("Error sendComment:", error);
        if (window.showToast) window.showToast("Erreur lors de l'envoi : " + error.code, { type: "error" });
    }
};

function listenToComments() {
    const commRef = collection(db, "comments");
    const q = query(commRef, where("postId", "==", postId), orderBy("createdAt", "desc"));

    onSnapshot(q, (snapshot) => {
        const listEl = document.getElementById("comments-list");
        const countEl = document.querySelector(".comments-count");
        if (!listEl) return;

        listEl.innerHTML = "";
        if (countEl) countEl.textContent = snapshot.size;

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const date = data.createdAt ? data.createdAt.toDate().toLocaleString("fr-FR", { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : "À l'instant";
            
            let authorDisplay = data.authorName || "Utilisateur inconnu";
            if (authorDisplay.includes("undefined")) authorDisplay = "Utilisateur inconnu";
            
            const initials = authorDisplay !== "Utilisateur inconnu" ? authorDisplay.split(" ").map(n => n[0]).join("").toUpperCase() : "??";
            const isOwner = data.authorUid === currentPostData.authorUid;

            const div = document.createElement("div");
            div.className = "comment-item";
            div.innerHTML = `
                <div class="comment-av" style="background: var(--grad)">${initials}</div>
                <div class="comment-content">
                    <div class="comment-header">
                        <span class="comment-name">${authorDisplay}</span>
                        <span class="comment-time">${date}</span>
                        ${isOwner ? '<span class="comment-owner">Auteur</span>' : ''}
                    </div>
                    <div class="comment-text">${data.text}</div>
                </div>
            `;
            listEl.appendChild(div);
        });
    });
}

/**
 * CONTACT
 */
window.contactAuthor = () => {
    if (!currentAuthorData) {
        if (window.showToast) window.showToast("Informations de contact indisponibles.");
        return;
    }

    const phone = currentAuthorData.phone;
    const email = currentAuthorData.email;

    if (phone) {
        const cleanPhone = phone.replace(/\s+/g, '').replace('+', '');
        const waLink = `https://wa.me/${cleanPhone.length >= 8 && !cleanPhone.startsWith('216') ? '216' + cleanPhone : cleanPhone}`;
        window.open(waLink, '_blank');
    } else if (email) {
        window.location.href = `mailto:${email}?subject=Vindora : Concernant votre annonce ${currentPostData.title}`;
    } else {
        if (window.showToast) window.showToast("Aucun moyen de contact trouvé.");
    }
};

/**
 * FAVORIS (LIKES)
 */
window.toggleFav = async () => {
    if (!window.currentUser) {
        if (window.showToast) window.showToast("Connectez-vous pour liker.");
        return;
    }

    const postRef = doc(db, "posts", postId);
    const isLiked = currentPostData.likes && currentPostData.likes.includes(window.currentUser.uid);

    try {
        if (isLiked) {
            await updateDoc(postRef, { likes: arrayRemove(window.currentUser.uid) });
            currentPostData.likes = currentPostData.likes.filter(id => id !== window.currentUser.uid);
        } else {
            await updateDoc(postRef, { likes: arrayUnion(window.currentUser.uid) });
            if (!currentPostData.likes) currentPostData.likes = [];
            currentPostData.likes.push(window.currentUser.uid);
        }
        refreshLikeUI();
    } catch (e) {
        console.error("Error toggleFav:", e);
    }
};

function refreshLikeUI() {
    const btn = document.getElementById("fav-btn");
    const icon = document.getElementById("fav-icon");
    const countEl = document.getElementById("fav-count");
    if (!btn || !icon) return;

    const likes = currentPostData.likes || [];
    if (countEl) countEl.textContent = `(${likes.length})`;

    if (window.currentUser && likes.includes(window.currentUser.uid)) {
        btn.classList.add("liked");
        icon.style.fill = "#E03B3B";
        icon.style.stroke = "#E03B3B";
    } else {
        btn.classList.remove("liked");
        icon.style.fill = "none";
        icon.style.stroke = "currentColor";
    }
}

// Initialisation
onAuthStateChanged(auth, (user) => {
    setTimeout(() => {
        refreshLikeUI();
        if (window.currentUser) {
            const commAv = document.querySelector(".add-comment .comment-avatar");
            if (commAv) commAv.textContent = (window.currentUser.prenom[0] + window.currentUser.nom[0]).toUpperCase();
        }
    }, 500);
});

initPostDetail();
