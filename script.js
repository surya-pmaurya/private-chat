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
import { emojiList } from "./emoji.js";

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
const themeToggle = document.getElementById("theme-toggle");
const reactionMenu = document.getElementById("reaction-menu");
const messageOptionsMenu = document.getElementById("message-options-menu");
const menuReply = document.getElementById("menu-reply");
const menuCopy = document.getElementById("menu-copy");
const menuDelete = document.getElementById("menu-delete");
const emojiPicker = document.getElementById("emoji-picker");
const moreEmojisBtn = document.getElementById("more-emojis-btn");
const typingIndicator = document.getElementById("typing-indicator");
const replyPreview = document.getElementById("reply-preview");
const replyText = document.getElementById("reply-text");
const cancelReplyBtn = document.getElementById("cancel-reply-btn");
const lastSeenEl = document.getElementById("last-seen");

let currentUser = null;
let unreadMessages = [];
let activeMessageIdForReaction = null;
let activeMessageForMenu = null;
let replyingToMessage = null;
let typingTimeout = null;
let isTyping = false;
let knownMessageIds = new Set();
let isInitialLoad = true;

// --- TOGGLE PASSWORD VISIBILITY ---
togglePasswordBtn.addEventListener("click", () => {
  const isPassword = passwordInput.getAttribute("type") === "password";
  passwordInput.setAttribute("type", isPassword ? "text" : "password");
  togglePasswordBtn.innerText = isPassword ? "🙈" : "👁️";
});

// --- THEME TOGGLE LOGIC ---
if (localStorage.getItem("theme") === "dark") {
  document.body.classList.add("dark-theme");
  themeToggle.innerText = "☀️";
}

themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("dark-theme");
  const isDark = document.body.classList.contains("dark-theme");
  themeToggle.innerText = isDark ? "☀️" : "🌙";
  localStorage.setItem("theme", isDark ? "dark" : "light");
});

// --- 1. LOGIN LOGIC ---
loginBtn.addEventListener("click", async () => {
  // Ask for notification permissions if not already granted or denied
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }

  try {
    errorMsg.innerText = ""; // Clear old errors
    await signInWithEmailAndPassword(
      auth,
      emailInput.value.trim(),
      passwordInput.value,
    );
  } catch (error) {
    errorMsg.innerText = "Login Failed: Check email/password.";
    setTimeout(() => {
      errorMsg.innerText = "";
    }, 5000);
  }
});

// Watch for User Login/Logout state changes
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");

    // Request notification permission for auto-logged-in users
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    loadMessages();
    setupPresence();
  } else {
    currentUser = null;
    knownMessageIds.clear(); // Reset tracked messages
    isInitialLoad = true;    // Reset load state
    loginScreen.classList.remove("hidden");
    chatScreen.classList.add("hidden");
  }
});

// --- 2. SEND MESSAGE LOGIC ---
async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !currentUser) return;

  messageInput.value = ""; // Clear input immediately

  // Instantly clear typing status
  isTyping = false;
  clearTimeout(typingTimeout);
  setDoc(doc(db, "room", "typingStatus"), { [currentUser.email]: false }, { merge: true });

  // Save to Firestore
  await addDoc(collection(db, "messages"), {
    text: text,
    user: currentUser.email,
    createdAt: serverTimestamp(), // Uses Firebase's server time to prevent timezone bugs
    status: "sent", // Default status for new messages
    replyTo: replyingToMessage || null // Attach reply payload if it exists
  });

  // Clear reply state
  replyingToMessage = null;
  replyPreview.classList.add("hidden");
}

// Send on Button Click or "Enter" key press
sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

// Listen for typing to update Indicator
messageInput.addEventListener("input", () => {
  if (!currentUser) return;
  const typingRef = doc(db, "room", "typingStatus");
  
  // Only send the database request once when you begin typing
  if (!isTyping) {
    isTyping = true;
    setDoc(typingRef, { [currentUser.email]: true }, { merge: true });
  }
  
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    isTyping = false;
    setDoc(typingRef, { [currentUser.email]: false }, { merge: true });
  }, 1500); // Wait 1.5 seconds after last keystroke to clear typing status
});

// Cancel Reply
cancelReplyBtn.addEventListener("click", () => {
  replyingToMessage = null;
  replyPreview.classList.add("hidden");
});

// --- FIX MOBILE KEYBOARD PANNING ---
// Forces the browser to keep the navbar at the top when the keyboard opens
messageInput.addEventListener("focus", () => {

  // Fallback: Request permission upon user interaction if it wasn't triggered
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
  setTimeout(() => {
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }, 100);
});

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
}

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
            replyTo: replyingToMessage || null
          });

          // Clear reply state after sending voice note
          replyingToMessage = null;
          replyPreview.classList.add("hidden");
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

// --- 2.8 REACTION MENU LOGIC ---
reactionMenu.querySelectorAll(".quick-emoji").forEach(emoji => {
  emoji.addEventListener("click", async () => {
    if (activeMessageIdForReaction) {
      await updateDoc(doc(db, "messages", activeMessageIdForReaction), {
        reaction: emoji.innerText
      });
      reactionMenu.classList.add("hidden");
      emojiPicker.classList.add("hidden");
      activeMessageIdForReaction = null;
    }
  });
});

// Populate the full emoji picker dynamically
emojiList.forEach(emojiChar => {
  const span = document.createElement("span");
  span.innerText = emojiChar;
  span.addEventListener("click", async () => {
    if (activeMessageIdForReaction) {
      await updateDoc(doc(db, "messages", activeMessageIdForReaction), {
        reaction: emojiChar
      });
      reactionMenu.classList.add("hidden");
      emojiPicker.classList.add("hidden");
      activeMessageIdForReaction = null;
    }
  });
  emojiPicker.appendChild(span);
});

// Toggle the extended emoji picker when clicking the + button
moreEmojisBtn.addEventListener("click", (e) => {
  e.stopPropagation(); // Prevent the document click listener from hiding it immediately
  const rect = reactionMenu.getBoundingClientRect();
  
  let left = rect.left;
  if (left + 260 > window.innerWidth) left = window.innerWidth - 270; // Keep within screen bounds
  emojiPicker.style.left = `${left}px`;

  // Position above or below the reaction menu based on available screen space
  if (rect.bottom + 210 > window.innerHeight) emojiPicker.style.top = `${rect.top - 210}px`;
  else emojiPicker.style.top = `${rect.bottom + 10}px`;

  emojiPicker.classList.toggle("hidden");
});

// --- 2.9 OPTIONS MENU LOGIC ---
menuReply.addEventListener("click", () => {
  if (activeMessageForMenu) {
    replyingToMessage = activeMessageForMenu;
    replyText.innerText = activeMessageForMenu.text;
    replyPreview.classList.remove("hidden");
    messageInput.focus();
    messageOptionsMenu.classList.add("hidden");
  }
});

menuCopy.addEventListener("click", async () => {
  if (activeMessageForMenu) {
    try {
      await navigator.clipboard.writeText(activeMessageForMenu.text);
    } catch (err) {
      console.error("Failed to copy text", err);
    }
    messageOptionsMenu.classList.add("hidden");
  }
});

menuDelete.addEventListener("click", async () => {
  if (activeMessageForMenu) {
    await deleteDoc(doc(db, "messages", activeMessageForMenu.id));
    messageOptionsMenu.classList.add("hidden");
  }
});

// Hide menus when clicking elsewhere
document.addEventListener("click", (e) => {
  if (!reactionMenu.classList.contains("hidden") && !reactionMenu.contains(e.target) && !emojiPicker.contains(e.target)) {
    reactionMenu.classList.add("hidden"); // Hide if clicking anywhere else
    emojiPicker.classList.add("hidden");
    activeMessageIdForReaction = null;
  }
  if (!messageOptionsMenu.classList.contains("hidden") && !messageOptionsMenu.contains(e.target)) {
    messageOptionsMenu.classList.add("hidden");
    activeMessageForMenu = null;
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
      const isNewMessage = !knownMessageIds.has(docSnap.id);
      knownMessageIds.add(docSnap.id);

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

      // If this message is a reply to another message, render the nested reply box
      if (data.replyTo) {
        const replyBox = document.createElement("div");
        replyBox.classList.add("message-reply");
        replyBox.innerText = data.replyTo.text;
        msgDiv.appendChild(replyBox);
      }

      const textSpan = document.createElement("span");
      textSpan.innerText = data.text;
      msgDiv.appendChild(textSpan);

      // If the message contains an audioURL, render the audio player
      if (data.audioUrl) {
        const audioContainer = document.createElement("div");
        audioContainer.classList.add("voice-note-container");

        const playBtn = document.createElement("button");
        playBtn.classList.add("voice-note-play-btn");
        playBtn.innerHTML = "▶";

        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = "0";
        slider.max = "100";
        slider.value = "0";
        slider.classList.add("voice-note-slider");
        
        // Prevent slider scrubbing from triggering the swipe-to-reply feature
        slider.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });
        slider.addEventListener("touchmove", (e) => e.stopPropagation(), { passive: true });

        const timerSpan = document.createElement("span");
        timerSpan.classList.add("voice-note-timer");
        timerSpan.innerText = "0:00";

        const audioEl = document.createElement("audio");
        audioEl.src = data.audioUrl;

        const formatTime = (seconds) => {
          if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
          const m = Math.floor(seconds / 60);
          const s = Math.floor(seconds % 60);
          return `${m}:${s < 10 ? '0' : ''}${s}`;
        };

        audioEl.addEventListener("loadedmetadata", () => {
          if (audioEl.duration && isFinite(audioEl.duration)) {
            timerSpan.innerText = formatTime(audioEl.duration);
          }
        });

        playBtn.addEventListener("click", () => {
          if (audioEl.paused) {
            audioEl.play();
            playBtn.innerHTML = "⏸";
          } else {
            audioEl.pause();
            playBtn.innerHTML = "▶";
          }
        });

        audioEl.addEventListener("timeupdate", () => {
          if (audioEl.duration && isFinite(audioEl.duration)) {
            slider.value = (audioEl.currentTime / audioEl.duration) * 100;
          }
          timerSpan.innerText = formatTime(audioEl.currentTime);
        });

        slider.addEventListener("input", (e) => {
          if (audioEl.duration && isFinite(audioEl.duration)) {
            audioEl.currentTime = (e.target.value / 100) * audioEl.duration;
          }
        });

        audioEl.addEventListener("ended", () => {
          playBtn.innerHTML = "▶";
          slider.value = 0;
          if (audioEl.duration && isFinite(audioEl.duration)) {
            timerSpan.innerText = formatTime(audioEl.duration);
          } else {
            timerSpan.innerText = "0:00";
          }
        });

        audioContainer.appendChild(playBtn);
        audioContainer.appendChild(slider);
        audioContainer.appendChild(timerSpan);
        audioContainer.appendChild(audioEl); // Hidden element driving the audio
        msgDiv.appendChild(audioContainer);
      }

      // Time & Meta logic for Message
      const timeString = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const metaDiv = document.createElement("div");
      metaDiv.classList.add("message-meta");
      
      const timeSpan = document.createElement("span");
      timeSpan.classList.add("message-time");
      timeSpan.innerText = timeString;
      metaDiv.appendChild(timeSpan);

      // Swipe to Reply Touch Interactions
      let startX = 0;
      let currentX = 0;

      msgDiv.addEventListener("touchstart", (e) => {
        startX = e.touches[0].clientX;
      }, { passive: true });

      msgDiv.addEventListener("touchmove", (e) => {
        if (!startX) return;
        currentX = e.touches[0].clientX;
        const diff = currentX - startX;
        if (Math.abs(diff) > 0 && Math.abs(diff) < 80) { // Limit swipe to 80px in either direction
          msgDiv.style.transform = `translateX(${diff}px)`;
          msgDiv.style.transition = 'none'; // Disable CSS transition for live drag
        }
      }, { passive: true });

      const handleTouchEnd = () => {
        if (!startX || !currentX) return;
        const diff = currentX - startX;
        
        // Snap back to original position
        msgDiv.style.transform = ``;
        msgDiv.style.transition = ''; 
        
        if (Math.abs(diff) > 50) { // If dragged more than 50px in either direction, activate the reply
          replyingToMessage = { id: docSnap.id, text: data.text, user: data.user };
          replyText.innerText = data.text;
          replyPreview.classList.remove("hidden");
          messageInput.focus();
        }
        startX = 0;
        currentX = 0;
      };

      msgDiv.addEventListener("touchend", handleTouchEnd, { passive: true });
      msgDiv.addEventListener("touchcancel", handleTouchEnd, { passive: true }); // Failsafe if gesture is interrupted

      // Reaction Context Menu (Long Press / Right Click)
      msgDiv.addEventListener("contextmenu", (e) => {
        e.preventDefault(); // Prevent standard right-click menu
        activeMessageIdForReaction = docSnap.id;
        
        const rect = msgDiv.getBoundingClientRect();
        let left = rect.left + (rect.width / 2) - 140; // Center the slightly wider menu (approx 280px)
        left = Math.max(10, Math.min(left, window.innerWidth - 290)); // Increase screen boundary so it doesn't push off the right side
        
        let top = rect.top - 55; // Show above message
        if (top < 60) top = rect.bottom + 10; // If too close to top edge, show below message
        
        reactionMenu.style.left = `${left}px`;
        reactionMenu.style.top = `${top}px`;
        reactionMenu.classList.remove("hidden");
        emojiPicker.classList.add("hidden"); // Reset the expanded picker if open
      });

      // Render Reaction Badge
      if (data.reaction) {
        const badge = document.createElement("div");
        badge.classList.add("reaction-badge");
        badge.innerText = data.reaction;
        badge.onclick = async (e) => {
          e.stopPropagation(); // Prevent bubbling up
          await updateDoc(doc(db, "messages", docSnap.id), { reaction: null }); // Removes reaction if clicked again
        };
        msgDiv.appendChild(badge);
      }

      // Render 3-Dot Options Menu Button
      const optionsBtn = document.createElement("span");
      optionsBtn.classList.add("msg-options-btn");
      optionsBtn.innerText = "⋮";
      optionsBtn.onclick = (e) => {
        e.stopPropagation();
        activeMessageForMenu = { id: docSnap.id, text: data.text, user: data.user };
        
        // Show delete only for the sender
        if (data.user === currentUser.email) menuDelete.style.display = "block";
        else menuDelete.style.display = "none";

        const rect = optionsBtn.getBoundingClientRect();
        let left = rect.right; // Shift popup menu to spawn on the right side
        if (left + 150 > window.innerWidth) left = window.innerWidth - 160; // Flip left if off-screen
        let top = rect.bottom;
        if (top + 160 > window.innerHeight) top = rect.top - 160; // Keep on screen
        
        messageOptionsMenu.style.left = `${left}px`;
        messageOptionsMenu.style.top = `${top}px`;
        messageOptionsMenu.classList.remove("hidden");
        
        // Hide other menus just in case
        reactionMenu.classList.add("hidden");
        emojiPicker.classList.add("hidden");
      };
      msgDiv.appendChild(optionsBtn);

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

        // Trigger Notification if it's a newly received message
        if (isNewMessage && !isInitialLoad) {
          if ("Notification" in window && Notification.permission === "granted") {
            const senderName = data.user.split("@")[0];
            const bodyText = data.audioUrl ? "🎵 Sent a voice note" : data.text;
            new Notification(`Message from ${senderName}`, { body: bodyText });
          }
        }

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

    isInitialLoad = false; // Initial batch of messages loaded, allow notifications for subsequent messages

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
    setDoc(doc(db, "room", "lastSeen"), { [currentUser.email]: serverTimestamp() }, { merge: true });
  }
});

// --- 4. PRESENCE SYSTEM (Snapchat Style) ---
function setupPresence() {
  const presenceRef = doc(db, "room", "activeUsers");
  const typingRef = doc(db, "room", "typingStatus");
  const lastSeenRef = doc(db, "room", "lastSeen");

  let friendIsActive = false;
  let activeTypingUsers = [];
  let friendEmail = null;
  let friendLastSeenDate = null;
  let lastSeenTimeout = null;

  function updateLastSeenUI() {
    if (!friendEmail) {
      lastSeenEl.classList.add("fade-out");
      return;
    }

    lastSeenEl.classList.remove("hidden"); // Clear initial HTML hidden property
    void lastSeenEl.offsetWidth; // Force a browser reflow so the transition actually plays
    lastSeenEl.classList.remove("fade-out");

    if (friendIsActive) {
      lastSeenEl.innerText = "Online";
    } else if (friendLastSeenDate) {
      const dateOptions = { year: 'numeric', month: 'short', day: 'numeric' };
      const msgDate = friendLastSeenDate.toLocaleDateString(undefined, dateOptions);
      const today = new Date().toLocaleDateString(undefined, dateOptions);
      const yesterday = new Date(Date.now() - 86400000).toLocaleDateString(undefined, dateOptions);
      
      let displayDate = msgDate;
      if (msgDate === today) displayDate = "today";
      else if (msgDate === yesterday) displayDate = "yesterday";
      else displayDate = "on " + msgDate;

      const timeString = friendLastSeenDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      lastSeenEl.innerText = `Last seen ${displayDate} at ${timeString}`;
    } 

    // Hide the text 5 seconds after it updates
    clearTimeout(lastSeenTimeout);
    lastSeenTimeout = setTimeout(() => {
      lastSeenEl.classList.add("fade-out");
    }, 5000);
  }

  function updateIndicatorUI() {
    if (activeTypingUsers.length > 0) {
      typingIndicator.innerText = "Typing...";
      typingIndicator.classList.remove("hidden");
      chatMessages.scrollTop = chatMessages.scrollHeight; // Auto-scroll down to show indicator
    } else if (friendIsActive) {
      typingIndicator.innerText = "👀"; // Fallback to eye when online but not typing
      typingIndicator.classList.remove("hidden");
      chatMessages.scrollTop = chatMessages.scrollHeight;
    } else {
      typingIndicator.classList.add("hidden");
    }
  }

  // Tell the database "I am here" only if the window is currently focused
  setDoc(presenceRef, { [currentUser.email]: document.hasFocus() }, { merge: true });

  // Listen to see if the friend is here
  onSnapshot(presenceRef, (snapshot) => {
    const data = snapshot.data();
    if (data) {
      friendIsActive = false;
      for (const email of Object.keys(data)) {
        if (email !== currentUser.email) {
          friendEmail = email; // Store the friend's email
          if (data[email] === true) friendIsActive = true;
        }
      }
      updateIndicatorUI();
      updateLastSeenUI();
    }
  });

  // Listen for Last Seen Status
  onSnapshot(lastSeenRef, (snapshot) => {
    const data = snapshot.data();
    if (data) {
      for (const email of Object.keys(data)) {
        if (email !== currentUser.email) friendEmail = email;
      }
      if (friendEmail && data[friendEmail]) {
        friendLastSeenDate = data[friendEmail].toDate ? data[friendEmail].toDate() : new Date();
        updateLastSeenUI();
      }
    }
  });

  // Listen for Live Typing Status
  onSnapshot(typingRef, (snapshot) => {
    const data = snapshot.data();
    if (data) {
      activeTypingUsers = Object.keys(data).filter(
        (email) => email !== currentUser.email && data[email] === true
      );
      updateIndicatorUI();
    }
  });

  // Tell database "I left" when closing the tab
  window.addEventListener("beforeunload", () => {
    setDoc(presenceRef, { [currentUser.email]: false }, { merge: true });
    setDoc(lastSeenRef, { [currentUser.email]: serverTimestamp() }, { merge: true });
  });
}

// --- 5. LOGOUT LOGIC ---
logoutBtn.addEventListener("click", () => {
  const presenceRef = doc(db, "room", "activeUsers");
  const lastSeenRef = doc(db, "room", "lastSeen");
  // Tell database we are leaving before signing out
  Promise.all([
    setDoc(presenceRef, { [currentUser.email]: false }, { merge: true }),
    setDoc(lastSeenRef, { [currentUser.email]: serverTimestamp() }, { merge: true })
  ]).then(() => {
    signOut(auth);
  });
});
