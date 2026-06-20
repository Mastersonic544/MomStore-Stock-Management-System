// Thin wrapper around Firebase email/password auth.
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { auth } from './firebase.js'

export function watchAuth(cb) {
  return onAuthStateChanged(auth, cb)
}

export function login(email, password) {
  return signInWithEmailAndPassword(auth, email.trim(), password)
}

export function logout() {
  return signOut(auth)
}

// Human-readable messages for the auth error codes we actually surface.
export function authErrorMessage(err) {
  const code = err?.code || ''
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found'))
    return 'Incorrect email or password.'
  if (code.includes('invalid-email')) return 'That email address looks invalid.'
  if (code.includes('too-many-requests')) return 'Too many attempts. Try again in a moment.'
  if (code.includes('network')) return 'Network error — check your connection.'
  return 'Sign-in failed. Please try again.'
}
