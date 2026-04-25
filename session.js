import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, collection, query, where, onSnapshot, orderBy, limit, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Variable globale pour accéder à l'utilisateur connecté depuis n'importe quel fichier
window.currentUser = null;

let isInitialLoad = true;

/**
 * Configure un listener en temps réel pour les notifications de l'utilisateur.
 * @param {string} userUid - L'UID de l'utilisateur.
 */
function setupNotificationListener(userUid) {
    const notifRef = collection(db, "notifications");
    const q = query(
        notifRef,
        where("userUid", "==", userUid),
        orderBy("createdAt", "desc"),
        limit(5)
    );

    onSnapshot(q, (snapshot) => {
        if (isInitialLoad) {
            isInitialLoad = false;
            return;
        }

        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const data = change.doc.data();
                const isUnread = data.read === false || data.status === "unread" || data.lu === false;

                if (isUnread && window.showToast) {
                    window.showToast(data.message || "Nouvelle notification de l'administration !");
                }
            }
        });
    });
}

/**
 * SYSTÈME D'ALERTES PRÉVENTIVES
 */
function setupAlertListener(userUid) {
    const alertsRef = collection(db, "alerts");
    const q = query(
        alertsRef,
        where("destinataireId", "==", userUid),
        where("lu", "==", false)
    );

    onSnapshot(q, (snapshot) => {
        // Supprimer la bannière existante si elle existe
        const existingBanner = document.getElementById("vindora-alert-banner");
        if (existingBanner) existingBanner.remove();

        if (!snapshot.empty) {
            const alertData = snapshot.docs[0].data();
            const alertId = snapshot.docs[0].id;
            injectAlertBanner(alertData.motif, alertId);
        }
    });
}

function injectAlertBanner(motif, alertId) {
    const container = document.getElementById("user-alerts-container");
    const banner = document.createElement("div");
    banner.id = "vindora-alert-banner";

    const isInline = !!container;
    const background = "#FFF7ED";
    const border = "2px solid #F59E0B";
    const shadow = isInline ? "none" : "0 4px 12px rgba(0,0,0,0.1)";
    const position = isInline ? "relative" : "sticky";
    const margin = isInline ? "20px 0" : "0";
    const radius = isInline ? "16px" : "0";

    banner.innerHTML = `
        <div style="background: ${background}; border: ${border}; border-radius: ${radius}; padding: 15px 20px; display: flex; align-items: center; justify-content: space-between; position: ${position}; top: 0; z-index: 9999; box-shadow: ${shadow}; margin: ${margin};">
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="background: #F59E0B; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink:0;">!</div>
                <div>
                    <strong style="color: #9A3412; font-size: 14px; display: block;">ALERTE PRÉVENTIVE : Risque de sanction</strong>
                    <span style="color: #C2410C; font-size: 12.5px; opacity:0.9;">Motif : ${motif}. Corriger vos publications pour éviter un blocage.</span>
                </div>
            </div>
            <button id="close-alert-btn" style="background: #F59E0B; border: none; color: white; padding: 6px 15px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 12px; transition: 0.2s; flex-shrink:0;">
                OK
            </button>
        </div>
    `;

    if (isInline) {
        container.style.display = "block";
        container.prepend(banner);
    } else {
        document.body.prepend(banner);
    }

    // GESTION DU CLIC OK (Correction : Doit être à l'intérieur de la fonction injectAlertBanner)
    const btn = banner.querySelector("#close-alert-btn");
    if (btn) {
        btn.onclick = async () => {
            btn.disabled = true;
            btn.textContent = "...";
            try {
                await updateDoc(doc(db, "alerts", alertId), { lu: true });
                banner.remove();
                if (isInline && container.children.length === 0) container.style.display = "none";
            } catch (e) { 
                console.error("Erreur lecture alerte :", e); 
                banner.remove(); 
            }
        };
    }
}

onAuthStateChanged(auth, async (user) => {
    const path = window.location.pathname.toLowerCase();
    const isPublicPage = path.endsWith("index.html") || path.endsWith("/") || path.includes("login");
    const isAdminPage = path.includes("admin.html");

    if (user) {
        try {
            const docRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const userData = docSnap.data();
                window.currentUser = { uid: user.uid, ...userData };
                updateUIProfile(userData);
                setupNotificationListener(user.uid);
                setupAlertListener(user.uid);

                if (isPublicPage) {
                    window.location.href = userData.role === 'admin' ? 'admin.html' : 'home.html';
                } else if (isAdminPage && userData.role !== 'admin') {
                    sessionStorage.setItem("authError", "Accès refusé. Réservé aux administrateurs.");
                    window.location.href = "home.html";
                }
            }
        } catch (error) { console.error("Erreur Firestore session:", error); }
    } else {
        window.currentUser = null;
        if (!isPublicPage) {
            sessionStorage.setItem("authError", "Veuillez vous vous connecter.");
            window.location.href = "index.html";
        }
    }
});

function updateUIProfile(userData) {
    const fullName = (userData.prenom || userData.nom)
        ? `${userData.prenom || ''} ${userData.nom || ''}`.trim()
        : "Utilisateur Vindora";

    const initials = (userData.prenom && userData.nom)
        ? (userData.prenom[0] + userData.nom[0]).toUpperCase()
        : "UV";

    document.querySelectorAll(".avatar, .admin-av, .profile-avatar, #user-initials").forEach(el => {
        el.textContent = initials;
    });

    document.querySelectorAll("#user-fullname").forEach(el => {
        el.textContent = userData.prenom + " " + userData.nom;
    });

    const editNom = document.getElementById("edit-nom");
    if (editNom) {
        editNom.value = userData.nom || "";
        document.getElementById("edit-prenom").value = userData.prenom || "";
        document.getElementById("edit-email").value = userData.email || "";
        const telEl = document.getElementById("edit-phone");
        if (telEl) telEl.value = userData.phone || "";
        const cityEl = document.getElementById("edit-city");
        if (cityEl && userData.city) cityEl.value = userData.city;
        const oldPassEl = document.getElementById("old-password");
        if (oldPassEl && userData.password) oldPassEl.value = userData.password;
        
        const userProfileName = document.getElementById("user-profile-name");
        if (userProfileName) userProfileName.textContent = `${userData.prenom} ${userData.nom}`;
        
        const badgeRole = document.querySelector(".badge-role");
        if (badgeRole && userData.role) badgeRole.textContent = userData.role === 'admin' ? 'Administrateur' : 'Utilisateur';
        
        const profileEmail = document.querySelector(".profile-email");
        if (profileEmail && userData.email) {
            profileEmail.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="opacity:0.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg> ${userData.email}`;
        }
    }
}
