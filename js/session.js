'use strict';
// Shared session helpers used by every page. `auth` and `db` come from firebase-init.js
// (loaded before this file). There is no server here anymore — Firestore + Firestore
// security rules (see firestore.rules) are the whole backend.
const STUDENT_KEY = 'c2s_student_profile';
const TEACHER_KEY = 'c2s_teacher_profile';
const SUPERADMIN_KEY = 'c2s_superadmin_profile';

function saveStudentSession(profile){ localStorage.setItem(STUDENT_KEY, JSON.stringify(profile)); }
function getStudentSession(){ try{ return JSON.parse(localStorage.getItem(STUDENT_KEY) || 'null'); } catch(e){ return null; } }
function clearStudentSession(){ localStorage.removeItem(STUDENT_KEY); }

function saveTeacherSession(profile){ localStorage.setItem(TEACHER_KEY, JSON.stringify(profile)); }
function getTeacherSession(){ try{ return JSON.parse(localStorage.getItem(TEACHER_KEY) || 'null'); } catch(e){ return null; } }
function clearTeacherSession(){ localStorage.removeItem(TEACHER_KEY); }

function saveSuperAdminSession(profile){ localStorage.setItem(SUPERADMIN_KEY, JSON.stringify(profile)); }
function getSuperAdminSession(){ try{ return JSON.parse(localStorage.getItem(SUPERADMIN_KEY) || 'null'); } catch(e){ return null; } }
function clearSuperAdminSession(){ localStorage.removeItem(SUPERADMIN_KEY); }

// Firebase Auth restores its session asynchronously (even from local persistence),
// so any page that needs to know "is someone logged in" has to await this once.
function authReady(){
  return new Promise(resolve => {
    const unsub = auth.onAuthStateChanged(user => { unsub(); resolve(user); });
  });
}

// Students authenticate anonymously — the Firebase Auth identity only exists so
// Firestore security rules have a `request.auth` to check; the real "who is this"
// is the Student ID profile cached in localStorage (see README for the trade-off).
async function ensureAnonAuth(){
  const existing = await authReady();
  if (existing && existing.isAnonymous) return existing;
  // A teacher session left signed in on a shared computer would otherwise leak into
  // the student flow (Firebase Auth only tracks one current user per browser) — sign
  // it out first so student actions always run under a fresh anonymous identity.
  if (existing && !existing.isAnonymous) await auth.signOut();
  const cred = await auth.signInAnonymously();
  return cred.user;
}

async function requireStudentSession(){
  const profile = getStudentSession();
  if (!profile){ window.location.href = 'index.html'; return null; }
  await ensureAnonAuth();
  // A Super Admin may have removed this student since they last logged in on this
  // device. Only a confirmed "doesn't exist" logs them out; a network error lets the
  // game carry on as before.
  try{
    const doc = await db.collection('students').doc(profile.studentId).get();
    if (!doc.exists){
      clearStudentSession();
      sessionStorage.setItem('c2s_login_error', 'This Student ID is no longer registered. Ask your teacher, or register again.');
      window.location.href = 'index.html';
      return null;
    }
  }catch(e){ /* offline or transient: keep the cached profile */ }
  return profile;
}

// Login only signs in and stores {uid} — it deliberately does NOT also fetch the
// teachers/{uid} profile doc before redirecting, so the login button responds after a
// single network round-trip instead of two. The profile fetch (which doubles as the
// "is this account actually a teacher" check) happens here instead, on the dashboard's
// own init, where a loading state is expected anyway. An invalid/missing profile bounces
// back to the login page with an explanatory message (via sessionStorage, read there).
async function requireTeacherSession(){
  const user = await authReady();
  if (!user || user.isAnonymous){ window.location.href = 'index.html?role=staff'; return null; }
  let cached = getTeacherSession();
  if (!cached || cached.uid !== user.uid || !cached.name) cached = null;
  if (!cached){
    try{
      const doc = await db.collection('teachers').doc(user.uid).get();
      if (!doc.exists){
        clearTeacherSession();
        sessionStorage.setItem('c2s_login_error', 'That account is not set up as a teacher. Ask your Super Admin.');
        await auth.signOut();
        window.location.href = 'index.html?role=staff';
        return null;
      }
      cached = { uid: user.uid, username: doc.data().username, name: doc.data().name };
      saveTeacherSession(cached);
    }catch(e){
      sessionStorage.setItem('c2s_login_error', 'Could not verify your account: ' + e.message);
      window.location.href = 'index.html?role=staff';
      return null;
    }
  }
  return cached;
}

async function requireSuperAdminSession(){
  const user = await authReady();
  if (!user || user.isAnonymous){ window.location.href = 'index.html?role=staff'; return null; }
  let cached = getSuperAdminSession();
  if (!cached || cached.uid !== user.uid || !cached.name) cached = null;
  if (!cached){
    try{
      const doc = await db.collection('superadmins').doc(user.uid).get();
      if (!doc.exists){
        clearSuperAdminSession();
        sessionStorage.setItem('c2s_login_error', 'That account is not a super admin.');
        await auth.signOut();
        window.location.href = 'index.html?role=staff';
        return null;
      }
      cached = { uid: user.uid, username: doc.data().username, name: doc.data().name };
      saveSuperAdminSession(cached);
    }catch(e){
      sessionStorage.setItem('c2s_login_error', 'Could not verify your account: ' + e.message);
      window.location.href = 'index.html?role=staff';
      return null;
    }
  }
  return cached;
}

// Shows a "bounced back from dashboard" error saved by requireTeacherSession/
// requireSuperAdminSession, if any, then clears it so it doesn't reappear on refresh.
function consumeLoginError(msgElId){
  const msg = sessionStorage.getItem('c2s_login_error');
  if (msg){
    sessionStorage.removeItem('c2s_login_error');
    const el = document.getElementById(msgElId);
    if (el){ el.textContent = msg; el.className = 'msg err'; }
  }
}

function doLogoutStudent(){
  clearStudentSession();
  auth.signOut().finally(()=>{ window.location.href = 'index.html'; });
}
function doLogoutTeacher(){
  clearTeacherSession();
  auth.signOut().finally(()=>{ window.location.href = 'index.html?role=staff'; });
}
function doLogoutSuperAdmin(){
  clearSuperAdminSession();
  auth.signOut().finally(()=>{ window.location.href = 'index.html?role=staff'; });
}

function friendlyAuthError(err){
  const map = {
    'auth/email-already-in-use': 'That username is already taken.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/invalid-email': 'That username contains characters that are not allowed.',
    'auth/invalid-credential': 'Invalid username or password.',
    'auth/wrong-password': 'Invalid username or password.',
    'auth/user-not-found': 'Invalid username or password.'
  };
  return map[err.code] || err.message;
}

function togglePasswordVisibility(inputId, btn){
  const input = document.getElementById(inputId);
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.textContent = show ? '🙈' : '👁';
  btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
}

function usernameToEmail(username){
  const clean = String(username||'').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return clean + '@click2survive.local';
}

// Accepts either a bare username ("msantos") or a full email typed directly, so the
// login form can just say "Username or Email" without the user needing to know which.
function loginIdentifierToEmail(identifier){
  const clean = String(identifier||'').trim();
  return clean.includes('@') ? clean.toLowerCase() : usernameToEmail(clean);
}

// Secure-ish random string from a charset that avoids visually-ambiguous characters
// (no 0/O/1/l/I) since a human has to read this off a screen and type it back in.
function randomCredentialString(length){
  const charset = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) out += charset[bytes[i] % charset.length];
  return out;
}

// Derives a username from a teacher's full name plus a random suffix (so two "Juan
// Dela Cruz"es don't collide), and a random password. Caller is responsible for
// retrying with a fresh suffix if the derived email turns out to already be taken.
function generateTeacherCredentials(fullName){
  const base = String(fullName||'').trim().toLowerCase()
    .replace(/[^a-z\s]/g, '').trim().split(/\s+/).join('.') || 'teacher';
  const username = base + randomCredentialString(3).toLowerCase();
  return {
    username,
    email: usernameToEmail(username),
    password: randomCredentialString(10)
  };
}
