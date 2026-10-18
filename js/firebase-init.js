'use strict';
// Firebase project config — this project's real values (from console.firebase.google.com →
// Project settings → General → Your apps). Used for real deploys; local emulator testing
// below overrides auth/db to point at 127.0.0.1 regardless of these values.
const firebaseConfig = {
  apiKey: "AIzaSyAk8EntnpgU1Ioy1gpSuQvHFmgQGgDcdeE",
  authDomain: "click2survive-764f4.firebaseapp.com",
  projectId: "click2survive-764f4",
  storageBucket: "click2survive-764f4.firebasestorage.app",
  messagingSenderId: "129043226834",
  appId: "1:129043226834:web:5928450cd4e38b9c4f8d0b"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// A second, independent Firebase app instance — used ONLY to create a teacher's Auth
// account. Firebase Auth's createUserWithEmailAndPassword signs in AS the new user on
// whatever app instance calls it, which would otherwise kick the super admin out of
// their own session. Firestore itself is shared across app instances of the same
// project, so `db` above still writes as the super admin regardless of what this
// secondary app's auth state is doing.
const secondaryApp = firebase.initializeApp(firebaseConfig, 'Secondary');
const secondaryAuth = secondaryApp.auth();

// When served from localhost (dev / `firebase emulators:start`), talk to the local
// emulators instead of real Firebase. Remove this block once you deploy for real —
// or leave it in: it only ever triggers on localhost/127.0.0.1.
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  auth.useEmulator('http://127.0.0.1:9099', { disableWarnings: true });
  db.useEmulator('127.0.0.1', 8080);
  secondaryAuth.useEmulator('http://127.0.0.1:9099', { disableWarnings: true });
}

// Creates a new Firebase Auth user via the secondary app (so the caller's own session
// is untouched), returns the new user's uid, then immediately signs the secondary
// session back out.
async function createAuthUserWithoutSignIn(email, password){
  const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
  const uid = cred.user.uid;
  await secondaryAuth.signOut();
  return uid;
}
