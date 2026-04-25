import { auth, db } from "./firebase-config.js";
import { 
    doc, getDoc, getDocs, collection, addDoc, onSnapshot, query, where, orderBy, limit, 
    updateDoc, arrayUnion, arrayRemove, serverTimestamp, increment 
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
        console.warn("No postId found in URL.");
        window.location.href = "home.html";
        return;
    }

    try {
        console.log("Fetching post:", postId);
        const postRef = doc(db, "posts", postId);
        const postSnap = await getDoc(postRef);

        if (!postSnap.exists()) {
            console.error("Post not found:", postId);
            window.location.href = "home.html";
            return;
        }

        currentPostData = { id: postSnap.id, ...postSnap.data() };
        console.log("Post data loaded:", currentPostData);
        
        // 1. Injecter les données du post immédiatement
        injectPostData(currentPostData);

        // 2. Charger les données de l'auteur (Profil complet)
        if (currentPostData.authorUid) {
            loadAuthorProfile(currentPostData.authorUid);
        } else {
            console.warn("Post has no authorUid.");
        }

        // 3. Charger les publications similaires
        if (currentPostData.category) {
            loadSimilarPosts(currentPostData.category, postSnap.id);
        }

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
    if (!data) return;

    const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val || "N/A";
    };

    try {
        setText("detail-title", data.title);
        setText("breadcrumb-title", data.title);
        setText("detail-category", data.category);
        setText("breadcrumb-category", data.category);
        setText("detail-category-grid", data.category);
        setText("detail-type", (data.postType === "lost" || data.postType === "perdu") ? "Objet Perdu" : "Objet Trouvé");
        setText("detail-city", data.city);
        setText("detail-desc", data.description || data.content);

        // Dates (Gestion sécurisée)
        try {
            if (data.createdAt) {
                let date;
                if (data.createdAt.toDate) {
                    date = data.createdAt.toDate();
                } else if (data.createdAt.seconds) {
                    date = new Date(data.createdAt.seconds * 1000);
                } else {
                    date = new Date(data.createdAt);
                }
                
                if (!isNaN(date.getTime())) {
                    const formattedDate = date.toLocaleDateString("fr-FR", { day: '2-digit', month: 'short', year: 'numeric' });
                    setText("detail-date", formattedDate);
                    setText("detail-publish-time", formattedDate);
                } else {
                    setText("detail-date", "Date inconnue");
                }
            } else {
                setText("detail-date", "Récemment");
            }
        } catch (e) {
            console.warn("Error parsing date:", e);
            setText("detail-date", "N/A");
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
                imgEl.style.backgroundColor = "transparent";
            } else {
                imgEl.style.backgroundColor = "var(--bg)";
                imgEl.style.backgroundImage = "none";
                if (!imgEl.querySelector('.placeholder-icon')) {
                    const icon = document.createElement('div');
                    icon.className = 'placeholder-icon';
                    icon.innerHTML = "📷";
                    icon.style = "position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:40px; opacity:0.3; pointer-events:none;";
                    imgEl.appendChild(icon);
                }
            }
        }
    } catch (err) {
        console.error("Error in injectPostData baseline:", err);
    }

    // AFFECTATION DU NOM DE L'AUTEUR (Fallback immédiat)
    try {
        const authorNameEl = document.getElementById("detail-author-name");
        const authorAvEl = document.getElementById("detail-author-av");
        
        const prenom = data.authorPrenom || "";
        const nom = data.authorNom || "";
        
        if (authorNameEl) {
            if (prenom || nom) {
                authorNameEl.textContent = `${prenom} ${nom}`.trim();
            } else if (data.authorName) {
                authorNameEl.textContent = data.authorName;
            } else {
                authorNameEl.textContent = "Utilisateur Vindora"; // Fallback final
            }
        }
        
        if (authorAvEl) {
            if (prenom && nom) {
                authorAvEl.textContent = (prenom[0] + nom[0]).toUpperCase();
            } else if (prenom && prenom.length > 0) {
                authorAvEl.textContent = prenom[0].toUpperCase();
            } else {
                authorAvEl.textContent = "UV";
            }
        }
    } catch (err) {
        console.error("Error in Author Fallback logic:", err);
    }

    refreshLikeUI();
}

/**
 * CHARGEMENT DU PROFIL DE L'AUTEUR (Async)
 */
async function loadAuthorProfile(uid) {
    if (!uid) return;
    try {
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);
        
        const nameEl = document.getElementById("detail-author-name");
        const avEl = document.getElementById("detail-author-av");

        if (userSnap.exists()) {
            currentAuthorData = userSnap.data();
            const fullName = `${currentAuthorData.prenom || ''} ${currentAuthorData.nom || ''}`.trim() || "Utilisateur";
            
            if (nameEl) nameEl.textContent = fullName;
            
            if (avEl && currentAuthorData.prenom && currentAuthorData.nom) {
                const initials = (currentAuthorData.prenom[0] + currentAuthorData.nom[0]).toUpperCase();
                avEl.textContent = initials;
            } else if (avEl && currentAuthorData.prenom) {
                avEl.textContent = currentAuthorData.prenom[0].toUpperCase();
            }
        } else {
            console.warn("Author user document does not exist for UID:", uid);
            // Si le doc user n'existe pas, on garde le fallback ou on met "Ancien utilisateur"
            if (nameEl && nameEl.textContent === "Chargement...") {
                nameEl.textContent = "Ancien Utilisateur";
            }
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
    if (!listEl || !category) return;

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
                        <div class="related-title">${data.title || "Sans titre"}</div>
                        <div class="related-meta">${data.city || ""} · ${data.category || ""}</div>
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
    if (!currentPostData || !postId) return;
    if (!window.currentUser) {
        if (window.showToast) window.showToast("Vous devez être connecté.");
        return;
    }

    const input = document.getElementById("new-comment");
    const text = input.value.trim();
    if (!text) return;

    try {
        const commRef = collection(db, "comments");
        await addDoc(commRef, {
            postId: postId,
            postTitle: currentPostData.title || "Post",
            postOwnerUid: currentPostData.authorUid || "",
            text: text,
            authorUid: window.currentUser.uid,
            authorName: `${window.currentUser.prenom || ''} ${window.currentUser.nom || ''}`.trim() || "Utilisateur",
            createdAt: serverTimestamp()
        });

        input.value = "";
        if (window.showToast) window.showToast("Commentaire envoyé !");
    } catch (error) {
        console.error("Error sendComment:", error);
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
            
            const authorDisplay = data.authorName || "Utilisateur";
            const initials = authorDisplay.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);
            const isOwner = data.authorUid === currentPostData.authorUid;

            const div = document.createElement("div");
            div.className = "comment-item";
            div.innerHTML = `
                <div class="comment-av" style="background: var(--grad)">${initials || "?"}</div>
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
        if (window.showToast) window.showToast("Détails de contact non chargés.");
        return;
    }
    const phone = currentAuthorData.phone;
    const email = currentAuthorData.email;
    if (phone) {
        const cleanPhone = phone.replace(/\s+/g, '').replace('+', '');
        const waLink = `https://wa.me/${cleanPhone.length >= 8 && !cleanPhone.startsWith('216') ? '216' + cleanPhone : cleanPhone}`;
        window.open(waLink, '_blank');
    } else if (email) {
        window.location.href = `mailto:${email}?subject=Vindora : ${currentPostData.title}`;
    } else {
        if (window.showToast) window.showToast("Aucun média de contact.");
    }
};

/**
 * FAVORIS (LIKES)
 */
window.toggleFav = async () => {
    if (!window.currentUser || !postId) return;
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
    } catch (e) { console.error(e); }
};

window.reportPost = async () => {
    if (!window.currentUser || !postId) return;
    if (currentPostData.reportedBy && currentPostData.reportedBy.includes(window.currentUser.uid)) {
        if (window.showToast) window.showToast("Déjà signalé."); return;
    }
    if (!confirm("Signaler ce post ?")) return;
    try {
        await updateDoc(doc(db, "posts", postId), {
            reportsCount: increment(1),
            reportedBy: arrayUnion(window.currentUser.uid)
        });
        if (window.showToast) window.showToast("Post signalé.");
        if (!currentPostData.reportedBy) currentPostData.reportedBy = [];
        currentPostData.reportedBy.push(window.currentUser.uid);
    } catch (e) { console.error(e); }
};

function refreshLikeUI() {
    const btn = document.getElementById("fav-btn");
    const icon = document.getElementById("fav-icon");
    const countEl = document.getElementById("fav-count");
    if (!btn || !icon || !currentPostData) return;
    const likes = currentPostData.likes || [];
    if (countEl) countEl.textContent = `(${likes.length})`;
    if (window.currentUser && likes.includes(window.currentUser.uid)) {
        btn.classList.add("liked");
        icon.style.fill = "#E03B3B"; icon.style.stroke = "#E03B3B";
    } else {
        btn.classList.remove("liked");
        icon.style.fill = "none"; icon.style.stroke = "currentColor";
    }
}

// Global Auth State
onAuthStateChanged(auth, (user) => {
    setTimeout(() => {
        refreshLikeUI();
        if (window.currentUser && window.currentUser.prenom && window.currentUser.nom) {
            const commAv = document.querySelector(".add-comment .comment-avatar");
            if (commAv) commAv.textContent = (window.currentUser.prenom[0] + window.currentUser.nom[0]).toUpperCase();
        }
    }, 500);
});

// Run
initPostDetail();
