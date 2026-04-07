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
  updateDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Get DOM Elements
const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const loginBtn = document.getElementById("login-btn");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const togglePasswordBtn = document.getElementById("toggle-password");
const errorMsg = document.getElementById("error-msg");
const micBtn = document.getElementById("mic-btn");
const sendBtn = document.getElementById("send-btn");
const messageInput = document.getElementById("message-input");
const chatMessages = document.getElementById("chat-messages");
const logoutBtn = document.getElementById("logout-btn");
const presenceIndicator = document.getElementById("presence-indicator");

let currentUser = null;
let unreadMessages = [];

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
    status: "sent" // Default status for new messages
  });
}

// Send on Button Click or "Enter" key press
sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

// --- 2.5. VOICE NOTE LOGIC ---
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

micBtn.addEventListener("click", async () => {
  if (!isRecording) {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunks.push(event.data);
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        audioChunks = []; // Reset chunks for next recording

        // Convert the Audio Blob to a Base64 String (The Free Workaround!)
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);

        reader.onloadend = async () => {
          const base64String = reader.result;

          // Save the voice note as a message directly in Firestore
          await addDoc(collection(db, "messages"), {
            text: "🎵 Voice Note",
            audioUrl: base64String, // We pass the long text string into the audioUrl
            user: currentUser.email,
            createdAt: serverTimestamp(),
            status: "sent",
          });
        };
      };
      
      mediaRecorder.start();
      isRecording = true;
      micBtn.classList.add("recording");
      micBtn.innerText = "🔴"; 
    } catch (err) {
      console.error("Microphone access error:", err);
      alert("Please allow microphone permissions to send voice notes.");
    }
  } else {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop()); // Completely release mic
    isRecording = false;
    micBtn.classList.remove("recording");
    micBtn.innerText = "🎙️";
  }
});

// --- 3. LOAD MESSAGES LOGIC ---
function loadMessages() {
  // Query messages ordered by time
  const q = query(collection(db, "messages"), orderBy("createdAt", "asc"));

  // onSnapshot listens for real-time updates
  onSnapshot(q, (snapshot) => {
    chatMessages.innerHTML = ""; // Clear the UI before reloading
    unreadMessages = []; // Reset unread pool on every reload
    let lastDateString = null;

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();

      // Handle Firebase serverTimestamp pending state (null locally at first)
      const timestamp = data.createdAt ? data.createdAt.toDate() : new Date();
      
      // Date logic for Mid-Chat Separator
      const dateOptions = { year: 'numeric', month: 'short', day: 'numeric' };
      const msgDate = timestamp.toLocaleDateString(undefined, dateOptions);
      
      const today = new Date().toLocaleDateString(undefined, dateOptions);
      const yesterday = new Date(Date.now() - 86400000).toLocaleDateString(undefined, dateOptions);
      
      let displayDate = msgDate;
      if (msgDate === today) displayDate = "Today";
      else if (msgDate === yesterday) displayDate = "Yesterday";

      if (displayDate !== lastDateString) {
        const dateDiv = document.createElement("div");
        dateDiv.classList.add("date-separator");
        dateDiv.innerText = displayDate;
        chatMessages.appendChild(dateDiv);
        lastDateString = displayDate;
      }

      const msgDiv = document.createElement("div");
      msgDiv.classList.add("message");

      const textSpan = document.createElement("span");
      textSpan.innerText = data.text;
      msgDiv.appendChild(textSpan);

      // If the message contains an audioURL, render the audio player
      if (data.audioUrl) {
        const audioEl = document.createElement("audio");
        audioEl.controls = true;
        audioEl.src = data.audioUrl;
        msgDiv.appendChild(audioEl);
      }

      // Time & Meta logic for Message
      const timeString = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const metaDiv = document.createElement("div");
      metaDiv.classList.add("message-meta");
      
      const timeSpan = document.createElement("span");
      timeSpan.classList.add("message-time");
      timeSpan.innerText = timeString;
      metaDiv.appendChild(timeSpan);

      // Check if I sent it, or my friend sent it
      if (data.user === currentUser.email) {
        msgDiv.classList.add("sent");

        // Delete Button
        const deleteBtn = document.createElement("span");
        deleteBtn.classList.add("delete-btn");
        deleteBtn.innerText = "🗑";
        deleteBtn.onclick = async () => {
          await deleteDoc(doc(db, "messages", docSnap.id));
        };

        const ticks = document.createElement("span");
        ticks.classList.add("message-ticks");

        if (data.status === "seen") {
          ticks.innerText = "✓✓";
          ticks.classList.add("tick-seen");
        } else if (data.status === "delivered") {
          ticks.innerText = "✓✓";
          ticks.classList.add("tick-delivered");
        } else {
          ticks.innerText = "✓"; // default to sent
          ticks.classList.add("tick-sent");
        }

        metaDiv.appendChild(ticks);
        msgDiv.appendChild(metaDiv);
        msgDiv.appendChild(deleteBtn); // Attach to the outer message bubble for absolute positioning
      } else {
        msgDiv.classList.add("received");
        msgDiv.appendChild(metaDiv);

        // Update message status if we are receiving it
        if (data.status !== "seen") {
          if (document.hasFocus()) {
            // Window is active, mark directly as seen
            updateDoc(doc(db, "messages", docSnap.id), { status: "seen" });
          } else {
            // Window is in background, queue up for when focused
            unreadMessages.push(docSnap.id);
            if (data.status !== "delivered") {
              updateDoc(doc(db, "messages", docSnap.id), { status: "delivered" });
            }
          }
        }
      }

      chatMessages.appendChild(msgDiv);
    });

    // Auto-scroll to the bottom of the chat
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
}

// --- 3.5. HANDLE WINDOW FOCUS FOR READ RECEIPTS ---
window.addEventListener("focus", () => {
  if (unreadMessages.length > 0) {
    unreadMessages.forEach(id => {
      updateDoc(doc(db, "messages", id), { status: "seen" });
    });
    unreadMessages = [];
  }

  // Update presence to active when window is focused
  if (currentUser) {
    setDoc(doc(db, "room", "activeUsers"), { [currentUser.email]: true }, { merge: true });
  }
});

window.addEventListener("blur", () => {
  // Update presence to inactive when user switches tabs or minimizes
  if (currentUser) {
    setDoc(doc(db, "room", "activeUsers"), { [currentUser.email]: false }, { merge: true });
  }
});

// --- 4. PRESENCE SYSTEM (Snapchat Style) ---
function setupPresence() {
  const presenceRef = doc(db, "room", "activeUsers");

  // Tell the database "I am here" only if the window is currently focused
  setDoc(presenceRef, { [currentUser.email]: document.hasFocus() }, { merge: true });

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
