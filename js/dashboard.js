'use strict';
let TEACHER_SESSION = null;
let assignedSectionIds = [];       // live, from the teacher's own doc
let assignedSectionsInfo = [];     // [{id,grade,name,studentCount}], refreshed when assignments change
let currentGrade = null;
let rosterUnsub = null;
let itemAnalysisUnsub = null;
let sessionsUnsub = null;
let sessionsCache = [];

function doTeacherLogout(){ doLogoutTeacher(); }
function pctClass(p){ return p>=70 ? 'pct-good' : p>=40 ? 'pct-mid' : 'pct-bad'; }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// Firestore 'in' queries cap at 10 values, so a teacher with more than 10 assigned
// sections needs the query batched into chunks whose *live* results are merged.
// Returns an unsubscribe-all function.
function watchChunkedIn(collectionRef, field, ids, onMerge){
  if (!ids.length){ onMerge([]); return () => {}; }
  const chunks = [];
  for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i+10));
  const perChunk = new Map();
  const unsubs = chunks.map((chunk, i) => collectionRef.where(field, 'in', chunk).onSnapshot(snap => {
    perChunk.set(i, snap.docs.map(d => ({ id: d.id, ...d.data() })));
    onMerge([].concat(...perChunk.values()));
  }));
  return () => unsubs.forEach(u => u());
}

async function fetchAssignedSectionsInfo(ids){
  if (!ids.length) return [];
  const chunks = [];
  for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i+10));
  const results = await Promise.all(chunks.map(chunk =>
    db.collection('sections').where(firebase.firestore.FieldPath.documentId(), 'in', chunk).get()
  ));
  return [].concat(...results.map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

function populateGradePicker(){
  const grades = [...new Set(assignedSectionsInfo.map(s => s.grade))].sort((a,b)=>a-b);
  const sel = document.getElementById('my-grade');
  const noMsg = document.getElementById('no-assignment-msg');
  noMsg.style.display = grades.length ? 'none' : 'block';
  if (!grades.length){
    sel.innerHTML = ''; currentGrade = null;
    if (rosterUnsub){ rosterUnsub(); rosterUnsub = null; }
    if (itemAnalysisUnsub){ itemAnalysisUnsub(); itemAnalysisUnsub = null; }
    if (sessionsUnsub){ sessionsUnsub(); sessionsUnsub = null; }
    renderEverythingEmpty();
    return;
  }
  const prev = currentGrade;
  sel.innerHTML = grades.map(g => `<option value="${g}">Grade ${g}</option>`).join('');
  currentGrade = grades.includes(prev) ? prev : grades[0];
  sel.value = currentGrade;
  onGradeChange();
}

function renderEverythingEmpty(){
  document.getElementById('stat-row').innerHTML = '';
  document.getElementById('sections-body').innerHTML = '<tr><td colspan="2" class="empty">No sections assigned yet.</td></tr>';
  document.getElementById('students-body').innerHTML = '<tr><td colspan="5" class="empty">No sections assigned yet.</td></tr>';
  document.getElementById('ia-body').innerHTML = '<tr><td colspan="6" class="empty">No sections assigned yet.</td></tr>';
  document.getElementById('sessions-body').innerHTML = '<tr><td colspan="7" class="empty">No sections assigned yet.</td></tr>';
}

function currentGradeSectionIds(){
  return assignedSectionsInfo.filter(s => s.grade === currentGrade).map(s => s.id);
}

function onGradeChange(){
  currentGrade = Number(document.getElementById('my-grade').value);
  document.getElementById('sec-grade-label').textContent = currentGrade;
  document.getElementById('ia-grade-label').textContent = currentGrade;
  document.getElementById('sess-grade-label').textContent = currentGrade;
  renderSectionsForGrade();
  populateSectionFilter();
  populateSessionSectionPicker();
  watchRoster();
  watchItemAnalysis();
  watchSessions();
}

function renderSectionsForGrade(){
  const rows = assignedSectionsInfo.filter(s => s.grade === currentGrade);
  const body = document.getElementById('sections-body');
  body.innerHTML = rows.length
    ? rows.map(s => `<tr><td>${esc(s.name)}</td><td>${s.studentCount||0}</td></tr>`).join('')
    : '<tr><td colspan="2" class="empty">No sections assigned for this grade.</td></tr>';
  document.getElementById('stat-row').innerHTML = `
    <div class="stat"><div class="stat-n">${rows.length}</div><div class="stat-l">My sections (G${currentGrade})</div></div>
    <div class="stat"><div class="stat-n" id="stat-students">–</div><div class="stat-l">Students</div></div>
    <div class="stat"><div class="stat-n" id="stat-attempts">–</div><div class="stat-l">Completed attempts</div></div>
    <div class="stat"><div class="stat-n" id="stat-avg">–</div><div class="stat-l">Average score</div></div>`;
}

function populateSectionFilter(){
  const rows = assignedSectionsInfo.filter(s => s.grade === currentGrade);
  const sel = document.getElementById('stu-section');
  const prev = sel.value;
  sel.innerHTML = '<option value="">All my sections</option>' + rows.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  sel.value = rows.some(s => s.id === prev) ? prev : '';
  sel.onchange = renderRoster;
}

let rosterCache = [];
function watchRoster(){
  if (rosterUnsub) rosterUnsub();
  rosterCache = [];
  const ids = currentGradeSectionIds();
  rosterUnsub = watchChunkedIn(db.collection('students'), 'sectionId', ids, docs => {
    rosterCache = docs.sort((a,b) => (a.name||'').localeCompare(b.name||''));
    renderRoster();
  });
}

function renderRoster(){
  const statEl = document.getElementById('stat-students');
  if (statEl) statEl.textContent = rosterCache.length; // always the full grade roster, unfiltered

  const sectionId = document.getElementById('stu-section').value;
  const sectionById = new Map(assignedSectionsInfo.map(s => [s.id, s]));
  const rows = sectionId ? rosterCache.filter(s => s.sectionId === sectionId) : rosterCache;
  const body = document.getElementById('students-body');
  if (!rows.length){ body.innerHTML = '<tr><td colspan="5" class="empty">No students found.</td></tr>'; return; }
  body.innerHTML = rows.map(s => {
    const sec = sectionById.get(s.sectionId);
    return `
    <tr>
      <td>${esc(s.name)}</td>
      <td>${esc(s.id)}</td>
      <td>${esc(sec ? sec.name : s.sectionName)}</td>
      <td>${s.latestPercent!=null ? s.latestPercent.toFixed(0)+'% ('+s.latestSolved+'/'+s.latestTotal+')' : '—'}</td>
      <td>${s.attemptCount||0}</td>
    </tr>`;
  }).join('');
}

let attemptsCache = [];
function watchAttemptsForStats(){
  const ids = currentGradeSectionIds();
  return watchChunkedIn(db.collection('attempts'), 'sectionId', ids, docs => {
    attemptsCache = docs;
    const el = document.getElementById('stat-attempts');
    const elAvg = document.getElementById('stat-avg');
    if (el) el.textContent = docs.length;
    if (elAvg) elAvg.textContent = docs.length ? Math.round(docs.reduce((a,d)=>a+d.percentScore,0)/docs.length)+'%' : '–';
  });
}

function watchItemAnalysis(){
  if (itemAnalysisUnsub) itemAnalysisUnsub();
  const ids = currentGradeSectionIds();
  const attemptsWatchUnsub = watchAttemptsForStats();
  const resultsUnsub = watchChunkedIn(db.collection('scenarioResults'), 'sectionId', ids, docs => {
    renderItemAnalysis(docs);
  });
  itemAnalysisUnsub = () => { attemptsWatchUnsub(); resultsUnsub(); };
}

function renderItemAnalysis(docs){
  const body = document.getElementById('ia-body');
  if (!docs.length){ body.innerHTML = '<tr><td colspan="6" class="empty">No attempts recorded yet for this grade.</td></tr>'; return; }
  const byIndex = new Map();
  docs.forEach(r => {
    if (!byIndex.has(r.scenarioIndex)){
      byIndex.set(r.scenarioIndex, { scenarioIndex:r.scenarioIndex, melc:r.melc, concept:r.concept, attempts:0, correct:0, optionCounts:{} });
    }
    const bucket = byIndex.get(r.scenarioIndex);
    bucket.attempts++;
    if (r.outcome === 'correct') bucket.correct++;
    const key = r.chosenOption===null || r.chosenOption===undefined ? 'n/a' : String(r.chosenOption);
    bucket.optionCounts[key] = (bucket.optionCounts[key]||0) + 1;
  });
  const items = [...byIndex.values()].sort((a,b)=>a.scenarioIndex-b.scenarioIndex);
  body.innerHTML = items.map(it => {
    const difficultyPercent = it.attempts ? Math.round((it.correct/it.attempts)*100) : 0;
    const dist = Object.entries(it.optionCounts).sort().map(([k,v])=>
      `<span class="opt-chip">${k==='n/a'?'—':('Opt '+String.fromCharCode(65+Number(k)))}: ${v}</span>`
    ).join('');
    return `
    <tr>
      <td>${it.scenarioIndex+1}</td>
      <td>${esc(it.melc)}</td>
      <td>${esc(it.concept)}</td>
      <td>${it.attempts}</td>
      <td><div class="pct-bar-wrap"><div class="pct-bar"><div class="pct-fill ${pctClass(difficultyPercent)}" style="width:${difficultyPercent}%"></div></div><span>${difficultyPercent}%</span></div></td>
      <td><div class="opt-dist">${dist}</div></td>
    </tr>`;
  }).join('');
}

// ═══ SESSIONS ═══
// A session is how a teacher tells students in a section "the quiz is on now" — the
// student's menu screen live-waits for one before letting them play (see game-logic.js),
// and every attempt/result gets tagged with sessionId so scores can be pulled up per
// session instead of just as one running lifetime total.
function populateSessionSectionPicker(){
  const rows = assignedSectionsInfo.filter(s => s.grade === currentGrade);
  const sel = document.getElementById('sess-section');
  sel.innerHTML = rows.length
    ? rows.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')
    : '<option value="">No sections assigned</option>';
}

function watchSessions(){
  if (sessionsUnsub) sessionsUnsub();
  const ids = currentGradeSectionIds();
  sessionsUnsub = watchChunkedIn(db.collection('sessions'), 'sectionId', ids, docs => {
    sessionsCache = docs.sort((a,b) => (b.createdAt ? b.createdAt.toMillis() : 0) - (a.createdAt ? a.createdAt.toMillis() : 0));
    renderSessions();
  });
}

function renderSessions(){
  const body = document.getElementById('sessions-body');
  if (!sessionsCache.length){ body.innerHTML = '<tr><td colspan="7" class="empty">No sessions yet for this grade.</td></tr>'; return; }
  const sectionById = new Map(assignedSectionsInfo.map(s => [s.id, s]));
  body.innerHTML = sessionsCache.map(s => {
    const sec = sectionById.get(s.sectionId);
    const started = s.createdAt ? s.createdAt.toDate().toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : '–';
    const badge = s.status === 'active'
      ? '<span class="session-badge active">● Active</span>'
      : '<span class="session-badge closed">Closed</span>';
    return `
    <tr>
      <td>${esc(sec ? sec.name : s.sectionName)}</td>
      <td>${esc(s.label || 'Session')}</td>
      <td>${badge}</td>
      <td>${started}</td>
      <td>${s.attemptCount || 0}</td>
      <td>${s.attemptCount ? Math.round(s.avgPercent||0)+'%' : '–'}</td>
      <td class="row" style="flex-wrap:nowrap">
        <button class="action" style="padding:5px 10px;font-size:.72rem" onclick="viewSessionResults('${s.id}')">View</button>
        ${s.status==='active' ? `<button class="danger" style="padding:5px 10px;font-size:.72rem" onclick="endSession('${s.id}')">End</button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

async function startSession(){
  const sectionId = document.getElementById('sess-section').value;
  const label = document.getElementById('sess-label').value.trim() || 'Session';
  const msg = document.getElementById('sess-msg');
  if (!sectionId){ msg.textContent = 'No section available for this grade.'; msg.className = 'msg err'; return; }
  const sec = assignedSectionsInfo.find(s => s.id === sectionId);
  try{
    // Only one active session per section makes sense (a student can only be waiting
    // to join one thing) — auto-close any other active session on this same section.
    const stillActive = sessionsCache.filter(s => s.sectionId === sectionId && s.status === 'active');
    for (const s of stillActive){
      await db.collection('sessions').doc(s.id).update({ status: 'closed', closedAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
    await db.collection('sessions').add({
      teacherId: TEACHER_SESSION.uid, grade: currentGrade, sectionId, sectionName: sec ? sec.name : '',
      label, status: 'active', attemptCount: 0, avgPercent: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(), closedAt: null
    });
    document.getElementById('sess-label').value = '';
    msg.textContent = 'Session started — students in that section can now join.'; msg.className = 'msg ok';
  }catch(e){
    msg.textContent = e.message; msg.className = 'msg err';
  }
}

async function endSession(sessionId){
  if (!confirm('End this session? Students will no longer be able to join it.')) return;
  try{
    await db.collection('sessions').doc(sessionId).update({ status: 'closed', closedAt: firebase.firestore.FieldValue.serverTimestamp() });
  }catch(e){
    alert(e.message);
  }
}

async function viewSessionResults(sessionId){
  const s = sessionsCache.find(x => x.id === sessionId);
  document.getElementById('sr-title').textContent = s ? `${s.label || 'Session'} — ${s.sectionName}` : 'Session Results';
  const body = document.getElementById('sr-body');
  body.innerHTML = '<tr><td colspan="3" class="empty">Loading…</td></tr>';
  document.getElementById('session-results-modal').style.display = 'flex';
  try{
    // Firestore's security rules can only vouch for a `list` query when it filters on
    // the same field the rule inspects (sectionId here) — filtering by sessionId
    // instead would make the query un-provably-safe and get rejected outright, even
    // though every actual matching document would pass. So: query by sectionId (which
    // the rule checks and this teacher is definitely allowed to see), then narrow to
    // this specific session client-side.
    const snap = await db.collection('attempts').where('sectionId','==', s.sectionId).get();
    const rows = snap.docs.map(d => d.data()).filter(r => r.sessionId === sessionId).sort((a,b) => b.percentScore - a.percentScore);
    if (!rows.length){ body.innerHTML = '<tr><td colspan="3" class="empty">No students have played this session yet.</td></tr>'; return; }
    const nameById = new Map(rosterCache.map(st => [st.id, st.name]));
    body.innerHTML = rows.map(r => `
      <tr>
        <td>${esc(nameById.get(r.studentId) || r.studentId)}</td>
        <td>${esc(r.studentId)}</td>
        <td>${Math.round(r.percentScore)}% (${r.solvedCount}/${r.totalScenarios})</td>
      </tr>`).join('');
  }catch(e){
    body.innerHTML = `<tr><td colspan="3" class="empty">${esc(e.message)}</td></tr>`;
  }
}

async function onAssignmentsChanged(newIds){
  assignedSectionIds = newIds || [];
  assignedSectionsInfo = await fetchAssignedSectionsInfo(assignedSectionIds);
  populateGradePicker();
}

(async () => {
  TEACHER_SESSION = await requireTeacherSession();
  if (!TEACHER_SESSION) return; // already redirected to teacher-login.html
  document.getElementById('teacher-name').textContent = TEACHER_SESSION.name + ' (' + TEACHER_SESSION.username + ')';
  document.getElementById('dash-loading').style.display = 'none';
  document.querySelector('.wrap').classList.add('ready');

  // Live on the teacher's own doc: if the Super Admin changes their assignments while
  // this dashboard is open, the grade picker and all scoped data update automatically.
  // If the doc disappears entirely (e.g. the admin reset this teacher's credentials,
  // which retires the old profile doc), sign this session out gracefully instead of
  // leaving a dashboard full of stale data and silent permission errors on screen.
  db.collection('teachers').doc(TEACHER_SESSION.uid).onSnapshot(doc => {
    if (!doc.exists){
      sessionStorage.setItem('c2s_login_error', 'Your account credentials were reset by your Super Admin. Please log in with your new username and password.');
      doLogoutTeacher();
      return;
    }
    const ids = doc.data().assignedSectionIds || [];
    if (JSON.stringify(ids) !== JSON.stringify(assignedSectionIds)) onAssignmentsChanged(ids);
  });
})();
