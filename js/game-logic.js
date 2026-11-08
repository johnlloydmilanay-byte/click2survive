'use strict';
// ═══ SESSION ═══
// requireStudentSession() is async (it awaits Firebase Auth's restored state), so STUDENT
// is populated inside init() below rather than at top level; it redirects to index.html
// on its own if there's no logged-in profile.
let STUDENT = null;
let VALIDATOR = null;   // set instead of STUDENT for a validator account (js/validator.js)

function doLogout(){ if(VALIDATOR) doLogoutValidator(); else doLogoutStudent(); }

// Lightweight diagnostic hook kept so game-engine.js's misconception/telemetry
// calls (labInit, labLaunch, etc.) have something to call without needing edits there.
function logRow(outcome, mis){ /* diagnostic only — scoring lives in resultsLog below */ }

function showPhysics(){ document.getElementById('phys-modal').style.display = 'block'; }

// ═══ GAME LOGIC ═══
let GS = { grade:null, idx:0, scores:[], gd:null, answered:false, attempts:0, t0:0, pred:'', sessionId:null };
let resultsLog = []; // per-scenario results for this run, submitted to the server at the end
let panelRevealed = false; // true once the question/side-panel has faded in for this scenario
let revealTimer = null;
let narrationActive = false; // true while the pre-question story overlay is showing
let isObserving = false; // true when the student manually re-hid the panel to look around
// Centred-question flow, used for every Grade 7 scenario (and the tutorial's practice
// round): narration → ~10 s of just watching the scene → the question pops up full
// screen in large type (situation and question on the left, choices on the right),
// with a Hide/View toggle to go back and check the scene. Grades 8–10 keep the
// right-docked side panel.
const WATCH_SECONDS = 10;
let watching = false, watchTimer = null;
function centerQ(){ return !!GS && isSceneGrade(GS.grade); }
function startWatch(){
  watching = true;
  let n = WATCH_SECONDS;
  document.getElementById('qw-n').textContent = n;
  document.getElementById('q-watch').classList.add('on');
  document.getElementById('observe-btn').textContent = '📋 Show question';
  clearInterval(watchTimer);
  watchTimer = setInterval(()=>{
    if(typeof TUT!=='undefined' && TUT.on && TUT.holdWatch) return;   // tutorial is still explaining the scene
    n--;
    document.getElementById('qw-n').textContent = Math.max(0,n);
    if(n>0 && n<=5 && (typeof AudioSys!=='undefined') && AudioSys.tick) AudioSys.tick(n<=3);   // soft countdown ticks
    if(n<=0) revealQuestion();
  }, 1000);
}
function stopWatch(){
  watching = false;
  clearInterval(watchTimer); watchTimer = null;
  document.getElementById('q-watch').classList.remove('on');
}
function revealQuestion(){
  if(!watching) return;
  stopWatch();
  AudioSysSafe('reveal');
  isObserving = false;
  setCenterVisible(true);
  if(typeof tutEvent==='function') tutEvent('reveal');
}
// Shows/hides the centred popup and keeps every related control in step.
function setCenterVisible(on){
  const panel = document.getElementById('side-panel');
  panel.classList.add('q-center');
  panel.classList.toggle('panel-hidden', !on);
  panelRevealed = on;
  document.body.classList.toggle('q-open', on);
  document.getElementById('q-show').classList.toggle('on', !on && !GS.answered);
  const btn = document.getElementById('observe-btn');
  btn.classList.toggle('active', !on);
  btn.textContent = on ? '🙈 Hide question' : '📋 View question';
  if(typeof AudioSys!=='undefined' && AudioSys.musicPhase && !GS.tutorial) AudioSys.musicPhase(on ? 'question' : 'observe');
  fitCenterQ();
}
// Full-screen question, no scrolling: find the largest font size at which the
// situation/question column and the choices column both fit on this screen (binary
// search; every size in the popup is in em of this one value), then let the choices
// stretch to fill their column. Re-run on resize/rotation via fitSidePanel().
function fitCenterQ(){
  const panel = document.getElementById('side-panel');
  if(!panel.classList.contains('q-center')) return;
  const inner = document.getElementById('side-panel-inner');
  const cols = [document.getElementById('q-left'), document.getElementById('choices')];
  panel.classList.remove('fitted');
  panel.classList.add('measuring');
  const fit = (el, setPx, test, lo, hi)=>{
    setPx(hi); if(test()) return hi;
    for(let k=0;k<14;k++){ const m = (lo+hi)/2; setPx(m); if(test()) lo = m; else hi = m; }
    setPx(lo); return lo;
  };
  const ok = (c)=> c.scrollHeight <= c.clientHeight + 1 && c.scrollWidth <= c.clientWidth + 1;
  // Cap scales with the screen so a big monitor doesn't get comically huge text.
  const cap = Math.max(16, Math.min(34, Math.min(innerWidth/38, innerHeight/18)));
  const L = cols[0], C = cols[1];
  L.style.fontSize = '';
  // 1) the whole popup (choices are usually the limiting column)
  // Floor of 8px is only ever reached by unusually long items on the smallest phones —
  // fitting on screen beats scrolling for these learners.
  const base = fit(inner, px=>{ inner.style.fontSize = px+'px'; }, ()=>ok(C) && ok(L), 8, cap);
  // 2) then let the situation/question column grow on its own into any spare room
  fit(L, px=>{ L.style.fontSize = px+'px'; }, ()=>ok(L), base, Math.min(cap*1.2, base*1.35));
  panel.classList.add('fitted');
  void panel.offsetHeight;                 // apply the final layout before transitions come back
  panel.classList.remove('measuring');
}
function resetCenterQ(){
  stopWatch();
  const panel = document.getElementById('side-panel');
  panel.classList.remove('q-center','fitted','measuring');
  document.getElementById('side-panel-inner').style.fontSize = '';
  document.getElementById('q-left').style.fontSize = '';
  document.body.classList.remove('q-open');
  document.getElementById('q-show').classList.remove('on');
  document.getElementById('story-overlay').classList.toggle('big', centerQ());
}
const LAB_MAX_ATTEMPTS = 3; // Grade 9 hands-on lab: cap retries so a stuck student still moves on

// ═══ SESSION GATE ═══
// A student can't just start playing whenever — a teacher has to open a session for
// their section first (see the teacher dashboard's Sessions panel). This listens live
// so the "Enter Session" button appears the moment the teacher starts one, with no
// refresh needed, and disappears again if the teacher ends it before the student joins.
let currentSessionId = null;
let currentSessionLabel = '';
let sessionWatchUnsub = null;

function watchForActiveSession(){
  if (sessionWatchUnsub) sessionWatchUnsub();
  document.getElementById('wait-section-name').textContent = STUDENT.sectionName || 'your section';
  sessionWatchUnsub = db.collection('sessions')
    .where('sectionId','==',STUDENT.sectionId)
    .where('status','==','active')
    .onSnapshot(snap => {
      const doc = snap.docs[0]; // auto-close-previous on start means at most one is active
      currentSessionId = doc ? doc.id : null;
      currentSessionLabel = doc ? (doc.data().label || 'Session') : '';
      document.getElementById('session-waiting').style.display = currentSessionId ? 'none' : 'flex';
      document.getElementById('session-ready').style.display = currentSessionId ? 'block' : 'none';
      if (currentSessionId) document.getElementById('ready-session-label').textContent = currentSessionLabel;
      fitMenuHistory();
    }, err => {
      document.getElementById('wait-section-name').textContent = 'your section (' + err.message + ')';
    });
}

function attemptScore(base){
  return +(base * Math.max(.5, Math.pow(1/GS.attempts, .3))).toFixed(2);
}

function recordResult(entry){
  if(GS.tutorial || GS.validator) return;          // practice round / validation play: never scored or saved
  resultsLog.push(Object.assign({
    scenarioIndex: GS.idx,
    melc: GS.gd.melc || '',
    // Grade 7 items each target one competency, so tag results per item for item analysis.
    concept: (GS.gd.scenarios[GS.idx] && GS.gd.scenarios[GS.idx].concept) || GS.gd.concept || '',
    timeSeconds: Math.round((Date.now()-GS.t0)/1000)
  }, entry));
}

function renderStartCard(){
  const g = STUDENT.grade;
  const gd = GRADES[g];
  document.getElementById('start-card').style.setProperty('--cc', gd.color);
  document.getElementById('start-num').textContent = g;
  document.getElementById('start-num').style.color = gd.color;
  document.getElementById('start-topic').textContent = gd.topic;
  document.getElementById('start-code').textContent = [gd.melc, gd.scenarios.length + ' scenarios'].filter(Boolean).join(' · ');
  document.getElementById('tb-profile').textContent =
    `${STUDENT.name} · Grade ${g}${STUDENT.sectionName ? ' · ' + STUDENT.sectionName : ''}`;
}

// Landscape phones: show only the recent-attempt rows that fit under the session card,
// so the card and its Enter button are never pushed off screen.
function fitMenuHistory(){
  const box = document.getElementById('history-box');
  if(!box || box.style.display === 'none') return;
  const rows = [...box.querySelectorAll('.history-row')];
  rows.forEach(r=> r.style.display = '');
  box.classList.remove('hist-off');
  if(!matchMedia('(orientation:landscape) and (max-height:700px)').matches) return;
  // The box can shrink inside its column, so measure what's clipped inside it as well
  // as whether it sticks out of the column.
  const col = box.parentElement;
  const over = ()=> box.scrollHeight > box.clientHeight + 1 || col.scrollHeight > col.clientHeight + 1;
  for(let i = rows.length-1; i >= 0 && over(); i--) rows[i].style.display = 'none';
  if(over() || !rows.some(r=>r.style.display !== 'none')) box.classList.add('hist-off');   // out of the layout, so the card re-centres
}
async function loadHistory(){
  try{
    const snap = await db.collection('students').doc(STUDENT.studentId)
      .collection('history').orderBy('finishedAt','desc').limit(5).get();
    const box = document.getElementById('history-box');
    const rows = document.getElementById('history-rows');
    if(snap.empty){ box.style.display = 'none'; return; }
    rows.innerHTML = snap.docs.map(doc => {
      const a = doc.data();
      const date = new Date(a.finishedAt).toLocaleDateString();
      return `<div class="history-row"><span>${date} · Grade ${a.grade}</span><span>${a.solvedCount}/${a.totalScenarios} correct · ${a.percentScore.toFixed(0)}%</span></div>`;
    }).join('');
    box.style.display = 'block';
    fitMenuHistory();
  }catch(e){ /* history is a nice-to-have; ignore failures */ }
}

// Best-effort: ask the browser to go fullscreen (hides the URL bar and the rest of the
// browser chrome) — only on a touch/mobile device, and only called directly from a
// click handler, since the Fullscreen API requires genuine user activation and just
// silently no-ops otherwise. iOS Safari doesn't support whole-page Fullscreen at all
// (an Apple platform restriction no website can work around); there this is a harmless
// no-op and the page just runs in Safari's normal (already fairly minimal) chrome.
// Best-effort: most browsers only allow screen.orientation.lock() inside an active
// fullscreen context, and support itself is inconsistent (Android Chrome yes, iOS
// Safari has no whole-page Fullscreen or lock API at all) — silent no-op elsewhere,
// leaving the CSS rotate-prompt overlay as the reliable fallback for those cases.
function lockLandscapeIfSupported(){
  try{
    const lock = screen.orientation && screen.orientation.lock;
    if (lock) lock.call(screen.orientation, 'landscape').catch(()=>{});
  }catch(e){ /* unsupported — harmless no-op */ }
}
function requestFullscreenIfMobile(){
  const isTouchDevice = matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 0;
  if (!isTouchDevice) return;
  if (document.fullscreenElement || document.webkitFullscreenElement){ lockLandscapeIfSupported(); return; }
  const el = document.documentElement;
  try{
    const result = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' })
                 : (el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : null);
    if (result && result.then) result.then(lockLandscapeIfSupported).catch(()=>{});
    else lockLandscapeIfSupported();
  }catch(e){ /* denied/unsupported — harmless no-op */ }
}

function enterSession(){
  if (!currentSessionId) return; // button shouldn't be visible/clickable without one, but guard anyway
  requestFullscreenIfMobile(); // call first, synchronously, while the click's gesture is still "live"
  const sessionId = currentSessionId, sessionLabel = currentSessionLabel;
  if(typeof needsTutorial==='function' && needsTutorial()){
    // First time on this account: guided practice round first, then the real session.
    startTutorial(()=>{ showScreen('s-game'); startGrade(STUDENT.grade, sessionId, sessionLabel); });
    return;
  }
  transitionTo(()=>{
    showScreen('s-game');
    startGrade(STUDENT.grade, sessionId, sessionLabel);
  });
}

// opts.tutorial runs the unscored practice round (opts.gd = its one practice scenario).
function startGrade(g, sessionId, sessionLabel, opts){
  opts = opts || {};
  GS = { grade:g, idx:0, scores:[], gd:opts.gd || GRADES[g], answered:false, attempts:0, t0:Date.now(), pred:'', sessionId, sessionLabel, tutorial:!!opts.tutorial, validator:!!opts.validator };
  resultsLog = [];
  // music: upbeat loop for the practice round; real scenarios get their own scene score (see loadScenario)
  if(typeof AudioSys!=='undefined'){ AudioSys.init(); if(GS.tutorial) AudioSys.startMusic('bright'); }
  applyTier();
  G10Wind = 0;
  document.getElementById('hud-ico').style.background = GS.gd.color;
  showScreen('s-game');
  setupHUD(g);
  loadScenario(opts.idx || 0);
  const tut = document.getElementById('tutorial');
  tut.style.display = 'block';
  setTimeout(()=>tut.style.display='none', 4500);
}
function setupHUD(g){
  document.getElementById('hud-grade').textContent = GS.gd.name;
  document.getElementById('hud-topic').textContent = GS.gd.topic;
  document.getElementById('score-t').textContent = GS.gd.scenarios.length;
  updateScore();
  const dc = document.getElementById('dots'); dc.innerHTML = '';
  for(let i=0;i<GS.gd.scenarios.length;i++){
    const d = document.createElement('div');
    d.className = 'dot'+(i===0?' cur':''); d.id = 'dot-'+i;
    dc.appendChild(d);
  }
}
function updateDots(){
  for(let i=0;i<GS.gd.scenarios.length;i++){
    const d = document.getElementById('dot-'+i); if(!d) continue;
    d.className = 'dot'+(i<GS.idx?' done':i===GS.idx?' cur':'');
  }
}
function updateScore(){
  document.getElementById('score-n').textContent = GS.scores.length;
}

// Wraps optional Bikol dialect text as an italicized subtitle under the English text.
// Returns just the English (escaped) when no translation is provided for this scenario.
function bilingualHTML(en, bi){
  const esc = s => String(s==null?'':s).replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  return esc(en) + (bi ? `<span class="bikol-text">(${esc(bi)})</span>` : '');   // Bikol always shown in parentheses
}

// Cinematic "movie-style" beat before the question demands a decision: letterboxed
// bars + a fading subtitle-style caption narrating the scenario (English, with the
// Bikol dialect underneath when the scenario provides it), auto-advancing after
// ~15 seconds into the normal question panel (or sooner if the student taps Skip) —
// long enough to actually read both languages and take in the scene, not just a beat.
function showNarration(scen){
  narrationActive = true;
  const overlay = document.getElementById('story-overlay');
  document.getElementById('story-num').textContent = `Scenario ${GS.idx+1} of ${GS.gd.scenarios.length}`;
  document.getElementById('story-en').textContent = scen.sit;
  const bi = document.getElementById('story-bi');
  bi.textContent = scen.sit_bi ? `(${scen.sit_bi})` : '';
  overlay.classList.add('on');
  AudioSysSafe('narration');
  clearTimeout(revealTimer);
  revealTimer = setTimeout(endNarration, 15000);
}
function endNarration(){
  if(!narrationActive) return;
  narrationActive = false;
  clearTimeout(revealTimer);
  if(NARR.btn && NARR.btn.id === 'story-listen') narrStop();
  document.getElementById('story-overlay').classList.remove('on');
  if(typeof tutEvent==='function') tutEvent('narrationEnd');
  if(centerQ()){ startWatch(); return; }
  if(!isObserving){
    document.getElementById('side-panel').classList.remove('panel-hidden');
    panelRevealed = true;
    if(typeof AudioSys!=='undefined' && AudioSys.musicPhase && !GS.tutorial) AudioSys.musicPhase('question');
  }
}
function skipNarration(){ AudioSysSafe('click'); endNarration(); }

// ── Optional read-aloud narration (accessibility) ──
// Scenarios with recordings (scen.narr) get a 🔊 Listen button on the story screen and
// on the question screen. It plays English first, then Bikol, through Web Audio (works on
// iPhone after the first tap); tapping again stops it. The story doesn't auto-advance
// while it's being read.
const NARR = { token:0, btn:null };
function narrLabel(btn, playing){ btn.textContent = playing ? '⏹ Stop' : '🔊 Listen'; btn.classList.toggle('playing', playing); }
function narrStop(){
  NARR.token++;
  try{ if(typeof AudioSys!=='undefined'){ AudioSys.stopVoice(); AudioSys.duck(false); } }catch(e){}
  if(NARR.btn) narrLabel(NARR.btn, false);
  NARR.btn = null;
}
async function narrPlay(list, btn, onDone){
  narrStop();
  if(typeof AudioSys==='undefined' || !list || !list.length) return;
  const token = NARR.token; NARR.btn = btn; narrLabel(btn, true);
  AudioSys.init(); AudioSys.duck(true);
  for(const url of list){
    if(token !== NARR.token) return;
    const buf = await AudioSys.loadVoice(url).catch(()=>null);
    if(token !== NARR.token) return;
    if(!buf) continue;
    await new Promise(res=> AudioSys.playVoice(buf, res));
    if(token !== NARR.token) return;
    await new Promise(r=>setTimeout(r, 450));          // a breath between English and Bikol
  }
  if(token === NARR.token){ narrStop(); if(onDone) onDone(); }
}
function narrPreload(scen){
  if(!scen || !scen.narr || typeof AudioSys==='undefined') return;
  [...(scen.narr.sit||[]), ...(scen.narr.q||[])].forEach(u=> AudioSys.loadVoice(u).catch(()=>{}));
}
function listenStory(){
  const btn = document.getElementById('story-listen'), scen = GS.gd.scenarios[GS.idx];
  if(NARR.btn === btn){ narrStop(); return; }
  clearTimeout(revealTimer);                            // don't move on while it's being read
  narrPlay(scen.narr && scen.narr.sit, btn, ()=>{ if(narrationActive){ clearTimeout(revealTimer); revealTimer = setTimeout(endNarration, 1800); } });
}
function listenQuestion(){
  const btn = document.getElementById('qh-listen'), scen = GS.gd.scenarios[GS.idx];
  if(NARR.btn === btn){ narrStop(); return; }
  narrPlay(scen.narr && scen.narr.q, btn);
}

// Manual re-hide toggle: lets a student who has already seen the question hide the
// side panel again to take another look at the 3D scene, without re-triggering the
// story overlay or losing their place. Disabled/ignored while the narration itself
// is still playing (Skip already covers that case).
function toggleMuteAudio(){
  if(typeof AudioSys==='undefined') return;
  const muted = AudioSys.toggleMute();
  const btn = document.getElementById('mute-btn');
  btn.textContent = muted ? '🔇' : '🔊';
  btn.classList.toggle('muted', muted);
}

function toggleObserve(){
  if(narrationActive) return;
  if(centerQ()){
    if(watching){ revealQuestion(); return; }       // header button doubles as "show now"
    if(GS.answered) return;
    if(typeof tutAllows==='function' && !tutAllows('toggleQuestion')) return;
    AudioSysSafe('click');
    isObserving = !isObserving;
    setCenterVisible(!isObserving);
    if(typeof tutEvent==='function') tutEvent(isObserving ? 'hide' : 'view');
    return;
  }
  AudioSysSafe('click');
  isObserving = !isObserving;
  const panel = document.getElementById('side-panel');
  const btn = document.getElementById('observe-btn');
  if(isObserving){
    panel.classList.add('panel-hidden');
    panelRevealed = false;
    btn.classList.add('active');
    btn.textContent = '▶ Resume';
  } else {
    panel.classList.remove('panel-hidden');
    panelRevealed = true;
    btn.classList.remove('active');
    btn.textContent = '👁 Observe';
  }
}

const CHOICE_LETTERS = ['A','B','C','D','E'];
// Freeze every scenario's choice list so nothing can reorder it at runtime, and check
// that each item's correct index still points at the instrument's answer-key letter.
Object.values(GRADES).forEach(gd=>gd.scenarios.forEach((sc,n)=>{
  if(sc.opts){ Object.freeze(sc.opts); if(sc.opts_bi) Object.freeze(sc.opts_bi); }
  if(sc.key && CHOICE_LETTERS[sc.ci] !== sc.key)
    console.error(`${gd.name} item ${n+1}: answer index ${sc.ci} (${CHOICE_LETTERS[sc.ci]}) does not match answer key ${sc.key}`);
}));
// ── Item scene themes (Grades 7, 11, 12) ── one musical idea per scenario, matched to its story
// (MIDI note numbers; chords loop one per bar). Mood sets the instrument family.
const G7_THEMES = {
  // 1 · floodwater pushing the trash bin — hopeful but alert, steady "pushing" pulse
  trashbin:   { mood:'flood',   intensity:.55, theme:{ bpm:92,  chords:[[57,60,64],[53,57,60],[48,52,55],[55,59,62]] } },            // Am F C G
  // 2 · hanging sign tilting — tense; each phrase ends unresolved on the dominant (A major)
  sign:       { mood:'typhoon', intensity:.62, theme:{ bpm:100, chords:[[50,53,57],[46,50,53],[43,46,50],[45,49,52]] } },           // Dm B♭ Gm A
  // 3 · choosing Route A or B — thoughtful, hopeful journey; flowing melody
  route:      { mood:'flood',   intensity:.45, theme:{ bpm:88,  chords:[[52,55,59],[48,52,55],[55,59,62],[50,54,57]], arp:[0,1,2,1,0,2,1,2] } }, // Em C G D
  // 4 · fallen tree, long detour — driving, determined storm theme
  fallentree: { mood:'typhoon', intensity:.7,  theme:{ bpm:106, chords:[[50,53,57],[46,50,53],[53,57,60],[48,52,55]] } },           // Dm B♭ F C
  // 5 · floating bottle, current speeding up — flowing theme whose tempo keeps accelerating
  bottle:     { mood:'flood',   intensity:.75, theme:{ bpm:90,  chords:[[57,60,64],[55,59,62],[53,57,60],[52,56,59]], accel:{ to:1.22, bars:8 } } }, // Am G F E
  // 6 · wind 40 → 65 → 90 km/h — storm theme; intensity rises with each weather update (see grade7-scenes.js)
  windupdate: { mood:'typhoon', intensity:.45, theme:{ bpm:104, chords:[[50,53,57],[48,52,55],[46,50,53],[45,49,52]] } },           // Dm C B♭ A
  // ── Grade 11 (shs-scenes.js) ──
  // rolling container / wheel — a rolling, circling arpeggio
  drum:       { mood:'flood',   intensity:.6,  theme:{ bpm:96,  chords:[[57,60,64],[55,59,62],[53,57,60],[55,59,62]], arp:[0,1,2,1,0,1,2,1] } }, // Am G F G
  wheel:      { mood:'typhoon', intensity:.62, theme:{ bpm:102, chords:[[50,53,57],[48,52,55],[46,50,53],[48,52,55]], arp:[0,1,2,1,0,1,2,1] } }, // Dm C B♭ C
  // ramp / lever — steady, purposeful work rhythm
  ramp:       { mood:'flood',   intensity:.45, theme:{ bpm:90,  chords:[[48,52,55],[53,57,60],[55,59,62],[48,52,55]] } },            // C F G C
  lever:      { mood:'typhoon', intensity:.5,  theme:{ bpm:94,  chords:[[50,53,57],[55,58,62],[46,50,53],[45,49,52]] } },           // Dm Gm B♭ A
  // tilting boat / floating container — uneasy, swaying
  tiltboat:   { mood:'flood',   intensity:.6,  theme:{ bpm:84,  chords:[[52,55,59],[53,57,60],[52,55,59],[50,53,57]] } },           // Em F Em Dm
  floatbox:   { mood:'typhoon', intensity:.72, theme:{ bpm:108, chords:[[57,60,64],[53,57,60],[55,59,62],[52,56,59]], accel:{ to:1.12, bars:8 } } }, // Am F G E
  // ── Grade 12 ──
  boatdrift:  { mood:'flood',   intensity:.68, theme:{ bpm:98,  chords:[[57,60,64],[55,59,62],[53,57,60],[52,56,59]], accel:{ to:1.15, bars:8 } } }, // Am G F E
  cartramp:   { mood:'flood',   intensity:.45, theme:{ bpm:92,  chords:[[55,59,62],[48,52,55],[50,54,57],[55,59,62]] } },           // G C D G
  panel:      { mood:'typhoon', intensity:.72, theme:{ bpm:106, chords:[[50,53,57],[46,50,53],[48,52,55],[45,49,52]] } },          // Dm B♭ C A
  momentum:   { mood:'flood',   intensity:.62, theme:{ bpm:94,  chords:[[52,55,59],[48,52,55],[50,54,57],[47,51,54]] } },          // Em C D B
  barrier:    { mood:'typhoon', intensity:.66, theme:{ bpm:104, chords:[[50,53,57],[48,52,55],[46,50,53],[45,49,52]] } },          // Dm C B♭ A
  // ── Grade 8 (jhs-scenes.js) ──
  channel:    { mood:'flood',   intensity:.6,  theme:{ bpm:94,  chords:[[57,60,64],[55,59,62],[53,57,60],[52,56,59]], accel:{ to:1.18, bars:8 } } }, // Am G F E
  roofslide:  { mood:'typhoon', intensity:.64, theme:{ bpm:102, chords:[[50,53,57],[46,50,53],[48,52,55],[45,49,52]], accel:{ to:1.15, bars:8 } } }, // Dm B♭ C A
  logbottle:  { mood:'flood',   intensity:.6,  theme:{ bpm:92,  chords:[[52,55,59],[48,52,55],[50,54,57],[47,51,54]] } },          // Em C D B
  flowerpot:  { mood:'typhoon', intensity:.5,  theme:{ bpm:96,  chords:[[50,53,57],[55,58,62],[53,57,60],[45,49,52]] } },          // Dm Gm F A
  stuckbox:   { mood:'flood',   intensity:.42, theme:{ bpm:88,  chords:[[48,52,55],[53,57,60],[55,59,62],[48,52,55]] } },          // C F G C
  platform:   { mood:'typhoon', intensity:.6,  theme:{ bpm:100, chords:[[50,53,57],[48,52,55],[46,50,53],[45,49,52]] } },          // Dm C B♭ A
  // ── Grade 9 ──
  boatstop:   { mood:'flood',   intensity:.5,  theme:{ bpm:90,  chords:[[57,60,64],[53,57,60],[48,52,55],[55,59,62]] } },          // Am F C G
  vehiclestop:{ mood:'typhoon', intensity:.55, theme:{ bpm:104, chords:[[50,53,57],[48,52,55],[53,57,60],[45,49,52]] } },          // Dm C F A
  twocontainers:{ mood:'flood', intensity:.55, theme:{ bpm:94,  chords:[[52,55,59],[48,52,55],[55,59,62],[50,54,57]] } },          // Em C G D
  roofboard:  { mood:'typhoon', intensity:.66, theme:{ bpm:106, chords:[[50,53,57],[46,50,53],[43,46,50],[45,49,52]] } },          // Dm B♭ Gm A
  boatstep:   { mood:'flood',   intensity:.45, theme:{ bpm:86,  chords:[[48,52,55],[57,60,64],[53,57,60],[55,59,62]], arp:[0,1,2,1,0,2,1,2] } }, // C Am F G
  branchspring:{ mood:'typhoon', intensity:.55, theme:{ bpm:96, chords:[[50,53,57],[55,58,62],[46,50,53],[45,49,52]] } },          // Dm Gm B♭ A
  // ── Grade 10 ──
  ropethrow:  { mood:'flood',   intensity:.55, theme:{ bpm:96,  chords:[[48,52,55],[55,59,62],[57,60,64],[53,57,60]], arp:[0,1,2,1,0,1,2,1] } }, // C G Am F
  roofproj:   { mood:'typhoon', intensity:.7,  theme:{ bpm:106, chords:[[50,53,57],[46,50,53],[48,52,55],[45,49,52]] } },          // Dm B♭ C A
  fender:     { mood:'flood',   intensity:.5,  theme:{ bpm:90,  chords:[[52,55,59],[48,52,55],[50,54,57],[52,55,59]] } },          // Em C D Em
  inelastic:  { mood:'typhoon', intensity:.66, theme:{ bpm:104, chords:[[50,53,57],[48,52,55],[46,50,53],[45,49,52]] } }           // Dm C B♭ A
};
function loadScenario(idx){
  const scen = GS.gd.scenarios[idx];
  if(!scen){ transitionTo(showResults); return; }
  GS.idx = idx; GS.answered = false;
  GS.attempts = 0; GS.t0 = Date.now(); GS.pred = '';
  gatewayActive = gatewayPassed = false;
  ctrl.on = false; ctrl.done = false;
  document.getElementById('fb-wrap').classList.remove('on');
  document.getElementById('gate-prompt').style.display = 'none';
  document.getElementById('mission').style.display = 'none';
  ['scen-card','choices','dots','observe-btn'].forEach(id=>{ document.getElementById(id).style.display = ''; });
  document.querySelector('.joy-label').textContent = '⟁ Look';

  // Reset the observe toggle for the new scenario, then play the ~3s story-narration
  // beat before the question panel demands a decision. panelRevealed gates answering +
  // the "1/2/3" keyboard shortcuts so nothing is clickable while hidden/narrating.
  isObserving = false;
  const observeBtn = document.getElementById('observe-btn');
  observeBtn.classList.remove('active');
  observeBtn.textContent = '👁 Observe';
  panelRevealed = false;
  document.getElementById('side-panel').classList.add('panel-hidden');
  resetCenterQ();
  narrStop();
  const hasNarr = !!(scen.narr);
  document.getElementById('story-listen').style.display = hasNarr && scen.narr.sit ? '' : 'none';
  document.getElementById('qh-listen').style.display = hasNarr && scen.narr.q ? '' : 'none';
  narrPreload(scen);
  document.getElementById('qh-title').textContent = `Scenario ${idx+1} of ${GS.gd.scenarios.length}`;
  showNarration(scen);
  updateDots();
  document.getElementById('sc-num').textContent = `Scenario ${idx+1} of ${GS.gd.scenarios.length}`;
  document.getElementById('sc-sit').innerHTML = bilingualHTML(scen.sit, scen.sit_bi);
  document.getElementById('sc-q').innerHTML = scen.lab ? bilingualHTML(scen.objective||'', scen.objective_bi) : bilingualHTML(scen.q, scen.q_bi);
  const ce = document.getElementById('choices'); ce.innerHTML = '';
  if(scen.lab){
    labInit(scen);
  } else {
    // Choices render in their fixed source order (never shuffled), so A–D here are the
    // same letters as in the teacher's instrument and the answer key.
    scen.opts.forEach((o,i)=>{
      const L = CHOICE_LETTERS[i];
      const b = document.createElement('button');
      b.className = 'ch-btn';
      b.setAttribute('aria-label', 'Answer '+L+': '+o);
      const biOpt = scen.opts_bi && scen.opts_bi[i];
      b.innerHTML = `<span class="ch-letter">${L}.</span><span class="ch-body">${bilingualHTML(o, biOpt)}</span>`;
      b.onclick = ()=>handleChoice(i);
      ce.appendChild(b);
    });
  }
  document.getElementById('val-rate-now').hidden = true;
  if(GS.validator && !scen.lab && typeof valMarkAnswer === 'function') valMarkAnswer(scen);   // validator: answer key shown
  updateParams(scen);
  updatePAGASA(scen);
  const g = GS.grade;
  // Environmental ambience matches the hazard driving each grade's scenarios — wind
  // for Grade 10's bridge, rain for Grade 8's river, flowing water for Grade 7's
  // flood crossing, and a calm dock/water loop for Grade 9's lab — loudness scales
  // with the scenario's own severity value so a 110km/h scene sounds stormier than a
  // 30km/h one, same idea as the visual PAGASA alert.
  if(typeof AudioSys!=='undefined'){
    if(isSceneGrade(g)) scen.hazard==='typhoon' ? AudioSys.setAmbience('wind', (scen.wind||60)/110) : AudioSys.setAmbience('water', .7);
    else if(g===8) AudioSys.setAmbience('rain', (scen.rain||10)/40);
    else if(g===9) AudioSys.setAmbience('water', .3);
    else AudioSys.setAmbience('wind', (scen.wind||30)/110);
    // Grade 7: each scenario has its own theme (G7_THEMES); Grades 8–10 keep the calm pad.
    if(!GS.tutorial){
      if(isSceneGrade(g) && AudioSys.sceneMusic && G7_THEMES[scen.scene]) AudioSys.sceneMusic(Object.assign({ phase:'observe', key:'g7-'+scen.scene }, G7_THEMES[scen.scene]));
      else AudioSys.startMusic('calm');
    }
  }
  try{
    if(isSceneGrade(g)) buildGrade7Scene(scen);
    else if(g===8) buildFloodScene(scen,8);
    else if(g===9) buildBoatScene(scen);
    else buildBridgeScene(scen);
  }catch(e){
    // The question/answer flow is fully usable without the 3D backdrop, so a broken
    // scene-builder shouldn't block the student from playing — but a silent failure
    // here is exactly what makes a black canvas so confusing, so surface it plainly.
    console.error('Scene build failed for grade '+g+', scenario '+idx+':', e);
    showRendererError('The 3D scene for this scenario failed to load, but you can still answer below.');
  }
  updateHapticLEDs(scen.out);
  fitSidePanel();
}

// Last-resort guarantee against a scrollbar, on top of the static compact-tier CSS:
// bilingual (English+Bikol) text roughly doubles content length, and a handful of
// scenarios (e.g. a 4-option question with an unusually long correct-answer
// explanation in both languages) can still be taller than the panel on the smallest
// real landscape-phone viewports even after that tightening. Rather than keep shaving
// font sizes globally (which would make the *common* case needlessly cramped), shrink
// just this one scenario's content via `zoom` until it actually fits.
function fitSidePanel(){
  const inner = document.getElementById('side-panel-inner');
  const panel = document.getElementById('side-panel');
  if(!inner || !panel) return;
  inner.style.zoom = '';
  if(panel.classList.contains('q-center')){ fitCenterQ(); return; }   // full-screen question sizes itself
  const overflow = panel.scrollHeight - panel.clientHeight;
  if(overflow > 1){
    // Floor of .62 keeps text legible even in the worst case; if that's still not
    // enough, #side-panel's overflow-y:auto remains as the final safety net.
    const ratio = Math.max(.62, panel.clientHeight / panel.scrollHeight);
    inner.style.zoom = ratio;
  }
}

function updateHapticLEDs(out){
  document.querySelectorAll('.hled').forEach(l=>{
    l.classList.remove('danger','risky');
    if(out==='unsafe') l.classList.add('danger');
    else if(out==='risky') l.classList.add('risky');
  });
}

function paramRow(label, valStr, num, safeMax, riskyMax, maxV){
  let cls='c-safe',b='b-safe',st='SAFE',stc='st-safe';
  if(num>riskyMax){cls='c-unsafe';b='b-unsafe';st='UNSAFE';stc='st-unsafe';}
  else if(num>safeMax){cls='c-risky';b='b-risky';st='RISKY';stc='st-risky';}
  const pct = Math.min(100,(num/maxV)*100);
  return `<div class="pp-row"><div class="pp-head"><span class="pp-label">${label}</span><span class="pp-val ${cls}">${valStr}</span></div>
    <div class="pp-bw"><div class="pp-b ${b}" style="width:${pct}%"></div></div>
    <div style="text-align:right"><span class="pp-st ${stc}">${st}</span></div></div>`;
}
function updateParams(scen){
  const p = document.getElementById('params-panel');
  p.style.display = 'block';
  let h = '<div class="pp-title">Live Conditions</div>';
  if(scen.lab){
    const w = scen.world;
    h = '<div class="pp-title">World Constants</div>' +
      `<div class="pp-row"><div class="pp-head"><span class="pp-label">Water density ρ</span><span class="pp-val ${scen.salt?'c-risky':'c-safe'}">${w.rho} kg/m³</span></div></div>` +
      `<div class="pp-row"><div class="pp-head"><span class="pp-label">Hull volume V</span><span class="pp-val">${w.hullV} m³</span></div></div>` +
      `<div class="pp-row"><div class="pp-head"><span class="pp-label">Hull mass</span><span class="pp-val">${w.hullM} kg</span></div></div>` +
      `<div class="pp-row"><div class="pp-head"><span class="pp-label">Per person</span><span class="pp-val">${w.pM} kg</span></div></div>` +
      `<div class="pp-row"><div class="pp-head"><span class="pp-label">g</span><span class="pp-val">9.81 m/s²</span></div></div>`;
    p.innerHTML = h; return;
  }
  if(scen.live){
    // Grade 7: the conditions each item describes, rather than numeric thresholds —
    // except the wind updates, which are shown as bars so the rise is visible at a glance.
    const col = {safe:'c-safe',risky:'c-risky',unsafe:'c-unsafe'};
    if(scen.windSteps) scen.windSteps.forEach((w,i)=>{ h += paramRow('Weather update '+(i+1), w+' km/h', w,59,100,120); });
    else scen.live.forEach(r=>{ h += `<div class="pp-row"><div class="pp-head"><span class="pp-label">${r.l}</span><span class="pp-val ${col[r.s]||''}">${r.v}</span></div></div>`; });
    h = h.replace('Live Conditions', scen.comp ? 'Live Conditions · '+scen.comp : 'Live Conditions');
    p.innerHTML = h; return;
  }
  if(scen.depth!==undefined) h += paramRow('Water Depth', scen.depth.toFixed(2)+'m', scen.depth,.29,.5,1);
  if(scen.vel!==undefined) h += paramRow('Current', scen.vel.toFixed(1)+' m/s', scen.vel,.49,1,2);
  if(scen.rain!==undefined) h += paramRow('Rainfall', scen.rain+' mm/hr', scen.rain,14.9,30,50);
  if(scen.cap!==undefined){
    let cls='c-safe',b='b-safe',st='SAFE',stc='st-safe';
    if(scen.load>scen.cap){cls='c-unsafe';b='b-unsafe';st='OVERLOAD';stc='st-unsafe';}
    else if(scen.load===scen.cap){cls='c-risky';b='b-risky';st='AT LIMIT';stc='st-risky';}
    if(['uneven','standing','shifting'].includes(scen.dist)){cls='c-risky';b='b-risky';st=scen.dist.toUpperCase();stc='st-risky';}
    const pct = Math.min(100,(scen.load/(scen.cap+2))*100);
    h += `<div class="pp-row"><div class="pp-head"><span class="pp-label">Boat Load</span><span class="pp-val ${cls}">${scen.load} / ${scen.cap}</span></div>
      <div class="pp-bw"><div class="pp-b ${b}" style="width:${pct}%"></div></div>
      <div style="text-align:right"><span class="pp-st ${stc}">${st}</span></div></div>`;
  }
  if(scen.wind!==undefined) h += paramRow('Wind Speed', scen.wind+' km/h', scen.wind,59,100,150);
  p.innerHTML = h;
}
function updatePAGASA(scen){
  const a = document.getElementById('pagasa-alert');
  a.style.display = 'none';
  function set(txt, bc, tc){ a.style.display='block'; a.textContent=txt; a.style.borderColor=bc; a.style.color=tc; }
  if(scen.hazard==='flood'){
    set('🌊 FLOOD — Moving floodwater','#f97316','#fdba74');
  } else if(scen.rain!==undefined){
    if(scen.rain>30) set('🔴 PAGASA RED — Severe Flooding','#ef4444','#fca5a5');
    else if(scen.rain>15) set('🟠 PAGASA ORANGE — Flooding Likely','#f97316','#fdba74');
    else if(scen.rain>7.5) set('🟡 PAGASA YELLOW — Possible Flooding','#eab308','#fde047');
  } else if(scen.wind!==undefined){
    if(scen.wind>100) set('💨 TYPHOON SIGNAL — Extreme Wind','#ef4444','#fca5a5');
    else if(scen.wind>60) set('💨 STRONG WIND WARNING','#f97316','#fdba74');
    else if(scen.wind>30) set('🌬 Moderate Wind — Caution','#eab308','#fde047');
  }
}

// Single-attempt quiz flow: right answer rewards you with the 3D "take control" drive;
// a wrong answer immediately reveals the correct choice and physics, then moves on —
// no forced retries, so a stuck student is never blocked from progressing.
function handleChoice(i){
  if(GS.answered || !panelRevealed) return;
  narrStop();
  if(typeof tutAllows==='function' && !tutAllows('answer')) return;
  const scen = GS.gd.scenarios[GS.idx];
  if(GS.validator && i !== scen.ci) return;       // validator: only the answer key is playable
  GS.answered = true;
  const ok = i === scen.ci;
  GS.attempts = 1;
  const btns = document.querySelectorAll('.ch-btn');
  const gp = document.getElementById('gate-prompt');
  gp.style.display = centerQ() ? 'none' : 'block';   // it would sit on top of the centred popup
  if(centerQ()) document.getElementById('q-show').classList.remove('on');

  btns.forEach((b,j)=>{
    if(j===scen.ci) b.classList.add('correct');
    else if(j===i && !ok) b.classList.add('wrong');
    b.classList.add('disabled');
  });

  recordResult({ outcome: ok?'correct':'incorrect', chosenOption:i, correctOption:scen.ci, score: ok?1:0 });
  if(typeof tutEvent==='function') tutEvent('answer');

  if(ok){
    GS.scores.push(1);
    updateScore();
    gatewayActive = true;
    gp.style.borderColor = 'rgba(56,189,248,.5)';
    document.getElementById('gp-text').textContent = '✓ Gateway Unlocked';
    document.getElementById('gp-hint').textContent = 'Steer through to advance';
    hapticBuzz(true);
    AudioSysSafe('correct');
    setTimeout(()=>AudioSysSafe('score'), 380);
    setTimeout(()=>showFeedback(true, scen), 900);
  } else {
    GS.scores.push(0);
    updateScore();
    gp.style.borderColor = 'rgba(239,68,68,.5)';
    document.getElementById('gp-text').textContent = '✗ Not quite';
    document.getElementById('gp-hint').textContent = 'See the correct answer below';
    hapticBuzz(false);
    AudioSysSafe('wrong');
    setTimeout(()=>showFeedback(false, scen), 700);
  }
}

function hapticBuzz(ok){
  if(navigator.vibrate) navigator.vibrate(ok?[40]:[60,40,60]);
  const stick = document.getElementById('joy-stick');
  stick.style.boxShadow = ok
    ? '0 0 24px rgba(34,197,94,.8), 0 4px 15px rgba(0,0,0,.6)'
    : '0 0 24px rgba(239,68,68,.8), 0 4px 15px rgba(0,0,0,.6)';
  setTimeout(()=>{ stick.style.boxShadow = ''; }, 800);
}

// Same idea as fitCenterQ(): find the largest font size at which both columns of the
// result card fit on this screen, so a landscape phone never has to scroll to reach
// the physics explanation or the "Take Control" button.
function fitFeedback(){
  const wrap = document.getElementById('fb-wrap');
  if(!wrap.classList.contains('on')) return;
  const card = wrap.querySelector('.fb-card');
  // With an animated diagram, first try showing diagram + text together; if that would
  // shrink the type below a readable size, switch to compact mode, where they take turns
  // behind the Visual / Read tabs.
  const hasVisual = !document.getElementById('fb-visual').hidden;
  card.classList.remove('fb-compact');
  card.querySelectorAll('.fb-col').forEach(c=>{ c.classList.remove('more'); c.scrollTop = 0; });
  const cols = [...card.querySelectorAll('.fb-col')];
  const phys = card.querySelector('.fbp-t');
  wrap.classList.add('measuring');
  const box = phys.parentElement;
  const fits = ()=> cols.every(c=> c.scrollHeight <= c.clientHeight + 1) && box.scrollHeight <= box.clientHeight + 1;
  // In compact mode both tabs must fit at the chosen size, so switching never overflows.
  const ok = ()=>{
    if(!card.classList.contains('fb-compact')) return fits();
    const v = box.dataset.view;
    box.dataset.view = 'visual'; const a = fits();
    box.dataset.view = 'text'; const b = fits();
    box.dataset.view = v;
    return a && b;
  };
  const set = (px)=>{ card.style.fontSize = px + 'px'; };
  const top = Math.max(15, Math.min(28, Math.min(innerWidth/42, innerHeight/22)));
  // Never shrink below a readable size: past this floor the columns scroll instead.
  const floor = innerHeight < 520 ? 11.5 : 14;
  let lo, hi;
  const search = ()=>{ lo = floor; hi = top; set(hi); if(!ok()){ for(let k=0;k<12;k++){ const m=(lo+hi)/2; set(m); if(ok()) lo=m; else hi=m; } set(lo); } else lo = hi; };
  search();
  if(hasVisual && (lo < 13 || !ok())){ card.classList.add('fb-compact'); search(); }
  void card.offsetHeight;
  wrap.classList.remove('measuring');
  updateFeedbackMore();
}
// "↓ scroll for more" on any column that still has content below its visible part.
function updateFeedbackMore(){
  document.querySelectorAll('#fb-wrap .fb-col').forEach(c=>{
    c.classList.toggle('more', c.scrollHeight - c.scrollTop - c.clientHeight > 4);
  });
}
document.querySelectorAll('#fb-wrap .fb-col').forEach(c=> c.addEventListener('scroll', updateFeedbackMore, { passive:true }));
addEventListener('resize', ()=>{ if(document.getElementById('fb-wrap').classList.contains('on')) fitFeedback(); });
function setExplainView(view){
  const phys = document.querySelector('#fb-wrap .fb-phys');
  phys.dataset.view = view;
  phys.querySelectorAll('.fbp-tabs button').forEach(b=> b.setAttribute('aria-selected', String(b.dataset.view === view)));
  phys.scrollTop = 0;
  if(typeof updateFeedbackMore === 'function') updateFeedbackMore();
}
document.querySelectorAll('#fb-wrap .fbp-tabs button').forEach(b=> b.addEventListener('click', ()=> setExplainView(b.dataset.view)));
function showFeedback(ok, scen){
  if(centerQ()){
    // The answer is in: put the popup away so the feedback card stands alone, and keep
    // it away through the take-control phase.
    document.getElementById('side-panel').classList.add('panel-hidden');
    document.body.classList.remove('q-open');
    document.getElementById('observe-btn').style.display = 'none';
  }
  document.getElementById('fb-wrap').classList.add('on');
  if(typeof AudioSys!=='undefined' && AudioSys.musicPhase && !GS.tutorial) AudioSys.musicPhase('question');
  document.getElementById('fb-ico').textContent = ok?'✓':'✗';
  document.getElementById('fb-ico').className = 'fbv-ico '+(ok?'ok':'no');
  document.getElementById('fb-verdict').textContent = ok?'Correct!':'Not quite — here’s why';
  const om = {safe:['fo-safe','✓ SAFE OUTCOME'],risky:['fo-risky','⚠ RISKY OUTCOME'],unsafe:['fo-unsafe','✗ UNSAFE OUTCOME']};
  // Grade 7's answer key rates the decision itself (every correct answer is the "Safe
  // Decision"), so show that instead of classifying the hazard level.
  const [cls,lbl] = scen.live ? (ok ? ['fo-safe','✓ SAFE DECISION'] : ['fo-unsafe','✗ UNSAFE DECISION']) : om[scen.out];
  const oe = document.getElementById('fb-outcome');
  oe.className = 'fb-out '+cls; oe.textContent = lbl;
  let ch = '';
  const C = (l,v,s)=>{ const c={safe:'#4ade80',risky:'#fbbf24',unsafe:'#f87171'}[s];
    return `<div class="chip"><div class="chip-l">${l}</div><div class="chip-v">${v}</div><div class="chip-s" style="color:${c}">${s.toUpperCase()}</div></div>`; };
  if(scen.live) scen.live.forEach(r=>{ ch += C(r.l, r.v, r.s); });
  else if(scen.depth!==undefined) ch += C('Depth',scen.depth+'m',scen.depth>.5?'unsafe':scen.depth>.3?'risky':'safe');
  if(scen.vel!==undefined) ch += C('Velocity',scen.vel+' m/s',scen.vel>1?'unsafe':scen.vel>.5?'risky':'safe');
  if(scen.rain!==undefined) ch += C('Rainfall',scen.rain+' mm/hr',scen.rain>30?'unsafe':scen.rain>15?'risky':'safe');
  if(scen.cap!==undefined) ch += C('Load',scen.load+'/'+scen.cap,scen.load>scen.cap?'unsafe':scen.load===scen.cap?'risky':'safe');
  if(scen.wind!==undefined && !scen.live) ch += C('Wind',scen.wind+' km/h',scen.wind>100?'unsafe':scen.wind>60?'risky':'safe');
  document.getElementById('fb-chips').innerHTML = ch;
  const fbEn = ok ? scen.fb : ('Correct answer: '+CHOICE_LETTERS[scen.ci]+'. "'+scen.opts[scen.ci]+'" '+scen.fb);
  document.getElementById('fb-text').innerHTML = bilingualHTML(fbEn, scen.fb_bi);
  // Grade 7 uses the teacher's consolidated explanations, with typeset formulas and the
  // Bikol translation; other grades keep their plain-text physics note.
  const physEl = document.getElementById('fb-physics');
  const physHead = document.querySelector('.fbp-h');
  if(scen.phy_html){
    physEl.classList.add('fbp-rich');
    physEl.innerHTML = (scen.phy_title ? `<div class="fbp-title">${scen.phy_title}</div>` : '')
      + `<div class="fbp-en">${scen.phy_html}</div>`
      + (scen.phy_bi_html ? `<div class="fbp-bi"><span class="fbp-lang">Paliwanag sa Pisika · Bikol</span>${scen.phy_bi_html}</div>` : '');
    physHead.textContent = '⚛ Physics Explanation · Paliwanag sa Pisika';
  } else {
    physEl.classList.remove('fbp-rich');
    physEl.textContent = scen.phy;
    physHead.textContent = '⚛ Physics Explanation';
  }
  // Animated diagram of the same physics, with steps that light up as it plays.
  setExplainView('visual');
  if(typeof renderExplainVisual === 'function') renderExplainVisual(scen, { grade: GS.grade });
  const last = GS.idx === GS.gd.scenarios.length-1;
  const nb = document.getElementById('next-btn');
  if(ok || GS.tutorial){
    nb.textContent = ok ? '🎮 Take Control — Execute Your Decision' : '🎮 Practice walking the safe path';
    nb.onclick = startControl;
  } else {
    nb.textContent = last ? 'See Results →' : 'Next Scenario →';
    nb.onclick = nextScenario;
  }
  fitFeedback();
}

function nextScenario(){
  document.getElementById('fb-wrap').classList.remove('on');
  const n = GS.idx+1;
  if(n >= GS.gd.scenarios.length) transitionTo(showResults);
  else {
    const nx = GS.gd.scenarios[n];
    const obj = (nx.lab && nx.objective) ? nx.objective : (GS.gd.topic + (GS.gd.prime ? ' — ' + GS.gd.prime : ''));
    transitionTo(()=>loadScenario(n), obj);
  }
}

async function submitResults(){
  const statusEl = document.getElementById('submit-status');
  try{
    await ensureAnonAuth();
    const total = resultsLog.length;
    const solved = resultsLog.filter(r=>r.outcome==='correct').length;
    const percentScore = (solved/total)*100;
    const processScore = resultsLog.reduce((s,r)=>s+(typeof r.score==='number'?r.score:(r.outcome==='correct'?1:0)),0)/total;
    const startedAt = new Date(GS.t0).toISOString();
    const finishedAt = new Date().toISOString();

    const batch = db.batch();
    const attemptRef = db.collection('attempts').doc();
    batch.set(attemptRef, {
      studentId: STUDENT.studentId, grade: GS.grade, sectionId: STUDENT.sectionId, sessionId: GS.sessionId || null,
      startedAt, finishedAt, totalScenarios: total, solvedCount: solved,
      processScore, percentScore
    });
    resultsLog.forEach(r => {
      const rRef = db.collection('scenarioResults').doc();
      batch.set(rRef, {
        attemptId: attemptRef.id, studentId: STUDENT.studentId, grade: GS.grade, sectionId: STUDENT.sectionId, sessionId: GS.sessionId || null,
        scenarioIndex: r.scenarioIndex, melc: r.melc||null, concept: r.concept||null,
        outcome: r.outcome, chosenOption: r.chosenOption ?? null, correctOption: r.correctOption ?? null,
        timeSeconds: r.timeSeconds||0
      });
    });
    const histRef = db.collection('students').doc(STUDENT.studentId).collection('history').doc(attemptRef.id);
    batch.set(histRef, { grade: GS.grade, startedAt, finishedAt, totalScenarios: total, solvedCount: solved, percentScore });
    const studentRef = db.collection('students').doc(STUDENT.studentId);
    batch.update(studentRef, {
      latestPercent: percentScore, latestSolved: solved, latestTotal: total, latestAt: finishedAt,
      attemptCount: firebase.firestore.FieldValue.increment(1)
    });
    await batch.commit();

    // Best-effort, non-fatal: roll this score into the session's denormalized stats so
    // the teacher's Sessions panel shows "played / average" without a separate query.
    if (GS.sessionId){
      try{
        await db.runTransaction(async (tx) => {
          const sessRef = db.collection('sessions').doc(GS.sessionId);
          const sessDoc = await tx.get(sessRef);
          if (!sessDoc.exists) return;
          const d = sessDoc.data();
          const oldCount = d.attemptCount || 0;
          const oldAvg = d.avgPercent || 0;
          const newCount = oldCount + 1;
          tx.update(sessRef, { attemptCount: newCount, avgPercent: (oldAvg*oldCount + percentScore) / newCount });
        });
      }catch(e){ /* the score itself already saved above; this is just a display aggregate */ }
    }

    statusEl.textContent = `Saved to your teacher's records — ${solved}/${total} correct.`;
    statusEl.style.color = '#4ade80';
  }catch(e){
    statusEl.textContent = 'Could not save your score: ' + e.message;
    statusEl.style.color = '#f87171';
  }
}

function showResults(){
  showScreen('s-res');
  AudioSysSafe('fanfare');
  if(typeof AudioSys!=='undefined') AudioSys.startMusic('bright');
  const t = GS.gd.scenarios.length;
  const solved = GS.scores.length ? GS.scores.filter(s=>s>0).length : 0;
  const proc = GS.scores.length ? GS.scores.reduce((a,b)=>a+b,0)/GS.scores.length : 0;
  let interp, icon;
  if(proc>=.85){interp='Strong understanding of this topic';icon='🏆';}
  else if(proc>=.65){interp='Good understanding — a few concepts need review';icon='🎯';}
  else if(proc>=.4){interp='Getting there — review the physics explanations';icon='📚';}
  else {interp='Needs review — talk to your teacher about this topic';icon='💪';}
  document.getElementById('res-icon').textContent = icon;
  document.getElementById('res-grade').textContent = [GS.gd.name, GS.gd.topic, GS.gd.melc].filter(Boolean).join(' · ');
  document.getElementById('res-big').textContent = `${solved} / ${t}`;
  document.getElementById('res-interp').textContent = 'scenarios correct — ' + interp;
  document.getElementById('res-breakdown').innerHTML = `
    <div class="rbd"><div class="rbd-n" style="color:#4ade80">${(proc*100).toFixed(0)}%</div><div class="rbd-l">Score</div></div>
    <div class="rbd"><div class="rbd-n">${solved}</div><div class="rbd-l">Correct</div></div>
    <div class="rbd"><div class="rbd-n">${t-solved}</div><div class="rbd-l">Missed</div></div>`;
  submitResults();
}
function replayGrade(){ requestFullscreenIfMobile(); transitionTo(()=>startGrade(GS.grade, GS.sessionId, GS.sessionLabel)); }
function goMenu(){
  narrStop();
  if(typeof g7ClosePanels==='function') g7ClosePanels();     // action button, checklist, aiming panel
  if(typeof AudioSys!=='undefined') AudioSys.startMusic('bright');
  if(typeof tutAbort==='function') tutAbort();
  G10Wind = 0;
  resetCenterQ();
  AudioSysSafe('click');
  if(typeof AudioSys!=='undefined') AudioSys.setAmbience(null);
  document.getElementById('val-rate-now').hidden = true;
  if(VALIDATOR){ transitionTo(()=>{ buildMenuBackground(); valShowHub(GS && GS.validator ? GS.grade : null); }); return; }
  transitionTo(()=>{ buildMenuBackground(); showScreen('s-menu'); renderStartCard(); loadHistory(); });
}
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('on'));
  document.getElementById(id).classList.add('on');
  // The always-on-top profile/logout bar only makes sense outside active gameplay —
  // in-game has its own consolidated header (back button + grade + score).
  document.getElementById('topbar').classList.toggle('hidden', id === 's-game');
}
function transitionTo(fn, objText){
  const t = document.getElementById('trans');
  if(objText){
    t.innerHTML = '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem;text-align:center"><div style="font-size:.62rem;letter-spacing:.25em;text-transform:uppercase;color:#38bdf8;margin-bottom:.7rem">Objective</div><div style="font-size:1rem;max-width:420px;line-height:1.55;color:#fff">'+objText+'</div></div>';
  } else t.innerHTML = '';
  t.style.opacity = '1';
  const dwell = objText ? 1400 : 400;
  setTimeout(()=>{ fn(); setTimeout(()=>{t.style.opacity='0';},100); }, dwell);
}

// ═══ JOYSTICK + CONTROLS ═══
function initControls(){
  const zone = document.getElementById('joy-zone');
  const stick = document.getElementById('joy-stick');
  const max = 36;
  let active = false;

  function move(e){
    if(!active) return;
    e.preventDefault();
    const r = zone.getBoundingClientRect();
    const pt = e.touches ? e.touches[0] : e;
    let dx = pt.clientX-(r.left+r.width/2), dy = pt.clientY-(r.top+r.height/2);
    const d = Math.hypot(dx,dy);
    if(d>max){ dx = dx/d*max; dy = dy/d*max; }
    stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    joy.x = dx/max; joy.y = -dy/max; joy.active = true;
    if(Math.hypot(joy.x, joy.y) > .45) if(typeof tutEvent==='function') tutEvent(ctrl.on ? (joy.y > .3 ? 'moved' : '') : 'look');
  }
  function end(){
    if(!active) return;
    active = false; joy.active = false; joy.x = joy.y = 0;
    stick.style.transform = 'translate(-50%,-50%)';
  }
  zone.addEventListener('mousedown', e=>{ e.preventDefault(); active = true; move(e); });
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', end);
  zone.addEventListener('touchstart', e=>{ e.preventDefault(); active = true; move(e); }, {passive:false});
  document.addEventListener('touchmove', move, {passive:false});
  document.addEventListener('touchend', end);

  document.getElementById('zoom-in').onclick = ()=>{ if(typeof tutEvent==='function') tutEvent('zoom'); zoomLevel = Math.min(2.4, zoomLevel+.25); AudioSysSafe('click'); if(navigator.vibrate) navigator.vibrate(15); };
  document.getElementById('zoom-out').onclick = ()=>{ if(typeof tutEvent==='function') tutEvent('zoom'); zoomLevel = Math.max(.6, zoomLevel-.25); AudioSysSafe('click'); if(navigator.vibrate) navigator.vibrate(15); };
  document.getElementById('cam-reset').onclick = ()=>{ if(typeof tutEvent==='function') tutEvent('zoom'); cam.yaw = 0; cam.pitch = 0; zoomLevel = 1; AudioSysSafe('click'); if(navigator.vibrate) navigator.vibrate(15); };
  document.getElementById('q-btn').onclick = ()=>{
    qTier = TIERS[(TIERS.indexOf(qTier)+1)%3];
    applyTier();
    AudioSysSafe('click');
    if(navigator.vibrate) navigator.vibrate(15);
  };

  // Keyboard
  const keys = {};
  document.addEventListener('keydown', e=>{
    keys[e.key.toLowerCase()] = true;
    if(panelRevealed && ['1','2','3'].includes(e.key)){
      const btns = document.querySelectorAll('.ch-btn');
      const b = btns[+e.key-1];
      if(b && !b.classList.contains('disabled') && !b.classList.contains('correct') && !b.classList.contains('wrong')) b.click();
    }
    if((e.key==='Enter'||e.key===' ') && document.getElementById('fb-wrap').classList.contains('on')){
      e.preventDefault(); document.getElementById('next-btn').click();
    }
    if(e.key==='Escape' && document.getElementById('s-game').classList.contains('on')) goMenu();
  });
  document.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()] = false; });
  let kbActive = false;
  setInterval(()=>{
    if(!document.getElementById('s-game').classList.contains('on')) return;
    if(active) return; // touch/mouse joystick has priority
    let kx = 0, ky = 0;
    if(keys['a']||keys['arrowleft']) kx -= 1;
    if(keys['d']||keys['arrowright']) kx += 1;
    if(keys['w']||keys['arrowup']) ky += 1;
    if(keys['s']||keys['arrowdown']) ky -= 1;
    if(kx||ky){ joy.x = kx*.75; joy.y = ky*.75; joy.active = true; kbActive = true; }
    else if(kbActive){ joy.x = joy.y = 0; joy.active = false; kbActive = false; }
  }, 40);
}

// ═══ INIT ═══
const LD_T0 = performance.now();
let ldPct = 0, ldRaf = 0;
function setLoad(p, tip){
  document.getElementById('ld-fill').style.width = p+'%';
  // Count the percentage up smoothly instead of jumping between steps.
  const pctEl = document.getElementById('ld-pct'), from = ldPct, t0 = performance.now();
  ldPct = p;
  cancelAnimationFrame(ldRaf);
  const step = now => {
    // rAF's timestamp can predate t0 (it marks the frame start), so clamp at 0.
    const k = Math.min(1, Math.max(0, (now - t0) / 650)), e = 1 - Math.pow(1 - k, 3);
    pctEl.textContent = Math.round(from + (p - from) * e) + '%';
    if(k < 1) ldRaf = requestAnimationFrame(step);
  };
  ldRaf = requestAnimationFrame(step);
  if(tip){
    const tipEl = document.getElementById('ld-tip');
    tipEl.textContent = tip;
    tipEl.classList.remove('swap'); void tipEl.offsetWidth; tipEl.classList.add('swap');
  }
}
// Let the logo intro finish (≈2s), then cross-fade the loader away over the menu
// (the menu is shown underneath first, so there is no flash of black in between).
async function finishLoad(){
  const wait = 2100 - (performance.now() - LD_T0);
  if(wait > 0) await new Promise(r=>setTimeout(r, wait));
  const L = document.getElementById('s-load');
  if(VALIDATOR) valShowHub(); else showScreen('s-menu');
  L.classList.add('on');
  requestAnimationFrame(()=>requestAnimationFrame(()=>L.classList.add('ld-out')));
  await new Promise(r=>setTimeout(r, 520));
  L.classList.remove('on','ld-out');
}
async function init(){
  const V = getValidatorSession();
  if(V){ VALIDATOR = V; await ensureAnonAuth(); }
  else {
    STUDENT = await requireStudentSession();
    if(!STUDENT) return; // requireStudentSession() is already redirecting to index.html
  }
  initThree();
  applyTier();
  initControls();
  setLoad(25,'Building the river...');
  await new Promise(r=>setTimeout(r,250));
  setLoad(55,'Placing the village...');
  await new Promise(r=>setTimeout(r,250));
  buildMenuBackground();
  setLoad(85,'Preparing your scenarios...');
  await new Promise(r=>setTimeout(r,250));
  setLoad(100,'Ready!');
  await new Promise(r=>setTimeout(r,350));
  if(VALIDATOR){ await valLoad(); await finishLoad(); return; }
  renderStartCard();
  loadHistory();
  if(typeof tutCheckRemote==='function') tutCheckRemote();
  watchForActiveSession();
  await finishLoad();
}
init();

// Browsers refuse to start any audio before a genuine user gesture, and the very
// first thing a student does on this page varies (tap the menu, a login field, the
// Enter Session button…) — so rather than wiring every possible entry point, unlock
// the AudioContext and kick off the background pad on whichever gesture comes first.
document.addEventListener('click', function unlockAudioOnce(){
  if(typeof AudioSys==='undefined') return;
  AudioSys.init();
  AudioSys.startMusic();
  document.removeEventListener('click', unlockAudioOnce);
}, {once:true});

// Best-effort extra attempt on physical rotation — most browsers only honor
// requestFullscreen from a direct click/tap, so this quietly no-ops most of the time,
// but costs nothing to try (e.g. it can succeed if the rotate happens soon after a tap).
// Listen on both the legacy window event and the modern Screen Orientation API — the
// latter is more reliable where supported, but browser coverage of each still varies.
window.addEventListener('orientationchange', () => {
  setTimeout(() => { if (matchMedia('(orientation: landscape)').matches) requestFullscreenIfMobile(); }, 400);
});
if (screen.orientation && screen.orientation.addEventListener){
  screen.orientation.addEventListener('change', () => {
    if (matchMedia('(orientation: landscape)').matches) requestFullscreenIfMobile();
  });
}

// Re-run the side-panel shrink-to-fit check on resize/rotation — the fit computed for
// one viewport size doesn't hold after the viewport changes shape.
let fitResizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(fitResizeTimer);
  fitResizeTimer = setTimeout(() => {
    if (document.getElementById('s-game').classList.contains('on')){ fitSidePanel(); fitFeedback(); }
    fitMenuHistory();
  }, 200);
});
