const { db, admin } = require('../config/firebaseAdmin');

/**
 * Envoie une alerte préventive à un utilisateur via le serveur (Firebase Admin SDK).
 * @param {string} userId - L'ID du destinataire (destinataireId).
 * @param {string} postId - L'ID du post concerné.
 * @param {string} motif - La raison de l'alerte.
 * @returns {Promise<Object>} Un objet contenant le résultat de l'opération.
 */
async function sendAlert(userId, postId, motif) {
  try {
    // 1. Création de l'alerte dans la collection 'alerts'
    const alertRef = db.collection('alerts').doc();
    await alertRef.set({
      destinataireId: userId,
      postId: postId,
      motif: motif,
      date: admin.firestore.FieldValue.serverTimestamp(),
      lu: false
    });

    // 2. Mise à jour du post lié pour le passer sous surveillance
    const postRef = db.collection('posts').doc(postId);
    await postRef.update({
      status: 'sous_surveillance',
      averti: true
    });

    console.log(`[AlertService] Alerte "${motif}" envoyée à l'utilisateur ${userId} pour le post ${postId}.`);
    
    return { 
      success: true, 
      alertId: alertRef.id,
      message: "Alerte envoyée et post mis sous surveillance." 
    };
  } catch (error) {
    console.error("[AlertService] Erreur lors de l'envoi de l'alerte:", error);
    throw error;
  }
}

module.exports = {
  sendAlert
};
