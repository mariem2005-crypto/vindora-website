import { auth, db } from "./firebase-config.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Fonction d'alerte professionnelle utilisant votre toast
function notify(msg) {
    if (window.showToast) {
        window.showToast(msg);
    } else {
        alert(msg);
    }
}

export async function register(email, password, nom, prenom, phone, city, role = 'user') {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        await setDoc(doc(db, "users", user.uid), {
            nom: nom,
            prenom: prenom,
            email: email,
            phone: phone,
            city: city,
            role: role,
            createdAt: serverTimestamp()
        });
        
        notify("Compte créé avec succès !");
        
        setTimeout(() => {
            if (role === 'admin') {
                window.location.href = "admin.html";
            } else {
                window.location.href = "home.html";
            }
        }, 1500);
    } catch (error) {
        console.error("Register Error:", error);
        if(error.code === 'auth/email-already-in-use') {
             notify("Cet email est déjà utilisé.");
        } else if(error.code === 'auth/weak-password') {
             notify("Le mot de passe doit faire au moins 6 caractères.");
        } else {
             notify("Erreur lors de l'inscription.");
        }
    }
}

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

            // Task 2: Post-Login Verification Logic (STRICT ENFORCEMENT)
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

            // SUCCESS: Roles match
            if (actualRole === 'admin') {
                notify("Bienvenue " + userData.prenom + " ! Redirection en cours...");
                setTimeout(() => {
                    window.location.href = "admin.html";
                }, 1000);
            } else {
                notify("Bienvenue " + userData.prenom + " ! Redirection...");
                setTimeout(() => {
                    window.location.href = "home.html";
                }, 1000);
            }
        } else {
            notify("Utilisateur introuvable dans la base !");
            await signOut(auth);
        }
    } catch (error) {
        console.error("Login Error:", error);
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
            notify("Email ou mot de passe incorrect.");
        } else {
            notify("Erreur lors de la connexion.");
        }
    }
}

// Liaisons pour index.html
window.realRegister = function() {
    const email = document.getElementById("reg-email").value;
    const password = document.getElementById("reg-password").value;
    const nom = document.getElementById("reg-nom").value;
    const prenom = document.getElementById("reg-prenom").value;
    const phone = document.getElementById("reg-phone").value;
    const citySelect = document.getElementById("reg-city");
    const city = citySelect.options[citySelect.selectedIndex].value;
    const pwdConfirmWrap = document.getElementById("reg-pwd-confirm");
    
    const role = window.currentRole || 'user';

    if (!email || !password || !nom || !prenom || !phone || !city) {
        notify("Veuillez remplir tous les champs !");
        return;
    }
    
    if (pwdConfirmWrap && password !== pwdConfirmWrap.value) {
        notify("Les mots de passe ne correspondent pas !");
        return;
    }

    notify("Inscription en cours...");
    register(email, password, nom, prenom, phone, city, role);
};

window.realLogin = function() {
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    // Capturer le rôle sélectionné AU MOMENT du clic
    const selectedRole = window.currentLoginRole || 'user';

    if (!email || !password) {
        notify("Veuillez remplir votre email et mot de passe.");
        return;
    }

    notify("Connexion en cours...");
    login(email, password, selectedRole);
};

export async function updateUserProfile(uid, newData) {
    if (!uid) throw new Error("User not authenticated");
    const docRef = doc(db, "users", uid);
    await updateDoc(docRef, newData);
}

window.realUpdateProfile = async function() {
    if (!window.currentUser) {
        notify("Veuillez vous connecter pour modifier votre profil.");
        return;
    }

    const nom = document.getElementById("edit-nom").value;
    const prenom = document.getElementById("edit-prenom").value;
    const phone = document.getElementById("edit-phone").value;
    const citySelect = document.getElementById("edit-city");
    const city = citySelect.options[citySelect.selectedIndex].value;

    if (!nom || !prenom) {
        notify("Le nom et le prénom sont obligatoires.");
        return;
    }

    try {
        const btn = document.getElementById("btn-update-profile");
        const originHTML = btn.innerHTML;
        btn.innerHTML = "Enregistrement...";
        btn.disabled = true;

        await updateUserProfile(window.currentUser.uid, {
            nom: nom,
            prenom: prenom,
            phone: phone,
            city: city
        });

        notify("Profil mis à jour avec succès !");

        // Update local session
        window.currentUser.nom = nom;
        window.currentUser.prenom = prenom;
        window.currentUser.phone = phone;
        window.currentUser.city = city;

        // Force UI refresh (if updateUIProfile exists globally or we just reload)
        setTimeout(() => {
            window.location.reload();
        }, 1500);
        
    } catch (e) {
        console.error("Update error: ", e);
        notify("Erreur lors de la mise à jour.");
        const btn = document.getElementById("btn-update-profile");
        btn.disabled = false;
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Enregistrer`;
    }
};

export async function updatePasswordBothPlaces(oldPass, newPass) {
    if (!auth.currentUser) throw new Error("No authenticated user.");
    
    // Step A.1: Re-authenticate
    const credential = EmailAuthProvider.credential(auth.currentUser.email, oldPass);
    await reauthenticateWithCredential(auth.currentUser, credential);
    
    // Step A.2: Update password in Firebase Auth
    await updatePassword(auth.currentUser, newPass);

    // Step B: Update password in Firestore users collection
    const docRef = doc(db, "users", auth.currentUser.uid);
    await updateDoc(docRef, { password: newPass });
}

window.realUpdatePassword = async function() {
    const oldPass = document.getElementById("old-password").value;
    const newPass = document.getElementById("new-password").value;
    const confirmPass = document.getElementById("confirm-password").value;

    if (!oldPass || !newPass || !confirmPass) {
        notify("Veuillez remplir tous les champs de mot de passe.");
        return;
    }

    if (newPass !== confirmPass) {
        notify("Erreur: Les mots de passe ne correspondent pas.");
        return;
    }

    if (newPass.length < 6) {
        notify("Le mot de passe doit faire au moins 6 caractères.");
        return;
    }

    try {
        const btn = document.getElementById("btn-submit-password");
        const originHTML = btn.innerHTML;
        btn.innerHTML = "Modification...";
        btn.disabled = true;

        await updatePasswordBothPlaces(oldPass, newPass);

        notify("Succès: Mot de passe mis à jour partout !");
        
        // Reset fields
        document.getElementById("old-password").value = "";
        document.getElementById("new-password").value = "";
        document.getElementById("confirm-password").value = "";

        btn.disabled = false;
        btn.innerHTML = originHTML;

    } catch (e) {
        console.error("Password update error:", e);
        if (e.code === 'auth/invalid-credential') {
            notify("Mot de passe actuel incorrect.");
        } else {
            notify("Erreur lors du changement de mot de passe.");
        }
        const btn = document.getElementById("btn-submit-password");
        btn.disabled = false;
        btn.innerHTML = "Changer mon mot de passe"; 
        // Fallback UI reset
    }
};
