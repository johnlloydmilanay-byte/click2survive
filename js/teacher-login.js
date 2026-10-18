'use strict';
(async () => {
  consumeLoginError('login-msg');
  if (getTeacherSession()){
    const user = await authReady();
    if (user && !user.isAnonymous){ window.location.href = 'teacher-dashboard.html'; return; }
  }
})();

function setMsg(id, text, kind){
  const el = document.getElementById(id);
  el.textContent = text || '';
  el.className = 'msg' + (kind ? ' '+kind : '');
}

async function doTeacherLogin(){
  const identifier = document.getElementById('login-id').value.trim();
  const password = document.getElementById('login-pass').value;
  if(!identifier || !password){ setMsg('login-msg','Enter your username/email and password.','err'); return; }
  const btn = document.getElementById('login-btn');
  btn.disabled = true; setMsg('login-msg','Logging in…');
  try{
    // Just sign in and go — requireTeacherSession() on the dashboard verifies the
    // account really is a teacher and fetches the display name. This means the button
    // responds after one network round-trip instead of two.
    const cred = await auth.signInWithEmailAndPassword(loginIdentifierToEmail(identifier), password);
    saveTeacherSession({ uid: cred.user.uid });
    window.location.href = 'teacher-dashboard.html';
  }catch(e){
    setMsg('login-msg', friendlyAuthError(e), 'err');
    btn.disabled = false;
  }
}
