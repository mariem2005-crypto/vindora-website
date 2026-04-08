import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAH2tdZ2UEWmb8G22WuZoFpvCCJsQ5OP3M",
  authDomain: "vindora-project.firebaseapp.com",
  projectId: "vindora-project",
  storageBucket: "vindora-project.firebasestorage.app",
  messagingSenderId: "596718188449",
  appId: "1:596718188449:web:09f4f964b947a641c77de0"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);