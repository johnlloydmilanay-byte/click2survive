'use strict';
let ADMIN_SESSION = null;
let sectionsCache = [];   // all sections, live
let teachersCache = [];   // all teachers, live
let activeSessionsCache = []; // all currently-active sessions school-wide, live
let assignTeacherId = null;

function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function updateStatRow(){
  document.getElementById('stat-row').innerHTML = `
    <div class="stat"><div class="stat-n">${teachersCache.length}</div><div class="stat-l">Teachers</div></div>
    <div class="stat"><div class="stat-n">${sectionsCache.length}</div><div class="stat-l">Sections</div></div>
    <div class="stat"><div class="stat-n" id="stat-students">–</div><div class="stat-l">Students</div></div>
    <div class="stat"><div class="stat-n" id="stat-attempts">–</div><div class="stat-l">Completed attempts</div></div>
    <div class="stat"><div class="stat-n" style="color:${activeSessionsCache.length?'#4ade80':'inherit'}">${activeSessionsCache.length}</div><div class="stat-l">Active sessions now</div></div>`;
}

function watchActiveSessions(){
  db.collection('sessions').where('status','==','active').onSnapshot(snap => {
    activeSessionsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a,b) => (b.createdAt ? b.createdAt.toMillis() : 0) - (a.createdAt ? a.createdAt.toMillis() : 0));
    renderActiveSessions();
    updateStatRow();
  }, err => {
    document.getElementById('active-sessions-body').innerHTML = `<tr><td colspan="6" class="empty">${esc(err.message)}</td></tr>`;
  });
}

function renderActiveSessions(){
  const body = document.getElementById('active-sessions-body');
  if (!activeSessionsCache.length){ body.innerHTML = '<tr><td colspan="6" class="empty">No sessions are currently active.</td></tr>'; return; }
  const teacherById = new Map(teachersCache.map(t => [t.id, t]));
  body.innerHTML = activeSessionsCache.map(s => {
    const teacher = teacherById.get(s.teacherId);
    const started = s.createdAt ? s.createdAt.toDate().toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : '–';
    return `
    <tr>
      <td>${s.grade}</td>
      <td>${esc(s.sectionName)}</td>
      <td>${esc(s.label || 'Session')}</td>
      <td>${esc(teacher ? teacher.name : '—')}</td>
      <td>${started}</td>
      <td>${s.attemptCount || 0}</td>
    </tr>`;
  }).join('');
}

function watchGlobalCounts(){
  db.collection('students').onSnapshot(snap => {
    const el = document.getElementById('stat-students');
    if (el) el.textContent = snap.size;
  });
  db.collection('attempts').onSnapshot(snap => {
    const el = document.getElementById('stat-attempts');
    if (el) el.textContent = snap.size;
  });
}

function watchSections(){
  // One live listener over ALL sections powers: the filtered table, the stat count,
  // and the assign-modal's checkbox list — no need to re-query per grade.
  db.collection('sections').orderBy('grade').orderBy('name').onSnapshot(snap => {
    sectionsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderSectionsTable();
    renderTeachersTable();
    updateStatRow();
  }, err => {
    document.getElementById('sections-body').innerHTML = `<tr><td colspan="4" class="empty">${esc(err.message)}</td></tr>`;
  });
}

function renderSectionsTable(){
  const grade = Number(document.getElementById('sec-grade').value);
  const body = document.getElementById('sections-body');
  const rows = sectionsCache.filter(s => s.grade === grade);
  if (!rows.length){ body.innerHTML = '<tr><td colspan="4" class="empty">No sections yet for this grade.</td></tr>'; return; }
  body.innerHTML = rows.map(s => `
    <tr>
      <td>${esc(s.name)}</td>
      <td>${s.grade}</td>
      <td>${s.studentCount||0}</td>
      <td><button class="danger" onclick="deleteSection('${s.id}')">Delete</button></td>
    </tr>`).join('');
}

async function createSection(){
  const grade = Number(document.getElementById('sec-grade').value);
  const name = document.getElementById('new-sec-name').value.trim();
  const msg = document.getElementById('sec-msg');
  if(!name){ msg.textContent = 'Enter a section name.'; msg.className = 'msg err'; return; }
  if (sectionsCache.some(s => s.grade === grade && s.name.toLowerCase() === name.toLowerCase())){
    msg.textContent = 'That section already exists for this grade.'; msg.className = 'msg err'; return;
  }
  try{
    await db.collection('sections').add({
      grade, name, createdBy: ADMIN_SESSION.uid,
      studentCount: 0, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    document.getElementById('new-sec-name').value = '';
    msg.textContent = 'Section created.'; msg.className = 'msg ok';
  }catch(e){
    msg.textContent = e.message; msg.className = 'msg err';
  }
}

async function deleteSection(id){
  if(!confirm('Delete this section? This only works if no students are enrolled in it.')) return;
  const s = sectionsCache.find(x => x.id === id);
  if (s && (s.studentCount||0) > 0){ alert('Cannot delete a section that already has students enrolled.'); return; }
  try{
    await db.collection('sections').doc(id).delete();
  }catch(e){
    alert(e.message);
  }
}

function watchTeachers(){
  db.collection('teachers').orderBy('name').onSnapshot(snap => {
    teachersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTeachersTable();
    renderActiveSessions(); // depends on teachersCache to resolve names
    updateStatRow();
  }, err => {
    document.getElementById('teachers-body').innerHTML = `<tr><td colspan="4" class="empty">${esc(err.message)}</td></tr>`;
  });
}

function renderTeachersTable(){
  const body = document.getElementById('teachers-body');
  if (!teachersCache.length){ body.innerHTML = '<tr><td colspan="4" class="empty">No teachers yet.</td></tr>'; return; }
  const sectionById = new Map(sectionsCache.map(s => [s.id, s]));
  body.innerHTML = teachersCache.map(t => {
    const names = (t.assignedSectionIds||[]).map(id => {
      const s = sectionById.get(id);
      return s ? `G${s.grade} ${esc(s.name)}` : null;
    }).filter(Boolean);
    const summary = names.length
      ? `<span class="teacher-sections">${names.join(', ')}</span>`
      : `<span class="teacher-sections none">No sections assigned</span>`;
    return `
    <tr>
      <td>${esc(t.name)}</td>
      <td>${esc(t.username)}</td>
      <td>${summary}</td>
      <td class="row" style="flex-wrap:nowrap">
        <button class="action" style="padding:5px 10px;font-size:.72rem" onclick="openAssignModal('${t.id}')">Assign Sections</button>
        <button class="danger" style="padding:5px 10px;font-size:.72rem" onclick="resetTeacherCredentials('${t.id}')">Reset Password</button>
      </td>
    </tr>`;
  }).join('');
}

// Shared by createTeacher() and resetTeacherCredentials(): generates a fresh
// username/password pair and creates the Firebase Auth account for it (via the
// secondary app, so the admin's own session is untouched), retrying with a new
// random suffix if that username's derived email happens to already be taken.
async function createTeacherAuthAccount(name){
  let lastErr = null;
  for (let attempt = 0; attempt < 4; attempt++){
    const creds = generateTeacherCredentials(name);
    try{
      const uid = await createAuthUserWithoutSignIn(creds.email, creds.password);
      return { uid, creds };
    }catch(e){
      lastErr = e;
      if (e.code !== 'auth/email-already-in-use') throw e;
    }
  }
  throw lastErr;
}

function showCredModal(username, password, title, note){
  document.getElementById('cred-modal-title').textContent = title;
  document.getElementById('cred-modal-note').textContent = note;
  document.getElementById('cred-username').textContent = username;
  document.getElementById('cred-password').textContent = password;
  document.getElementById('cred-modal').style.display = 'flex';
}

async function createTeacher(){
  const nameInput = document.getElementById('new-teacher-name');
  const name = nameInput.value.trim();
  const msg = document.getElementById('teacher-msg');
  if(!name){ msg.textContent = 'Enter the teacher\'s full name.'; msg.className = 'msg err'; return; }
  msg.textContent = 'Creating account…'; msg.className = 'msg';
  try{
    const { uid, creds } = await createTeacherAuthAccount(name);
    await db.collection('teachers').doc(uid).set({
      name, username: creds.username, assignedSectionIds: [],
      createdBy: ADMIN_SESSION.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    nameInput.value = '';
    msg.textContent = 'Teacher account created.'; msg.className = 'msg ok';
    showCredModal(creds.username, creds.password, 'Teacher account created',
      'Copy these now and send them to the teacher — the password will not be shown again.');
  }catch(e){
    msg.textContent = friendlyAuthError(e); msg.className = 'msg err';
  }
}

// There's no "change another user's password" call in client-side Firebase Auth
// without Cloud Functions/Admin SDK — that's a deliberately privileged operation. The
// practical equivalent here: issue a brand-new Auth account + username/password,
// carry the teacher's existing section assignments over to a new profile doc keyed by
// that new account, and delete the old profile doc so the old credentials can no
// longer pass the "is this account a teacher" check even though the underlying old
// Auth user technically still exists (harmless — it just can't log into this app).
async function resetTeacherCredentials(teacherId){
  const t = teachersCache.find(x => x.id === teacherId);
  if (!t) return;
  if (!confirm(`Issue new login credentials for ${t.name}? Their current username and password will stop working immediately.`)) return;
  const msg = document.getElementById('teacher-msg');
  msg.textContent = 'Issuing new credentials…'; msg.className = 'msg';
  try{
    const { uid, creds } = await createTeacherAuthAccount(t.name);
    const batch = db.batch();
    batch.set(db.collection('teachers').doc(uid), {
      name: t.name, username: creds.username, assignedSectionIds: t.assignedSectionIds || [],
      createdBy: ADMIN_SESSION.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    batch.delete(db.collection('teachers').doc(teacherId));
    await batch.commit();
    // Avoid saving assignments against the now-deleted doc if that teacher's assign
    // modal happened to be open when the reset ran.
    if (assignTeacherId === teacherId) document.getElementById('assign-modal').style.display = 'none';
    msg.textContent = 'New credentials issued.'; msg.className = 'msg ok';
    showCredModal(creds.username, creds.password, 'New credentials issued',
      'The old username and password no longer work. Copy these now and send them to the teacher — the password will not be shown again.');
  }catch(e){
    msg.textContent = friendlyAuthError(e); msg.className = 'msg err';
  }
}

function copyCred(elId, btn){
  const text = document.getElementById(elId).textContent;
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = 'Copied!'; btn.classList.add('copied');
    setTimeout(() => { btn.textContent = original; btn.classList.remove('copied'); }, 1500);
  });
}

function openAssignModal(teacherId){
  assignTeacherId = teacherId;
  const t = teachersCache.find(x => x.id === teacherId);
  if (!t) return;
  document.getElementById('assign-teacher-name').textContent = `${t.name} (${t.username})`;
  document.getElementById('assign-msg').textContent = '';
  const assigned = new Set(t.assignedSectionIds||[]);
  const byGrade = {};
  sectionsCache.forEach(s => { (byGrade[s.grade] = byGrade[s.grade]||[]).push(s); });
  const list = document.getElementById('assign-list');
  list.innerHTML = [7,8,9,10].map(g => {
    const secs = byGrade[g]||[];
    if (!secs.length) return '';
    return `<div>
      <div class="section-toggle-grade">Grade ${g}</div>
      ${secs.map(s => `
        <label class="section-toggle-row">
          <input type="checkbox" value="${s.id}" ${assigned.has(s.id)?'checked':''}>
          ${esc(s.name)}
        </label>`).join('')}
    </div>`;
  }).join('') || '<div class="empty">No sections exist yet — create one above first.</div>';
  document.getElementById('assign-modal').style.display = 'flex';
}

async function saveAssignments(){
  const checked = [...document.querySelectorAll('#assign-list input[type=checkbox]:checked')].map(c => c.value);
  const msg = document.getElementById('assign-msg');
  try{
    await db.collection('teachers').doc(assignTeacherId).update({ assignedSectionIds: checked });
    document.getElementById('assign-modal').style.display = 'none';
  }catch(e){
    msg.textContent = e.message; msg.className = 'msg err';
  }
}

(async () => {
  ADMIN_SESSION = await requireSuperAdminSession();
  if (!ADMIN_SESSION) return; // already redirected to superadmin-login.html
  document.getElementById('admin-name').textContent = ADMIN_SESSION.name + ' (' + ADMIN_SESSION.username + ')';
  document.getElementById('dash-loading').style.display = 'none';
  document.querySelector('.wrap').classList.add('ready');
  watchGlobalCounts();
  watchSections();
  watchTeachers();
  watchActiveSessions();
})();
