import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAMfR3IR-mwlcSoTRxvY7NqN4O4pL-zWUk",
  authDomain: "private-chat-18a44.firebaseapp.com",
  projectId: "private-chat-18a44",
  storageBucket: "private-chat-18a44.firebasestorage.app",
  messagingSenderId: "993010255286",
  appId: "1:993010255286:web:c49d609cf032f76c67ad17"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export Auth and Firestore so script.js can use them
export const auth = getAuth(app);
export const db = getFirestore(app);
