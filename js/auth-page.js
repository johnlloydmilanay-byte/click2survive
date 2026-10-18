'use strict';
// If already logged in, skip straight to the game.
if (getStudentSession()) window.location.href = 'game.html';

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

    saveStudentSession({ studentId, name, grade, sectionId, sectionName });
    setMsg('reg-msg','Account created! Redirecting…','ok');
    window.location.href = 'game.html';
  }catch(e){
    setMsg('reg-msg', e.message, 'err');
    btn.disabled = false;
  }
}
