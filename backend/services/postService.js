const { db } = require('../config/firebaseAdmin');
const PostModel = require('../models/postModel');

/**
 * Recupère toutes les publications (posts) depuis Firestore.
 * @returns {Promise<PostModel[]>} Une promesse contenant la liste des publications.
 */
async function getAllPosts() {
  try {
    const postsRef = db.collection('posts');
    const snapshot = await postsRef.orderBy('createdAt', 'desc').get();
    
    if (snapshot.empty) {
      console.log('Aucune publication trouvée.');
      return [];
    }

    const posts = [];
    snapshot.forEach(doc => {
      posts.push(PostModel.fromFirestore(doc));
    });

    return posts;
  } catch (error) {
    console.error('Erreur lors de la récupération des publications:', error);
    throw error;
  }
}

/**
 * Approuve une publication en changeant son statut à 'approved'.
 * @param {string} postId - L'ID de la publication.
 */
async function approvePost(postId) {
  try {
    const postRef = db.collection('posts').doc(postId);
    await postRef.update({
      status: 'approved'
    });
    console.log(`Publication ${postId} approuvée.`);
  } catch (error) {
    console.error(`Erreur lors de l'approbation de la publication ${postId}:`, error);
    throw error;
  }
}

/**
 * Supprime définitivement une publication de Firestore.
 * @param {string} postId - L'ID de la publication.
 */
async function deletePost(postId) {
  try {
    const postRef = db.collection('posts').doc(postId);
    await postRef.delete();
    console.log(`Publication ${postId} supprimée.`);
  } catch (error) {
    console.error(`Erreur lors de la suppression de la publication ${postId}:`, error);
    throw error;
  }
}

module.exports = {
  getAllPosts,
  approvePost,
  deletePost
};
