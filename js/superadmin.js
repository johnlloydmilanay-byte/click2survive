'use strict';
// Super Admin dashboard: school-wide oversight (grades, sections, teachers, students,
// sessions, item analysis), PDF reports, and the account/section management
// actions. Everything is live via onSnapshot; each page re-renders from the
// in-memory caches below.
let ADMIN_SESSION = null;
let sectionsCache = [];   // all sections, live
let teachersCache = [];   // all teachers, live
let studentsCache = [];   // all students, live
let attemptsCache = [];   // all completed runs, live
let resultsCache = [];    // all per-item results, live (if the rules allow it)
let sessionsCache = [];   // all sessions (falls back to active-only if the rules only allow that)
let validatorsCache = []; // content validators (name-only accounts), live
let vItemsCache = [];     // Expert Validation Form, Part A: one per validator per item, live
let vGradesCache = [];    // Part B + learner-view check: one per validator per grade, live
let vFormsCache = [];     // Part C, recommendation, signature, acceptability: one per validator, live
let valReviewsCache = []; // the earlier 0–5 star ratings, kept for reference
let assignTeacherId = null;
let goTab = () => {};
const GRADE_LIST = GRADE_LEVELS;   // from game-data.js: Junior High 7–10, Senior High 11–12

function sectionById(id){ return sectionsCache.find(s => s.id === id); }
function sectionName(id){ const s = sectionById(id); return s ? s.name : ''; }
function teacherName(id){ const t = teachersCache.find(x => x.id === id); return t ? t.name : '—'; }
function studentById(id){ return studentsCache.find(s => s.id === id); }
function sessionLabel(id){ const s = sessionsCache.find(x => x.id === id); return s ? (s.label || 'Session') : (id ? 'Session' : 'Practice (no session)'); }
function sessionOptionLabel(s){ return `${s.label || 'Session'} · G${s.grade} ${sectionName(s.sectionId) || s.sectionName} · ${fmtWhen(s.createdAt)}`; }
function teachersForSection(id){ return teachersCache.filter(t => (t.assignedSectionIds||[]).includes(id)); }
function keepSelect(id, html){ const el = document.getElementById(id); const v = el.value; el.innerHTML = html; if ([...el.options].some(o => o.value === v)) el.value = v; }

let renderQueued = false;
function renderAll(){
  if (renderQueued) return; renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    const cnt = (id, n) => { document.getElementById(id).innerHTML = `<span class="sr-only">count </span>${n}`; };
    cnt('tc-sections', sectionsCache.length); cnt('tc-teachers', teachersCache.length); cnt('tc-students', studentsCache.length);
    const live = sessionsCache.filter(s => s.status === 'active').length;
    const lc = document.getElementById('tc-live'); lc.style.display = live ? '' : 'none'; lc.innerHTML = `${live}<span class="sr-only"> live</span>`;
    cnt('tc-validators', validatorsCache.length);
    renderOverview(); renderSections(); renderTeachers(); renderStudents(); renderSessions(); renderItems(); populateReportPickers(); renderValidation();
    if (document.getElementById('va-modal').style.display === 'flex' && vaOpen) vaOpen.render();
    if (document.getElementById('session-modal').style.display === 'flex') renderSessionModal();
    if (document.getElementById('student-modal').style.display === 'flex') renderStudentModal();
  });
}

// ═══ OVERVIEW ═══
function gradeRollup(g){
  const secs = sectionsCache.filter(s => s.grade === g);
  const ids = new Set(secs.map(s => s.id));
  const students = studentsCache.filter(s => s.grade === g || ids.has(s.sectionId));
  const latest = latestByStudent(attemptsCache.filter(a => a.grade === g));
  const scores = [...latest.values()].map(a => a.percentScore || 0);
  const teachers = teachersCache.filter(t => (t.assignedSectionIds||[]).some(id => ids.has(id)));
  return { g, gd: GRADES[g], secs, students: students.length, played: latest.size, teachers: teachers.length,
    participation: students.length ? latest.size / students.length * 100 : null, mps: mean(scores) };
}
function renderOverview(){
  const latest = latestByStudent(attemptsCache);
  const scores = [...latest.values()].map(a => a.percentScore || 0);
  const mps = mean(scores), m = mastery(mps);
  const live = sessionsCache.filter(s => s.status === 'active');
  const part = studentsCache.length ? latest.size / studentsCache.length * 100 : null;
  const unassigned = sectionsCache.filter(s => !teachersForSection(s.id).length).length;
  const idle = teachersCache.filter(t => !(t.assignedSectionIds||[]).length).length;
  document.getElementById('ov-stats').innerHTML =
      statHTML({ label:'Students', icon:'people', value:studentsCache.length, sub:`${latest.size} have played (${pct(part)})` })
    + statHTML({ label:'Teachers', icon:'person-workspace', tone: idle ? 'warn' : '', value:teachersCache.length, sub: idle ? `${idle} without sections` : 'All have sections' })
    + statHTML({ label:'Sections', icon:'grid-3x3-gap', tone: unassigned ? 'warn' : '', value:sectionsCache.length, sub: unassigned ? `${unassigned} with no teacher` : 'All have a teacher' })
    + statHTML({ label:'School mean score', icon:'bullseye', tone: m.tone === 'none' ? '' : m.tone, value:pct(mps), sub:masteryBadge(mps) })
    + statHTML({ label:'Completed runs', icon:'journal-check', value:attemptsCache.length, sub:`${sessionsCache.length} session${sessionsCache.length===1?'':'s'}` })
    + statHTML({ label:'Live sessions', icon:'broadcast', tone: live.length ? 'good' : '', value:live.length, sub: live.length ? 'Students playing now' : 'None running' });

  document.getElementById('ov-grades').innerHTML = GRADE_LIST.map((g, i) => {
    const r = gradeRollup(g);
    const band = (!i || gradeBand(g) !== gradeBand(GRADE_LIST[i-1])) ? `<tr class="band-row"><th colspan="8" scope="colgroup">${gradeBand(g)}</th></tr>` : '';
    return `${band}<tr class="clickable" onclick="rowClick(event,this)">
      <th scope="row"><button class="name-btn" data-primary onclick="openGradeItems(${g})"><span class="nm">Grade ${g}</span><span class="sr-only">, open item analysis</span></button></th><td class="muted">${esc(r.gd ? r.gd.topic : '')}</td>
      <td class="num">${r.secs.length}</td><td class="num">${r.teachers}</td><td class="num">${r.students}</td>
      <td>${r.students ? barHTML(r.participation, { tone:'seq', tip:`${r.played} of ${r.students} played` }) : '<span class="dim">—</span>'}</td>
      <td>${r.played ? barHTML(r.mps) : '<span class="dim">No runs yet</span>'}</td>
      <td>${r.played ? masteryBadge(r.mps) : ''}</td></tr>`;
  }).join('');

  const ranked = sectionsCache.map(s => sectionRollup(s, studentsCache, attemptsCache)).filter(r => r.played).sort((a,b) => b.mps - a.mps);
  document.getElementById('ov-sections').innerHTML = ranked.length ? `<ol class="hbars" style="list-style:none">${ranked.slice(0, 12).map(r => `
    <li class="hbar"><span class="name"><span class="dim">G${r.grade}</span> <b>${esc(r.name)}</b></span>
      <div class="bar-track" aria-hidden="true" data-tip="${esc(`G${r.grade} ${r.name}: ${pct(r.mps)} · ${mastery(r.mps).label} · ${r.played}/${r.enrolled} played`)}"><div class="bar-fill ${mastery(r.mps).tone}" style="width:${r.mps}%"></div></div>
      <span class="meta"><b style="color:var(--tx)">${pct(r.mps)}</b> · ${r.played}/${r.enrolled}<span class="sr-only"> played, ${esc(mastery(r.mps).label)}</span></span></li>`).join('')}</ol>
      ${ranked.length > 12 ? `<p class="dim" style="margin-top:.7rem">Showing the top 12 of ${ranked.length}. See Sections for all.</p>` : ''}`
    : emptyHTML('No section has completed runs yet.', 'bar-chart');

  document.getElementById('ov-mastery').innerHTML = masteryStackHTML(scores, Math.max(0, studentsCache.length - latest.size));

  document.getElementById('ov-live').innerHTML = live.length ? `<ul class="hbars" style="list-style:none">${live.map(s => `
    <li><button class="hbar two" onclick="openSession('${s.id}')">
      <span class="name"><b>${esc(s.label||'Session')}</b> <span class="dim">G${s.grade} ${esc(sectionName(s.sectionId)||s.sectionName)} · ${esc(teacherName(s.teacherId))}</span></span>
      ${liveBadge(new Set(attemptsCache.filter(a => a.sessionId === s.id).map(a => a.studentId)).size + ' played')}</button></li>`).join('')}</ul>`
    : emptyHTML('No sessions are running right now.', 'broadcast');

  const recent = [...attemptsCache].sort((a,b) => toMillis(b.finishedAt) - toMillis(a.finishedAt)).slice(0, 8);
  document.getElementById('ov-recent').innerHTML = recent.length ? `<div class="table-wrap"><table><caption class="sr-only">Recently completed runs</caption>
    <thead><tr><th scope="col">Student</th><th scope="col">Class</th><th scope="col">Mastery</th><th scope="col" class="num">Score</th><th scope="col">When</th></tr></thead><tbody>${recent.map(a => {
    const st = studentById(a.studentId);
    return `<tr class="clickable" onclick="rowClick(event,this)"><td>${studentNameBtn(a.studentId, st ? st.name : a.studentId)}</td>
      <td class="muted">Grade ${a.grade} · ${esc(sectionName(a.sectionId))}${a.sessionId ? ' · ' + esc(sessionLabel(a.sessionId)) : ''}</td>
      <td>${masteryBadge(a.percentScore)}</td><td class="num"><b>${pct(a.percentScore)}</b></td><td class="dim nowrap">${fmtAgo(a.finishedAt)}</td></tr>`;
  }).join('')}</tbody></table></div>` : emptyHTML('No runs completed yet.', 'journal');
}
function openGradeItems(g){ document.getElementById('ia-grade').value = g; onIaGradeChange(); goTab('items'); }
function exportGradeSummary(){
  const rows = [['Grade','Topic','Sections','Teachers','Students','Played','Participation %','Mean score %','Mastery']];
  GRADE_LIST.forEach(g => { const r = gradeRollup(g); rows.push([g, r.gd ? r.gd.topic : '', r.secs.length, r.teachers, r.students, r.played, r.participation==null?'':Math.round(r.participation), r.mps==null?'':Math.round(r.mps), r.played?mastery(r.mps).label:'']); });
  rows.push([]);
  rows.push(['Grade','Section','Teacher(s)','Students','Played','Participation %','Mean score %','Mastery']);
  sectionsCache.forEach(s => { const r = sectionRollup(s, studentsCache, attemptsCache); rows.push([s.grade, s.name, teachersForSection(s.id).map(t => t.name).join('; '), r.enrolled, r.played, r.participation==null?'':Math.round(r.participation), r.mps==null?'':Math.round(r.mps), r.played?mastery(r.mps).label:'']); });
  downloadCSV('click2survive-school-summary.csv', rows);
}

// ═══ SECTIONS ═══
function renderSections(){
  const g = Number(document.getElementById('sec-grade').value) || null;
  const q = document.getElementById('sec-search').value.trim().toLowerCase();
  const body = document.getElementById('sections-body');
  const rows = sectionsCache.filter(s => (!g || s.grade === g) && (!q || s.name.toLowerCase().includes(q)));
  if (!rows.length){ body.innerHTML = `<tr><td colspan="8">${emptyHTML(sectionsCache.length ? 'No sections match.' : 'No sections yet. Add one above.', 'grid-3x3-gap')}</td></tr>`; return; }
  body.innerHTML = rows.map(s => {
    const r = sectionRollup(s, studentsCache, attemptsCache);
    const ts = teachersForSection(s.id);
    return `<tr>
      <th scope="row" style="font-weight:600">${esc(s.name)}</th><td>Grade ${s.grade}</td>
      <td>${ts.length ? ts.map(t => `<span class="chip">${esc(t.name)}</span>`).join('') : `<span class="badge warn">${ico('exclamation-triangle')}No teacher</span>`}</td>
      <td class="num">${r.enrolled}</td>
      <td>${r.enrolled ? barHTML(r.participation, { tone:'seq', tip:`${r.played} of ${r.enrolled} played` }) : '<span class="dim">—</span>'}</td>
      <td>${r.played ? barHTML(r.mps) : '<span class="dim">No runs yet</span>'}</td>
      <td>${r.played ? masteryBadge(r.mps) : ''}</td>
      <td><div class="row" style="flex-wrap:nowrap;justify-content:flex-end">
        <button class="btn secondary sm" onclick="viewSectionStudents('${s.id}')" aria-label="View students in ${esc(s.name)}">${ico('people')}Students</button>
        <button class="btn secondary sm" onclick="pdfClass(this, ${s.grade}, '${s.id}')" aria-label="Download class report for ${esc(s.name)}">${ico('file-earmark-pdf')}PDF</button>
        <button class="btn danger sm" onclick="deleteSection('${s.id}')" aria-label="Delete section ${esc(s.name)}" ${r.enrolled ? 'disabled title="Sections with enrolled students cannot be deleted"' : ''}>${ico('trash')}</button>
      </div></td></tr>`;
  }).join('');
}
function viewSectionStudents(id){
  const s = sectionById(id); if (!s) return;
  document.getElementById('stu-grade').value = s.grade; populateStuSections();
  document.getElementById('stu-section').value = id; renderStudents(); goTab('students');
}

async function createSection(){
  const grade = Number(document.getElementById('new-sec-grade').value);
  const name = document.getElementById('new-sec-name').value.trim();
  if(!name){ setMsg('sec-msg', 'Enter a section name.', 'err'); document.getElementById('new-sec-name').focus(); return; }
  if (sectionsCache.some(s => s.grade === grade && s.name.toLowerCase() === name.toLowerCase())){
    setMsg('sec-msg', 'That section already exists for this grade.', 'err'); return;
  }
  try{
    await db.collection('sections').add({
      grade, name, createdBy: ADMIN_SESSION.uid,
      studentCount: 0, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    document.getElementById('new-sec-name').value = '';
    setMsg('sec-msg', `Section “${name}” created for Grade ${grade}.`, 'ok');
  }catch(e){
    setMsg('sec-msg', e.message, 'err');
  }
}

async function deleteSection(id){
  const s = sectionsCache.find(x => x.id === id);
  if (s && (s.studentCount||0) > 0){ alert('Cannot delete a section that already has students enrolled.'); return; }
  if(!confirm(`Delete section “${s ? s.name : ''}”? This only works if no students are enrolled in it.`)) return;
  try{
    await db.collection('sections').doc(id).delete();
    toast('Section deleted.');
  }catch(e){
    toast(e.message, 'err');
  }
}

// ═══ TEACHERS ═══
function teacherRollup(t){
  const ids = new Set(t.assignedSectionIds||[]);
  const secs = sectionsCache.filter(s => ids.has(s.id));
  const studs = studentsCache.filter(s => ids.has(s.sectionId));
  const latest = latestByStudent(attemptsCache.filter(a => ids.has(a.sectionId)));
  const sess = sessionsCache.filter(s => s.teacherId === t.id);
  return { secs, students: studs.length, played: latest.size, mps: latest.size ? mean([...latest.values()].map(a => a.percentScore || 0)) : null, sess, live: sess.some(s => s.status === 'active') };
}
function renderTeachers(){
  const q = document.getElementById('t-search').value.trim().toLowerCase();
  const level = document.getElementById('t-level').value;
  const body = document.getElementById('teachers-body');
  const teaches = (t, shs) => (t.assignedSectionIds||[]).some(id => { const s = sectionById(id); return s && (s.grade >= 11) === shs; });
  const rows = teachersCache.filter(t => (!q || (t.name||'').toLowerCase().includes(q) || (t.username||'').toLowerCase().includes(q))
    && (!level || (level === 'none' ? !(t.assignedSectionIds||[]).length : teaches(t, level === 'shs'))));
  if (!rows.length){ body.innerHTML = `<tr><td colspan="8">${emptyHTML(teachersCache.length ? 'No teachers match these filters.' : 'No teachers yet. Create one above.', 'person-workspace')}</td></tr>`; return; }
  body.innerHTML = rows.map(t => {
    const r = teacherRollup(t);
    return `<tr>
      <th scope="row"><div class="row" style="flex-wrap:nowrap"><span class="avatar" style="width:30px;height:30px;font-size:.72rem" aria-hidden="true">${esc(initials(t.name))}</span><span style="font-weight:600">${esc(t.name)}</span>${r.live?liveBadge('Live'):''}</div></th>
      <td class="mono">${esc(t.username)}</td>
      <td>${r.secs.length ? r.secs.map(s => `<span class="chip">G${s.grade} ${esc(s.name)}</span>`).join('') : `<span class="badge warn">${ico('exclamation-triangle')}None assigned</span>`}</td>
      <td class="num">${r.students}</td>
      <td class="num">${r.sess.length}</td>
      <td class="dim nowrap">${r.sess.length ? fmtAgo(r.sess[0].createdAt) : '—'}</td>
      <td>${r.played ? barHTML(r.mps) : '<span class="dim">—</span>'}</td>
      <td><div class="row" style="flex-wrap:nowrap;justify-content:flex-end">
        <button class="btn secondary sm" onclick="openAssignModal('${t.id}')" aria-label="Assign sections to ${esc(t.name)}">${ico('diagram-3')}Assign</button>
        <button class="btn secondary sm" onclick="resetTeacherCredentials('${t.id}')" aria-label="Issue a new username and password for ${esc(t.name)}">${ico('key')}Reset login</button>
        <button class="btn danger sm" onclick="removeTeacher('${t.id}')" aria-label="Remove teacher ${esc(t.name)}">${ico('person-x')}Remove</button>
      </div></td></tr>`;
  }).join('');
}

// ═══ STUDENTS ═══
function populateStuSections(){
  const g = Number(document.getElementById('stu-grade').value) || null;
  keepSelect('stu-section', '<option value="">All sections</option>' + sectionsCache.filter(s => !g || s.grade === g)
    .map(s => `<option value="${s.id}">G${s.grade} ${esc(s.name)}</option>`).join(''));
}
function onStuGradeChange(){ populateStuSections(); renderStudents(); }
function studentRows(){
  const q = document.getElementById('stu-search').value.trim().toLowerCase();
  const g = Number(document.getElementById('stu-grade').value) || null;
  const sec = document.getElementById('stu-section').value;
  const mf = document.getElementById('stu-mastery').value;
  const latest = latestByStudent(attemptsCache);
  const runs = new Map(); attemptsCache.forEach(a => runs.set(a.studentId, (runs.get(a.studentId)||0) + 1));
  return studentsCache.map(s => { const a = latest.get(s.id); return { s, a, p: a ? a.percentScore : null, runs: runs.get(s.id) || 0 }; })
    .filter(r => (!g || r.s.grade === g) && (!sec || r.s.sectionId === sec)
      && (!q || (r.s.name||'').toLowerCase().includes(q) || r.s.id.toLowerCase().includes(q))
      && (!mf || mastery(r.p).tone === mf))
    .sort((x,y) => (x.s.grade - y.s.grade) || (sectionName(x.s.sectionId)).localeCompare(sectionName(y.s.sectionId)) || (x.s.name||'').localeCompare(y.s.name||''));
}
const STUDENT_ROW_CAP = 400;
function renderStudents(){
  const rows = studentRows();
  const body = document.getElementById('students-body');
  document.getElementById('stu-foot').textContent = rows.length > STUDENT_ROW_CAP ? `Showing ${STUDENT_ROW_CAP} of ${rows.length}. Narrow with the filters, or export CSV for the full list.` : `${rows.length} of ${studentsCache.length} student${studentsCache.length===1?'':'s'} shown`;
  if (!rows.length){ body.innerHTML = `<tr><td colspan="9">${emptyHTML(studentsCache.length ? 'No students match these filters.' : 'No students have registered yet.', 'people')}</td></tr>`; return; }
  body.innerHTML = rows.slice(0, STUDENT_ROW_CAP).map(r => `<tr class="clickable" onclick="rowClick(event,this)">
    <td>${studentNameBtn(r.s.id, r.s.name)}</td><td class="mono">${esc(r.s.id)}</td><td>${r.s.grade}</td>
    <td>${esc(sectionName(r.s.sectionId) || r.s.sectionName)}</td>
    <td>${r.a ? barHTML(r.p, { tip:`${r.a.solvedCount}/${r.a.totalScenarios} correct` }) : '<span class="dim">—</span>'}</td>
    <td>${r.a ? masteryBadge(r.p) : `<span class="badge none">${ico('hourglass')}Not yet played</span>`}</td>
    <td class="num">${r.runs}</td><td class="dim nowrap">${fmtWhen(r.s.createdAt)}</td>
    <td><button class="btn danger sm" data-sid="${esc(r.s.id)}" onclick="removeStudent(this.dataset.sid)" aria-label="Remove student ${esc(r.s.name)}">${ico('person-x')}Remove</button></td></tr>`).join('');
}
function exportStudents(){
  const rows = [['Student ID','Name','Grade','Section','Latest score %','Correct','Items','Mastery','Runs','Last played','Registered']];
  studentRows().forEach(r => rows.push([r.s.id, r.s.name, r.s.grade, sectionName(r.s.sectionId) || r.s.sectionName, r.a ? Math.round(r.p) : '', r.a ? r.a.solvedCount : '', r.a ? r.a.totalScenarios : '', r.a ? mastery(r.p).label : 'Not yet played', r.runs, r.a ? r.a.finishedAt : '', r.s.createdAt ? new Date(toMillis(r.s.createdAt)).toISOString() : '']));
  downloadCSV('click2survive-students.csv', rows);
}
let openStudentId = null;
function openStudent(id){
  if (!studentById(id)) return;
  openStudentId = id; renderStudentModal();
  if (document.getElementById('session-modal').style.display === 'flex') closeModal('session-modal');
  openModal('student-modal');
}
function renderStudentModal(){
  const s = studentById(openStudentId); if (!s) return;
  renderStudentDetail(s, attemptsCache.filter(a => a.studentId === s.id), resultsCache, { sectionName, sessionLabel });
  document.getElementById('st-pdf-btn').onclick = e => pdfStudent(s.id, e.currentTarget);
  document.getElementById('st-remove-btn').onclick = () => removeStudent(s.id);
}

// ═══ SESSIONS ═══
function populateTeacherFilter(){
  keepSelect('ss-teacher', '<option value="">All teachers</option>' + teachersCache.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join(''));
}
function renderSessions(){
  const g = Number(document.getElementById('ss-grade').value) || null;
  const t = document.getElementById('ss-teacher').value;
  const st = document.getElementById('ss-status').value;
  const body = document.getElementById('sessions-body');
  const rows = sessionsCache.filter(s => (!g || s.grade === g) && (!t || s.teacherId === t) && (!st || s.status === st));
  if (!rows.length){ body.innerHTML = `<tr><td colspan="9">${emptyHTML(sessionsCache.length ? 'No sessions match.' : 'No sessions yet.', 'broadcast')}</td></tr>`; return; }
  body.innerHTML = rows.map(s => {
    const at = attemptsCache.filter(a => a.sessionId === s.id);
    const latest = latestByStudent(at);
    const enrolled = studentsCache.filter(x => x.sectionId === s.sectionId).length;
    return `<tr class="clickable" onclick="rowClick(event,this)">
      <td><button class="name-btn" data-primary onclick="openSession('${s.id}')"><span class="nm">${esc(s.label || 'Session')}</span></button></td><td>${s.grade}</td><td>${esc(sectionName(s.sectionId) || s.sectionName)}</td>
      <td>${esc(teacherName(s.teacherId))}</td>
      <td>${s.status === 'active' ? liveBadge() : closedBadge()}</td>
      <td class="nowrap">${fmtWhen(s.createdAt)}</td>
      <td class="num">${latest.size}<span class="dim"> / ${enrolled}</span></td>
      <td>${at.length ? barHTML(mean([...latest.values()].map(a => a.percentScore||0))) : '<span class="dim">No runs yet</span>'}</td>
      <td><button class="btn secondary sm" onclick="pdfSession('${s.id}', this)" aria-label="Download PDF for ${esc(s.label||'session')}">${ico('file-earmark-pdf')}PDF</button></td></tr>`;
  }).join('');
}
let openSessionId = null;
function openSession(id){ openSessionId = id; renderSessionModal(); openModal('session-modal'); }
function renderSessionModal(){
  const s = sessionsCache.find(x => x.id === openSessionId); if (!s) return;
  const at = attemptsCache.filter(a => a.sessionId === s.id);
  const latest = latestByStudent(at);
  const roster = studentsCache.filter(x => x.sectionId === s.sectionId);
  const scores = [...latest.values()].map(a => a.percentScore || 0);
  const avg = mean(scores);
  document.getElementById('sm-title').textContent = s.label || 'Session';
  document.getElementById('sm-sub').textContent = `Grade ${s.grade} · ${sectionName(s.sectionId) || s.sectionName} · ${teacherName(s.teacherId)} · started ${fmtWhen(s.createdAt, true)}`;
  document.getElementById('sm-stats').innerHTML =
      statHTML({ label:'Status', icon: s.status==='active' ? 'broadcast' : 'lock', tone: s.status==='active' ? 'good' : '', value: s.status==='active' ? 'Active' : 'Closed' })
    + statHTML({ label:'Played', icon:'person-check', value:`${latest.size}<small> / ${roster.length}</small>` })
    + statHTML({ label:'Mean score', icon:'bullseye', value:pct(avg), sub: avg==null ? '' : masteryBadge(avg) })
    + statHTML({ label:'Highest / lowest', icon:'arrow-down-up', value: scores.length ? pct(Math.max(...scores)) + ' / ' + pct(Math.min(...scores)) : '–' });
  document.getElementById('sm-pdf-btn').onclick = e => pdfSession(s.id, e.currentTarget);
  const played = [...latest.values()].sort((a,b) => (b.percentScore||0) - (a.percentScore||0));
  const notPlayed = roster.filter(r => !latest.has(r.id));
  document.getElementById('sm-body').innerHTML = (played.length || notPlayed.length) ? played.map((a, i) => {
    const st = studentById(a.studentId);
    return `<tr class="clickable" onclick="rowClick(event,this)"><td class="dim">${i+1}</td><td>${studentNameBtn(a.studentId, st ? st.name : a.studentId, { avatar:false })}</td><td class="mono">${esc(a.studentId)}</td>
      <td>${barHTML(a.percentScore, { tip:`${a.solvedCount}/${a.totalScenarios} correct` })}</td><td>${masteryBadge(a.percentScore)}</td><td class="nowrap dim">${fmtWhen(a.finishedAt)}</td></tr>`;
  }).join('') + notPlayed.map(r => `<tr class="clickable" onclick="rowClick(event,this)"><td class="dim">–</td><td>${studentNameBtn(r.id, r.name, { avatar:false })}</td><td class="mono">${esc(r.id)}</td><td colspan="3"><span class="badge none">${ico('hourglass')}Not yet played</span></td></tr>`).join('')
    : `<tr><td colspan="6">${emptyHTML('No students in this section yet.', 'people')}</td></tr>`;
}

// ═══ VALIDATION ═══
// The Expert Validation Form and Acceptability Evaluation Tool (js/validation-form.js),
// filled in by validators in game.html. f = frequency of each rating, WM = weighted mean.
const VA_SCOPE = () => document.getElementById('va-scope').value;
function vaFormOf(id){ return vFormsCache.find(f => f.id === id) || {}; }
function vaInScope(validatorId){ return VA_SCOPE() === 'all' || !!vaFormOf(validatorId).submitted; }
function vaItems(g, i){ return vItemsCache.filter(r => r.grade === g && r.idx === i && r.rating && vaInScope(r.validatorId)); }
function vaGrades(g){ return vGradesCache.filter(r => r.grade === g && vaInScope(r.validatorId)); }
function vaForms(){ return vFormsCache.filter(f => vaInScope(f.id)); }
function vaAccepts(){ return vFormsCache.filter(f => f.acceptability && (VA_SCOPE() === 'all' || f.acceptability.submitted)); }
function vaName(id){ const v = validatorsCache.find(x => x.id === id); return v ? v.name : id; }
function vaProgress(id){
  const items = vItemsCache.filter(r => r.validatorId === id && r.rating).length;
  const grades = vGradesCache.filter(r => r.validatorId === id);
  const partB = grades.filter(r => VF_PART_B_IDS.every(k => (r.ratings||{})[k])).length;
  const checks = grades.filter(r => r.check).length, f = vaFormOf(id);
  const partC = VF.partC.items.filter(([k]) => ((f.partC||{}).ratings||{})[k]).length;
  return { items, partB, checks, partC, submitted: !!f.submitted, accept: !!(f.acceptability||{}).submitted, form:f };
}
function vaRow(label, top, values, scale, extra, cls){
  const q = vfFreq(values, top), ks = []; for (let k = top; k >= 1; k--) ks.push(k);
  return `<tr${cls ? ` class="${cls}"` : ''}>${label}${ks.map(k => `<td class="num">${q.n ? q.f[k] : '–'}</td>`).join('')}<td class="num"><b>${q.wm == null ? '–' : q.wm.toFixed(2)}</b></td><td>${q.wm == null ? '<span class="dim">No ratings</span>' : esc(vfInterp(q.wm, scale))}</td>${extra == null ? '' : `<td>${extra}</td>`}</tr>`;
}
function vaCmBtn(n, call){ return n ? `<button class="btn secondary sm" onclick="${call}">${ico('chat-left-text')}${n}</button>` : '<span class="dim">–</span>'; }
const vaHead = (top, first, cm) => { const ks = []; for (let k = top; k >= 1; k--) ks.push(k); return `<thead><tr>${first}${ks.map(k => `<th scope="col" class="num">${k}</th>`).join('')}<th scope="col" class="num">WM</th><th scope="col">Interpretation</th>${cm ? '<th scope="col">Comments</th>' : ''}</tr></thead>`; };
const vaAll = (list, get) => list.reduce((a, x) => a.concat(get(x)), []);

function vaPartATable(g, plain){
  const rows = VF.items[g].map((foc, i) => {
    const rs = vaItems(g, i), notes = rs.filter(r => r.noConcept).length, cm = rs.filter(r => r.comment || r.noConcept).length;
    const flag = notes ? `<div class="va-flag">${notes} noted: correct answer possible without the concept</div>` : '';
    return vaRow(`<td class="num">${i+1}</td><td>${esc(foc)}${flag}</td>`, 4, rs.map(r => r.rating), VF.partA.scale, plain ? null : vaCmBtn(cm, `vaShowComments('a',${g},${i})`));
  }).join('');
  const all = VF.items[g].reduce((a, _, i) => a.concat(vaItems(g, i).map(r => r.rating)), []);
  return `<table><caption class="sr-only">Grade ${g} item relevance</caption>${vaHead(4, '<th scope="col" class="num">Item</th><th scope="col">Item Focus</th>', !plain)}<tbody>${rows}${vaRow('<td colspan="2"><b>Grade ' + g + ' items overall</b></td>', 4, all, VF.partA.scale, plain ? null : '', 'va-total')}</tbody></table>`;
}
function vaPartBTable(g, plain){
  const gs = vaGrades(g), val = id => gs.map(r => (r.ratings||{})[id]);
  const body = VF.partB.groups.map(gr => {
    const head = vaRow(`<td><b>${esc(gr.name)}</b></td>`, 4, vaAll(gr.items, ([id]) => val(id)), VF.criterion, plain ? null : '', 'va-group');
    return head + gr.items.map(([id, t]) => vaRow(`<td>${vfNumber(id)}. ${esc(t)}</td>`, 4, val(id), VF.criterion, plain ? null : vaCmBtn(gs.filter(r => (r.comments||{})[id]).length, `vaShowComments('b',${g},'${id}')`))).join('');
  }).join('');
  const gen = gs.filter(r => r.general).length;
  return `<table><caption class="sr-only">Grade ${g} set evaluation</caption>${vaHead(4, '<th scope="col">Validation Indicator</th>', !plain)}<tbody>${body}${vaRow(`<td><b>Grade ${g} set overall</b></td>`, 4, vaAll(VF_PART_B_IDS, val), VF.criterion, plain ? null : (gen ? vaCmBtn(gen, `vaShowComments('bg',${g})`) + ' <span class="dim">general</span>' : ''), 'va-total')}</tbody></table>`;
}
function vaPartCTable(plain){
  const fs = vaForms(), val = id => fs.map(f => ((f.partC||{}).ratings||{})[id]);
  const gen = fs.filter(f => (f.partC||{}).general).length;
  return `<table><caption class="sr-only">Simulation evaluation</caption>${vaHead(4, `<th scope="col">${esc(VF.partC.head)}</th>`, !plain)}<tbody>${VF.partC.items.map(([id, t]) => vaRow(`<td>${vfNumber(id)}. ${esc(t)}</td>`, 4, val(id), VF.criterion, plain ? null : vaCmBtn(fs.filter(f => ((f.partC||{}).comments||{})[id]).length, `vaShowComments('c','${id}')`))).join('')}${vaRow('<td><b>Part C overall</b></td>', 4, vaAll(VF.partC.items, ([id]) => val(id)), VF.criterion, plain ? null : (gen ? vaCmBtn(gen, `vaShowComments('cg')`) + ' <span class="dim">general</span>' : ''), 'va-total')}</tbody></table>`;
}
function vaAccTable(plain){
  const A = VF.acceptability, as = vaAccepts().map(f => f.acceptability), val = id => as.map(a => (a.ratings||{})[id]);
  const ov = as.filter(a => a.overall).length;
  return `<table><caption class="sr-only">Acceptability</caption>${vaHead(5, '<th scope="col">Indicator</th>', !plain)}<tbody>${A.items.map(([id, n, t]) => vaRow(`<td><b>${esc(n)}.</b> ${esc(t)}</td>`, 5, val(id), A.scale, plain ? null : vaCmBtn(as.filter(a => (a.comments||{})[id]).length, `vaShowComments('e','${id}')`))).join('')}${vaRow('<td><b>Overall acceptability</b></td>', 5, vaAll(A.items, ([id]) => val(id)), A.scale, plain ? null : (ov ? vaCmBtn(ov, `vaShowComments('eg')`) + ' <span class="dim">overall</span>' : ''), 'va-total')}</tbody></table>`;
}
function vaRecHTML(){
  const fs = vaForms().filter(f => f.recommendation), n = fs.length;
  if (!n) return emptyHTML('No recommendations yet.', 'award');
  return `<ul class="va-recs">${VF.recommendations.map(t => { const c = fs.filter(f => f.recommendation === t).length; return `<li><span>${esc(t)}</span><b>${c}</b><span class="dim">${Math.round(c/n*100)}%</span></li>`; }).join('')}</ul>`;
}
function vaChecksHTML(){
  const gs = vGradesCache.filter(r => r.check && vaInScope(r.validatorId));
  if (!gs.length) return emptyHTML('No learner-view checks yet.', 'ui-checks');
  return `<ul class="va-recs">${VF.checks.map(([k, t]) => { const yes = gs.filter(r => r.check[k] === true).length; return `<li><span>The set ${esc(t)}</span><b>${yes}</b><span class="dim">of ${gs.length} checks</span></li>`; }).join('')}</ul>${gs.some(r => VF.checks.some(([k]) => r.check[k] === false)) ? `<button class="btn secondary sm" onclick="vaShowComments('chk')">${ico('exclamation-triangle')}See checks answered No</button>` : ''}`;
}
function renderValidation(){
  if (!document.getElementById('va-grade-a')) return;
  const scope = VA_SCOPE();
  const allA = VF_GRADES.reduce((a, g) => a.concat(...VF.items[g].map((_, i) => vaItems(g, i).map(r => r.rating))), []);
  const allB = VF_GRADES.reduce((a, g) => a.concat(...VF_PART_B_IDS.map(id => vaGrades(g).map(r => (r.ratings||{})[id]))), []);
  const allC = vaAll(VF.partC.items, ([id]) => vaForms().map(f => ((f.partC||{}).ratings||{})[id]));
  const allE = vaAll(VF.acceptability.items, ([id]) => vaAccepts().map(f => (f.acceptability.ratings||{})[id]));
  const st = (label, icon, vals, top, scale) => { const q = vfFreq(vals, top); return statHTML({ label, icon, value: q.wm == null ? '–' : `${q.wm.toFixed(2)}<small> / ${top}</small>`, sub: q.wm == null ? 'No ratings yet' : esc(vfInterp(q.wm, scale)) }); };
  const submitted = vFormsCache.filter(f => f.submitted).length;
  document.getElementById('va-stats').innerHTML =
      statHTML({ label:'Validators', icon:'people', value: validatorsCache.length, sub: `${submitted} submitted the signed form` })
    + st('Part A · item relevance', 'list-check', allA, 4, VF.partA.scale)
    + st('Part B · item sets', 'clipboard-check', allB, 4, VF.criterion)
    + st('Part C · simulation', 'window-sidebar', allC, 4, VF.criterion)
    + st('Acceptability', 'hand-thumbs-up', allE, 5, VF.acceptability.scale);
  const vs = validatorsCache.slice().sort((a,b) => toMillis(b.lastActiveAt) - toMillis(a.lastActiveAt));
  document.getElementById('va-validators').innerHTML = vs.length ? vs.map(v => {
    const p = vaProgress(v.id), f = p.form;
    const status = p.submitted ? `<span class="badge good">${ico('check-circle-fill')}Submitted</span>` : (p.items || p.partB || p.checks || p.partC) ? `<span class="badge warn">${ico('hourglass-split')}In progress</span>` : `<span class="badge none">${ico('circle')}Not started</span>`;
    return `<tr class="clickable" onclick="rowClick(event,this)">
      <td><button class="name-btn" data-primary data-vid="${esc(v.id)}" onclick="openValidator(this.dataset.vid)"><span class="avatar" style="width:28px;height:28px;font-size:.68rem" aria-hidden="true">${esc(initials(v.name))}</span><span class="nm">${esc(v.name)}</span></button>${f.position || f.school ? `<div class="dim">${esc([f.position, f.school].filter(Boolean).join(' · '))}</div>` : ''}</td>
      <td>${barHTML(p.items / VF_ITEM_TOTAL * 100, { tip:`${p.items} of ${VF_ITEM_TOTAL} items rated` })}<div class="dim">${p.items} / ${VF_ITEM_TOTAL}</div></td>
      <td class="num">${p.partB} / 6</td><td class="num">${p.checks} / 6</td><td class="num">${p.partC} / ${VF.partC.items.length}</td>
      <td>${f.recommendation ? esc(f.recommendation) : '<span class="dim">–</span>'}</td>
      <td>${p.accept ? `<span class="badge good">${ico('check-circle-fill')}Submitted</span>` : '<span class="dim">–</span>'}</td><td>${status}</td></tr>`;
  }).join('') : `<tr><td colspan="8">${emptyHTML('No validators yet. Validators log in from the login page → Validator, with just their name.', 'patch-check')}</td></tr>`;
  document.getElementById('va-a').innerHTML = vaPartATable(Number(document.getElementById('va-grade-a').value));
  document.getElementById('va-b').innerHTML = vaPartBTable(Number(document.getElementById('va-grade-b').value));
  document.getElementById('va-c').innerHTML = vaPartCTable();
  document.getElementById('va-rec').innerHTML = vaRecHTML();
  document.getElementById('va-checks').innerHTML = vaChecksHTML();
  document.getElementById('va-acc').innerHTML = vaAccTable();
  document.getElementById('va-how').textContent = `Weighted mean = Σ(f × rating) ÷ N, from ${scope === 'all' ? 'all responses, including forms still in progress' : 'submitted forms only'}. Means are read on equal intervals of each scale: ${vfIntervals(VF.criterion)} (Part A uses the same bands with its own labels). Acceptability: ${vfIntervals(VF.acceptability.scale)}.`;
  document.getElementById('va-legacy').innerHTML = valReviewsCache.length ? `<div class="notice">${ico('info-circle')}<span>${valReviewsCache.length} earlier 0–5 star rating${valReviewsCache.length === 1 ? '' : 's'}, from before the formal form, are kept separately and not counted above.</span><button class="btn secondary sm" onclick="exportValidationLegacy()">${ico('filetype-csv')}CSV</button></div>` : '';
}
let vaOpen = null;
function vaFeed(list){
  if (!list.length) return emptyHTML('No comments.', 'chat-left-text');
  return list.map(c => `<article class="va-item"><div class="va-item-h"><b>${esc(c.who)}</b>${c.rating != null ? `<span>Rating <b>${c.rating}</b></span>` : ''}</div>${c.flag ? `<div class="va-flag">${esc(c.flag)}</div>` : ''}${c.text ? `<div class="va-item-c">${esc(c.text)}</div>` : ''}</article>`).join('');
}
function vaShowComments(kind, a, b){
  vaOpen = { render(){
    let title = '', sub = '', list = [];
    if (kind === 'a'){ title = `Grade ${a} · Item ${b+1}`; sub = VF.items[a][b];
      list = vaItems(a, b).filter(r => r.comment || r.noConcept).map(r => ({ who:vaName(r.validatorId), rating:r.rating, text:r.comment, flag:r.noConcept ? 'Noted: learners can choose the correct answer without applying the concept.' : '' })); }
    if (kind === 'b'){ const t = VF.partB.groups.reduce((x, g) => x.concat(g.items), []).find(x => x[0] === b); title = `Grade ${a} · Part B indicator ${vfNumber(b)}`; sub = t[1];
      list = vaGrades(a).filter(r => (r.comments||{})[b]).map(r => ({ who:vaName(r.validatorId), rating:(r.ratings||{})[b], text:r.comments[b] })); }
    if (kind === 'bg'){ title = `Grade ${a} · Part B general comments`; list = vaGrades(a).filter(r => r.general).map(r => ({ who:vaName(r.validatorId), text:r.general })); }
    if (kind === 'c'){ const t = VF.partC.items.find(x => x[0] === a); title = `Part C indicator ${vfNumber(a)}`; sub = t[1];
      list = vaForms().filter(f => ((f.partC||{}).comments||{})[a]).map(f => ({ who:vaName(f.id), rating:f.partC.ratings[a], text:f.partC.comments[a] })); }
    if (kind === 'cg'){ title = 'Part C general comments'; list = vaForms().filter(f => (f.partC||{}).general).map(f => ({ who:vaName(f.id), text:f.partC.general })); }
    if (kind === 'e'){ const t = VF.acceptability.items.find(x => x[0] === a); title = `Acceptability · ${t[1]}`; sub = t[2];
      list = vaAccepts().filter(f => (f.acceptability.comments||{})[a]).map(f => ({ who:f.acceptability.code || 'Evaluator', rating:(f.acceptability.ratings||{})[a], text:f.acceptability.comments[a] })); }
    if (kind === 'eg'){ title = 'Acceptability · overall comments'; list = vaAccepts().filter(f => f.acceptability.overall).map(f => ({ who:f.acceptability.code || 'Evaluator', text:f.acceptability.overall })); }
    if (kind === 'chk'){ title = 'Learner-view checks answered No';
      list = vGradesCache.filter(r => r.check && vaInScope(r.validatorId) && VF.checks.some(([k]) => r.check[k] === false)).map(r => ({ who:`${vaName(r.validatorId)} · Grade ${r.grade}`, flag:'No: ' + VF.checks.filter(([k]) => r.check[k] === false).map(c => c[1]).join(', '), text:r.check.note })); }
    document.getElementById('vam-title').textContent = title;
    document.getElementById('vam-sub').textContent = sub;
    document.getElementById('vam-stats').innerHTML = '';
    document.getElementById('vam-actions').innerHTML = '';
    document.getElementById('vam-body').innerHTML = vaFeed(list);
  }};
  vaOpen.render(); openModal('va-modal');
}
function vaFormCopy(id){
  const v = validatorsCache.find(x => x.id === id);
  return vfFormHTML({ name:v ? v.name : id, form:vaFormOf(id),
    itemOf:(g, i) => vItemsCache.find(r => r.validatorId === id && r.grade === g && r.idx === i),
    gradeOf:g => vGradesCache.find(r => r.validatorId === id && r.grade === g) });
}
function openValidator(id){
  vfEnsureStyles();
  vaOpen = { render(){
    const v = validatorsCache.find(x => x.id === id); if (!v) return closeModal('va-modal');
    const p = vaProgress(id), f = p.form;
    document.getElementById('vam-title').textContent = v.name;
    document.getElementById('vam-sub').textContent = [f.position, f.school, f.submittedAt ? `submitted ${fmtWhen(f.submittedAt, true)}` : `last active ${fmtAgo(v.lastActiveAt)}`].filter(Boolean).join(' · ');
    document.getElementById('vam-stats').innerHTML =
        statHTML({ label:'Part A items', icon:'list-check', value:`${p.items}<small> / ${VF_ITEM_TOTAL}</small>` })
      + statHTML({ label:'Part B sets', icon:'clipboard-check', value:`${p.partB}<small> / 6</small>` })
      + statHTML({ label:'Learner checks', icon:'ui-checks', value:`${p.checks}<small> / 6</small>` })
      + statHTML({ label:'Part C', icon:'window-sidebar', value:`${p.partC}<small> / ${VF.partC.items.length}</small>` });
    document.getElementById('vam-actions').innerHTML = `<button class="btn secondary" data-vid="${esc(id)}" onclick="printValidator(this.dataset.vid)">${ico('printer')}Print</button>${f.submitted ? `<button class="btn secondary" data-vid="${esc(id)}" onclick="reopenValidator(this.dataset.vid)">${ico('unlock')}Reopen</button>` : ''}<button class="btn danger" data-vid="${esc(id)}" onclick="removeValidator(this.dataset.vid)">${ico('trash')}Remove</button>`;
    document.getElementById('vam-body').innerHTML = vaFormCopy(id) + (f.acceptability ? '<div style="height:12px"></div>' + vfAcceptHTML(f.acceptability) : '');
  }};
  vaOpen.render(); openModal('va-modal');
}
function printValidator(id){
  const f = vaFormOf(id);
  vfPrint(`Expert Validation Form - ${vaName(id)}`, vaFormCopy(id) + (f.acceptability ? '<div class="vfp pg-break" style="page-break-before:always"></div>' + vfAcceptHTML(f.acceptability) : ''));
}
async function reopenValidator(id){
  if (!confirm(`Reopen ${vaName(id)}'s form? They can change their answers again and will have to sign it again.`)) return;
  try{
    await db.collection('validationForms').doc(id).update({ submitted:false, signature:'', reopenedAt:new Date().toISOString() });
    toast('Form reopened.', 'ok');
  }catch(e){ toast('Could not reopen: ' + e.message, 'err'); }
}
async function removeValidator(id){
  const name = vaName(id);
  if (!confirm(`Remove validator "${name}" and their whole form? This cannot be undone.`)) return;
  try{
    const batch = db.batch();
    vItemsCache.filter(r => r.validatorId === id).forEach(r => batch.delete(db.collection('validationItems').doc(r.id)));
    vGradesCache.filter(r => r.validatorId === id).forEach(r => batch.delete(db.collection('validationGrades').doc(r.id)));
    valReviewsCache.filter(r => r.validatorId === id).forEach(r => batch.delete(db.collection('validationReviews').doc(r.id)));
    batch.delete(db.collection('validationForms').doc(id));
    batch.delete(db.collection('validators').doc(id));
    await batch.commit();
    closeModal('va-modal'); toast(`Removed ${name}.`, 'ok');
  }catch(e){ toast('Could not remove: ' + e.message, 'err'); }
}
function printValidationSummary(){
  const scope = VA_SCOPE() === 'all' ? 'all responses, including forms still in progress' : 'submitted forms only';
  const n = VA_SCOPE() === 'all' ? validatorsCache.length : vFormsCache.filter(f => f.submitted).length;
  vfPrint('Expert validation summary', `<div class="vfp"><h1>${esc(VF.formTitle)}<br>SUMMARY OF RATINGS</h1><p><b>Title of the Study:</b> ${esc(VF.study)}</p><p>Validators included: <b>${n}</b> (${scope}). Weighted mean = Σ(f × rating) ÷ N.</p>
    <h2>${esc(VF.partA.title)}</h2>${VF_GRADES.map(g => `<h3>${esc(vfPartALabel(g))}</h3>${vaPartATable(g, true)}`).join('')}
    <h2 style="page-break-before:always">${esc(VF.partB.title)}</h2>${VF_GRADES.map(g => `<h3>Grade ${g}</h3>${vaPartBTable(g, true)}`).join('')}
    <h2 style="page-break-before:always">${esc(VF.partC.title)}</h2>${vaPartCTable(true)}
    <h2>Overall Recommendation</h2><table><tr><th>Recommendation</th><th>f</th></tr>${VF.recommendations.map(t => `<tr><td>${esc(t)}</td><td>${vaForms().filter(f => f.recommendation === t).length}</td></tr>`).join('')}</table>
    <h2>${esc(VF.acceptability.title)}</h2>${vaAccTable(true)}
    <p style="font-size:11.5px">Interpretation (equal intervals): ${esc(vfIntervals(VF.criterion))}. Part A uses the same bands: ${esc(vfIntervals(VF.partA.scale))}. Acceptability: ${esc(vfIntervals(VF.acceptability.scale))}.</p></div>`,
    '.vfp .sr-only{display:none}.vfp .num{text-align:center}.vfp .va-flag{font-size:11px}');
}
function exportValidation(){
  const rows = [['Part','Grade','Item / Indicator','Text','Validator','Position','School','Rating','Comment','Note']];
  const who = id => { const f = vaFormOf(id); return [vaName(id), f.position || '', f.school || '']; };
  VF_GRADES.forEach(g => VF.items[g].forEach((foc, i) => vaItems(g, i).forEach(r => rows.push(['A', g, i+1, foc, ...who(r.validatorId), r.rating, r.comment || '', [r.noConcept ? 'Correct answer possible without the concept' : '', r.completed === false ? 'Simulation not executed to the end' : ''].filter(Boolean).join('; ')]))));
  VF_GRADES.forEach(g => vaGrades(g).forEach(r => {
    VF.partB.groups.forEach(gr => gr.items.forEach(([id, t]) => { if ((r.ratings||{})[id]) rows.push(['B', g, vfNumber(id), t, ...who(r.validatorId), r.ratings[id], (r.comments||{})[id] || '', '']); }));
    if (r.general) rows.push(['B general', g, '', 'General Comments and Suggestions', ...who(r.validatorId), '', r.general, '']);
    if (r.check) rows.push(['Learner check', g, '', VF.checks.map(([k, t]) => `${t}: ${r.check[k] ? 'Yes' : 'No'}`).join('; '), ...who(r.validatorId), '', r.check.note || '', `Score shown ${r.check.solved}/${r.check.total}`]);
  }));
  vaForms().forEach(f => {
    VF.partC.items.forEach(([id, t]) => { if (((f.partC||{}).ratings||{})[id]) rows.push(['C', '', vfNumber(id), t, ...who(f.id), f.partC.ratings[id], (f.partC.comments||{})[id] || '', '']); });
    if ((f.partC||{}).general) rows.push(['C general', '', '', 'General Comments and Suggestions', ...who(f.id), '', f.partC.general, '']);
    if (f.recommendation) rows.push(['Recommendation', '', '', f.recommendation, ...who(f.id), '', '', f.date || '']);
  });
  vaAccepts().forEach(f => { const a = f.acceptability; VF.acceptability.items.forEach(([id, n]) => { if ((a.ratings||{})[id]) rows.push(['Acceptability', '', n, '', a.code || '', '', a.subject || '', a.ratings[id], (a.comments||{})[id] || '', '']); }); if (a.overall) rows.push(['Acceptability overall', '', '', '', a.code || '', '', a.subject || '', '', a.overall, '']); });
  rows.push([]); rows.push(['Summary','Grade','Item / Indicator','Text','f4 (or f5 first)','','','N','WM','Interpretation']);
  const sum = (part, g, n, t, vals, top, scale) => { const q = vfFreq(vals, top); const ks = []; for (let k = top; k >= 1; k--) ks.push(q.f[k]); rows.push([part, g, n, t, ks.join(' / '), '', '', q.n, q.wm == null ? '' : q.wm.toFixed(2), vfInterp(q.wm, scale)]); };
  VF_GRADES.forEach(g => VF.items[g].forEach((foc, i) => sum('A', g, i+1, foc, vaItems(g, i).map(r => r.rating), 4, VF.partA.scale)));
  VF_GRADES.forEach(g => VF.partB.groups.forEach(gr => gr.items.forEach(([id, t]) => sum('B', g, vfNumber(id), t, vaGrades(g).map(r => (r.ratings||{})[id]), 4, VF.criterion))));
  VF.partC.items.forEach(([id, t]) => sum('C', '', vfNumber(id), t, vaForms().map(f => ((f.partC||{}).ratings||{})[id]), 4, VF.criterion));
  VF.acceptability.items.forEach(([id, n]) => sum('Acceptability', '', n, '', vaAccepts().map(f => (f.acceptability.ratings||{})[id]), 5, VF.acceptability.scale));
  downloadCSV('expert-validation.csv', rows);
}
function exportValidationLegacy(){
  const rows = [['Validator','Grade','Scenario #','Rating (0-5)','Comment','Updated']];
  valReviewsCache.forEach(r => rows.push([r.validatorName || r.validatorId, r.grade, r.idx+1, r.rating, r.comment || '', r.updatedAt || '']));
  downloadCSV('earlier-star-ratings.csv', rows);
}

// ═══ ITEM ANALYSIS ═══
function sectionOptions(g){ return '<option value="">All sections</option>' + sectionsCache.filter(s => s.grade === g).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join(''); }
function sessionOptions(g, sec){ return '<option value="">All sessions</option>' + sessionsCache.filter(s => s.grade === g && (!sec || s.sectionId === sec)).map(s => `<option value="${s.id}">${esc(sessionOptionLabel(s))}</option>`).join(''); }
function onIaGradeChange(){ keepSelect('ia-section', sectionOptions(Number(document.getElementById('ia-grade').value))); onIaSectionChange(); }
function onIaSectionChange(){ keepSelect('ia-session', sessionOptions(Number(document.getElementById('ia-grade').value), document.getElementById('ia-section').value)); renderItems(); }
let lastIA = null;
function iaFilters(prefix){
  return { grade: Number(document.getElementById(prefix + '-grade').value), sectionId: document.getElementById(prefix + '-section').value,
    sessionId: document.getElementById(prefix + '-session').value, mode: document.getElementById(prefix + '-mode').value };
}
function renderItems(){
  const f = iaFilters('ia');
  lastIA = computeItemAnalysis(f.grade, scopeAttempts(attemptsCache, f), resultsCache);
  document.getElementById('ia-out').innerHTML = itemAnalysisHTML(lastIA);
}
function exportItems(){
  if (!lastIA) return;
  const sec = sectionName(document.getElementById('ia-section').value) || 'all-sections';
  downloadCSV(`item-analysis-grade-${lastIA.grade}-${slug(sec)}.csv`, itemAnalysisCSV(lastIA));
}

// ═══ PDF REPORTS ═══
function populateReportPickers(){
  const cg = Number(document.getElementById('rep-class-grade').value);
  keepSelect('rep-class-section', sectionOptions(cg));
  const ig = Number(document.getElementById('rep-ia-grade').value);
  keepSelect('rep-ia-section', sectionOptions(ig));
  keepSelect('rep-ia-session', sessionOptions(ig, document.getElementById('rep-ia-section').value));
  keepSelect('rep-session', sessionsCache.length ? sessionsCache.map(s => `<option value="${s.id}">${esc(sessionOptionLabel(s))}</option>`).join('') : '<option value="">No sessions yet</option>');
  const sg = Number(document.getElementById('rep-student-grade').value);
  const studs = studentsCache.filter(s => s.grade === sg).sort((a,b) => (a.name||'').localeCompare(b.name||''));
  keepSelect('rep-student', studs.length ? studs.map(s => `<option value="${esc(s.id)}">${esc(s.name)} (${esc(s.id)}) · ${esc(sectionName(s.sectionId))}</option>`).join('') : '<option value="">No students in this grade</option>');
}
function reportMeta(filename){ return { author: ADMIN_SESSION.name, filename }; }
function pdfSchool(btn){
  generatePdf(btn, () => buildSchoolReport({
    grades: GRADE_LIST.map(gradeRollup),
    sections: sectionsCache.map(s => ({ ...sectionRollup(s, studentsCache, attemptsCache), teacherNames: teachersForSection(s.id).map(t => t.name).join(', ') })),
    teachers: teachersCache.map(t => { const r = teacherRollup(t); return { name:t.name, username:t.username, sections: r.secs.map(s => `G${s.grade} ${s.name}`).join(', '), students:r.students, sessions:r.sess.length, mps:r.mps }; }),
    students: studentsCache, attempts: attemptsCache, sessions: sessionsCache
  }, reportMeta(`school-summary-${new Date().toISOString().slice(0,10)}.pdf`)));
}
function pdfClass(btn, grade, sectionId){
  grade = grade || Number(document.getElementById('rep-class-grade').value);
  sectionId = sectionId != null ? sectionId : document.getElementById('rep-class-section').value;
  const secs = sectionsCache.filter(s => s.grade === grade && (!sectionId || s.id === sectionId));
  if (!secs.length) return toast(`Grade ${grade} has no sections yet.`, 'err');
  const ids = new Set(secs.map(s => s.id));
  const teachers = [...new Set(secs.flatMap(s => teachersForSection(s.id).map(t => t.name)))].join(', ');
  generatePdf(btn, () => buildClassReport({ grade, sectionLabel: sectionId ? sectionName(sectionId) : secs.map(s => s.name).join(', '),
    sections: secs.map(s => sectionRollup(s, studentsCache, attemptsCache)), roster: studentsCache.filter(s => ids.has(s.sectionId)),
    attempts: attemptsCache.filter(a => ids.has(a.sectionId)), results: resultsCache, sectionName },
    { ...reportMeta(`class-report-grade-${grade}-${slug(sectionId ? sectionName(sectionId) : 'all-sections')}.pdf`), teacher: teachers || 'Not assigned' }));
}
function pdfItemsWith(f, btn){
  const ia = computeItemAnalysis(f.grade, scopeAttempts(attemptsCache, f), resultsCache);
  const sec = sectionName(f.sectionId), sess = sessionsCache.find(s => s.id === f.sessionId);
  generatePdf(btn, () => buildItemAnalysisReport(ia, { ...reportMeta(`item-analysis-grade-${f.grade}-${slug(sec || 'all-sections')}${sess ? '-' + slug(sess.label) : ''}.pdf`),
    section: sec, session: sess ? sessionOptionLabel(sess) : '', mode: f.mode }));
}
function pdfItems(btn){ pdfItemsWith(iaFilters('ia'), btn); }
function pdfItemsFromReports(btn){ pdfItemsWith(iaFilters('rep-ia'), btn); }
function pdfSession(id, btn){
  const s = sessionsCache.find(x => x.id === id); if (!s) return toast('Choose a session first.', 'err');
  generatePdf(btn, () => buildSessionReport({ session: s, sectionName: sectionName(s.sectionId) || s.sectionName, teacherName: teacherName(s.teacherId),
    attempts: attemptsCache.filter(a => a.sessionId === s.id), roster: studentsCache.filter(x => x.sectionId === s.sectionId), results: resultsCache,
    studentName: sid => (studentById(sid) || {}).name || sid }, reportMeta(`session-${slug(s.label)}-${slug(sectionName(s.sectionId))}.pdf`)));
}
function pdfStudent(id, btn){
  const s = studentById(id); if (!s) return toast('Choose a student first.', 'err');
  generatePdf(btn, () => buildStudentReport({ student: s, sectionName: sectionName(s.sectionId) || s.sectionName, runs: attemptsCache.filter(a => a.studentId === s.id),
    results: resultsCache, sessionLabel }, reportMeta(`student-${slug(s.name)}-${slug(s.id)}.pdf`)));
}

// ═══ LIVE DATA ═══
function watchAll(){
  const fail = (what, el) => err => {
    console.warn(what, err);
    if (el){ const n = document.getElementById(el); n.style.display = 'flex'; n.innerHTML = `${ico('exclamation-triangle')}<span>${esc(`Could not load ${what}: ${err.message}`)}</span>`; }
    else toast(`Could not load ${what}: ${err.message}`, 'err');
  };
  db.collection('sections').orderBy('grade').orderBy('name').onSnapshot(snap => {
    sectionsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    populateStuSections(); onIaGradeChange(); renderAll();
  }, fail('sections'));
  db.collection('teachers').orderBy('name').onSnapshot(snap => {
    teachersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    populateTeacherFilter(); renderAll();
  }, fail('teachers'));
  db.collection('students').onSnapshot(snap => {
    studentsCache = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderAll();
  }, fail('students'));
  db.collection('attempts').onSnapshot(snap => {
    attemptsCache = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderAll();
  }, fail('attempts'));
  db.collection('scenarioResults').onSnapshot(snap => {
    resultsCache = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderAll();
  }, fail('per-item answers (scenarioResults). Item analysis needs Super Admin read access to this collection in firestore.rules', 'ia-notice'));
  db.collection('validators').onSnapshot(snap => {
    validatorsCache = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderAll();
  }, fail('validators (update firestore.rules)', 'va-notice'));
  const vWatch = (col, set) => db.collection(col).onSnapshot(snap => { set(snap.docs.map(d => ({ id: d.id, ...d.data() }))); renderAll(); }, fail(`${col} (update firestore.rules)`, 'va-notice'));
  vWatch('validationItems', v => { vItemsCache = v; });
  vWatch('validationGrades', v => { vGradesCache = v; });
  vWatch('validationForms', v => { vFormsCache = v; });
  vWatch('validationReviews', v => { valReviewsCache = v; });
  // Older rules may only let the admin list *active* sessions; fall back to that.
  const setSessions = snap => {
    sessionsCache = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    onIaSectionChange(); renderAll();
  };
  db.collection('sessions').onSnapshot(setSessions, err => {
    const n = document.getElementById('sess-notice'); n.style.display = 'flex';
    n.innerHTML = `${ico('info-circle')}<span>${esc('Showing active sessions only: the security rules do not let the Super Admin list closed sessions (' + err.message + ').')}</span>`;
    db.collection('sessions').where('status','==','active').onSnapshot(setSessions, fail('sessions'));
  });
}

// ═══ ACCOUNTS ═══
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

const TEACHER_LOGIN_URL = new URL('index.html?role=staff', location.href).href;   // the shared Teacher / Admin login
function showCredModal(username, password, title, note){
  document.getElementById('cred-login-url').textContent = TEACHER_LOGIN_URL;
  document.getElementById('cred-modal-title').textContent = title;
  document.getElementById('cred-modal-note').textContent = note;
  document.getElementById('cred-username').textContent = username;
  document.getElementById('cred-password').textContent = password;
  openModal('cred-modal');
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
    if (assignTeacherId === teacherId) closeModal('assign-modal');
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

// One message the admin can paste straight into Messenger, SMS or email.
function copyAllCreds(btn){
  const u = document.getElementById('cred-username').textContent;
  const p = document.getElementById('cred-password').textContent;
  const text = `Click to Survive — Teacher account\nLogin page: ${TEACHER_LOGIN_URL}\nUsername: ${u}\nPassword: ${p}`;
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.innerHTML;
    btn.textContent = 'Copied!'; btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = original; btn.classList.remove('copied'); }, 1500);
  });
}
// A printable slip to hand to the teacher in person.
function printCreds(){
  const u = document.getElementById('cred-username').textContent;
  const p = document.getElementById('cred-password').textContent;
  const w = window.open('', '_blank', 'width=520,height=640');
  if (!w){ toast('Allow pop-ups to print the login slip.', 'err'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Teacher login slip</title>
    <style>body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;margin:40px;color:#0a1830}
    .slip{border:2px dashed #94a3b8;border-radius:14px;padding:28px;max-width:420px}
    .hd{display:flex;align-items:center;gap:12px;margin-bottom:18px}h1{font-size:20px;margin:0}
    .k{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#475569;margin-top:14px}
    .v{font:600 18px ui-monospace,Menlo,monospace;margin-top:4px;word-break:break-all}
    p{font-size:12px;color:#475569;margin-top:20px}</style></head><body>
    <div class="slip"><div class="hd"><img src="${new URL('icons/logo-mark.svg', location.href).href}" width="44" height="44" alt=""><h1>Click to Survive<br><span style="font-weight:500;font-size:14px">Teacher account</span></h1></div>
    <div class="k">Login page</div><div class="v" style="font-size:13px">${esc(TEACHER_LOGIN_URL)}</div>
    <div class="k">Username</div><div class="v">${esc(u)}</div>
    <div class="k">Password</div><div class="v">${esc(p)}</div>
    <p>Keep this slip private. Ask your school's Click to Survive admin if you lose it.</p></div>
    <script>window.onload=()=>{window.print()}<\/script></body></html>`);
  w.document.close();
}

// ═══ REMOVING ACCOUNTS ═══
// Removing a teacher deletes their profile, which is what the teacher login checks,
// so their username and password stop working at once. Their past sessions and their
// students' results stay, so school reports remain complete. (The underlying Firebase
// Auth login can only be deleted with the Admin SDK; without a profile it can't open
// the dashboard.)
async function removeTeacher(teacherId){
  const t = teachersCache.find(x => x.id === teacherId);
  if (!t) return;
  const live = sessionsCache.some(s => s.teacherId === teacherId && s.status === 'active');
  const warn = live ? '\n\nThis teacher has a session running right now. Students in it can finish, but the teacher will be signed out of the dashboard.' : '';
  if (!confirm(`Remove ${t.name} (${t.username})?\n\nTheir username and password will stop working immediately. Their past sessions and their students' results are kept.${warn}`)) return;
  try{
    await db.collection('teachers').doc(teacherId).delete();
    if (assignTeacherId === teacherId) closeModal('assign-modal');
    toast(`${t.name} was removed.`);
  }catch(e){
    toast(friendlyAuthError(e) || e.message, 'err');
  }
}

// Removing a student deletes their profile (so the Student ID can no longer log in)
// together with all their runs and answers, so they disappear from every report.
async function removeStudent(studentId){
  const s = studentById(studentId);
  if (!s) return;
  const runs = attemptsCache.filter(a => a.studentId === studentId);
  const answers = resultsCache.filter(r => r.studentId === studentId);
  const what = runs.length ? `\n\nThis also permanently deletes their ${runs.length} game run${runs.length===1?'':'s'} and all their answers.` : '';
  if (!confirm(`Remove ${s.name} (Student ID ${s.id}) from ${sectionName(s.sectionId) || s.sectionName || 'their section'}?${what}\n\nThis cannot be undone.`)) return;
  try{
    const refs = [];
    const hist = await db.collection('students').doc(studentId).collection('history').get().catch(() => null);
    if (hist) hist.docs.forEach(d => refs.push(d.ref));
    runs.forEach(a => refs.push(db.collection('attempts').doc(a.id)));
    answers.forEach(r => refs.push(db.collection('scenarioResults').doc(r.id)));
    // Firestore batches hold up to 500 writes; delete the records in chunks first and
    // the profile last, so a failure part-way never leaves records without an owner.
    for (let i = 0; i < refs.length; i += 450){
      const b = db.batch(); refs.slice(i, i + 450).forEach(r => b.delete(r)); await b.commit();
    }
    const b = db.batch();
    b.delete(db.collection('students').doc(studentId));
    if (s.sectionId && sectionById(s.sectionId)) b.update(db.collection('sections').doc(s.sectionId), { studentCount: firebase.firestore.FieldValue.increment(-1) });
    await b.commit();
    if (openStudentId === studentId) closeModal('student-modal');
    toast(`${s.name} was removed.`);
  }catch(e){
    console.error(e);
    toast(e.code === 'permission-denied'
      ? 'The database security rules do not allow the Super Admin to delete this. Update firestore.rules (see the setup notes) and try again.'
      : (e.message || 'Could not remove the student.'), 'err');
  }
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
  // Grouped Junior High (7–10) / Senior High (11–12); a teacher may hold sections in both.
  list.innerHTML = GRADE_LIST.map((g, i) => {
    const secs = byGrade[g]||[];
    const band = (!i || gradeBand(g) !== gradeBand(GRADE_LIST[i-1])) && GRADE_LIST.slice(i).some(x => gradeBand(x) === gradeBand(g) && (byGrade[x]||[]).length)
      ? `<div class="assign-band">${gradeBand(g)}</div>` : '';
    if (!secs.length) return band;
    return `${band}<fieldset style="border:0">
      <legend class="section-toggle-grade">Grade ${g}</legend>
      ${secs.map(s => `
        <label class="section-toggle-row">
          <input type="checkbox" value="${s.id}" ${assigned.has(s.id)?'checked':''}>
          ${esc(s.name)}
        </label>`).join('')}
    </fieldset>`;
  }).join('') || '<div class="empty">No sections exist yet — create one above first.</div>';
  openModal('assign-modal');
}

async function saveAssignments(){
  const checked = [...document.querySelectorAll('#assign-list input[type=checkbox]:checked')].map(c => c.value);
  const msg = document.getElementById('assign-msg');
  try{
    await db.collection('teachers').doc(assignTeacherId).update({ assignedSectionIds: checked });
    closeModal('assign-modal');
  }catch(e){
    msg.textContent = e.message; msg.className = 'msg err';
  }
}

(async () => {
  ADMIN_SESSION = await requireSuperAdminSession();
  if (!ADMIN_SESSION) return; // already redirected to the login page
  document.getElementById('admin-name').textContent = ADMIN_SESSION.name;
  document.getElementById('admin-user').textContent = '@' + ADMIN_SESSION.username;
  document.getElementById('rep-school').value = reportSchoolName();
  document.getElementById('avatar').textContent = initials(ADMIN_SESSION.name);
  document.getElementById('dash-loading').style.display = 'none';
  document.querySelector('.app').classList.add('ready');
  fillGradeSelects();
  goTab = initTabs();
  watchAll();
})();
