const { admin, db } = require('../config/firebaseAdmin');
const UserModel = require('../models/userModel');

/**
 * Récupère tous les utilisateurs depuis la collection Firestore 'users'.
 * @returns {Promise<UserModel[]>} Liste des utilisateurs.
 */
async function getAllUsers() {
  try {
    const usersRef = db.collection('users');
    const snapshot = await usersRef.get();
    
    if (snapshot.empty) {
      return [];
    }

    const users = [];
    snapshot.forEach(doc => {
      users.push(UserModel.fromFirestore(doc));
    });

    return users;
  } catch (error) {
    console.error('Erreur lors de la récupération des utilisateurs:', error);
    throw error;
  }
}

/**
 * Bascule le statut d'un utilisateur entre 'active' et 'blocked'.
 * Synchronise également avec Firebase Authentication pour désactiver/activer le compte.
 * @param {string} uid - L'identifiant unique de l'utilisateur (UID).
 */
async function toggleUserStatus(uid) {
  try {
    const userRef = db.collection('users').doc(uid);
    const doc = await userRef.get();

    if (!doc.exists) {
      throw new Error(`Utilisateur avec l'UID ${uid} non trouvé dans Firestore.`);
    }

    const userData = doc.data();
    const currentStatus = userData.status || 'active';
    const newStatus = currentStatus === 'active' ? 'blocked' : 'active';
    const isDisabled = newStatus === 'blocked';

    // 1. Mettre à jour l'état dans Firebase Authentication
    await admin.auth().updateUser(uid, {
      disabled: isDisabled
    });

    // 2. Mettre à jour le statut dans Firestore
    await userRef.update({
      status: newStatus
    });

    console.log(`Utilisateur ${uid} est maintenant ${newStatus} (Auth disabled: ${isDisabled})`);
    return newStatus;
  } catch (error) {
    console.error(`Erreur lors de la bascule du statut de l'utilisateur ${uid}:`, error);
    throw error;
  }
}

/**
 * Supprime un utilisateur de Firestore et de Firebase Authentication.
 * @param {string} uid - L'identifiant unique de l'utilisateur.
 */
async function deleteUser(uid) {
  try {
    // 1. Supprimer du service Authentication
    await admin.auth().deleteUser(uid);

    // 2. Supprimer de Firestore
    await db.collection('users').doc(uid).delete();

    console.log(`Utilisateur ${uid} supprimé d'Auth et de Firestore.`);
  } catch (error) {
    console.error(`Erreur lors de la suppression de l'utilisateur ${uid}:`, error);
    throw error;
  }
}

module.exports = {
  getAllUsers,
  toggleUserStatus,
  deleteUser
};
