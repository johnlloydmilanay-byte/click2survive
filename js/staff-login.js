'use strict';
// Teacher / Admin side of the login page (index.html). One username/password form for
// both roles: after signing in, the account's profile decides where it goes —
// superadmins/{uid} → Super Admin dashboard, teachers/{uid} → teacher dashboard.
// Also hosts the one-time Super Admin setup, offered only while none exists.

let staffChecked = false;

// Runs when the Teacher / Admin side is shown: skip ahead if already signed in, and
// check (once) whether the first-time setup should be offered.
async function staffModeOpened(){
  if (staffChecked) return;
  staffChecked = true;
  const user = await authReady();
  if (user && !user.isAnonymous){
    if (getSuperAdminSession()){ window.location.href = 'superadmin-dashboard.html'; return; }
    if (getTeacherSession()){ window.location.href = 'teacher-dashboard.html'; return; }
  }
  try{
    await ensureAnonAuth();
    const lock = await db.collection('system').doc('superadminBootstrap').get();
    document.getElementById('setup-link').hidden = lock.exists;
  }catch(e){ /* offline: just don't offer setup */ }
}

function staffMsg(id, text, kind){
  const el = document.getElementById(id);
  el.textContent = text || '';
  el.className = 'msg' + (kind ? ' '+kind : '');
}

async function doStaffLogin(){
  const identifier = document.getElementById('staff-id').value.trim();
  const password = document.getElementById('staff-pass').value;
  if (!identifier || !password){ staffMsg('staff-msg', 'Enter your username/email and password.', 'err'); return; }
  const btn = document.getElementById('staff-btn');
  btn.disabled = true; staffMsg('staff-msg', 'Logging in…');
  try{
    const cred = await auth.signInWithEmailAndPassword(loginIdentifierToEmail(identifier), password);
    const uid = cred.user.uid;
    clearStudentSession();          // this device now belongs to a staff session
    const admin = await db.collection('superadmins').doc(uid).get();
    if (admin.exists){
      const d = admin.data();
      saveSuperAdminSession({ uid, name: d.name, username: d.username });
      window.location.href = 'superadmin-dashboard.html';
      return;
    }
    const teacher = await db.collection('teachers').doc(uid).get();
    if (teacher.exists){
      const d = teacher.data();
      saveTeacherSession({ uid, name: d.name, username: d.username });
      window.location.href = 'teacher-dashboard.html';
      return;
    }
    await auth.signOut();
    staffMsg('staff-msg', 'This account is not set up as a teacher or Super Admin. Ask your Super Admin.', 'err');
  }catch(e){
    staffMsg('staff-msg', friendlyAuthError(e), 'err');
  }
  btn.disabled = false;
}

function showSetup(on){
  document.getElementById('panel-staff').classList.toggle('active', !on);
  document.getElementById('panel-setup').classList.toggle('active', !!on);
}

async function doSuperAdminSetup(){
  const name = document.getElementById('setup-name').value.trim();
  const username = document.getElementById('setup-user').value.trim();
  const password = document.getElementById('setup-pass').value;
  if (!name || !username || !password){ staffMsg('setup-msg', 'Please fill in every field.', 'err'); return; }
  if (!/^[a-zA-Z0-9._-]{3,30}$/.test(username)){
    staffMsg('setup-msg', 'Username may only contain letters, numbers, dots, dashes and underscores (3-30 chars).', 'err');
    return;
  }
  if (password.length < 6){ staffMsg('setup-msg', 'Password must be at least 6 characters.', 'err'); return; }
  const btn = document.getElementById('setup-btn');
  btn.disabled = true; staffMsg('setup-msg', 'Creating account…');
  try{
    const cred = await auth.createUserWithEmailAndPassword(usernameToEmail(username), password);
    const uid = cred.user.uid;
    await db.runTransaction(async (tx) => {
      const lock = await tx.get(db.collection('system').doc('superadminBootstrap'));
      if (lock.exists) throw new Error('A super admin has already been set up on this project.');
      tx.set(db.collection('superadmins').doc(uid), {
        name, username: username.toLowerCase(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      tx.set(db.collection('system').doc('superadminBootstrap'), {
        createdBy: uid, createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    clearStudentSession();
    saveSuperAdminSession({ uid, name, username: username.toLowerCase() });
    window.location.href = 'superadmin-dashboard.html';
  }catch(e){
    staffMsg('setup-msg', friendlyAuthError(e), 'err');
    btn.disabled = false;
  }
}
