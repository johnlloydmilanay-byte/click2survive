'use strict';
// One login page for everyone: "Student" (Student ID) or "Teacher / Admin" (username +
// password, see staff-login.js). ?role=staff opens the Teacher / Admin side.
const ROLE_Q = new URLSearchParams(location.search).get('role');
const START_ROLE = ['staff','validator'].includes(ROLE_Q) ? ROLE_Q : 'student';
// A student or validator already logged in on this device skips straight to the game.
if (START_ROLE === 'student' && getStudentSession()) window.location.href = 'game.html';
else if (START_ROLE !== 'staff' && getValidatorSession()) window.location.href = 'game.html';
else document.addEventListener('DOMContentLoaded', () => {
  switchRole(START_ROLE);
  consumeLoginError({staff:'staff-msg', validator:'val-msg'}[START_ROLE] || 'login-msg');
});

function switchRole(role){
  ['student','staff','validator'].forEach(r=>{
    const on = r === role;
    document.getElementById('role-'+r).classList.toggle('active', on);
    document.getElementById('role-'+r).setAttribute('aria-selected', String(on));
    document.getElementById('mode-'+r).classList.toggle('active', on);
  });
  try{ history.replaceState(null, '', role === 'student' ? location.pathname : '?role=' + role); }catch(e){}
  if (role === 'staff' && typeof staffModeOpened === 'function') staffModeOpened();
}

function switchTab(name){
  document.getElementById('tab-login').classList.toggle('active', name==='login');
  document.getElementById('tab-register').classList.toggle('active', name==='register');
  document.getElementById('panel-login').classList.toggle('active', name==='login');
  document.getElementById('panel-register').classList.toggle('active', name==='register');
}

function setMsg(id, text, kind){
  const el = document.getElementById(id);
  el.textContent = text || '';
  el.className = 'msg' + (kind ? ' '+kind : '');
}

async function loadSections(){
  const grade = document.getElementById('reg-grade').value;
  const sel = document.getElementById('reg-section');
  if(!grade){ sel.disabled = true; sel.innerHTML = '<option value="">Select grade first…</option>'; return; }
  sel.disabled = true;
  sel.innerHTML = '<option value="">Loading sections…</option>';
  try{
    await ensureAnonAuth();
    const snap = await db.collection('sections').where('grade','==',Number(grade)).orderBy('name').get();
    if(snap.empty){
      sel.innerHTML = '<option value="">No sections yet — ask your teacher to create one</option>';
      return;
    }
    sel.innerHTML = '<option value="">Select section…</option>' +
      snap.docs.map(d=>`<option value="${d.id}">${d.data().name}</option>`).join('');
    sel.disabled = false;
  }catch(e){
    sel.innerHTML = '<option value="">Could not load sections</option>';
  }
}

async function doLogin(){
  const id = document.getElementById('login-id').value.trim();
  if(!id){ setMsg('login-msg','Enter your Student ID.','err'); return; }
  const btn = document.getElementById('login-btn');
  btn.disabled = true; setMsg('login-msg','Logging in…');
  try{
    await ensureAnonAuth();
    const doc = await db.collection('students').doc(id).get();
    if(!doc.exists){
      setMsg('login-msg','No account found for that Student ID. Please register first.','err');
      btn.disabled = false;
      return;
    }
    const d = doc.data();
    clearValidatorSession();
    saveStudentSession({ studentId:id, name:d.name, grade:d.grade, sectionId:d.sectionId, sectionName:d.sectionName });
    window.location.href = 'game.html';
  }catch(e){
    setMsg('login-msg', e.message, 'err');
    btn.disabled = false;
  }
}

async function doRegister(){
  const studentId = document.getElementById('reg-id').value.trim();
  const name = document.getElementById('reg-name').value.trim();
  const grade = Number(document.getElementById('reg-grade').value);
  const sectionId = document.getElementById('reg-section').value;

  if(!studentId || !name || !grade || !sectionId){
    setMsg('reg-msg','Please fill in every field, including a section.','err');
    return;
  }
  const btn = document.getElementById('reg-btn');
  btn.disabled = true; setMsg('reg-msg','Creating your account…');
  try{
    await ensureAnonAuth();
    const studentRef = db.collection('students').doc(studentId);
    const sectionRef = db.collection('sections').doc(sectionId);
    let sectionName = '';

    await db.runTransaction(async (tx) => {
      const existing = await tx.get(studentRef);
      if (existing.exists) throw new Error('That Student ID is already registered. Please log in instead.');
      const section = await tx.get(sectionRef);
      if (!section.exists || section.data().grade !== grade) throw new Error('Choose a valid section for this grade.');
      sectionName = section.data().name;
      tx.set(studentRef, {
        name, grade, sectionId, sectionName,
        latestPercent: null, latestSolved: null, latestTotal: null, latestAt: null, attemptCount: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      tx.update(sectionRef, { studentCount: firebase.firestore.FieldValue.increment(1) });
    });

    clearValidatorSession();
    saveStudentSession({ studentId, name, grade, sectionId, sectionName });
    setMsg('reg-msg','Account created! Redirecting…','ok');
    window.location.href = 'game.html';
  }catch(e){
    setMsg('reg-msg', e.message, 'err');
    btn.disabled = false;
  }
}

// Validator: name only. The name maps to one validator record (validators/{id}), created
// on first use, so the same name continues the same progress on any device.
async function doValidatorLogin(){
  const name = document.getElementById('val-name').value.trim().replace(/\s+/g, ' ');
  const validatorId = validatorIdFromName(name);
  if(name.length < 2 || validatorId.length < 4){ setMsg('val-msg','Enter your full name.','err'); return; }
  const btn = document.getElementById('val-btn');
  btn.disabled = true; setMsg('val-msg','Opening your validator account…');
  try{
    await ensureAnonAuth();
    const ref = db.collection('validators').doc(validatorId);
    const doc = await ref.get();
    const now = firebase.firestore.FieldValue.serverTimestamp();
    if(doc.exists) await ref.update({ name, lastActiveAt: now });
    else await ref.set({ name, createdAt: now, lastActiveAt: now, reviewedCount: 0, avgRating: null });
    clearStudentSession();
    saveValidatorSession({ validatorId, name });
    setMsg('val-msg', doc.exists ? 'Welcome back! Continuing your validation…' : 'Validator account created! Opening…', 'ok');
    window.location.href = 'game.html';
  }catch(e){
    setMsg('val-msg', e.message, 'err');
    btn.disabled = false;
  }
}
