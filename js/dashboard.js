'use strict';
// Teacher dashboard: overview, session management, roster, item analysis and PDF
// reports for the sections the Super Admin assigned to this teacher. All data is
// read with the same sectionId-scoped queries as before (the only shape the
// security rules allow for a teacher), kept live with onSnapshot, and every page
// re-renders from these caches.
let TEACHER_SESSION = null;
let assignedSectionIds = [];       // live, from the teacher's own doc
let assignmentsLoaded = false;
let assignedSectionsInfo = [];     // [{id,grade,name,studentCount}], refreshed when assignments change
let currentGrade = null;
let unsubs = [];
let rosterCache = [], attemptsCache = [], resultsCache = [], sessionsCache = [];
let goTab = () => {};

function doTeacherLogout(){ doLogoutTeacher(); }
function gradeSections(){ return assignedSectionsInfo.filter(s => s.grade === currentGrade).sort((a,b) => a.name.localeCompare(b.name)); }
function currentGradeSectionIds(){ return gradeSections().map(s => s.id); }
function sectionName(id){ const s = assignedSectionsInfo.find(x => x.id === id); return s ? s.name : ''; }
function studentById(id){ return rosterCache.find(s => s.id === id); }
function sessionLabel(id){ const s = sessionsCache.find(x => x.id === id); return s ? (s.label || 'Session') : (id ? 'Session' : 'Practice (no session)'); }
function sessionOptionLabel(s){ return `${s.label || 'Session'} · ${sectionName(s.sectionId) || s.sectionName} · ${fmtWhen(s.createdAt)}`; }

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
  document.getElementById('no-assignment-msg').style.display = grades.length ? 'none' : 'flex';
  sel.style.display = grades.length ? '' : 'none';
  if (!grades.length){
    currentGrade = null; stopWatches();
    rosterCache = []; attemptsCache = []; resultsCache = []; sessionsCache = [];
    populatePickers(); renderAll();
    return;
  }
  const prev = currentGrade;
  // Group by Junior/Senior High only when the teacher has sections in both.
  const bands = [...new Set(grades.map(gradeBand))];
  sel.innerHTML = bands.length > 1
    ? bands.map(b => `<optgroup label="${b}">${grades.filter(g => gradeBand(g) === b).map(g => `<option value="${g}">Grade ${g}</option>`).join('')}</optgroup>`).join('')
    : grades.map(g => `<option value="${g}">Grade ${g}</option>`).join('');
  sel.value = grades.includes(prev) ? prev : grades[0];
  onGradeChange();
}

function stopWatches(){ unsubs.forEach(u => u()); unsubs = []; }

function onGradeChange(){
  currentGrade = Number(document.getElementById('my-grade').value);
  stopWatches();
  rosterCache = []; attemptsCache = []; resultsCache = []; sessionsCache = [];
  populatePickers();
  renderAll();
  const ids = currentGradeSectionIds();
  const err = e => toast('Could not load data: ' + e.message, 'err');
  unsubs.push(watchChunkedIn(db.collection('students'), 'sectionId', ids, docs => {
    rosterCache = docs.sort((a,b) => (a.name||'').localeCompare(b.name||'')); populateStudentPicker(); renderAll();
  }, err));
  unsubs.push(watchChunkedIn(db.collection('attempts'), 'sectionId', ids, docs => { attemptsCache = docs; renderAll(); }, err));
  unsubs.push(watchChunkedIn(db.collection('scenarioResults'), 'sectionId', ids, docs => { resultsCache = docs; renderAll(); }, err));
  unsubs.push(watchChunkedIn(db.collection('sessions'), 'sectionId', ids, docs => {
    sessionsCache = docs.sort((a,b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    populateSessionPicker(); populateReportSessions(); renderAll();
  }, err));
}

function keepSelect(id, html){ const el = document.getElementById(id); const v = el.value; el.innerHTML = html; if ([...el.options].some(o => o.value === v)) el.value = v; }
function populatePickers(){
  const rows = gradeSections();
  const opts = rows.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  keepSelect('sess-section', rows.length ? opts : '<option value="">No sections assigned</option>');
  ['sess-filter-section','stu-section','ia-section','rep-class-section','rep-ia-section'].forEach(id => keepSelect(id, '<option value="">All sections</option>' + opts));
  populateSessionPicker(); populateReportSessions(); populateStudentPicker();
}
function populateSessionPicker(){
  const sec = document.getElementById('ia-section').value;
  keepSelect('ia-session', '<option value="">All sessions</option>' + sessionsCache.filter(s => !sec || s.sectionId === sec).map(s => `<option value="${s.id}">${esc(sessionOptionLabel(s))}</option>`).join(''));
}
function populateReportSessions(){
  const sec = document.getElementById('rep-ia-section').value;
  keepSelect('rep-ia-session', '<option value="">All sessions</option>' + sessionsCache.filter(s => !sec || s.sectionId === sec).map(s => `<option value="${s.id}">${esc(sessionOptionLabel(s))}</option>`).join(''));
  keepSelect('rep-session', sessionsCache.length ? sessionsCache.map(s => `<option value="${s.id}">${esc(sessionOptionLabel(s))}</option>`).join('') : '<option value="">No sessions yet</option>');
}
function populateStudentPicker(){
  keepSelect('rep-student', rosterCache.length ? rosterCache.map(s => `<option value="${esc(s.id)}">${esc(s.name)} (${esc(s.id)}) · ${esc(sectionName(s.sectionId))}</option>`).join('') : '<option value="">No students yet</option>');
}
function onIaSectionChange(){ populateSessionPicker(); renderItems(); }

let renderQueued = false;
function renderAll(){
  if (renderQueued) return; renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; renderOverview(); renderSessions(); renderStudents(); renderItems(); refreshOpenModals(); });
}

// ═══ OVERVIEW ═══
function renderOverview(){
  const secs = gradeSections();
  document.getElementById('ov-title').textContent = currentGrade ? `Grade ${currentGrade} overview` : 'Class overview';
  const latest = latestByStudent(attemptsCache);
  const scores = [...latest.values()].map(a => a.percentScore || 0);
  const enrolled = rosterCache.length;
  const mps = mean(scores);
  const m = mastery(mps);
  const active = sessionsCache.filter(s => s.status === 'active');
  const part = enrolled ? latest.size / enrolled * 100 : null;
  document.getElementById('ov-stats').innerHTML =
      statHTML({ label:'Students', icon:'people', value:enrolled, sub:`in ${secs.length} section${secs.length===1?'':'s'}` })
    + statHTML({ label:'Participation', icon:'person-check', value:pct(part), sub:`${latest.size} of ${enrolled} have played` })
    + statHTML({ label:'Mean percentage score', icon:'bullseye', tone:m.tone === 'none' ? '' : m.tone, value:pct(mps), sub:masteryBadge(mps) })
    + statHTML({ label:'Completed runs', icon:'journal-check', value:attemptsCache.length, sub:`${sessionsCache.length} session${sessionsCache.length===1?'':'s'} so far` })
    + statHTML({ label:'Active sessions', icon:'broadcast', tone:active.length?'good':'', value:active.length, sub: active.length ? esc(active.map(s => sectionName(s.sectionId)).join(', ')) : 'None running' });

  document.getElementById('ov-sections').innerHTML = secs.length ? `<ul class="hbars" style="list-style:none">${secs.map(s => {
    const r = sectionRollup(s, rosterCache, attemptsCache);
    return `<li class="hbar"><span class="name"><b>${esc(s.name)}</b></span>
      <div class="bar-track" aria-hidden="true" data-tip="${esc(`${s.name}: mean ${pct(r.mps)} · ${mastery(r.mps).label}`)}"><div class="bar-fill ${mastery(r.mps).tone}" style="width:${r.mps||0}%"></div></div>
      <span class="meta"><b style="color:var(--tx)">${pct(r.mps)}</b> · ${r.played}/${r.enrolled} played<span class="sr-only">, ${esc(mastery(r.mps).label)}</span></span></li>`;
  }).join('')}</ul>` : emptyHTML('No sections for this grade.', 'grid');

  document.getElementById('ov-mastery').innerHTML = masteryStackHTML(scores, Math.max(0, enrolled - latest.size));

  const ia = computeItemAnalysis(currentGrade, attemptsCache, resultsCache);
  const least = ia.items.filter(i => i.n).sort((a,b) => a.p - b.p).slice(0, 4);
  document.getElementById('ov-least').innerHTML = least.length ? `<ul class="hbars" style="list-style:none">${least.map(i => `
    <li class="hbar two"><span class="name" data-tip="${esc(i.question)}"><b>Item ${i.no}</b> · ${esc(i.comp)}</span><span class="badge ${mastery(i.p).tone}">${ico(TONE_ICON[mastery(i.p).tone])}${pct(i.p)}<span class="sr-only">, ${esc(mastery(i.p).label)}</span></span></li>`).join('')}</ul>`
    : emptyHTML('No answers recorded yet.', 'clipboard');

  const support = rosterCache.map(s => ({ s, a: latest.get(s.id) })).filter(x => x.a && (x.a.percentScore||0) < 75)
    .sort((x,y) => x.a.percentScore - y.a.percentScore).slice(0, 5);
  const never = rosterCache.filter(s => !latest.has(s.id)).length;
  document.getElementById('ov-support').innerHTML = (support.length ? `<ul class="hbars" style="list-style:none">${support.map(x => `
    <li><button class="hbar two" data-sid="${esc(x.s.id)}" onclick="openStudent(this.dataset.sid)"><span class="name">${esc(x.s.name)} <span class="dim">${esc(sectionName(x.s.sectionId))}</span></span><span class="badge ${mastery(x.a.percentScore).tone}">${pct(x.a.percentScore)}</span></button></li>`).join('')}</ul>`
    : emptyHTML('Everyone who has played is at 75% or above.', 'emoji-smile'))
    + (never ? `<p class="dim" style="margin-top:.7rem">${ico('hourglass')} ${never} student${never===1?' has':'s have'} not played yet.</p>` : '');

  const recent = [...active, ...sessionsCache.filter(s => s.status !== 'active')].slice(0, 4);
  document.getElementById('ov-sessions').innerHTML = recent.length ? `<ul class="hbars" style="list-style:none">${recent.map(s => `
    <li><button class="hbar two" onclick="openSession('${s.id}')">
      <span class="name"><b>${esc(s.label||'Session')}</b> <span class="dim">${esc(sectionName(s.sectionId)||s.sectionName)} · ${fmtAgo(s.createdAt)}</span></span>
      ${s.status==='active' ? liveBadge('Live') : `<span class="dim">${new Set(sessionAttempts(s).map(a => a.studentId)).size} played</span>`}</button></li>`).join('')}</ul>`
    : `${emptyHTML('No sessions yet.', 'broadcast')}<button class="btn primary" style="width:100%" onclick="goTab('sessions')">${ico('play-fill')}Start your first session</button>`;
}

// ═══ SESSIONS ═══
function sessionAttempts(s){ return attemptsCache.filter(a => a.sessionId === s.id); }

function renderSessions(){
  const sec = document.getElementById('sess-filter-section').value;
  const st = document.getElementById('sess-filter-status').value;
  const live = sessionsCache.filter(s => s.status === 'active').length;
  const lc = document.getElementById('tab-live-count');
  lc.style.display = live ? '' : 'none'; lc.innerHTML = `${live}<span class="sr-only"> live</span>`;
  const body = document.getElementById('sessions-body');
  const rows = sessionsCache.filter(s => (!sec || s.sectionId === sec) && (!st || s.status === st));
  if (!rows.length){ body.innerHTML = `<tr><td colspan="7">${emptyHTML(sessionsCache.length ? 'No sessions match these filters.' : 'No sessions yet for this grade. Start one above.', 'broadcast')}</td></tr>`; return; }
  body.innerHTML = rows.map(s => {
    const at = sessionAttempts(s);
    const played = new Set(at.map(a => a.studentId)).size;
    const enrolled = rosterCache.filter(x => x.sectionId === s.sectionId).length;
    const avg = mean([...latestByStudent(at).values()].map(a => a.percentScore || 0));
    return `<tr class="clickable" onclick="rowClick(event,this)">
      <td><button class="name-btn" data-primary onclick="openSession('${s.id}')"><span class="nm">${esc(s.label || 'Session')}</span></button></td>
      <td>${esc(sectionName(s.sectionId) || s.sectionName)}</td>
      <td>${s.status === 'active' ? liveBadge() : closedBadge()}</td>
      <td class="nowrap">${fmtWhen(s.createdAt)}</td>
      <td class="num">${played}<span class="dim"> / ${enrolled}</span></td>
      <td>${at.length ? barHTML(avg) : '<span class="dim">No runs yet</span>'}</td>
      <td><div class="row" style="flex-wrap:nowrap;justify-content:flex-end">
        <button class="btn secondary sm" onclick="pdfSession('${s.id}', this)" aria-label="Download PDF for ${esc(s.label||'session')}">${ico('file-earmark-pdf')}PDF</button>
        ${s.status==='active' ? `<button class="btn danger sm" onclick="endSession('${s.id}')">${ico('stop-circle')}End</button>` : ''}
      </div></td></tr>`;
  }).join('');
}

async function startSession(){
  const sectionId = document.getElementById('sess-section').value;
  const label = document.getElementById('sess-label').value.trim() || 'Session';
  if (!sectionId){ setMsg('sess-msg', 'No section available for this grade.', 'err'); return; }
  const sec = assignedSectionsInfo.find(s => s.id === sectionId);
  const btn = document.getElementById('start-btn'); btn.disabled = true;
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
    setMsg('sess-msg', `Session started. Students in ${sec ? sec.name : 'that section'} can now join.` + (stillActive.length ? ' The previous active session was closed.' : ''), 'ok');
  }catch(e){
    setMsg('sess-msg', e.message, 'err');
  }finally{ btn.disabled = false; }
}

async function endSession(sessionId){
  if (!confirm('End this session? Students will no longer be able to join it.')) return;
  try{
    await db.collection('sessions').doc(sessionId).update({ status: 'closed', closedAt: firebase.firestore.FieldValue.serverTimestamp() });
    toast('Session ended.');
  }catch(e){ toast(e.message, 'err'); }
}

let openSessionId = null;
function openSession(id){ openSessionId = id; renderSessionModal(); openModal('session-modal'); }
function renderSessionModal(){
  const s = sessionsCache.find(x => x.id === openSessionId);
  if (!s) return;
  const at = sessionAttempts(s);
  const latest = latestByStudent(at);
  const roster = rosterCache.filter(x => x.sectionId === s.sectionId);
  const scores = [...latest.values()].map(a => a.percentScore || 0);
  const avg = mean(scores);
  document.getElementById('sm-title').textContent = s.label || 'Session';
  document.getElementById('sm-sub').textContent = `${sectionName(s.sectionId) || s.sectionName} · started ${fmtWhen(s.createdAt, true)}${s.closedAt ? ' · ended ' + fmtWhen(s.closedAt) : ''}`;
  document.getElementById('sm-stats').innerHTML =
      statHTML({ label:'Status', icon: s.status==='active' ? 'broadcast' : 'lock', tone: s.status==='active' ? 'good' : '', value: s.status==='active' ? 'Active' : 'Closed' })
    + statHTML({ label:'Played', icon:'person-check', value:`${latest.size}<small> / ${roster.length}</small>`, sub:`${at.length} run${at.length===1?'':'s'} total` })
    + statHTML({ label:'Mean score', icon:'bullseye', value:pct(avg), sub: avg==null ? '' : masteryBadge(avg) })
    + statHTML({ label:'Highest / lowest', icon:'arrow-down-up', value: scores.length ? pct(Math.max(...scores)) + ' / ' + pct(Math.min(...scores)) : '–' });
  document.getElementById('sm-end-wrap').innerHTML = s.status === 'active' ? `<button class="btn danger" onclick="endSession('${s.id}')">${ico('stop-circle')}End session</button>` : '';
  document.getElementById('sm-ia-btn').onclick = () => {
    closeModal('session-modal');
    document.getElementById('ia-section').value = s.sectionId; populateSessionPicker();
    document.getElementById('ia-session').value = s.id; renderItems(); goTab('items');
  };
  document.getElementById('sm-csv-btn').onclick = () => exportSession(s);
  document.getElementById('sm-pdf-btn').onclick = e => pdfSession(s.id, e.currentTarget);
  const played = [...latest.values()].sort((a,b) => (b.percentScore||0) - (a.percentScore||0));
  const notPlayed = roster.filter(r => !latest.has(r.id));
  document.getElementById('sm-body').innerHTML = (played.length || notPlayed.length) ? played.map((a, i) => {
    const st = studentById(a.studentId);
    const runs = at.filter(x => x.studentId === a.studentId).length;
    return `<tr class="clickable" onclick="rowClick(event,this)"><td class="dim">${i+1}</td><td>${studentNameBtn(a.studentId, st ? st.name : a.studentId, { avatar:false })}${runs>1?` <span class="dim">(${runs} runs, latest shown)</span>`:''}</td><td class="mono">${esc(a.studentId)}</td>
      <td>${barHTML(a.percentScore, { tip:`${a.solvedCount}/${a.totalScenarios} correct` })}</td><td>${masteryBadge(a.percentScore)}</td><td class="nowrap dim">${fmtWhen(a.finishedAt)}</td></tr>`;
  }).join('') + notPlayed.map(r => `<tr class="clickable" onclick="rowClick(event,this)"><td class="dim">–</td><td>${studentNameBtn(r.id, r.name, { avatar:false })}</td><td class="mono">${esc(r.id)}</td><td colspan="3"><span class="badge none">${ico('hourglass')}Not yet played</span></td></tr>`).join('')
    : `<tr><td colspan="6">${emptyHTML('No students in this section yet.', 'people')}</td></tr>`;
}
function exportSession(s){
  const at = sessionAttempts(s);
  const rows = [['Student ID','Name','Section','Score %','Correct','Items','Mastery','Started','Finished']];
  at.sort((a,b) => toMillis(a.finishedAt) - toMillis(b.finishedAt)).forEach(a => {
    const st = studentById(a.studentId);
    rows.push([a.studentId, st ? st.name : '', sectionName(a.sectionId), Math.round(a.percentScore), a.solvedCount, a.totalScenarios, mastery(a.percentScore).label, a.startedAt, a.finishedAt]);
  });
  rosterCache.filter(r => r.sectionId === s.sectionId && !at.some(a => a.studentId === r.id)).forEach(r => rows.push([r.id, r.name, sectionName(r.sectionId), '', '', '', 'Not yet played', '', '']));
  downloadCSV(`session-${slug(s.label)}-${slug(sectionName(s.sectionId))}.csv`, rows);
}

// ═══ STUDENTS ═══
function studentRows(){
  const q = document.getElementById('stu-search').value.trim().toLowerCase();
  const sec = document.getElementById('stu-section').value;
  const mf = document.getElementById('stu-mastery').value;
  const sort = document.getElementById('stu-sort').value;
  const latest = latestByStudent(attemptsCache);
  const runs = new Map(); attemptsCache.forEach(a => runs.set(a.studentId, (runs.get(a.studentId)||0) + 1));
  let rows = rosterCache.map(s => {
    const a = latest.get(s.id);
    return { s, a, p: a ? a.percentScore : null, runs: runs.get(s.id) || 0 };
  }).filter(r => (!sec || r.s.sectionId === sec)
    && (!q || (r.s.name||'').toLowerCase().includes(q) || r.s.id.toLowerCase().includes(q))
    && (!mf || mastery(r.p).tone === mf));
  const by = { name:(x,y) => (x.s.name||'').localeCompare(y.s.name||''), 'score-asc':(x,y) => (x.p ?? 999) - (y.p ?? 999), 'score-desc':(x,y) => (y.p ?? -1) - (x.p ?? -1), recent:(x,y) => toMillis(y.a && y.a.finishedAt) - toMillis(x.a && x.a.finishedAt) };
  return rows.sort(by[sort]);
}
function renderStudents(){
  document.getElementById('tab-stu-count').innerHTML = `<span class="sr-only">count </span>${rosterCache.length}`;
  const rows = studentRows();
  document.getElementById('stu-foot').textContent = `${rows.length} of ${rosterCache.length} student${rosterCache.length===1?'':'s'} shown`;
  const body = document.getElementById('students-body');
  if (!rows.length){ body.innerHTML = `<tr><td colspan="7">${emptyHTML(rosterCache.length ? 'No students match these filters.' : 'No students have registered in these sections yet.', 'people')}</td></tr>`; return; }
  body.innerHTML = rows.map(r => `<tr class="clickable" onclick="rowClick(event,this)">
    <td>${studentNameBtn(r.s.id, r.s.name)}</td>
    <td class="mono">${esc(r.s.id)}</td>
    <td>${esc(sectionName(r.s.sectionId) || r.s.sectionName)}</td>
    <td>${r.a ? barHTML(r.p, { tip:`${r.a.solvedCount}/${r.a.totalScenarios} correct` }) : '<span class="dim">—</span>'}</td>
    <td>${r.a ? masteryBadge(r.p) : `<span class="badge none">${ico('hourglass')}Not yet played</span>`}</td>
    <td class="num">${r.runs}</td>
    <td class="dim nowrap">${r.a ? fmtAgo(r.a.finishedAt) : '—'}</td></tr>`).join('');
}
function exportStudents(){
  const rows = [['Student ID','Name','Section','Latest score %','Correct','Items','Mastery','Runs','Last played']];
  studentRows().forEach(r => rows.push([r.s.id, r.s.name, sectionName(r.s.sectionId), r.a ? Math.round(r.p) : '', r.a ? r.a.solvedCount : '', r.a ? r.a.totalScenarios : '', r.a ? mastery(r.p).label : 'Not yet played', r.runs, r.a ? r.a.finishedAt : '']));
  downloadCSV(`grade-${currentGrade}-students.csv`, rows);
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
}
function refreshOpenModals(){
  if (document.getElementById('session-modal').style.display === 'flex') renderSessionModal();
  if (document.getElementById('student-modal').style.display === 'flex') renderStudentModal();
}

// ═══ ITEM ANALYSIS ═══
let lastIA = null;
function iaFilters(prefix){
  return { sectionId: document.getElementById(prefix + '-section').value, sessionId: document.getElementById(prefix + '-session').value, mode: document.getElementById(prefix + '-mode').value };
}
function renderItems(){
  const out = document.getElementById('ia-out');
  if (!currentGrade){ out.innerHTML = emptyHTML('No sections assigned yet.', 'grid'); return; }
  lastIA = computeItemAnalysis(currentGrade, scopeAttempts(attemptsCache, iaFilters('ia')), resultsCache);
  out.innerHTML = itemAnalysisHTML(lastIA);
}
function exportItems(){
  if (!lastIA) return;
  const sec = sectionName(document.getElementById('ia-section').value) || 'all-sections';
  downloadCSV(`item-analysis-grade-${currentGrade}-${slug(sec)}.csv`, itemAnalysisCSV(lastIA));
}

// ═══ PDF REPORTS ═══
function reportMeta(filename){ return { author: TEACHER_SESSION.name, teacher: TEACHER_SESSION.name, filename }; }
function pdfItemsWith(f, btn){
  if (!currentGrade) return toast('No sections assigned yet.', 'err');
  const ia = computeItemAnalysis(currentGrade, scopeAttempts(attemptsCache, f), resultsCache);
  const sec = sectionName(f.sectionId), sess = sessionsCache.find(s => s.id === f.sessionId);
  generatePdf(btn, () => buildItemAnalysisReport(ia, { ...reportMeta(`item-analysis-grade-${currentGrade}-${slug(sec || 'all-sections')}${sess ? '-' + slug(sess.label) : ''}.pdf`),
    section: sec, session: sess ? sessionOptionLabel(sess) : '', mode: f.mode }));
}
function pdfItems(btn){ pdfItemsWith(iaFilters('ia'), btn); }
function pdfItemsFromReports(btn){ pdfItemsWith(iaFilters('rep-ia'), btn); }
function pdfClass(btn){
  if (!currentGrade) return toast('No sections assigned yet.', 'err');
  const secId = document.getElementById('rep-class-section').value;
  const secs = gradeSections().filter(s => !secId || s.id === secId);
  const ids = new Set(secs.map(s => s.id));
  const roster = rosterCache.filter(s => ids.has(s.sectionId)), attempts = attemptsCache.filter(a => ids.has(a.sectionId));
  generatePdf(btn, () => buildClassReport({ grade: currentGrade, sectionLabel: secId ? sectionName(secId) : secs.map(s => s.name).join(', '),
    sections: secs.map(s => sectionRollup(s, rosterCache, attemptsCache)), roster, attempts, results: resultsCache, sectionName },
    reportMeta(`class-report-grade-${currentGrade}-${slug(secId ? sectionName(secId) : 'all-sections')}.pdf`)));
}
function pdfSession(id, btn){
  const s = sessionsCache.find(x => x.id === id); if (!s) return toast('Choose a session first.', 'err');
  generatePdf(btn, () => buildSessionReport({ session: s, sectionName: sectionName(s.sectionId) || s.sectionName, teacherName: TEACHER_SESSION.name,
    attempts: sessionAttempts(s), roster: rosterCache.filter(x => x.sectionId === s.sectionId), results: resultsCache,
    studentName: sid => (studentById(sid) || {}).name || sid }, reportMeta(`session-${slug(s.label)}-${slug(sectionName(s.sectionId))}.pdf`)));
}
function pdfStudent(id, btn){
  const s = studentById(id); if (!s) return toast('Choose a student first.', 'err');
  generatePdf(btn, () => buildStudentReport({ student: s, sectionName: sectionName(s.sectionId) || s.sectionName, runs: attemptsCache.filter(a => a.studentId === s.id),
    results: resultsCache, sessionLabel }, reportMeta(`student-${slug(s.name)}-${slug(s.id)}.pdf`)));
}

async function onAssignmentsChanged(newIds){
  assignedSectionIds = newIds || [];
  assignedSectionsInfo = await fetchAssignedSectionsInfo(assignedSectionIds);
  populateGradePicker();
}

(async () => {
  TEACHER_SESSION = await requireTeacherSession();
  if (!TEACHER_SESSION) return; // already redirected to teacher-login.html
  document.getElementById('teacher-name').textContent = TEACHER_SESSION.name;
  document.getElementById('teacher-user').textContent = '@' + TEACHER_SESSION.username;
  document.getElementById('avatar').textContent = initials(TEACHER_SESSION.name);
  document.getElementById('rep-school').value = reportSchoolName();
  document.getElementById('dash-loading').style.display = 'none';
  document.querySelector('.app').classList.add('ready');
  goTab = initTabs();

  // Live on the teacher's own doc: if the Super Admin changes their assignments while
  // this dashboard is open, the grade picker and all scoped data update automatically.
  // If the doc disappears entirely (e.g. the admin reset this teacher's credentials,
  // which retires the old profile doc), sign this session out gracefully instead of
  // leaving a dashboard full of stale data and silent permission errors on screen.
  db.collection('teachers').doc(TEACHER_SESSION.uid).onSnapshot(doc => {
    if (!doc.exists){
      sessionStorage.setItem('c2s_login_error', 'Your teacher account was removed or its login was reset by your Super Admin. Ask them for your current username and password.');
      doLogoutTeacher();
      return;
    }
    const ids = doc.data().assignedSectionIds || [];
    // Always handle the first snapshot, even an empty list, so a teacher with no
    // sections yet sees the "no sections assigned" notice instead of a blank page.
    if (!assignmentsLoaded || JSON.stringify(ids) !== JSON.stringify(assignedSectionIds)){ assignmentsLoaded = true; onAssignmentsChanged(ids); }
  });
})();
