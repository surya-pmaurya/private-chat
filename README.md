# Private Chat App

A real-time, mobile-first private messaging application built with Vanilla JavaScript and Firebase. It features a modern, app-like user interface with rich interactions inspired by platforms like Instagram, Snapchat, and WhatsApp.

## ✨ Features

- **Real-Time Messaging**: Instant message delivery and synchronization using Firebase Firestore real-time listeners (`onSnapshot`).
- **User Authentication**: Secure access using Firebase Email & Password authentication.
- **Voice Notes**: Built-in microphone recording capabilities to send inline audio messages seamlessly.
- **Swipe-to-Reply**: Intuitive touch gestures allowing you to swipe left or right on any message bubble to quickly formulate a reply.
- **Smart Read Receipts**: Dynamic status indicators for Sent (✓), Delivered (✓✓), and Seen (✓✓ - cyan) based on user presence and active window focus.
- **Message Reactions**: Long-press (or right-click) any message to drop an emoji reaction. Includes a quick-bar and a full expandable emoji picker.
- **Message Context Menu**: A clean 3-dot (`⋮`) menu on every message allowing users to Reply, Copy, or Delete (for their own messages).
- **Live Presence & Typing Indicators**: Intelligent bottom indicator that displays when the other user is looking at the chat ("👀") or actively typing ("Typing...").
- **Desktop Notifications**: Native web background notifications for incoming messages when the chat tab is out of focus.
- **Dark & Light Themes**: Fully supported visual modes with settings automatically saved to local storage.
- **Smart Date Separators**: Automatically groups scrolling messages by day (e.g., Today, Yesterday).

## 🛠️ Tech Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ESModules)
- **Backend/Database**: Firebase (Firestore & Authentication)

## 🚀 Setup & Installation

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   ```

2. **Setup Firebase:**
   - Create a project on the Firebase Console.
   - Enable **Firestore Database** and **Authentication** (Email/Password).
   - Update `firebaseConfig.js` with your project's specific Firebase configuration keys.
   - Update Firestore Security Rules to allow authenticated users to read and write to `messages` and `room` collections.

3. **Run the App:**
   - Because this project uses JavaScript ES Modules (`<script type="module">`), you cannot just double-click the `index.html` file.
   - Serve the directory using a local web server. If using VS Code, the **Live Server** extension is recommended.
   - Open the app in your browser (usually `http://127.0.0.1:5500`).

## 📱 Usage Guide

- **React to a Message**: Long-press on mobile (or right-click on desktop) on any message bubble to open the reaction picker.
- **Options Menu**: Tap the `⋮` button attached to a message to access the Copy, Reply, and Delete functionalities.
- **Quick Reply**: Swipe horizontally on any message to instantly pop it into the reply preview box above your keyboard.
- **Send a Voice Note**: Tap the 🎙️ microphone icon to start recording. The icon will pulse red. Tap it again to stop and automatically send the recording.

## 🔒 Security Note

By default, standard Firebase configurations are exposed in the client-side code (`firebaseConfig.js`). Ensure your Firebase Console has **App Check** enabled and strict **Firestore Security Rules** applied so that only authorized, logged-in users can modify or view data.