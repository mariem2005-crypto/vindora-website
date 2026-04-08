console.log("Running Notifications Script V1");

import { auth, db } from "./firebase-config.js";
import { collection, query, where, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// ====== VARIABLES GLOBALES ======
let allNotifications = [];
let currentFilter = 'all';

// ====== TASK 2: Fetch and logic ======
async function loadNotifications() {
    const user = auth.currentUser;
    if (!user) {
        console.warn("Utilisateur non authentifié. Arrêt du chargement des notifications.");
        return;
    }

    try {
        const notifRef = collection(db, "notifications");
        
        // Fetch notifications for the current user
        const q = query(notifRef, where("userUid", "==", user.uid));
        
        const querySnapshot = await getDocs(q);
        
        allNotifications = [];
        querySnapshot.forEach(docSnap => {
            // Store as plain objects so we can easily mutate local state (mark as read)
            allNotifications.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        // Sort descending by createdAt (latest first)
        allNotifications.sort((a, b) => {
            const timeA = (a.createdAt && a.createdAt.toMillis) ? a.createdAt.toMillis() : 0;
            const timeB = (b.createdAt && b.createdAt.toMillis) ? b.createdAt.toMillis() : 0;
            return timeB - timeA;
        });

        // Initial render
        window.filterNotifs(currentFilter);

    } catch (error) {
        console.error("Erreur lors de la récupération des notifications:", error);
    }
}

// ====== TASK 1 & 2: HTML UI Filtering Logic ======
window.filterNotifs = function(type) {
    currentFilter = type;
    
    // Update active button classes
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    if (type === 'all') document.getElementById('filter-notif-all').classList.add('active');
    else if (type === 'alert') document.getElementById('filter-notif-alerts').classList.add('active');
    else if (type === 'message') document.getElementById('filter-notif-messages').classList.add('active');
    else if (type === 'match') document.getElementById('filter-notif-matches').classList.add('active');

    const wrapper = document.getElementById('notifications-wrapper');
    if (!wrapper) return;
    
    // Clear current list
    wrapper.innerHTML = '';

    // Filter local array
    const filtered = allNotifications.filter(notif => {
        if (type === 'all') return true;
        
        if (type === 'message') {
            // Often messaging systems might use 'message' or 'comment'
            return notif.type === 'message' || notif.type === 'comment';
        }
        
        return notif.type === type;
    });

    if (filtered.length === 0) {
        wrapper.innerHTML = `
            <div class="empty-state">
              <div class="empty-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
              </div>
              <div class="empty-title">Aucune notification</div>
              <div class="empty-sub">Vous n'avez pas de notifications pour cette catégorie.</div>
            </div>
        `;
        return;
    }

    // Re-render
    filtered.forEach(notif => {
        const msg = notif.message || "Nouvelle notification";
        const isRead = notif.status === "read" || notif.read === true;
        
        let dateStr = "Récemment";
        if (notif.createdAt && notif.createdAt.toDate) {
             const d = notif.createdAt.toDate();
             dateStr = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
        }

        // Set Icon based on type
        let iconHtml = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
        if (notif.type === 'alert') {
            iconHtml = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2.2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
        } else if (notif.type === 'message' || notif.type === 'comment') {
            iconHtml = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
        } else if (notif.type === 'match') {
            iconHtml = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
        }

        let unreadClass = isRead ? "" : "unread";

        const card = document.createElement("div");
        card.className = `notif-card ${unreadClass}`;
        card.innerHTML = `
            <div class="notif-icon">${iconHtml}</div>
            <div class="notif-content">
                <div class="notif-message">${msg}</div>
                <div class="notif-date">${dateStr}</div>
            </div>
        `;

        if (!isRead) {
            card.onclick = () => window.markAsRead(notif.id, card);
        }

        wrapper.appendChild(card);
    });
};

// ====== TASK 3: Visual Feedback and DB Update ======
window.markAsRead = async function(docId, element) {
    try {
        // Update Firestore
        await updateDoc(doc(db, "notifications", docId), {
            status: "read"
        });
        
        // Remove unread visual class
        element.classList.remove("unread");
        element.onclick = null; // Disable clicking again

        // Update local state so it persists if the user clicks a tab filter
        const index = allNotifications.findIndex(n => n.id === docId);
        if (index !== -1) {
            allNotifications[index].status = "read";
        }

    } catch (error) {
        console.error("Erreur lors du changement de statut :", error);
    }
};

// ON AUTH STATE CHANGED
onAuthStateChanged(auth, user => {
    if (user) {
        loadNotifications();
    }
});
