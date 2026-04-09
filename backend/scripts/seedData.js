const { db, admin } = require('../config/firebaseAdmin');

const samplePosts = [
  {
    title: "iPhone 14 Pro — Bleu",
    content: "Perdu à la station Tunis Marine ce matin. Coque en silicone.",
    category: "Électronique",
    objectType: "Téléphone",
    city: "Tunis",
    postType: "lost",
    status: "active",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    imageUrl: null
  },
  {
    title: "Sac à dos Nike — Noir",
    content: "Trouvé près de la faculté des sciences. Contient des cahiers.",
    category: "Accessoires",
    objectType: "Sac",
    city: "Sfax",
    postType: "found",
    status: "active",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    imageUrl: null
  },
  {
    title: "Trousseau de clés",
    content: "Perdu au centre commercial Carrefour. Porte-clé rouge.",
    category: "Autres",
    objectType: "Clés",
    city: "Tunis",
    postType: "lost",
    status: "active",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    imageUrl: null
  },
  {
    title: "Montre Casio",
    content: "Trouvée sur la plage de Hammamet. Bracelet métallique.",
    category: "Accessoires",
    objectType: "Montre",
    city: "Nabeul",
    postType: "found",
    status: "active",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    imageUrl: null
  }
];

async function seedPosts() {
  try {
    const postsRef = db.collection('posts');
    const batch = db.batch();

    console.log("Suppression des anciens posts de test (optionnel)...");
    
    samplePosts.forEach(post => {
      const newDocRef = postsRef.doc();
      batch.set(newDocRef, post);
    });

    await batch.commit();
    console.log('Données de test mises à jour avec succès !');
    process.exit(0);
  } catch (error) {
    console.error('Erreur lors de la mise à jour des données:', error);
    process.exit(1);
  }
}

seedPosts();
