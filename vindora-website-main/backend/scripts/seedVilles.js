const { db } = require('../config/firebaseAdmin');

const tunisiaCities = [
  "Tunis", "Ariana", "Ben Arous", "Manouba", "Nabeul", "Zaghouan", 
  "Bizerte", "Béja", "Jendouba", "Le Kef", "Siliana", "Kairouan", 
  "Kasserine", "Sidi Bouzid", "Sousse", "Monastir", "Mahdia", 
  "Sfax", "Gafsa", "Tozeur", "Kébili", "Gabès", "Médenine", "Tataouine"
];

async function seedVilles() {
  try {
    const villesRef = db.collection('villes');
    
    console.log("Nettoyage de la collection 'villes'...");
    const existing = await villesRef.get();
    const deleteBatch = db.batch();
    existing.forEach(doc => deleteBatch.delete(doc.ref));
    await deleteBatch.commit();

    console.log("Remplissage des villes...");
    const batch = db.batch();
    tunisiaCities.sort().forEach(cityName => {
      // Slugify simple for ID
      const docId = cityName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-');
      batch.set(villesRef.doc(docId), { name: cityName });
    });

    await batch.commit();
    console.log('Félicitations ! Les 24 villes de Tunisie ont été injectées avec succès.');
    process.exit(0);
  } catch (error) {
    console.error('Erreur lors du seeding des villes :', error);
    process.exit(1);
  }
}

seedVilles();
