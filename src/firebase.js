// Firebase initialization. Reads config from Vite env vars (VITE_FIREBASE_*).
// If config is missing we don't crash — `isConfigured` is false and the UI
// shows a setup notice instead of a broken login.
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const isConfigured = Boolean(cfg.apiKey && cfg.projectId)

let auth = null
let db = null
if (isConfigured) {
  const app = initializeApp(cfg)
  auth = getAuth(app)
  db = getFirestore(app)
}

export { auth, db }
