import { db } from "./firebase-config.js";
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let cachedVilles = null;

/**
 * Récupère la liste des villes depuis Firestore (avec cache session)
 */
export async function getVilles() {
    if (cachedVilles) return cachedVilles;
    
    // Tentative de récupération depuis le cache session pour accélérer les changements de page
    const sessionData = sessionStorage.getItem("vindora_villes");
    if (sessionData) {
        cachedVilles = JSON.parse(sessionData);
        return cachedVilles;
    }

    try {
        const q = query(collection(db, "villes"), orderBy("name"));
        const snap = await getDocs(q);
        const villes = [];
        snap.forEach(doc => {
            villes.push(doc.data().name);
        });
        
        cachedVilles = villes;
        sessionStorage.setItem("vindora_villes", JSON.stringify(villes));
        return villes;
    } catch (error) {
        console.error("Erreur chargement villes:", error);
        return [];
    }
}

/**
 * Remplit un élément <select> avec la liste des villes
 * @param {string} selectId - L'ID de l'élément select
 * @param {Object} options - Options { includeAll: boolean, defaultText: string }
 */
export async function populateCitySelect(selectId, options = {}) {
    const selectEl = document.getElementById(selectId);
    if (!selectEl) return;

    const villes = await getVilles();
    
    // Garder la première option si c'est un placeholder ou "Toutes les villes"
    const firstOption = selectEl.options[0];
    selectEl.innerHTML = "";
    
    if (firstOption) {
        selectEl.appendChild(firstOption);
    } else if (options.includeAll) {
        const opt = document.createElement("option");
        opt.value = "Tous";
        opt.textContent = options.defaultText || "Toutes les villes";
        selectEl.appendChild(opt);
    }

    villes.forEach(v => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        selectEl.appendChild(opt);
    });
}
