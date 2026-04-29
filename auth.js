import { auth, db } from "./firebase-config.js";
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    updatePassword, 
    reauthenticateWithCredential, 
    EmailAuthProvider,
    deleteUser,
    sendPasswordResetEmail,
    GoogleAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Fonction d'alerte professionnelle utilisant votre toast
function notify(msg) {
    if (window.showToast) {
        window.showToast(msg);
    } else {
        alert(msg);
    }
}

/**
 * Redirection intelligente selon le rôle
 */
function redirectByRole(role) {
    if (role === 'admin') {
        window.location.href = "admin.html";
    } else {
        window.location.href = "home.html";
    }
}

/**
 * INSCRIPTION (SIGNUP)
 */
export async function signUp(email, password, userData) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // On enregistre les infos dans Firestore
        await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            email: email,
            prenom: userData.prenom,
            nom: userData.nom,
            role: userData.role || 'user', // Par défaut 'user'
            createdAt: serverTimestamp()
        });

        notify("Compte créé avec succès !");
        redirectByRole(userData.role);
    } catch (error) {
        console.error("Erreur Inscription:", error);
        if (error.code === 'auth/email-already-in-use') {
            notify("Cette adresse email est déjà associée à un compte.");
        } else if (error.code === 'auth/weak-password') {
            notify("Le mot de passe est trop faible (6 caractères minimum).");
        } else if (error.code === 'auth/invalid-email') {
            notify("L'adresse email est invalide.");
        } else {
            notify("Erreur lors de la création du compte.");
        }
    }
}

/**
 * CONNEXION (LOGIN) AVEC VÉRIFICATION STRICTE DU RÔLE
 */
export async function login(email, password, selectedRole = 'user') {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const userData = docSnap.data();
            const actualRole = userData.role || 'user';
            
            console.log("Login check:", { selectedRole, actualRole });

            if (selectedRole === 'user' && actualRole === 'admin') {
                await signOut(auth);
                notify("Ce compte est un compte Administrateur. Veuillez utiliser le bouton Administrateur pour vous connecter.");
                return;
            }

            if (selectedRole === 'admin' && actualRole === 'user') {
                await signOut(auth);
                notify("Accès refusé. Ce bouton est réservé aux comptes Administrateurs.");
                return;
            }

            if (actualRole === 'admin') {
                notify("Bienvenue " + userData.prenom + " ! Redirection en cours...");
                setTimeout(() => { window.location.href = "admin.html"; }, 1000);
            } else {
                notify("Bienvenue " + userData.prenom + " ! Redirection...");
                setTimeout(() => { window.location.href = "home.html"; }, 1000);
            }
        } else {
            notify("Utilisateur introuvable dans la base !");
        }
    } catch (error) {
        console.error("Erreur Connexion:", error);
        notify("Email ou mot de passe incorrect.");
    }
}

/**
 * MOT DE PASSE OUBLIÉ
 */
export async function forgotPassword(email) {
    if (!email) {
        notify("Veuillez saisir votre adresse email dans le champ ci-dessus.");
        return;
    }
    try {
        await sendPasswordResetEmail(auth, email);
        notify("Email de réinitialisation envoyé ! Vérifiez votre boîte de réception.");
    } catch (error) {
        console.error("Erreur ForgotPassword:", error);
        if (error.code === 'auth/user-not-found') {
            notify("Aucun utilisateur trouvé avec cet email.");
        } else {
            notify("Erreur lors de l'envoi de l'email.");
        }
    }
}

/**
 * CONNEXION AVEC GOOGLE
 */
export async function loginWithGoogle(selectedRole = 'user') {
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        // On vérifie si le profil Firestore existe
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        let finalRole = selectedRole;

        if (!userDocSnap.exists()) {
            // Nouvel utilisateur via Google -> On crée le profil par défaut
            const names = (user.displayName || "").split(" ");
            const prenom = names[0] || "User";
            const nom = names.length > 1 ? names.slice(1).join(" ") : "Google";

            await setDoc(userDocRef, {
                uid: user.uid,
                email: user.email,
                prenom: prenom,
                nom: nom,
                role: 'user', // Les nouveaux via Google sont toujours 'user' par sécurité
                createdAt: serverTimestamp()
            });
            finalRole = 'user';
        } else {
            // Utilisateur existant -> On respecte son rôle actuel
            const userData = userDocSnap.data();
            finalRole = userData.role || 'user';

            // Vérification de cohérence comme pour le login classique
            if (selectedRole === 'admin' && finalRole !== 'admin') {
                await signOut(auth);
                notify("Accès refusé. Ce compte n'a pas les droits Administrateur.");
                return;
            }
            if (selectedRole === 'user' && finalRole === 'admin') {
                await signOut(auth);
                notify("Ce compte est un compte Administrateur. Veuillez utiliser le mode Administrateur.");
                return;
            }
        }

        notify("Connexion Google réussie !");
        redirectByRole(finalRole);

    } catch (error) {
        console.error("Erreur Google Login:", error);
        if (error.code !== 'auth/popup-closed-by-user') {
            notify("La connexion Google a échoué.");
        }
    }
}

/**
 * LOGOUT
 */
export async function logout() {
    try {
        await signOut(auth);
        window.location.href = "index.html";
    } catch (error) {
        console.error("Erreur Logout:", error);
    }
}

/**
 * MISE À JOUR MOT DE PASSE
 */
export async function changePassword(oldPassword, newPassword) {
    const user = auth.currentUser;
    if (!user) return;
    try {
        const credential = EmailAuthProvider.credential(user.email, oldPassword);
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, newPassword);
        notify("Mot de passe mis à jour !");
        return true;
    } catch (error) {
        console.error("Erreur Change Password:", error);
        notify("Erreur : " + error.message);
        return false;
    }
}

/**
 * TASK: SUPPRESSION DE COMPTE (SOI-MÊME)
 */
export async function deleteMyAccount() {
    const user = auth.currentUser;
    if (!user) {
        notify("Veuillez vous connecter pour supprimer votre compte.");
        return;
    }

    const confirmFirst = confirm("Êtes-vous ABSOLUMENT sûr ? Cette action supprimera votre profil et vos accès définitivement.");
    if (!confirmFirst) return;

    const confirmSecond = confirm("Dernière confirmation : Vos données seront perdues. Continuer ?");
    if (!confirmSecond) return;

    try {
        // 1. Supprimer le profil Firestore
        await deleteDoc(doc(db, "users", user.uid));

        // 2. Supprimer l'utilisateur Firebase Auth
        await deleteUser(user);

        notify("Votre compte a été supprimé avec succès. Au revoir !");
        setTimeout(() => {
            window.location.href = "index.html";
        }, 2000);

    } catch (error) {
        console.error("Erreur suppression compte :", error);
        
        if (error.code === 'auth/requires-recent-login') {
            alert("Sécurité : Veuillez vous reconnecter (Logout puis Login) avant de supprimer votre compte.");
            await signOut(auth);
            window.location.href = "index.html";
        } else {
            notify("Une erreur est survenue lors de la suppression.");
        }
    }
}

// EXPORTATIONS GLOBALES
window.login = (e, p, role) => login(e, p, role);
window.signUp = (e, p, d) => signUp(e, p, d);
window.logout = () => logout();
window.realDeleteAccount = deleteMyAccount;
window.forgotPassword = (email) => forgotPassword(email);
window.loginWithGoogle = (role) => loginWithGoogle(role);

/**
 * PROFILE UPDATES
 */
window.realUpdatePassword = async function() {
    const oldP = document.getElementById("old-password").value;
    const newP = document.getElementById("new-password").value;
    const confP = document.getElementById("confirm-password").value;

    if (!oldP || !newP || !confP) {
        notify("Veuillez remplir tous les champs !");
        return;
    }
    if (newP !== confP) {
        notify("Les mots de passe ne correspondent pas.");
        return;
    }

    const success = await changePassword(oldP, newP);
    if (success) {
        document.getElementById("old-password").value = "";
        document.getElementById("new-password").value = "";
        document.getElementById("confirm-password").value = "";
    }
};

window.realUpdateProfile = async function() {
    const user = auth.currentUser;
    if (!user) return;

    const data = {
        prenom: document.getElementById("edit-prenom").value,
        nom: document.getElementById("edit-nom").value,
        phone: document.getElementById("edit-phone").value,
        city: document.getElementById("edit-city").value,
        updatedAt: serverTimestamp()
    };

    try {
        await updateDoc(doc(db, "users", user.uid), data);
        notify("Profil mis à jour !");
    } catch (error) {
        console.error("Erreur Update Profile:", error);
        notify("Échec de la mise à jour.");
    }
};
