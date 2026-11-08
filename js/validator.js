'use strict';
// Validator mode (game.html with a validator session, see index.html → Validator).
// A validator opens every grade level (7–12) with one name-only account, picks any
// scenario, plays it with the correct answer shown, carries out the decision in Take
// Control, then rates it 0–5 ★ with written feedback. Each rating is saved to
// validationReviews/{validatorId}_{grade}_{index} (one per scenario, updated if they play
// it again) and marks the scenario as played. Once every scenario is validated, the
// "Review my feedback" page unlocks; the Super Admin sees everything under Validation.
const VAL_GRADES = GRADE_LEVELS;
let VAL_REVIEWS = {};            // `${grade}-${index}` → saved review
let VAL_OPEN_GRADE = null;       // grade whose scenario list is showing
let VAL_RATE = { g:null, i:null, stars:-1, completed:false };

const valKey = (g, i) => `${g}-${i}`;
const valDocId = (g, i) => `${VALIDATOR.validatorId}_${g}_${i}`;
const valTotal = () => VAL_GRADES.reduce((n, g) => n + GRADES[g].scenarios.length, 0);
const valDone = () => Object.keys(VAL_REVIEWS).length;
const valEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function valTitle(scen, i){ return scen.phy_title || scen.title || scen.concept || `Scenario ${i+1}`; }
function valStars(n, cls){
  if(n == null) return '';
  return `<span class="val-stars ${cls||''}" aria-label="${n} of 5 stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(5-n)}</span></span>`;
}
const VAL_HAZ = { flood:'🌊 Flood', typhoon:'🌀 Typhoon' };

async function valLoad(){
  VAL_REVIEWS = {};
  try{
    const snap = await db.collection('validationReviews').where('validatorId', '==', VALIDATOR.validatorId).get();
    snap.forEach(d => { const r = d.data(); VAL_REVIEWS[valKey(r.grade, r.idx)] = r; });
  }catch(e){ console.warn('Could not load validation progress', e); }
}

// ── Hub ──
function valShowHub(grade){
  showScreen('s-val');
  document.getElementById('tb-profile').textContent = `✅ Validator · ${VALIDATOR.name}`;
  document.getElementById('val-hello').innerHTML = `Hi <b>${valEsc(VALIDATOR.name)}</b>! Pick a grade, then a scenario. The correct answer is shown — play it, carry out the decision, then rate it (0–5 ★) and leave feedback.`;
  valRenderProgress();
  document.getElementById('val-review').hidden = true;
  if(grade) valOpenGrade(grade); else valRenderGrades();
}
function valRenderProgress(){
  const done = valDone(), total = valTotal(), all = done >= total;
  document.getElementById('val-done').textContent = done;
  document.getElementById('val-total').textContent = total;
  document.getElementById('val-bar').style.width = (done/total*100) + '%';
  const rb = document.getElementById('val-review-btn');
  rb.disabled = !all; rb.textContent = all ? '📝 Review my feedback' : '🔒 Review my feedback';
  document.getElementById('val-lock').textContent = all ? 'All scenarios validated — thank you!' : `Unlocks after you validate every scenario (${total - done} to go).`;
}
function valGradeStats(g){
  const sc = GRADES[g].scenarios, rs = sc.map((_, i) => VAL_REVIEWS[valKey(g, i)]).filter(Boolean);
  const avg = rs.length ? rs.reduce((s, r) => s + r.rating, 0) / rs.length : null;
  return { n: sc.length, done: rs.length, avg };
}
function valRenderGrades(){
  VAL_OPEN_GRADE = null;
  document.getElementById('val-list').hidden = true;
  const el = document.getElementById('val-grades'); el.hidden = false;
  el.innerHTML = VAL_GRADES.map(g => {
    const gd = GRADES[g], s = valGradeStats(g), full = s.done >= s.n;
    return `<button class="val-grade ${full ? 'full' : ''}" style="--cc:${gd.color}" onclick="valOpenGrade(${g})">
      <div class="vg-band">${g <= 10 ? 'Junior High' : 'Senior High'}</div>
      <div class="vg-num">Grade ${g}</div>
      <div class="vg-topic">${valEsc(gd.topic)}</div>
      <div class="vg-meta"><span>${full ? '✓ ' : ''}${s.done}/${s.n} played</span>${s.avg != null ? `<span>${valStars(Math.round(s.avg))} ${s.avg.toFixed(1)}</span>` : ''}</div>
      <div class="vg-bar"><i style="width:${s.done/s.n*100}%"></i></div>
    </button>`;
  }).join('');
}
function valOpenGrade(g){
  VAL_OPEN_GRADE = g;
  const gd = GRADES[g];
  document.getElementById('val-grades').hidden = true;
  document.getElementById('val-review').hidden = true;
  const el = document.getElementById('val-list'); el.hidden = false;
  const s = valGradeStats(g);
  el.innerHTML = `<div class="vl-head" style="--cc:${gd.color}">
      <button class="vl-back" onclick="valRenderGrades()">← All grades</button>
      <div><div class="vl-title">Grade ${g} · ${valEsc(gd.topic)}</div><div class="vl-sub">${s.done} of ${s.n} scenarios played</div></div>
    </div>
    <div class="vl-items">${gd.scenarios.map((sc, i) => {
      const r = VAL_REVIEWS[valKey(g, i)];
      return `<div class="vl-item ${r ? 'played' : ''}">
        <div class="vl-n" style="--cc:${gd.color}">${i+1}</div>
        <div class="vl-body">
          <div class="vl-name">${valEsc(valTitle(sc, i))}</div>
          <div class="vl-meta">${VAL_HAZ[sc.hazard] || ''}${sc.concept ? ' · ' + valEsc(String(sc.concept).replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())) : ''}</div>
          <div class="vl-ans">🔑 Answer: <b>${'ABCDE'[sc.ci]}.</b> ${valEsc(sc.opts[sc.ci])}</div>
          ${r ? `<div class="vl-done">✓ Played · ${valStars(r.rating)}${r.completed === false ? ' · <span class="vl-warn">rated before finishing</span>' : ''}${r.comment ? ` · “${valEsc(r.comment.slice(0, 90))}${r.comment.length > 90 ? '…' : ''}”` : ''}</div>` : '<div class="vl-todo">Not yet played</div>'}
        </div>
        <button class="vl-play" onclick="valPlay(${g},${i})">${r ? '↻ Play again' : '▶ Play'}</button>
      </div>`;
    }).join('')}</div>`;
  document.getElementById('s-val').scrollTop = 0;
}

// ── Play one scenario ──
function valPlay(g, i){
  requestFullscreenIfMobile();
  VAL_RATE = { g, i, stars:-1, completed:false };
  transitionTo(()=>{ showScreen('s-game'); startGrade(g, null, 'Validation', { validator:true, idx:i }); },
    `Validating Grade ${g} · Scenario ${i+1}: ${valTitle(GRADES[g].scenarios[i], i)}`);
}
// Called by loadScenario: show the answer key on the choices.
function valMarkAnswer(scen){
  const ce = document.getElementById('choices');
  const btns = [...ce.querySelectorAll('.ch-btn')];
  btns.forEach((b, j) => {
    if(j === scen.ci){ b.classList.add('val-key'); b.insertAdjacentHTML('beforeend', '<span class="val-key-tag">✓ Correct answer</span>'); }
    else b.classList.add('val-dim');
  });
  ce.insertAdjacentHTML('afterbegin', `<div class="val-note">🔑 Answer key: <b>${'ABCDE'[scen.ci]}</b> — tap it to carry out the decision.</div>`);
  document.getElementById('val-rate-now').hidden = false;
}
// Take Control finished (completed) or the validator chose "Rate now" (not finished).
function valAfterPlay(completed){
  document.getElementById('val-rate-now').hidden = true;
  valOpenRating(GS.grade, GS.idx, completed || VAL_RATE.completed, false);
}
// From the review page: change a rating/comment without playing again.
function valEditReview(g, i){ const r = VAL_REVIEWS[valKey(g, i)]; valOpenRating(g, i, !!(r && r.completed), true); }
function valOpenRating(g, i, completed, fromHub){
  VAL_RATE = { g, i, stars:-1, completed:!!completed, fromHub:!!fromHub };
  const sc = GRADES[g].scenarios[i], prev = VAL_REVIEWS[valKey(g, i)];
  document.getElementById('vr-eyebrow').textContent = `Grade ${g} · Scenario ${i+1} of ${GRADES[g].scenarios.length}`;
  document.getElementById('vr-title').textContent = valTitle(sc, i);
  const st = document.getElementById('vr-status');
  st.className = 'vr-status ' + (VAL_RATE.completed ? 'ok' : 'warn');
  st.textContent = fromHub ? (VAL_RATE.completed ? '✎ Editing your saved feedback' : '✎ Editing — this scenario was rated before it was finished')
    : VAL_RATE.completed ? '✓ Scenario executed to the end' : '⚠ Rated before the scenario was finished — say what stopped you in the feedback';
  VAL_RATE.stars = prev ? prev.rating : -1;
  document.getElementById('vr-comment').value = prev ? (prev.comment || '') : '';
  document.getElementById('vr-msg').textContent = '';
  document.getElementById('vr-save').disabled = false;
  document.getElementById('vr-again').textContent = fromHub ? 'Cancel' : '↻ Play again';
  valDrawStars();
  document.getElementById('val-rate').hidden = false;
  if(typeof AudioSys !== 'undefined' && AudioSys.musicPhase) AudioSys.musicPhase('question');
}
function valRateNow(){
  if(ctrl.on && !ctrl.done) ctrl.done = true;        // freeze the control phase behind the dialog
  if(typeof g7ClosePanels === 'function') g7ClosePanels();
  narrStop();
  valAfterPlay(false);
}
const VAL_WORDS = ['0 — Not usable', '1 — Poor', '2 — Needs major fixes', '3 — Acceptable', '4 — Good', '5 — Excellent'];
function valDrawStars(){
  const el = document.getElementById('vr-stars'), n = VAL_RATE.stars;
  el.innerHTML = `<button type="button" class="vr-zero ${n === 0 ? 'on' : ''}" role="radio" aria-checked="${n === 0}" onclick="valSetStars(0)">0</button>` +
    [1,2,3,4,5].map(k => `<button type="button" class="vr-star ${n >= k ? 'on' : ''}" role="radio" aria-checked="${n === k}" aria-label="${k} star${k > 1 ? 's' : ''}" onclick="valSetStars(${k})">★</button>`).join('');
  document.getElementById('vr-rtext').textContent = n < 0 ? 'Tap the stars (0 – 5)' : VAL_WORDS[n];
}
function valSetStars(k){ VAL_RATE.stars = k; valDrawStars(); AudioSysSafe('click'); }
async function valSaveRating(){
  const msg = document.getElementById('vr-msg'), btn = document.getElementById('vr-save');
  if(VAL_RATE.stars < 0){ msg.className = 'vr-msg err'; msg.textContent = 'Choose a rating from 0 to 5 stars first.'; return; }
  const comment = document.getElementById('vr-comment').value.trim();
  const { g, i } = VAL_RATE, sc = GRADES[g].scenarios[i], prev = VAL_REVIEWS[valKey(g, i)];
  btn.disabled = true; msg.className = 'vr-msg'; msg.textContent = 'Saving…';
  const review = {
    validatorId: VALIDATOR.validatorId, validatorName: VALIDATOR.name,
    grade: g, idx: i, scene: sc.scene || '', title: valTitle(sc, i),
    rating: VAL_RATE.stars, comment, completed: !!VAL_RATE.completed,
    playCount: (prev && prev.playCount || 0) + 1,
    firstPlayedAt: (prev && prev.firstPlayedAt) || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  try{
    await ensureAnonAuth();
    await db.collection('validationReviews').doc(valDocId(g, i)).set(review);
    VAL_REVIEWS[valKey(g, i)] = review;
    const all = Object.values(VAL_REVIEWS);
    db.collection('validators').doc(VALIDATOR.validatorId).set({
      name: VALIDATOR.name, reviewedCount: all.length,
      avgRating: all.reduce((s, r) => s + r.rating, 0) / all.length,
      completedAll: all.length >= valTotal(),
      lastActiveAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge:true }).catch(e => console.warn('validator summary', e));
    AudioSysSafe('correct');
    document.getElementById('val-rate').hidden = true;
    if(VAL_RATE.fromHub){ valRenderProgress(); valShowReview(); return; }
    const finishedNow = all.length >= valTotal() && !(prev);
    valExitToHub(g, finishedNow);
  }catch(e){
    msg.className = 'vr-msg err'; msg.textContent = 'Could not save: ' + e.message;
    btn.disabled = false;
  }
}
function valPlayAgain(){
  document.getElementById('val-rate').hidden = true;
  if(!VAL_RATE.fromHub) valPlay(VAL_RATE.g, VAL_RATE.i);     // from the review page this button is “Cancel”
}
function valExitToHub(g, finishedNow){
  document.getElementById('val-rate-now').hidden = true;
  if(typeof g7ClosePanels === 'function') g7ClosePanels();
  resetCenterQ();
  if(typeof AudioSys !== 'undefined'){ AudioSys.setAmbience(null); AudioSys.startMusic('bright'); }
  transitionTo(()=>{ buildMenuBackground(); valShowHub(g); if(finishedNow) setTimeout(valShowReview, 300); },
    finishedNow ? '🎉 Every scenario validated — your feedback review is now unlocked.' : '');
}

// ── Review (after every scenario is validated) ──
function valShowReview(){
  if(valDone() < valTotal()) return;
  document.getElementById('val-grades').hidden = true;
  document.getElementById('val-list').hidden = true;
  const el = document.getElementById('val-review'); el.hidden = false;
  const all = Object.values(VAL_REVIEWS), avg = all.reduce((s, r) => s + r.rating, 0) / all.length;
  el.innerHTML = `<div class="vl-head"><button class="vl-back" onclick="valRenderGrades()">← All grades</button>
      <div><div class="vl-title">Your feedback & ratings</div><div class="vl-sub">${all.length} scenarios · average ${avg.toFixed(2)} ★ · use “Edit” to change a rating or comment</div></div></div>` +
    VAL_GRADES.map(g => {
      const gd = GRADES[g], s = valGradeStats(g);
      return `<div class="vr-grade" style="--cc:${gd.color}"><div class="vr-gh">Grade ${g} · ${valEsc(gd.topic)}<span>${s.avg != null ? valStars(Math.round(s.avg)) + ' ' + s.avg.toFixed(1) : ''}</span></div>` +
        gd.scenarios.map((sc, i) => { const r = VAL_REVIEWS[valKey(g, i)]; return `<div class="vr-row">
          <div class="vl-n" style="--cc:${gd.color}">${i+1}</div>
          <div class="vl-body"><div class="vl-name">${valEsc(valTitle(sc, i))} ${valStars(r.rating)}${r.completed === false ? ' <span class="vl-warn">not finished</span>' : ''}</div>
            <div class="vr-comment">${r.comment ? valEsc(r.comment) : '<i>No comment</i>'}</div></div>
          <div class="vr-acts"><button class="vl-play" onclick="valEditReview(${g},${i})">✎ Edit</button><button class="vl-play ghost" onclick="valPlay(${g},${i})">↻ Replay</button></div></div>`; }).join('') + '</div>';
    }).join('');
}
