'use strict';
// The Expert Validation Form and Acceptability Evaluation Tool, word for word from the
// researcher's document, plus the summary maths and the printable copies. Shared by the
// validator pages (validator.js) and the Super Admin's Validation page (superadmin.js).
const VF = {
  formTitle: 'EXPERT VALIDATION FORM FOR THE LOCALIZED SCENARIO-BASED DECISION TASKS',
  study: 'Web-Based Decision Simulation Applying Forces and Motion Concepts in Localized Disaster Contexts',
  letter: 'You are invited to evaluate the Grade-Level Scenario-Based Decision Items and the web-based simulation developed for this study. Please rate each indicator and provide comments or suggestions when necessary. Your evaluation will guide the revision and improvement of the instrument.',
  directions: 'Please rate each indicator by placing a check mark under the appropriate column.',
  partA: {
    title: 'Part A. Validation of Scenario-Based Decision Items and Web-Based Simulation',
    directions: 'Review the full item, answer key, and feedback. Rate how well the item assesses the intended physics competency. Note if learners can choose the correct answer without applying the concept.',
    scale: [[4,'Highly relevant'],[3,'Quite relevant'],[2,'Somewhat relevant'],[1,'Not relevant']]
  },
  items: {
    7: ['Flood: Moving floodwater pushing a loose object','Typhoon: Strong wind acting on a hanging sign','Flood: Choosing between a shorter flooded route and a longer open route','Typhoon: Identifying displacement toward a designated shelter','Flood: Interpreting the increasing speed of a floating object','Typhoon: Interpreting increasing wind-speed updates'],
    8: ['Flood: Acceleration of debris entering a narrow drainage channel','Typhoon: Acceleration of a loose roof sheet in strong wind','Flood: Kinetic energy of flood-borne objects with different masses','Typhoon: Potential-energy hazard of a loose object on a high ledge','Flood: Work done while moving a relief box','Typhoon: Reducing the mechanical-energy hazard of loose outdoor objects'],
    9: ['Flood: Inertia of unsecured objects during a sudden vehicle stop','Typhoon: Securing loose objects inside an evacuation vehicle','Flood: Relationship between mass and acceleration of debris','Typhoon: Acceleration of light and heavy objects under the same wind force','Flood: Action-reaction forces involving a floating platform','Typhoon: Opposing forces during post-typhoon debris removal'],
    10: ['Flood: Release angle and speed affecting the range of a projectile','Typhoon: Predicted landing area of a wind-driven roof fragment','Flood: Momentum of debris with different masses','Typhoon: Increasing stopping time to reduce impact force','Flood: Reducing the impact of colliding flood-borne debris','Typhoon: Identifying an inelastic collision between wind-driven objects'],
    11: ['Flood: Translational and rotational motion of a rolling container','Typhoon: Linear and angular quantities describing a rolling wheel','Flood: Using a simple machine to raise a relief box','Typhoon: Safe use of a lever during debris cleanup','Flood: Boat capacity, load distribution, buoyancy, and stability','Typhoon: Upward force acting on a floating sealed container'],
    12: ['Flood: Net force changing the motion of a floating object','Typhoon: Equilibrium between wind and support forces','Flood: Mechanical work in moving a supply cart','Typhoon: Energy transformation of a falling loose panel','Flood: Momentum-related danger of fast and massive debris','Typhoon: Increasing stopping time to reduce impact force']
  },
  criterion: [[4,'Criterion Fully Met'],[3,'Criterion Adequately Met; Minor Revision May Be Needed'],[2,'Criterion Partially Met; Major Revision Is Needed'],[1,'Criterion Not Met']],
  partB: {
    title: 'Part B. Overall Evaluation of the Grade-Level Item Set',
    directions: 'Evaluate the six-item grade-level set using the scale below.',
    note: 'Reproduce Part B for Grades 7, 8, 9, 10, 11, and 12. The ratings will be summarized using weighted mean.',
    groups: [
      { name:'Content and Scientific Accuracy', items:[
        ['b1','The scientific concepts presented in the items are accurate.'],
        ['b2','The answer key identifies the most scientifically appropriate decision.'],
        ['b3','The feedback statements are supported by appropriate scientific and safety references.'] ]},
      { name:'Competency Alignment', items:[
        ['b4','The items are aligned with the identified physics-related learning competencies.'],
        ['b5','The six items represent the three priority competency areas indicated in the test blueprint.'] ]},
      { name:'Scenario Relevance and Localization', items:[
        ['b6','The items present realistic localized flood and typhoon situations.'],
        ['b7','The scenarios reflect local mobility conditions during floods and typhoons.'],
        ['b8','The response options represent plausible decisions that learners may make in the given situations.'] ]},
      { name:'Pedagogical and Grade-Level Appropriateness', items:[
        ['b9','The language and scientific content are appropriate for the intended grade level.'],
        ['b10','The English and Naga-Bikol versions are clear, convey the same meaning, and give the same clues.'],
        ['b11','The level of difficulty is appropriate for the intended learners.'] ]}
    ]
  },
  partC: {
    title: 'Part C. Validation of the Web-Based Simulation',
    directions: 'Complete this section once after checking that each grade-level set displays the correct items, records responses, shows the matching feedback, and calculates scores correctly.',
    note: 'Part C will be completed only once because the grade level items will be presented through the same simulation platform.',
    head: 'Technical Design and Usability Indicator',
    items: [
      ['c1','The instructions for using the simulation are clear.'],
      ['c2','The text, images, buttons, and response options are readable and properly presented.'],
      ['c3','The navigation from one scenario to another is easy to follow.'],
      ['c4','The simulation records the learners’ selected responses properly.'],
      ['c5','The feedback presented after each response is clear and scientifically appropriate.'],
      ['c6','The score summary correctly presents the learner’s results.'],
      ['c7','The interface is appropriate for learners from Grades 7 to 12.']
    ]
  },
  // What Part C's directions ask the expert to confirm for each grade-level set.
  checks: [
    ['items','displays the correct items'],
    ['records','records responses'],
    ['feedback','shows the matching feedback'],
    ['scores','calculates scores correctly']
  ],
  recommendations: ['Accept as presented','Accept with minor revisions','Revise and resubmit for checking','Not acceptable in its present form'],
  acceptability: {
    title: 'ACCEPTABILITY EVALUATION TOOL',
    researcher: ['Janice Pauline B. Reyes','Master of Arts in General Science Education','Bicol University Graduate School'],
    letter: 'You are invited to evaluate the acceptability of the web-based simulation after using it. Please rate each indicator and provide comments or suggestions when necessary. Your evaluation will guide the revision and improvement of the instrument.',
    directions: 'Please evaluate the web-based decision simulation by putting a check mark under the rating that best represents your evaluation.',
    scale: [[5,'Very Highly Acceptable'],[4,'Highly Acceptable'],[3,'Moderately Acceptable'],[2,'Less Acceptable'],[1,'Not Acceptable']],
    items: [
      ['usefulness','Usefulness','The simulation supports the application of selected science concepts in localized flood and typhoon situations.'],
      ['clarity','Clarity','The instructions, scenarios, questions, choices, and feedback are clear and understandable.'],
      ['relevance','Relevance','The scenarios are relevant to learners’ local experiences and flood or typhoon mobility situations.'],
      ['ease','Ease of Use','The simulation is easy to access, navigate, and use.'],
      ['appropriateness','Appropriateness','The content, design, language, and activities are appropriate for the learners’ grade level and Science learning needs.']
    ]
  }
};
const VF_GRADES = [7,8,9,10,11,12];
const VF_PART_B_IDS = VF.partB.groups.reduce((a,g)=> a.concat(g.items.map(x=>x[0])), []);
const VF_PART_B_TOTAL = VF_PART_B_IDS.length;
const VF_ITEM_TOTAL = VF_GRADES.reduce((n,g)=> n + VF.items[g].length, 0);
const vfEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function vfPartALabel(g){ return `A.${VF_GRADES.indexOf(g)+1} Grade ${g} Item-Relevance Rating`; }
function vfNumber(id){ return Number(String(id).replace(/\D/g,'')); }

// ── Summary maths ──
// Weighted mean = Σ(f·x) / N for ratings x with frequency f. The document only names the
// scale points, so means are read on equal intervals of the scale (see vfInterp).
function vfFreq(values, top){
  const f = {}; for(let k=1;k<=top;k++) f[k] = 0;
  const v = values.filter(x => typeof x === 'number' && x >= 1 && x <= top);
  v.forEach(x => f[x]++);
  return { f, n:v.length, wm: v.length ? v.reduce((a,b)=>a+b,0)/v.length : null };
}
// Lower limit of each band, highest first, on equal intervals of the scale. A mean is read
// after rounding to the 2 decimals it is reported with.
const VF_CUTS = { 4:[3.25,2.50,1.75,1], 5:[4.21,3.41,2.61,1.81,1] };
function vfInterp(wm, scale){
  if(wm == null) return '';
  const r = Math.round(wm*100)/100, cuts = VF_CUTS[scale[0][0]];
  for(let i=0;i<cuts.length;i++) if(r >= cuts[i]) return scale[i][1];
  return scale[scale.length-1][1];
}
function vfIntervals(scale){
  const top = scale[0][0], cuts = VF_CUTS[top];
  return scale.map((s,i)=> `${cuts[i].toFixed(2)}–${(i ? cuts[i-1]-.01 : top).toFixed(2)} ${s[1]}`).join('; ');
}

// ── Printable copies (same layout as the document, on white paper) ──
const VF_PRINT_CSS = `
.vfp{background:#fff;color:#111;font:13px/1.45 'Times New Roman',Georgia,serif;padding:18px 22px;border-radius:6px}
.vfp h1{font-size:15px;text-align:center;margin:0 0 10px;font-weight:800;color:#111}
.vfp h2{font-size:13.5px;margin:16px 0 5px;font-weight:800;color:#111}
.vfp h3{font-size:13px;margin:12px 0 4px;font-weight:700;color:#111}
.vfp p{margin:4px 0;color:#111}.vfp b{color:#111}
.vfp table{border-collapse:collapse;width:100%;margin:5px 0 10px;page-break-inside:auto;min-width:0}
.vfp tr{page-break-inside:avoid}
.vfp th,.vfp td{border:1px solid #555;padding:3px 6px;vertical-align:top;text-align:left;color:#111;background:#fff;font-size:12.5px;white-space:normal}
.vfp th{font-weight:700;background:#f1f1f1}
.vfp td.c,.vfp th.c{text-align:center;width:26px;padding:3px 2px}
.vfp tr.grp td{font-weight:700;background:#f7f7f7}
.vfp .sig{height:60px;display:block;margin:2px 0}
.vfp .line{display:flex;gap:6px;margin:3px 0;color:#111}.vfp .line b{white-space:nowrap}
.vfp .line span{flex:1;border-bottom:1px solid #555;min-height:1.3em;color:#111}
.vfp .pg{page-break-before:always}
.vfp .box{border:1px solid #bbb;min-height:2.6em;padding:4px 6px;white-space:pre-wrap;color:#111}
.vfp .warn{font-size:11.5px;color:#7c2d12}`;
function vfBox(v, k){ return v === k ? '☑' : '☐'; }
function vfRows(idList, top, ratings, comments, labelFn){
  const ks = []; for(let k=top;k>=1;k--) ks.push(k);
  return idList.map(id => `<tr><td>${labelFn(id)}</td>${ks.map(k=>`<td class="c">${vfBox((ratings||{})[id], k)}</td>`).join('')}<td>${vfEsc((comments||{})[id]||'')}</td></tr>`).join('');
}
function vfSigImg(s){ return s && /^data:image\/png;base64,/.test(s) ? `<img class="sig" src="${vfEsc(s)}" alt="Signature">` : ''; }
// data: {name, itemOf(g,i), gradeOf(g), form}
function vfFormHTML(d){
  const form = d.form || {}, C = form.partC || {};
  const scale = s => `<table><tr><th class="c" style="width:60px">Rating</th><th>Description</th></tr>${s.map(([k,t])=>`<tr><td class="c" style="width:60px">${k}</td><td>${vfEsc(t)}</td></tr>`).join('')}</table>`;
  const head4 = '<th class="c">4</th><th class="c">3</th><th class="c">2</th><th class="c">1</th>';
  let h = `<div class="vfp"><h1>${vfEsc(VF.formTitle)}</h1><p><b>Title of the Study:</b><br>${vfEsc(VF.study)}</p><p>Dear Expert Validator,</p><p>${vfEsc(VF.letter)}</p><p><b>Directions:</b> ${vfEsc(VF.directions)}</p>
    <h2>${vfEsc(VF.partA.title)}</h2><p><b>Directions:</b> ${vfEsc(VF.partA.directions)}</p>${scale(VF.partA.scale)}`;
  VF_GRADES.forEach(g => {
    h += `<h3>${vfEsc(vfPartALabel(g))}</h3><table><tr><th class="c">Item</th><th>Item Focus</th>${head4}<th>Comments or Required Revision</th></tr>` +
      VF.items[g].map((foc,i)=>{ const r = d.itemOf(g,i) || {};
        const note = r.noConcept ? '<div class="warn">Noted: learners can choose the correct answer without applying the concept.</div>' : '';
        const stop = r.played && r.completed === false ? '<div class="warn">Simulation not executed to the end.</div>' : '';
        return `<tr><td class="c">${i+1}</td><td>${vfEsc(foc)}</td>${[4,3,2,1].map(k=>`<td class="c">${vfBox(r.rating,k)}</td>`).join('')}<td>${vfEsc(r.comment||'')}${note}${stop}</td></tr>`; }).join('') + '</table>';
  });
  h += `<h2 class="pg">${vfEsc(VF.partB.title)}</h2><p><b>Directions:</b> ${vfEsc(VF.partB.directions)}</p>${scale(VF.criterion)}`;
  VF_GRADES.forEach(g => {
    const G = d.gradeOf(g) || {};
    h += `<h3>Grade ${g}</h3><table><tr><th>Validation Indicator</th>${head4}<th>Comments or Required Revision</th></tr>` +
      VF.partB.groups.map(gr => `<tr class="grp"><td colspan="6">${vfEsc(gr.name)}</td></tr>` + vfRows(gr.items.map(x=>x[0]), 4, G.ratings, G.comments, id => `${vfNumber(id)}. ${vfEsc(gr.items.find(x=>x[0]===id)[1])}`)).join('') + '</table>' +
      `<p><b>General Comments and Suggestions</b></p><div class="box">${vfEsc(G.general||'')}</div>`;
    if(G.check) h += `<p style="font-size:11.5px">Learner-view check (for Part C): ${VF.checks.map(([k,t])=>`${vfEsc(t)} — ${G.check[k] === true ? 'Yes' : G.check[k] === false ? 'No' : '—'}`).join('; ')}; score shown ${G.check.solved}/${G.check.total}.${G.check.note ? ' Note: '+vfEsc(G.check.note) : ''}</p>`;
  });
  h += `<h2 class="pg">${vfEsc(VF.partC.title)}</h2><p><b>Directions:</b> ${vfEsc(VF.partC.directions)}</p>${scale(VF.criterion)}
    <table><tr><th>${vfEsc(VF.partC.head)}</th>${head4}<th>Comments or Required Revision</th></tr>${vfRows(VF.partC.items.map(x=>x[0]), 4, C.ratings, C.comments, id => `${vfNumber(id)}. ${vfEsc(VF.partC.items.find(x=>x[0]===id)[1])}`)}</table>
    <p><b>General Comments and Suggestions</b></p><div class="box">${vfEsc(C.general||'')}</div>
    <p><b>Overall Recommendation:</b></p>${VF.recommendations.map(t=>`<p>${form.recommendation === t ? '☑' : '☐'} ${vfEsc(t)}</p>`).join('')}
    <div class="line"><b>Validator’s Name:</b><span>${vfEsc(d.name||'')}</span></div>
    <div class="line"><b>Position / Designation:</b><span>${vfEsc(form.position||'')}</span></div>
    <div class="line"><b>School:</b><span>${vfEsc(form.school||'')}</span></div>
    <div class="line"><b>Signature:</b><span>${vfSigImg(form.signature)}</span></div>
    <div class="line"><b>Date:</b><span>${vfEsc(form.date||'')}</span></div></div>`;
  return h;
}
function vfAcceptHTML(a){
  a = a || {};
  const A = VF.acceptability, ks = [5,4,3,2,1];
  return `<div class="vfp"><h1>${vfEsc(A.title)}</h1><p><b>Title of the Study:</b><br>${vfEsc(VF.study)}</p>
    <p><b>Researcher:</b><br>${A.researcher.map(vfEsc).join('<br>')}</p><p>Dear Respondent,</p><p>${vfEsc(A.letter)}</p><p><b>Directions:</b><br>${vfEsc(A.directions)}</p>
    <h3>Rating Scale</h3><table><tr><th class="c" style="width:60px">Rating</th><th>Interpretation</th></tr>${A.scale.map(([k,t])=>`<tr><td class="c" style="width:60px">${k}</td><td>${vfEsc(t)}</td></tr>`).join('')}</table>
    <h3>Acceptability Rating Sheet</h3><table><tr><th>Indicator</th><th>Description</th>${ks.map(k=>`<th class="c">${k}</th>`).join('')}<th>Comments / Suggestions</th></tr>
    ${A.items.map(([id,n,t])=>`<tr><td>${vfEsc(n)}</td><td>${vfEsc(t)}</td>${ks.map(k=>`<td class="c">${vfBox((a.ratings||{})[id],k)}</td>`).join('')}<td>${vfEsc((a.comments||{})[id]||'')}</td></tr>`).join('')}</table>
    <p><b>Overall Comments / Suggestions:</b></p><div class="box">${vfEsc(a.overall||'')}</div>
    <div class="line"><b>Evaluator Code:</b><span>${vfEsc(a.code||'')}</span></div>
    <div class="line"><b>Subject/Grade Level Taught:</b><span>${vfEsc(a.subject||'')}</span></div>
    <div class="line"><b>Signature:</b><span>${vfSigImg(a.signature)}</span></div>
    <div class="line"><b>Date:</b><span>${vfEsc(a.date||'')}</span></div></div>`;
}
function vfPrint(title, html, extraCss){
  const w = window.open('', '_blank');
  if(!w){ alert('Please allow pop-ups for this site to print the form.'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${vfEsc(title)}</title><style>body{margin:0;background:#fff}@page{margin:14mm}${VF_PRINT_CSS}${extraCss||''}</style></head><body>${html}<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
  w.document.close();
}
// In-page copies need the sheet's styles once.
function vfEnsureStyles(){
  if(document.getElementById('vf-style')) return;
  const s = document.createElement('style'); s.id = 'vf-style'; s.textContent = VF_PRINT_CSS; document.head.appendChild(s);
}
