'use strict';

function setMsg(id, text, kind){
  const el = document.getElementById(id);
  el.textContent = text || '';
  el.className = 'msg' + (kind ? ' '+kind : '');
}

function switchTab(name){
  document.getElementById('tab-login').classList.toggle('active', name==='login');
  document.getElementById('tab-setup').classList.toggle('active', name==='setup');
  document.getElementById('panel-login').classList.toggle('active', name==='login');
  document.getElementById('panel-setup').classList.toggle('active', name==='setup');
}

async function doSuperAdminLogin(){
  const identifier = document.getElementById('login-id').value.trim();
  const password = document.getElementById('login-pass').value;
  if(!identifier || !password){ setMsg('login-msg','Enter your username/email and password.','err'); return; }
  const btn = document.getElementById('login-btn');
  btn.disabled = true; setMsg('login-msg','Logging in…');
  try{
    // Just sign in and go — requireSuperAdminSession() on the dashboard verifies the
    // account really is a super admin and fetches the display name. This means the
    // button responds after one network round-trip instead of two.
    const cred = await auth.signInWithEmailAndPassword(loginIdentifierToEmail(identifier), password);
    saveSuperAdminSession({ uid: cred.user.uid });
    window.location.href = 'superadmin-dashboard.html';
  }catch(e){
    setMsg('login-msg', friendlyAuthError(e), 'err');
    btn.disabled = false;
  }
}

async function doSuperAdminSetup(){
  const name = document.getElementById('setup-name').value.trim();
  const username = document.getElementById('setup-user').value.trim();
  const password = document.getElementById('setup-pass').value;
  if(!name || !username || !password){ setMsg('setup-msg','Please fill in every field.','err'); return; }
  if(!/^[a-zA-Z0-9._-]{3,30}$/.test(username)){
    setMsg('setup-msg','Username may only contain letters, numbers, dots, dashes and underscores (3-30 chars).','err');
    return;
  }
  if(password.length < 6){ setMsg('setup-msg','Password must be at least 6 characters.','err'); return; }

  const btn = document.getElementById('setup-btn');
  btn.disabled = true; setMsg('setup-msg','Creating account…');
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
    saveSuperAdminSession({ uid, name, username: username.toLowerCase() });
    window.location.href = 'superadmin-dashboard.html';
  }catch(e){
    setMsg('setup-msg', friendlyAuthError(e), 'err');
    btn.disabled = false;
  }
}

// The login form is interactive immediately — nothing here blocks it. The bootstrap
// check (does a super admin already exist?) only gates the Setup tab, and runs quietly
// in the background; most visitors never touch that tab at all.
(async () => {
  consumeLoginError('login-msg');

  // Non-blocking convenience: if already logged in as super admin, skip straight to the
  // dashboard. This never delays the form itself since it's just checked in passing.
  if (getSuperAdminSession()){
    const user = await authReady();
    if (user && !user.isAnonymous){ window.location.href = 'superadmin-dashboard.html'; return; }
  }

  try{
    await ensureAnonAuth();
    const lock = await db.collection('system').doc('superadminBootstrap').get();
    if (lock.exists){
      setMsg('setup-status', 'A super admin has already been set up for this project. Please use the Log In tab.', 'ok');
    } else {
      document.getElementById('setup-status').style.display = 'none';
      document.getElementById('setup-form').style.display = 'block';
    }
  }catch(e){
    setMsg('setup-status', 'Could not check setup status: ' + e.message, 'err');
  }
})();
