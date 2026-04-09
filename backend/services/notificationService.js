const { db, admin } = require('../config/firebaseAdmin');

/**
 * Envoie une notification (alerte) en temps réel à un utilisateur.
 * @param {string} userUid - L'UID de l'utilisateur destinataire.
 * @param {string} message - Le contenu du message.
 * @param {string} type - Le type de notification (alert, message, match, etc.)
 */
async function sendNotification(userUid, message, type = 'alert') {
  try {
    const notifRef = db.collection('notifications');
    const newNotif = {
      userUid: userUid,
      message: message,
      type: type,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await notifRef.add(newNotif);
    console.log(`Notification envoyée à ${userUid} avec succès [ID: ${docRef.id}]`);
    return docRef.id;
  } catch (error) {
    console.error(`Erreur lors de l'envoi de la notification à ${userUid}:`, error);
    throw error;
  }
}

module.exports = {
  sendNotification
};
