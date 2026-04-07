import { auth, db } from "./firebaseConfig.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  doc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Get DOM Elements
const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const loginBtn = document.getElementById("login-btn");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const togglePasswordBtn = document.getElementById("toggle-password");
const errorMsg = document.getElementById("error-msg");
const sendBtn = document.getElementById("send-btn");
const messageInput = document.getElementById("message-input");
const chatMessages = document.getElementById("chat-messages");
const logoutBtn = document.getElementById("logout-btn");
const presenceIndicator = document.getElementById("presence-indicator");

let currentUser = null;

// --- TOGGLE PASSWORD VISIBILITY ---
togglePasswordBtn.addEventListener("click", () => {
  const isPassword = passwordInput.getAttribute("type") === "password";
  passwordInput.setAttribute("type", isPassword ? "text" : "password");
  togglePasswordBtn.innerText = isPassword ? "🙈" : "👁️";
});

// --- 1. LOGIN LOGIC ---
loginBtn.addEventListener("click", async () => {
  try {
    errorMsg.innerText = ""; // Clear old errors
    await signInWithEmailAndPassword(
      auth,
      emailInput.value.trim(),
      passwordInput.value,
    );
  } catch (error) {
    errorMsg.innerText = "Login Failed: Check email/password.";
  }
});

// Watch for User Login/Logout state changes
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");
    loadMessages();
    setupPresence();
  } else {
    currentUser = null;
    loginScreen.classList.remove("hidden");
    chatScreen.classList.add("hidden");
  }
});

// --- 2. SEND MESSAGE LOGIC ---
async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !currentUser) return;

  messageInput.value = ""; // Clear input immediately

  // Save to Firestore
  await addDoc(collection(db, "messages"), {
    text: text,
    user: currentUser.email,
    createdAt: serverTimestamp(), // Uses Firebase's server time to prevent timezone bugs
  });
}

// Send on Button Click or "Enter" key press
sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

// --- 3. LOAD MESSAGES LOGIC ---
function loadMessages() {
  // Query messages ordered by time
  const q = query(collection(db, "messages"), orderBy("createdAt", "asc"));

  // onSnapshot listens for real-time updates
  onSnapshot(q, (snapshot) => {
    chatMessages.innerHTML = ""; // Clear the UI before reloading

    snapshot.forEach((doc) => {
      const data = doc.data();
      const msgDiv = document.createElement("div");
      msgDiv.classList.add("message");

      // Check if I sent it, or my friend sent it
      if (data.user === currentUser.email) {
        msgDiv.classList.add("sent");
      } else {
        msgDiv.classList.add("received");
      }

      msgDiv.innerText = data.text;
      chatMessages.appendChild(msgDiv);
    });

    // Auto-scroll to the bottom of the chat
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
}

// --- 4. PRESENCE SYSTEM (Snapchat Style) ---
function setupPresence() {
  const presenceRef = doc(db, "room", "activeUsers");

  // Tell the database "I am here"
  setDoc(presenceRef, { [currentUser.email]: true }, { merge: true });

  // Listen to see if the friend is here
  onSnapshot(presenceRef, (snapshot) => {
    const data = snapshot.data();
    if (data) {
      // Check if any email other than ours is set to true
      const friendIsActive = Object.keys(data).some(
        (email) => email !== currentUser.email && data[email] === true,
      );

      if (friendIsActive) {
        presenceIndicator.classList.remove("hidden");
      } else {
        presenceIndicator.classList.add("hidden");
      }
    }
  });

  // Tell database "I left" when closing the tab
  window.addEventListener("beforeunload", () => {
    setDoc(presenceRef, { [currentUser.email]: false }, { merge: true });
  });
}

// --- 5. LOGOUT LOGIC ---
logoutBtn.addEventListener("click", () => {
  const presenceRef = doc(db, "room", "activeUsers");
  // Tell database we are leaving before signing out
  setDoc(presenceRef, { [currentUser.email]: false }, { merge: true }).then(
    () => {
      signOut(auth);
    },
  );
});
