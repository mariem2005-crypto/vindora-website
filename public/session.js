import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, collection, query, where, onSnapshot, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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
        where("read", "==", false),
        orderBy("createdAt", "desc"),
        limit(1)
    );

    onSnapshot(q, (snapshot) => {
        if (isInitialLoad) {
            isInitialLoad = false;
            return;
        }

        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const data = change.doc.data();
                if (window.showToast) {
                    window.showToast(data.message || "Nouvelle notification de l'administration !");
                }
            }
        });
    });
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
                window.currentUser = {
                    uid: user.uid,
                    ...userData
                };

                // Hydratation UI : Initiales, Nom complet et formulaire
                updateUIProfile(userData);

                // Activer l'écoute des notifications en temps réel
                setupNotificationListener(user.uid);

                // Règles de redirection et de sécurité (Session de Garde)
                if (isPublicPage) {
                    // S'il est sur index.html ou login mais qu'il est connecté, on l'envoie sur sa page
                    window.location.href = userData.role === 'admin' ? 'admin.html' : 'home.html';
                } else if (isAdminPage && userData.role !== 'admin') {
                    // Sécurité : Un utilisateur normal tente d'accéder à l'Admin panel !
                    sessionStorage.setItem("authError", "Accès refusé. Réservé aux administrateurs.");
                    window.location.href = "home.html";
                }

            } else {
                console.error("Erreur de session: Aucun profil utilisateur trouvé dans Firestore.");
            }
        } catch (error) {
            console.error("Erreur Firestore session:", error);
        }
    } else {
        window.currentUser = null;
        // Non connecté
        if (!isPublicPage) {
            sessionStorage.setItem("authError", "Veuillez vous vous connecter pour accéder à cette page.");
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
    
    // Mettre à jour les éléments contenant les initiales
    const initialsElements = document.querySelectorAll(".avatar, .admin-av, .profile-avatar, #user-initials");
    initialsElements.forEach(el => {
        el.textContent = initials;
    });

    // Mettre à jour les éléments de nom complet
    const fullNameElements = document.querySelectorAll("#user-fullname");
    fullNameElements.forEach(el => {
        el.textContent = userData.prenom + " " + userData.nom;
    });

    // Fill profile form if on profile.html
    const editNom = document.getElementById("edit-nom");
    if (editNom) {
        editNom.value = userData.nom || "";
        document.getElementById("edit-prenom").value = userData.prenom || "";
        document.getElementById("edit-email").value = userData.email || "";
        
        const telEl = document.getElementById("edit-phone");
        if (telEl) telEl.value = userData.phone || "";
        
        const cityEl = document.getElementById("edit-city");
        if (cityEl && userData.city) cityEl.value = userData.city;
        
        // Populate mapped password if it exists in db
        const oldPassEl = document.getElementById("old-password");
        if (oldPassEl && userData.password) oldPassEl.value = userData.password;
        
        const userProfileName = document.getElementById("user-profile-name");
        if (userProfileName) {
            userProfileName.textContent = `${userData.prenom} ${userData.nom}`;
        }
        
        const badgeRole = document.querySelector(".badge-role");
        if (badgeRole && userData.role) {
            badgeRole.textContent = userData.role === 'admin' ? 'Administrateur' : 'Utilisateur';
        }
        
        const profileEmail = document.querySelector(".profile-email");
        if (profileEmail && userData.email) {
            profileEmail.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="opacity:0.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg> ${userData.email}`;
        }
    }
}
