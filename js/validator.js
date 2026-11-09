'use strict';
// Validator mode (game.html with a validator session, see index.html → Validator): the
// researcher's Expert Validation Form (js/validation-form.js) carried out in the system.
//   Part A  for each item: review the full item, answer key and feedback → execute it in the
//           simulation with the answer key shown → rate its relevance 4–1, with comments.
//   Part B  once per grade, after that grade's six items: the 11 indicators + general comments.
//   Check   once per grade: answer the set as a learner would (any answer, real score), then
//           record whether it shows the right items, records responses, shows the matching
//           feedback and calculates scores — Part C's directions ask for this first.
//   Part C  once, after all six checks: the 7 usability indicators + general comments.
//   Sign    overall recommendation, position, school, signature, date. Submitting locks the form.
//   Then    the Acceptability Evaluation Tool, "after using it".
// Stored per validator: validationItems/{id}_{g}_{i}, validationGrades/{id}_{g}, validationForms/{id}.
const VAL_GRADES = VF_GRADES;
const VAL = { items:{}, grades:{}, form:{}, loadError:'', lastCheck:null, timers:{}, pending:{}, sig:null };

const vKey = (g, i) => `${g}-${i}`;
const vItemRef = (g, i) => db.collection('validationItems').doc(`${VALIDATOR.validatorId}_${g}_${i}`);
const vGradeRef = g => db.collection('validationGrades').doc(`${VALIDATOR.validatorId}_${g}`);
const vFormRef = () => db.collection('validationForms').doc(VALIDATOR.validatorId);
const vLocked = () => !!VAL.form.submitted;
const vItem = (g, i) => VAL.items[vKey(g, i)] || {};
const vGrade = g => VAL.grades[g] || (VAL.grades[g] = { ratings:{}, comments:{}, general:'' });
const vToday = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0, 10); };

// ── Progress ──
const vRated = g => VF.items[g].filter((_, i) => vItem(g, i).rating).length;
const vPartADone = g => vRated(g) >= VF.items[g].length;
const vPartBCount = g => VF_PART_B_IDS.filter(id => (vGrade(g).ratings || {})[id]).length;
const vPartBDone = g => vPartBCount(g) >= VF_PART_B_TOTAL;
const vCheckDone = g => !!vGrade(g).check;
const vGradeDone = g => vPartADone(g) && vPartBDone(g) && vCheckDone(g);
const vChecksAll = () => VAL_GRADES.every(vCheckDone);
const vPartCCount = () => VF.partC.items.filter(([id]) => ((VAL.form.partC || {}).ratings || {})[id]).length;
const vPartCDone = () => vPartCCount() >= VF.partC.items.length;
const vReadyToSign = () => VAL_GRADES.every(vGradeDone) && vPartCDone();
const vAcceptDone = () => !!(VAL.form.acceptability || {}).submitted;

async function valLoad(){
  const reads = [];
  VAL_GRADES.forEach(g => {
    reads.push(vGradeRef(g).get().then(d => { if(d.exists) VAL.grades[g] = d.data(); }));
    VF.items[g].forEach((_, i) => reads.push(vItemRef(g, i).get().then(d => { if(d.exists) VAL.items[vKey(g, i)] = d.data(); })));
  });
  reads.push(vFormRef().get().then(d => { if(d.exists) VAL.form = d.data(); }));
  try{ await Promise.all(reads); }
  catch(e){ VAL.loadError = e.message; console.warn('Could not load validation progress', e); }
}

// ── Saving: answers save themselves a moment after each change ──
function vSaved(state){
  const el = document.getElementById('val-saved'); if(!el) return;
  el.className = 'val-saved ' + (state === 'err' ? 'err' : '');
  el.textContent = { busy:'Saving…', ok:'✓ Saved', err:'⚠ Not saved — check your connection' }[state] || '';
}
function vQueue(key, fn){
  VAL.pending[key] = fn; clearTimeout(VAL.timers[key]); vSaved('busy');
  VAL.timers[key] = setTimeout(() => vRun(key), 500);
}
function vRun(key){
  const fn = VAL.pending[key]; if(!fn) return Promise.resolve();
  delete VAL.pending[key]; clearTimeout(VAL.timers[key]);
  return fn().then(() => vSaved('ok')).catch(e => { console.warn('save', e); vSaved('err'); });
}
const vFlush = () => Promise.all(Object.keys(VAL.pending).map(vRun));
const vBase = () => ({ validatorId: VALIDATOR.validatorId, validatorName: VALIDATOR.name, updatedAt: new Date().toISOString() });
const vSaveGrade = g => { const G = vGrade(g); return vGradeRef(g).set(Object.assign(vBase(), { grade:g, ratings:G.ratings||{}, comments:G.comments||{}, general:G.general||'' }, G.check ? { check:G.check } : {}), { merge:true }); };
const vSaveForm = fields => vFormRef().set(Object.assign(vBase(), fields), { merge:true });

// ── Shared bits of markup ──
function vPills(name, top, cur, onchange, labels, off){
  const ks = []; for(let k = top; k >= 1; k--) ks.push(k);
  const dis = off || (name.startsWith('acc') ? vAcceptDone() : vLocked()) ? ' disabled' : '';
  return `<div class="vf-pills" role="radiogroup">${ks.map(k => `<label class="vf-pill ${labels ? 'wide' : ''}"><input type="radio" name="${name}" value="${k}"${cur === k ? ' checked' : ''}${dis} onchange="${onchange}"><span><b>${k}</b>${labels ? `<em>${vfEsc(labels.find(l => l[0] === k)[1])}</em>` : ''}</span></label>`).join('')}</div>`;
}
const vScale = s => `<div class="vf-scale">${s.map(([k, t]) => `<span><b>${k}</b> ${vfEsc(t)}</span>`).join('')}</div>`;
const vBack = (label, go) => `<button class="vl-back" onclick="${go}">← ${vfEsc(label)}</button>`;
const vHeadRow = (title, sub, back) => `<div class="vl-head">${back || ''}<div class="vl-ht"><div class="vl-title">${title}</div>${sub ? `<div class="vl-sub">${sub}</div>` : ''}</div><div class="val-saved" id="val-saved" role="status"></div></div>`;
const vTick = (ok, txt) => `<span class="vf-st ${ok ? 'ok' : ''}">${ok ? '✓ ' : ''}${txt}</span>`;

// ── Navigation ──
function valGo(view, a, b){
  vFlush();
  VAL.sig = null;
  VAL.view = [view, a, b];
  const el = document.getElementById('val-view');
  el.innerHTML = ({ home:vHome, grade:vGradePage, item:vItemPage, partb:vPartBPage, check:vCheckPage, partc:vPartCPage, sign:vSignPage, accept:vAcceptPage, review:vReviewPage }[view])(a, b);
  if(view === 'sign' || view === 'accept') vMountSig(view);
  document.getElementById('s-val').scrollTop = 0;
}
function valShowHub(grade){
  showScreen('s-val');
  document.getElementById('tb-profile').textContent = `✅ Validator · ${VALIDATOR.name}`;
  if(grade) valGo('grade', grade); else valGo('home');
}

// ── Home: the whole procedure at a glance ──
function vHome(){
  const started = Object.keys(VAL.items).length > 0;
  const done = VAL_GRADES.filter(vGradeDone).length, rated = VAL_GRADES.reduce((n, g) => n + vRated(g), 0);
  const stepC = vChecksAll(), stepSign = vReadyToSign();
  const pct = (rated + VAL_GRADES.filter(vPartBDone).length + VAL_GRADES.filter(vCheckDone).length + (vPartCDone() ? 1 : 0) + (vLocked() ? 1 : 0)) / (VF_ITEM_TOTAL + 14) * 100;
  return `<div class="val-top"><div>
      <div class="menu-eyebrow">Expert validation · All grade levels</div>
      <h1 class="val-h1">Expert <em>Validation Form</em></h1>
      <p class="val-sub">Localized Scenario-Based Decision Tasks · ${vfEsc(VF.study)}</p></div>
    <div class="val-prog"><div class="val-prog-n"><b>${rated}</b> / ${VF_ITEM_TOTAL} items rated · <b>${done}</b> / 6 grade sets complete</div><div class="val-bar"><i style="width:${pct}%"></i></div></div></div>
    ${VAL.loadError ? `<div class="vf-alert err">Could not load your saved progress: ${vfEsc(VAL.loadError)}</div>` : ''}
    <details class="vf-letter" ${started ? '' : 'open'}><summary>Letter and directions to the Expert Validator</summary>
      <p><b>Title of the Study:</b> ${vfEsc(VF.study)}</p><p>Dear Expert Validator,</p><p>${vfEsc(VF.letter)}</p><p><b>Directions:</b> ${vfEsc(VF.directions)}</p>
      <ol class="vf-how"><li><b>Each grade level (Part A):</b> open an item, review it with its answer key and feedback, execute it in the simulation, then rate it.</li>
        <li><b>Each grade level (Part B):</b> after its six items, evaluate the whole set using the 11 indicators.</li>
        <li><b>Each grade level (learner check):</b> answer the set as a learner would and confirm the items, responses, feedback and score.</li>
        <li><b>Part C (once):</b> rate the web-based simulation.</li>
        <li><b>Overall recommendation:</b> review your form, then sign and submit it.</li>
        <li><b>Acceptability Evaluation Tool:</b> your evaluation after using the simulation.</li></ol></details>
    <h2 class="vf-step"><span>1</span>Grade-level item sets <small>Parts A and B, and the learner check, for each grade</small></h2>
    <div class="val-grades">${VAL_GRADES.map(g => { const gd = GRADES[g], full = vGradeDone(g); return `<button class="val-grade ${full ? 'full' : ''}" style="--cc:${gd.color}" onclick="valGo('grade',${g})">
        <div class="vg-num">Grade ${g}</div><div class="vg-topic">${vfEsc(gd.topic)}</div>
        <div class="vg-parts">${vTick(vPartADone(g), `Part A ${vRated(g)}/6`)}${vTick(vPartBDone(g), `Part B ${vPartBCount(g)}/${VF_PART_B_TOTAL}`)}${vTick(vCheckDone(g), 'Check')}</div>
        <div class="vg-bar"><i style="width:${(vRated(g) + vPartBCount(g) + (vCheckDone(g) ? 1 : 0)) / (6 + VF_PART_B_TOTAL + 1) * 100}%"></i></div></button>`; }).join('')}</div>
    <h2 class="vf-step"><span>2</span>${vfEsc(VF.partC.title)} <small>completed once</small></h2>
    <button class="vf-card ${vPartCDone() ? 'full' : ''}" ${stepC ? '' : 'disabled'} onclick="valGo('partc')"><b>${vPartCDone() ? '✓ Part C rated' : stepC ? `Rate the simulation (${vPartCCount()}/${VF.partC.items.length})` : '🔒 Part C'}</b>
      <span>${stepC ? vfEsc(VF.partC.note) : `Unlocks after the learner check of all six grade levels (${VAL_GRADES.filter(vCheckDone).length}/6 done).`}</span></button>
    <h2 class="vf-step"><span>3</span>Overall recommendation and signature</h2>
    <button class="vf-card ${vLocked() ? 'full' : ''}" ${stepSign || vLocked() ? '' : 'disabled'} onclick="valGo('${vLocked() ? 'review' : 'sign'}')"><b>${vLocked() ? '✓ Form submitted' : stepSign ? 'Review, sign and submit your form' : '🔒 Sign and submit'}</b>
      <span>${vLocked() ? `Signed ${vfEsc(VAL.form.date || '')}. View or print your copy.` : stepSign ? 'Your ratings and comments can still be changed until you submit.' : 'Unlocks after Parts A, B and C are complete.'}</span></button>
    <h2 class="vf-step"><span>4</span>${vfEsc(VF.acceptability.title)}</h2>
    <button class="vf-card ${vAcceptDone() ? 'full' : ''}" ${vLocked() ? '' : 'disabled'} onclick="valGo('accept')"><b>${vAcceptDone() ? '✓ Acceptability evaluation submitted' : vLocked() ? 'Evaluate the acceptability of the simulation' : '🔒 Acceptability evaluation'}</b>
      <span>${vLocked() ? 'Your evaluation after using the web-based simulation.' : 'Opens after you submit the validation form.'}</span></button>`;
}

// ── Grade page: A.n table, Part B and the learner check ──
function vGradePage(g){
  const gd = GRADES[g];
  return `${vHeadRow(`Grade ${g} · ${vfEsc(gd.topic)}`, `${vRated(g)} of 6 items rated`, vBack('Validation form', "valGo('home')"))}
    <section class="vf-sec"><h3>${vfEsc(VF.partA.title)}</h3><p class="vf-dir"><b>Directions:</b> ${vfEsc(VF.partA.directions)}</p>${vScale(VF.partA.scale)}
      <h4>${vfEsc(vfPartALabel(g))}</h4><div class="vl-items">${VF.items[g].map((foc, i) => { const r = vItem(g, i);
        const label = r.rating ? VF.partA.scale.find(s => s[0] === r.rating)[1] : '';
        return `<div class="vl-item ${r.rating ? 'played' : ''}"><div class="vl-n" style="--cc:${gd.color}">${i+1}</div>
          <div class="vl-body"><div class="vl-name">${vfEsc(foc)}</div>
          ${r.rating ? `<div class="vl-done">✓ Rated <b>${r.rating}</b> — ${vfEsc(label)}${r.noConcept ? ' · <span class="vl-warn">concept not needed noted</span>' : ''}${r.comment ? ` · “${vfEsc(r.comment.slice(0, 90))}${r.comment.length > 90 ? '…' : ''}”` : ''}</div>` : r.played ? '<div class="vl-next">Executed — rate this item</div>' : '<div class="vl-todo">Not yet reviewed</div>'}</div>
          <button class="vl-play" onclick="valGo('item',${g},${i})">${r.rating ? 'Open' : r.played ? 'Rate' : 'Review'}</button></div>`; }).join('')}</div></section>
    <section class="vf-sec"><h3>${vfEsc(VF.partB.title)}</h3><p class="vf-dir">${vfEsc(VF.partB.directions)}</p>
      <button class="vf-card ${vPartBDone(g) ? 'full' : ''}" ${vPartADone(g) ? '' : 'disabled'} onclick="valGo('partb',${g})"><b>${vPartBDone(g) ? '✓ Part B rated' : vPartADone(g) ? `Evaluate the Grade ${g} set (${vPartBCount(g)}/${VF_PART_B_TOTAL})` : '🔒 Part B'}</b><span>${vPartADone(g) ? 'Eleven indicators, with comments and general suggestions.' : 'Unlocks after you rate all six items above.'}</span></button></section>
    <section class="vf-sec"><h3>Learner-view check <small>(required before Part C)</small></h3><p class="vf-dir">Answer this grade’s six items as a learner would, choosing any answers. Then confirm that the set ${VF.checks.map(c => c[1]).join(', ')}. Nothing goes into student records.</p>
      ${vCheckDone(g) ? `<div class="vf-alert ok">✓ Checked — score shown ${vGrade(g).check.solved}/${vGrade(g).check.total}. ${VF.checks.map(([k, t]) => `${vfEsc(t)}: <b>${vGrade(g).check[k] ? 'Yes' : 'No'}</b>`).join(' · ')}</div>` : ''}
      <button class="vf-card ${vCheckDone(g) ? 'full' : ''}" ${vLocked() ? 'disabled' : ''} onclick="valStartCheck(${g})"><b>${vCheckDone(g) ? '↻ Run the check again' : '▶ Start the learner-view check'}</b><span>Six items · your answers are not saved as scores.</span></button></section>`;
}

// ── Part A: one item — review, execute, rate ──
function vItemPage(g, i){
  const sc = GRADES[g].scenarios[i], r = vItem(g, i), n = VF.items[g].length, L = 'ABCDE';
  const dis = vLocked() || !r.played ? ' disabled' : '';
  const biP = t => t ? `<p class="vf-bi">${t}</p>` : '';
  return `${vHeadRow(`Grade ${g} · Item ${i+1} of ${n}`, vfEsc(VF.items[g][i]), vBack(`Grade ${g} items`, `valGo('grade',${g})`))}
    <div class="vf-steps"><span class="on">① Review the item</span><span class="${r.played ? 'on' : ''}">② Execute it</span><span class="${r.rating ? 'on' : ''}">③ Rate it</span></div>
    <div class="vf-item">
      <section class="vf-sec vf-full"><h3>Full item <small>${vfEsc(sc.comp || '')}</small></h3>
        ${sc.live ? `<div class="vf-live">${sc.live.map(c => `<span>${c.l}: <b>${c.v}</b></span>`).join('')}</div>` : ''}
        <p>${sc.sit}</p>${biP(sc.sit_bi)}<p class="vf-q">${sc.q}</p>${biP(sc.q_bi)}
        <ol class="vf-opts">${sc.opts.map((o, j) => `<li class="${j === sc.ci ? 'key' : ''}"><b>${L[j]}.</b><div>${o}${sc.opts_bi && sc.opts_bi[j] ? `<em>${sc.opts_bi[j]}</em>` : ''}${j === sc.ci ? '<i>✓ Answer key</i>' : ''}</div></li>`).join('')}</ol>
        <h4>Feedback</h4><p>${sc.fb}</p>${biP(sc.fb_bi)}
        <h4>Physics explanation${sc.phy_title ? ` · ${sc.phy_title}` : ''}</h4><div class="vf-phy">${sc.phy_html || sc.phy || ''}</div>${sc.phy_bi_html ? `<div class="vf-phy vf-bi">${sc.phy_bi_html}</div>` : ''}
      </section>
      <div class="vf-side">
        <section class="vf-sec"><h3>Execute in the simulation</h3><p class="vf-dir">Play the item as learners will see it. The answer key is shown; tap it, then carry out the decision.</p>
          ${r.played ? `<div class="vf-alert ${r.completed ? 'ok' : 'warn'}">${r.completed ? '✓ Executed to the end' : '⚠ Stopped before the end — say what happened in your comments'}</div>` : ''}
          <button class="vl-play big" onclick="valPlay(${g},${i})">${r.played ? '↻ Execute again' : '▶ Execute in the simulation'}</button></section>
        <section class="vf-sec ${r.played ? '' : 'vf-off'}"><h3>Rate this item</h3>
          ${r.played ? '' : '<p class="vf-dir">Execute the item first, then rate it here.</p>'}
          <p class="vf-dir">Rate how well the item assesses the intended physics competency.</p>
          ${vPills('rate', 4, r.rating, '', VF.partA.scale, !r.played)}
          <label class="vf-note"><input type="checkbox" id="vr-note"${r.noConcept ? ' checked' : ''}${dis}> Learners can choose the correct answer without applying the concept</label>
          <label class="vf-lab" for="vr-comment">Comments or Required Revision</label>
          <textarea id="vr-comment" class="vf-ta" rows="4" maxlength="2000"${dis}>${vfEsc(r.comment || '')}</textarea>
          <div class="vr-msg" id="vr-msg"></div>
          ${vLocked() ? '' : `<div class="vr-btns"><button class="vr-btn primary" ${r.played ? '' : 'disabled'} onclick="valSaveItem(${g},${i})">Save${i < n-1 ? ' & next item' : ' & finish'}</button></div>`}
        </section>
        <div class="vf-nav">${i > 0 ? `<button class="vl-back" onclick="valGo('item',${g},${i-1})">← Item ${i}</button>` : '<span></span>'}${i < n-1 ? `<button class="vl-back" onclick="valGo('item',${g},${i+1})">Item ${i+2} →</button>` : ''}</div>
      </div>
    </div>`;
}
async function valSaveItem(g, i){
  const msg = document.getElementById('vr-msg'), pick = document.querySelector('input[name="rate"]:checked');
  if(!pick){ msg.className = 'vr-msg err'; msg.textContent = 'Choose a rating from 4 to 1 first.'; return; }
  const rec = Object.assign({}, vItem(g, i), vBase(), { grade:g, idx:i, focus:VF.items[g][i], played:true,
    rating:Number(pick.value), noConcept:document.getElementById('vr-note').checked, comment:document.getElementById('vr-comment').value.trim() });
  msg.className = 'vr-msg'; msg.textContent = 'Saving…';
  try{
    await vItemRef(g, i).set(rec);
    VAL.items[vKey(g, i)] = rec;
    AudioSysSafe('correct');
    if(i < VF.items[g].length - 1) valGo('item', g, i+1); else valGo('grade', g);
  }catch(e){ msg.className = 'vr-msg err'; msg.textContent = 'Could not save: ' + e.message; }
}

// Execute with the answer key shown (game.html's normal scene, control and feedback).
function valPlay(g, i){
  vFlush();
  requestFullscreenIfMobile();
  transitionTo(()=>{ showScreen('s-game'); startGrade(g, null, 'Validation', { validator:true, idx:i }); },
    `Validating Grade ${g} · Item ${i+1}: ${VF.items[g][i]}`);
}
function valMarkAnswer(scen){
  const ce = document.getElementById('choices');
  [...ce.querySelectorAll('.ch-btn')].forEach((b, j) => {
    if(j === scen.ci){ b.classList.add('val-key'); b.insertAdjacentHTML('beforeend', '<span class="val-key-tag">✓ Answer key</span>'); }
    else b.classList.add('val-dim');
  });
  ce.insertAdjacentHTML('afterbegin', `<div class="val-note">🔑 Answer key: <b>${'ABCDE'[scen.ci]}</b> — tap it to carry out the decision.</div>`);
  document.getElementById('val-rate-now').hidden = false;
}
// Take Control finished (completed), or the validator stopped early with “Stop & rate”.
function valAfterPlay(completed){
  const g = GS.grade, i = GS.idx, prev = vItem(g, i);
  const rec = Object.assign({ grade:g, idx:i, focus:VF.items[g][i], rating:null, comment:'', noConcept:false }, prev, vBase(),
    { played:true, completed:!!(completed || prev.completed), playCount:(prev.playCount || 0) + 1 });
  if(!vLocked()){ VAL.items[vKey(g, i)] = rec; vItemRef(g, i).set(rec).catch(e => console.warn('save play', e)); }
  valExit(() => valGo('item', g, i));
}
function valRateNow(){
  if(ctrl.on && !ctrl.done) ctrl.done = true;
  narrStop();
  valAfterPlay(false);
}
// Leaves the simulation for the validator pages.
function valExit(then){
  document.getElementById('val-rate-now').hidden = true;
  document.getElementById('fb-wrap').classList.remove('on');
  if(typeof g7ClosePanels === 'function') g7ClosePanels();
  resetCenterQ();
  ctrl.on = false; panelRevealed = false;
  if(typeof AudioSys !== 'undefined'){ AudioSys.setAmbience(null); AudioSys.startMusic('bright'); }
  transitionTo(() => { buildMenuBackground(); showScreen('s-val'); then(); });
}
// The in-game Menu button: back to the item being executed, or the grade being checked.
function valReturn(){
  const inPlay = GS && GS.validator, g = inPlay && GS.grade, i = inPlay && GS.idx, check = inPlay && GS.check;
  valExit(() => { if(!inPlay) valGo('home'); else if(check) valGo('grade', g); else valGo('item', g, i); });
}

// ── Part B ──
function vIndicatorRows(list, top, ratings, comments, setCall, cmCall){
  return list.map(([id, text], n) => `<div class="vf-ind"><div class="vf-ind-t">${vfNumber(id)}. ${vfEsc(text)}</div>
      ${vPills(`r-${id}`, top, (ratings || {})[id], setCall(id))}
      <input class="vf-in" type="text" maxlength="1000" placeholder="Comments or required revision" aria-label="Comments for indicator ${vfNumber(id)}" value="${vfEsc((comments || {})[id] || '')}"${vLocked() ? ' disabled' : ''} oninput="${cmCall(id)}"></div>`).join('');
}
function vPartBPage(g){
  const G = vGrade(g);
  return `${vHeadRow(`Part B · Grade ${g}`, vfEsc(VF.partB.title), vBack(`Grade ${g}`, `valGo('grade',${g})`))}
    <section class="vf-sec"><p class="vf-dir"><b>Directions:</b> ${vfEsc(VF.partB.directions)}</p>${vScale(VF.criterion)}
      <details class="vf-letter"><summary>The six items and their competencies</summary><ol class="vf-how">${VF.items[g].map((f, i) => `<li>${vfEsc(f)} <em>· ${vfEsc(GRADES[g].scenarios[i].comp || '')}</em></li>`).join('')}</ol></details></section>
    ${VF.partB.groups.map(gr => `<section class="vf-sec"><h3>${vfEsc(gr.name)}</h3>${vIndicatorRows(gr.items, 4, G.ratings, G.comments, id => `valSetB(${g},'${id}',this.value)`, id => `valCmB(${g},'${id}',this.value)`)}</section>`).join('')}
    <section class="vf-sec"><label class="vf-lab" for="b-gen">General Comments and Suggestions</label><textarea id="b-gen" class="vf-ta" rows="4" maxlength="4000"${vLocked() ? ' disabled' : ''} oninput="valGenB(${g},this.value)">${vfEsc(G.general || '')}</textarea>
      <p class="vf-dir"><b>Note:</b> ${vfEsc(VF.partB.note)}</p>
      <div class="vr-btns"><span class="vf-count" id="b-count">${vPartBCount(g)} of ${VF_PART_B_TOTAL} rated</span><button class="vr-btn primary" onclick="valGo('grade',${g})">Done</button></div></section>`;
}
function valSetB(g, id, v){ const G = vGrade(g); (G.ratings = G.ratings || {})[id] = Number(v); const c = document.getElementById('b-count'); if(c) c.textContent = `${vPartBCount(g)} of ${VF_PART_B_TOTAL} rated`; vQueue('g'+g, () => vSaveGrade(g)); }
function valCmB(g, id, v){ const G = vGrade(g); (G.comments = G.comments || {})[id] = v; vQueue('g'+g, () => vSaveGrade(g)); }
function valGenB(g, v){ vGrade(g).general = v; vQueue('g'+g, () => vSaveGrade(g)); }

// ── Learner-view check: any answer, real feedback and the real score summary ──
function valStartCheck(g){
  vFlush();
  requestFullscreenIfMobile();
  transitionTo(()=>{ showScreen('s-game'); startGrade(g, null, 'Validation', { validator:true, check:true }); },
    `Learner-view check · Grade ${g}: answer as a learner would. Choose any answers.`);
}
// Called by showResults once the learner's score summary is on screen.
function valCheckResults(){
  const t = GS.gd.scenarios.length;
  VAL.lastCheck = { g:GS.grade, total:t, solved:GS.scores.filter(s => s > 0).length,
    responses:resultsLog.map(r => ({ i:r.scenarioIndex, chosen:r.chosenOption, key:r.correctOption })) };
}
function valCheckContinue(){
  const c = VAL.lastCheck; if(!c) return;
  valExit(() => valGo('check', c.g));
}
function vCheckPage(g){
  const c = VAL.lastCheck, L = 'ABCDE';
  if(!c || c.g !== g) return vGradePage(g);
  return `${vHeadRow(`Learner-view check · Grade ${g}`, `Part C asks you to confirm these for each grade-level set`, vBack(`Grade ${g}`, `valGo('grade',${g})`))}
    <section class="vf-sec"><h3>Responses recorded by the simulation</h3>
      <div class="vf-tw"><table class="vf-t"><thead><tr><th>Item</th><th>Item focus</th><th>Your response</th><th>Answer key</th><th>Result</th></tr></thead><tbody>
      ${c.responses.map(r => `<tr><td>${r.i+1}</td><td>${vfEsc(VF.items[g][r.i])}</td><td>${L[r.chosen]}</td><td>${L[r.key]}</td><td>${r.chosen === r.key ? '✓ Correct' : '✗ Incorrect'}</td></tr>`).join('')}
      </tbody></table></div><p class="vf-dir">Score shown on the summary: <b>${c.solved} / ${c.total}</b> (${Math.round(c.solved/c.total*100)}%)</p></section>
    <section class="vf-sec"><h3>Did this grade-level set…</h3>
      ${VF.checks.map(([k, t]) => `<div class="vf-yn"><span>…${vfEsc(t)}?</span><label class="vf-pill"><input type="radio" name="chk-${k}" value="1"><span><b>Yes</b></span></label><label class="vf-pill"><input type="radio" name="chk-${k}" value="0"><span><b>No</b></span></label></div>`).join('')}
      <label class="vf-lab" for="chk-note">Note (optional)</label><textarea id="chk-note" class="vf-ta" rows="2" maxlength="1000"></textarea>
      <div class="vr-msg" id="chk-msg"></div><div class="vr-btns"><button class="vr-btn primary" onclick="valSaveCheck(${g})">Save this check</button></div></section>`;
}
async function valSaveCheck(g){
  const c = VAL.lastCheck, msg = document.getElementById('chk-msg'), out = {};
  for(const [k] of VF.checks){ const p = document.querySelector(`input[name="chk-${k}"]:checked`); if(!p){ msg.className = 'vr-msg err'; msg.textContent = 'Answer Yes or No for all four.'; return; } out[k] = p.value === '1'; }
  const G = vGrade(g);
  G.check = Object.assign(out, { solved:c.solved, total:c.total, responses:c.responses, note:document.getElementById('chk-note').value.trim(), at:new Date().toISOString() });
  try{ await vSaveGrade(g); VAL.lastCheck = null; AudioSysSafe('correct'); valGo('grade', g); }
  catch(e){ msg.className = 'vr-msg err'; msg.textContent = 'Could not save: ' + e.message; }
}

// ── Part C ──
const vPartC = () => VAL.form.partC || (VAL.form.partC = { ratings:{}, comments:{}, general:'' });
function vPartCPage(){
  const C = vPartC();
  return `${vHeadRow('Part C', vfEsc(VF.partC.title), vBack('Validation form', "valGo('home')"))}
    <section class="vf-sec"><p class="vf-dir"><b>Directions:</b> ${vfEsc(VF.partC.directions)}</p>${vScale(VF.criterion)}</section>
    <section class="vf-sec"><h3>${vfEsc(VF.partC.head)}</h3>${vIndicatorRows(VF.partC.items, 4, C.ratings, C.comments, id => `valSetC('${id}',this.value)`, id => `valCmC('${id}',this.value)`)}</section>
    <section class="vf-sec"><label class="vf-lab" for="c-gen">General Comments and Suggestions</label><textarea id="c-gen" class="vf-ta" rows="4" maxlength="4000"${vLocked() ? ' disabled' : ''} oninput="valGenC(this.value)">${vfEsc(C.general || '')}</textarea>
      <p class="vf-dir"><b>Note:</b> ${vfEsc(VF.partC.note)}</p>
      <div class="vr-btns"><span class="vf-count" id="c-count">${vPartCCount()} of ${VF.partC.items.length} rated</span><button class="vr-btn primary" onclick="valGo('home')">Done</button></div></section>`;
}
const vSaveC = () => vQueue('c', () => vSaveForm({ partC:vPartC() }));
function valSetC(id, v){ const C = vPartC(); (C.ratings = C.ratings || {})[id] = Number(v); const n = document.getElementById('c-count'); if(n) n.textContent = `${vPartCCount()} of ${VF.partC.items.length} rated`; vSaveC(); }
function valCmC(id, v){ const C = vPartC(); (C.comments = C.comments || {})[id] = v; vSaveC(); }
function valGenC(v){ vPartC().general = v; vSaveC(); }

// ── Review, sign, submit ──
function vFormCopy(){ return vfFormHTML({ name:VALIDATOR.name, itemOf:vItem, gradeOf:vGrade, form:VAL.form }); }
function vSigBlock(){
  return `<div class="vf-sigwrap"><canvas class="vf-sig" id="vf-sig" width="560" height="150" aria-label="Signature pad: sign with your finger or mouse"></canvas>
    <div class="vf-sigbar"><span>Sign above with your finger or mouse</span><button type="button" class="vl-back" onclick="VAL.sig && VAL.sig.clear()">Clear</button></div></div>`;
}
function vSignPage(){
  vfEnsureStyles();
  const F = VAL.form;
  return `${vHeadRow('Review, sign and submit', 'Check your whole form below. Your answers can still be changed until you submit.', vBack('Validation form', "valGo('home')"))}
    <section class="vf-sec"><h3>Change an answer</h3><div class="vf-chips">${VAL_GRADES.map(g => `<button class="vl-back" onclick="valGo('grade',${g})">Grade ${g}</button>`).join('')}<button class="vl-back" onclick="valGo('partc')">Part C</button></div></section>
    <section class="vf-sec"><h3>Your form</h3><div class="vf-copy">${vFormCopy()}</div></section>
    <section class="vf-sec"><h3>Overall Recommendation</h3><div class="vf-recs">${VF.recommendations.map((t, i) => `<label class="vf-rec"><input type="radio" name="rec" value="${i}"${F.recommendation === t ? ' checked' : ''} onchange="valField('recommendation',VF.recommendations[this.value])"><span>${vfEsc(t)}</span></label>`).join('')}</div>
      <div class="vf-grid2"><div><label class="vf-lab">Validator’s Name</label><input class="vf-in" type="text" value="${vfEsc(VALIDATOR.name)}" disabled></div>
        <div><label class="vf-lab" for="s-pos">Position / Designation</label><input class="vf-in" id="s-pos" type="text" maxlength="120" value="${vfEsc(F.position || '')}" oninput="valField('position',this.value)"></div>
        <div><label class="vf-lab" for="s-sch">School</label><input class="vf-in" id="s-sch" type="text" maxlength="160" value="${vfEsc(F.school || '')}" oninput="valField('school',this.value)"></div>
        <div><label class="vf-lab" for="s-date">Date</label><input class="vf-in" id="s-date" type="date" value="${vfEsc(F.date || vToday())}" oninput="valField('date',this.value)"></div></div>
      <label class="vf-lab">Signature</label>${vSigBlock()}
      <div class="vr-msg" id="s-msg"></div><div class="vr-btns"><button class="vr-btn primary" id="s-btn" onclick="valSubmitForm()">Submit signed form</button></div></section>`;
}
function valField(k, v){ VAL.form[k] = v; vQueue('f'+k, () => vSaveForm({ [k]:v })); }
async function valSubmitForm(){
  const F = VAL.form, msg = document.getElementById('s-msg'), date = document.getElementById('s-date').value;
  const fail = t => { msg.className = 'vr-msg err'; msg.textContent = t; };
  if(!F.recommendation) return fail('Choose your overall recommendation.');
  if(!String(F.position || '').trim()) return fail('Enter your position or designation.');
  if(!String(F.school || '').trim()) return fail('Enter your school.');
  if(!date) return fail('Enter the date.');
  if(!VAL.sig || VAL.sig.empty()) return fail('Please sign the form.');
  if(!confirm('Submit your signed validation form? Your ratings will be locked. Only the Super Admin can reopen it.')) return;
  document.getElementById('s-btn').disabled = true; msg.className = 'vr-msg'; msg.textContent = 'Submitting…';
  try{
    await vFlush();
    const fields = { date, signature:VAL.sig.data(), submitted:true, submittedAt:new Date().toISOString(), position:F.position.trim(), school:F.school.trim(), recommendation:F.recommendation, partC:vPartC() };
    await vSaveForm(fields);
    Object.assign(VAL.form, fields);
    AudioSysSafe('fanfare');
    valGo('accept');
  }catch(e){ fail('Could not submit: ' + e.message); document.getElementById('s-btn').disabled = false; }
}
function vReviewPage(){
  vfEnsureStyles();
  return `${vHeadRow('Your submitted form', VAL.form.submittedAt ? `Submitted ${vfEsc(new Date(VAL.form.submittedAt).toLocaleString())}` : '', vBack('Validation form', "valGo('home')"))}
    <section class="vf-sec"><div class="vr-btns" style="justify-content:flex-start"><button class="vr-btn primary" onclick="vfPrint('Expert Validation Form', vFormCopy())">🖨 Print / save as PDF</button></div><div class="vf-copy">${vFormCopy()}</div></section>`;
}

// ── Acceptability Evaluation Tool ──
const vAcc = () => VAL.form.acceptability || (VAL.form.acceptability = { ratings:{}, comments:{}, overall:'', code:'', subject:'', date:vToday() });
function vAcceptPage(){
  const A = VF.acceptability, a = vAcc(), ro = vAcceptDone();
  if(ro) vfEnsureStyles();
  return `${vHeadRow(vfEsc(A.title), ro ? 'Submitted — thank you for your evaluation.' : '', vBack('Validation form', "valGo('home')"))}
    ${ro ? `<section class="vf-sec"><div class="vr-btns" style="justify-content:flex-start"><button class="vr-btn primary" onclick="vfPrint('Acceptability Evaluation Tool', vfAcceptHTML(vAcc()))">🖨 Print / save as PDF</button></div><div class="vf-copy">${vfAcceptHTML(a)}</div></section>` : `
    <section class="vf-sec"><p><b>Title of the Study:</b> ${vfEsc(VF.study)}</p><p><b>Researcher:</b> ${A.researcher.map(vfEsc).join(', ')}</p><p>Dear Respondent,</p><p>${vfEsc(A.letter)}</p><p class="vf-dir"><b>Directions:</b> ${vfEsc(A.directions)}</p>${vScale(A.scale)}</section>
    <section class="vf-sec"><h3>Acceptability Rating Sheet</h3>${A.items.map(([id, n, t]) => `<div class="vf-ind"><div class="vf-ind-t"><b>${vfEsc(n)}.</b> ${vfEsc(t)}</div>${vPills(`acc-${id}`, 5, (a.ratings || {})[id], `valSetAcc('${id}',this.value)`)}
        <input class="vf-in" type="text" maxlength="1000" placeholder="Comments / suggestions" value="${vfEsc((a.comments || {})[id] || '')}" oninput="valCmAcc('${id}',this.value)"></div>`).join('')}</section>
    <section class="vf-sec"><label class="vf-lab" for="a-ov">Overall Comments / Suggestions</label><textarea id="a-ov" class="vf-ta" rows="3" maxlength="4000" oninput="valAccField('overall',this.value)">${vfEsc(a.overall || '')}</textarea>
      <div class="vf-grid2"><div><label class="vf-lab" for="a-code">Evaluator Code</label><input class="vf-in" id="a-code" type="text" maxlength="40" value="${vfEsc(a.code || '')}" oninput="valAccField('code',this.value)"></div>
        <div><label class="vf-lab" for="a-sub">Subject/Grade Level Taught</label><input class="vf-in" id="a-sub" type="text" maxlength="120" value="${vfEsc(a.subject || '')}" oninput="valAccField('subject',this.value)"></div>
        <div><label class="vf-lab" for="a-date">Date</label><input class="vf-in" id="a-date" type="date" value="${vfEsc(a.date || vToday())}" oninput="valAccField('date',this.value)"></div></div>
      <label class="vf-lab">Signature</label>${vSigBlock()}
      <div class="vr-msg" id="a-msg"></div><div class="vr-btns"><button class="vr-btn primary" id="a-btn" onclick="valSubmitAccept()">Submit evaluation</button></div></section>`}`;
}
const vSaveAcc = () => vQueue('a', () => vSaveForm({ acceptability:vAcc() }));
function valSetAcc(id, v){ const a = vAcc(); (a.ratings = a.ratings || {})[id] = Number(v); vSaveAcc(); }
function valCmAcc(id, v){ const a = vAcc(); (a.comments = a.comments || {})[id] = v; vSaveAcc(); }
function valAccField(k, v){ vAcc()[k] = v; vSaveAcc(); }
async function valSubmitAccept(){
  const a = vAcc(), msg = document.getElementById('a-msg');
  const fail = t => { msg.className = 'vr-msg err'; msg.textContent = t; };
  if(VF.acceptability.items.some(([id]) => !(a.ratings || {})[id])) return fail('Please rate all five indicators.');
  if(!String(a.code || '').trim()) return fail('Enter your evaluator code.');
  if(!String(a.subject || '').trim()) return fail('Enter the subject or grade level you teach.');
  a.date = document.getElementById('a-date').value;
  if(!a.date) return fail('Enter the date.');
  if(!VAL.sig || VAL.sig.empty()) return fail('Please sign the evaluation.');
  document.getElementById('a-btn').disabled = true; msg.className = 'vr-msg'; msg.textContent = 'Submitting…';
  try{
    await vFlush();
    const done = Object.assign({}, a, { signature:VAL.sig.data(), submitted:true, submittedAt:new Date().toISOString() });
    await vSaveForm({ acceptability:done });
    VAL.form.acceptability = done;
    AudioSysSafe('fanfare');
    valGo('home');
  }catch(e){ fail('Could not submit: ' + e.message); document.getElementById('a-btn').disabled = false; }
}

// ── Signature pad ──
function vMountSig(){
  const c = document.getElementById('vf-sig'); if(!c) return;
  const x = c.getContext('2d'); let drawing = false, has = false, last = null;
  x.lineWidth = 2.4; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#0f172a';
  const at = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
  c.addEventListener('pointerdown', e => { e.preventDefault(); c.setPointerCapture(e.pointerId); drawing = true; last = at(e); x.beginPath(); x.arc(last[0], last[1], 1.1, 0, 6.3); x.fillStyle = x.strokeStyle; x.fill(); has = true; });
  c.addEventListener('pointermove', e => { if(!drawing) return; e.preventDefault(); const p = at(e); x.beginPath(); x.moveTo(last[0], last[1]); x.lineTo(p[0], p[1]); x.stroke(); last = p; });
  const up = () => { drawing = false; };
  c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  VAL.sig = { clear(){ x.clearRect(0, 0, c.width, c.height); has = false; }, empty(){ return !has; }, data(){ return c.toDataURL('image/png'); } };
}
