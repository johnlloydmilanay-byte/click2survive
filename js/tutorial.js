'use strict';
// ═══════════════════════════════════════════════
//  FIRST-TIME TUTORIAL — a guided, unscored practice round
// ═══════════════════════════════════════════════
// Runs automatically the first time an account enters a session (and any time from
// the menu's "How to play" link). It plays one practice scenario through the real game
// flow — story → look around → question → hide/view → answer → feedback → walk to the
// gateway — and at each step highlights the control to use, shows an animated pointer
// for gestures, and waits until the student has actually done it. Nothing in the
// practice round is scored or saved.
//
// "First time" = not marked done on this device, not marked done on the account
// (students/{id}.tutorialDoneAt), and no finished attempts on the account.

const PRACTICE_GD = {
  name:'Practice', topic:'Tutorial · Practice round', color:'#38bdf8', melc:'', concept:'practice', prime:'',
  scenarios:[{
    scene:'practice', hazard:'flood', comp:'Practice round', concept:'practice', out:'risky', ci:1, key:'B',
    sit:'Practice round: After heavy rain, a deep puddle has formed on the straight path to the safe spot. A dry path goes around it.',
    q:'Which way should the learner go to reach the safe spot?',
    q_bi:'Arin na dalan an dapat agihan kan estudyante pasiring sa ligtas na lugar?',
    opts:['Walk straight through the deep puddle.',
          'Take the dry path around the puddle.',
          'Run through the puddle as fast as possible.',
          'Stand still in the rain and wait.'],
    fb:'The dry path is a little longer, but it keeps the learner out of deep water. In every scenario, choose the answer that is both safe and scientifically correct.',
    phy:'This is only a practice round, so it is not scored. In the real scenarios this box explains the science behind the safe decision: forces, distance and displacement, and speed and motion.',
    live:[{l:'Puddle',v:'Deep',s:'unsafe'},{l:'Dry path',v:'Longer · passable',s:'safe'},{l:'This round',v:'Practice only',s:'safe'}],
    mission:'Follow the dry path around the puddle to the gateway'
  }]
};

// ── VOICEOVER ──
// Every step is read aloud with its own friendly script (more conversational than the
// bubble text). If studio recordings are added later (audio/vo/<step>.mp3, listed in
// VO_FILES), those play; otherwise the device's best built-in voice speaks, picked
// for naturalness (Samantha, Google US English, Microsoft "Natural" voices, en-PH…)
// with a slightly brighter pitch for an upbeat tone. Music ducks under the voice.
// Studio recordings (ElevenLabs, voice "Frankie – Friendly Instructor", performed with
// emotion tags). The recorded welcome says "Hi there!" — the built-in voice, used only
// as a fallback, can still say the student's name.
const VO_FILES = Object.fromEntries(['welcome','story','look','zoom','reveal','readq','choices','hide','view','answer','feedback','walk','mission','done']
  .map(id=>[id, 'audio/vo/' + id + '.mp3?v=1']));
function voPreload(){
  if(typeof AudioSys==='undefined' || !AudioSys.loadVoice) return;
  Object.values(VO_FILES).forEach(u=> AudioSys.loadVoice(u).catch(()=>{}));
}
const VO = { on:true, voice:null, timer:0, token:0 };
try{ VO.on = localStorage.getItem('c2s_vo') !== 'off'; }catch(e){}
const VO_NOVELTY = /Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Deranged|Hysterical|Pipe Organ|Fred|Junior|Ralph|Kathy|Grandma|Grandpa|Rocko|Shelley|Sandy|Eddy|Flo|Reed/i;
const VO_PREFERRED = [/Samantha/i, /Google US English/i, /Microsoft (Aria|Jenny|Ana|Michelle).*Natural/i, /Natural/i,
  /Microsoft (Aria|Jenny|Zira)/i, /Karen|Moira|Tessa|Serena|Allison|Ava/i];
function voPickVoice(){
  if(VO.voice) return VO.voice;
  if(!('speechSynthesis' in window)) return null;
  const vs = speechSynthesis.getVoices().filter(v=> /^en/i.test(v.lang) && !VO_NOVELTY.test(v.name));
  if(!vs.length) return null;
  for(const re of VO_PREFERRED){ const v = vs.find(x=>re.test(x.name)); if(v) return (VO.voice = v); }
  return (VO.voice = vs.find(v=>/en-(US|PH|GB|AU)/i.test(v.lang)) || vs[0]);
}
if('speechSynthesis' in window) speechSynthesis.onvoiceschanged = ()=>{ VO.voice = null; };
function voDuck(on){ try{ if(typeof AudioSys!=='undefined') AudioSys.duck(on); }catch(e){} }
function voStop(){
  clearTimeout(VO.timer); VO.token = (VO.token||0) + 1;
  try{ if('speechSynthesis' in window) speechSynthesis.cancel(); }catch(e){}
  try{ if(typeof AudioSys!=='undefined' && AudioSys.stopVoice) AudioSys.stopVoice(); }catch(e){}
  voDuck(false);
}
function voSpeak(id, text){
  voStop();
  if(!VO.on || !text || (typeof AudioSys!=='undefined' && AudioSys.isMuted())) return;
  voDuck(true);
  const token = VO.token;
  // Built-in voice fallback, made livelier: spoken sentence by sentence so each gets its
  // own intonation — exclamations brighter and a touch faster, questions lifted.
  const tts = ()=>{
    if(token !== VO.token) return;
    if(!('speechSynthesis' in window)){ voDuck(false); return; }
    const v = voPickVoice();
    const parts = text.match(/[^.!?…]+[.!?…]*/g) || [text];
    parts.forEach((p, i)=>{
      const t = p.trim(); if(!t) return;
      const u = new SpeechSynthesisUtterance(t);
      if(v){ u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
      const ex = /!$/.test(t), q = /\?$/.test(t);
      u.pitch = ex ? 1.28 : q ? 1.2 : 1.1;
      u.rate  = ex ? 1.06 : q ? 1.0 : .97;
      u.volume = 1;
      if(i === parts.length-1) u.onend = u.onerror = ()=> voDuck(false);
      speechSynthesis.speak(u);
    });
  };
  if(VO_FILES[id] && typeof AudioSys!=='undefined' && AudioSys.loadVoice){
    let started = false;
    const fallback = setTimeout(()=>{ if(!started) { started = true; tts(); } }, 2500);   // recording too slow to arrive
    AudioSys.loadVoice(VO_FILES[id]).then(buf=>{
      if(started || token !== VO.token) return;
      started = true; clearTimeout(fallback);
      AudioSys.playVoice(buf, ()=> voDuck(false));
    }).catch(()=>{ if(!started){ started = true; clearTimeout(fallback); tts(); } });
    return;
  }
  VO.timer = setTimeout(tts, 80);   // a beat after cancel(): some Android engines drop an immediate re-speak
}
function voToggle(){
  VO.on = !VO.on;
  try{ localStorage.setItem('c2s_vo', VO.on ? 'on' : 'off'); }catch(e){}
  document.querySelectorAll('.tut-voice').forEach(b=>{ b.textContent = VO.on ? '🔊' : '🔇'; b.setAttribute('aria-label', VO.on ? 'Turn voice off' : 'Turn voice on'); });
  if(VO.on){ const st = tutStep(); if(st) voSpeak(st.id || (st.start?'welcome':'done'), tutVo(st)); } else voStop();
}
function tutVo(st){ return (st.vo || '').replace('{name}', tutName()); }

const TUT = { on:false, i:-1, after:null, remoteDone:false, holdWatch:false, confirmSkip:false, raf:0, steps:[] };

function tutKey(){ return 'c2s_tut_done_' + ((typeof STUDENT!=='undefined' && STUDENT && STUDENT.studentId) || 'anon'); }
function tutorialDoneLocally(){ try{ return localStorage.getItem(tutKey()) === '1'; }catch(e){ return false; } }
// Checks the account (called once at startup); a student who already played on another
// device, or already finished the tutorial there, isn't shown it again.
async function tutCheckRemote(){
  try{
    const d = await db.collection('students').doc(STUDENT.studentId).get();
    const v = d.exists ? d.data() : {};
    TUT.remoteDone = !!v.tutorialDoneAt || (v.attemptCount||0) > 0 || v.latestAt != null;
  }catch(e){ /* offline etc. — fall back to the local flag */ }
}
function needsTutorial(){ return !tutorialDoneLocally() && !TUT.remoteDone; }
function markTutorialDone(){
  try{ localStorage.setItem(tutKey(), '1'); }catch(e){}
  try{ db.collection('students').doc(STUDENT.studentId).update({ tutorialDoneAt: Date.now() }).catch(()=>{}); }catch(e){}
}

function tutName(){ const n = (typeof STUDENT!=='undefined' && STUDENT && STUDENT.name) || ''; return n.split(' ')[0] || 'there'; }

// Each step: target (element to highlight), text, and either a "Next" button or `wait`
// for a game event fired via tutEvent(). `hand` shows an animated drag pointer.
function tutSteps(){
  return [
    { card:true, title:'Welcome to Click to Survive! 👋',
      text:`Hi ${tutName()}! Since this is your first time, let’s do a short <b>practice round</b> so you know how everything works.<br><br>It is <b>not scored</b> and takes about two minutes.`,
      btn:'Start the tutorial ▶', start:true,
      vo:'Hi {name}! Welcome to Click to Survive! Since this is your first time here, let\'s do a quick practice round together. Don\'t worry, it\'s not scored! Tap Start when you\'re ready.' },
    { id:'story', target:'.story-box', wait:'narrationEnd',
      vo:'Every scenario begins with a short story. Read it carefully, because it tells you what is happening. When you\'re done, tap Skip.',
      text:'Every scenario starts with a short <b>story</b> about what is happening. Read it carefully.<br>Tap <b>Skip ▶</b> when you are done.' },
    { id:'look', target:'#joy-zone', wait:'look', hand:'drag',
      vo:'Awesome! Now let\'s look around. Drag the joystick in any direction to turn the camera.',
      text:'Look around the scene! <b>Drag the joystick</b> in any direction to turn the camera.' },
    { id:'zoom', target:'#act-pad', wait:'zoom',
      vo:'Nice! Want a closer look? Tap plus or minus to zoom. The house button resets your view. Try one now!',
      text:'Use <b>＋</b> and <b>−</b> to zoom in and out. <b>⌂</b> resets the view.<br>Try one now.' },
    { id:'reveal', target:'#q-watch', wait:'reveal', release:true,
      vo:'Great job! After ten seconds, the question pops up by itself. Or, you can tap Show question now.',
      text:'After 10 seconds of watching, the question appears by itself.<br>You can also tap <b>“Show question now”</b>.' },
    { id:'readq', target:'#q-left', btn:'Next ▶',
      vo:'Here\'s the question! On the left is the situation, and the question is in yellow. The Bikol translation is in the parentheses. Tap Next.',
      text:'On the <b>left</b> is the situation, and the <b>question in yellow</b>.<br>The Bikol translation is shown in (parentheses).' },
    { id:'choices', target:'#choices', btn:'Next ▶',
      vo:'On the right are your choices: A, B, C, and D. They always match your teacher\'s test paper. Tap Next.',
      text:'On the <b>right</b> are your choices, <b>A</b> to <b>D</b>. The letters always match your teacher’s test paper.' },
    { id:'hide', target:'.qh-hide', wait:'hide',
      vo:'Need to check the scene again before you answer? Tap Hide question.',
      text:'Want to check the scene again before answering?<br>Tap <b>“Hide question”</b>.' },
    { id:'view', target:'#q-show', wait:'view',
      vo:'Perfect! Now tap View question to bring it back.',
      text:'Now tap <b>“View question”</b> to bring the question back.' },
    { id:'answer', target:'#choices', wait:'answer',
      vo:'Okay, time to decide! Tap the safest answer.',
      text:'Choose the <b>safest</b> answer. Tap it!' },
    { id:'feedback', target:'#next-btn', wait:'control',
      vo:'This card tells you if you got it right, and explains the science behind it. Now tap the big button to try the walking part!',
      text:'This card shows if you were right and <b>explains the science</b>.<br>Tap the big button to try the walking part.' },
    { id:'walk', target:'#joy-zone', wait:'moved', hand:'up',
      vo:'Now it\'s your turn to act! Push the joystick up to walk toward the glowing gateway.',
      text:'Now <b>you</b> carry out the decision. <b>Push the joystick up</b> to walk toward the glowing gateway ring.' },
    { id:'mission', target:'#mission', wait:'gateway',
      vo:'See the bar at the top? It shows how far away the gateway is. If you walk into danger, you\'ll get a red warning, so follow the dry path!',
      text:'The bar at the top shows <b>how far</b> the gateway is. Tap it to read your mission again.<br>Dangerous areas stop you with a <b>red warning</b>, so follow the dry path!' },
    { card:true, title:'You’re ready! 🎉',
      text:'Your <b>score</b> is shown at the top right. <b>← Menu</b> takes you back, and <b>🔊</b> turns the sound on or off.<br><br>Now play your real session. Read carefully and choose the safest answer.',
      btn: null, finish:true,
      vo:'You did it! You\'re ready! Your score is at the top right, and the Menu button takes you back. Now go play your real session. Read carefully, and choose the safest answer. Good luck!' }
  ];
}

// ── UI ──
function tutEnsureUI(){
  if(document.getElementById('tut-layer')) return;
  const L = document.createElement('div');
  L.id = 'tut-layer';
  L.innerHTML = `
    <div id="tut-ring"></div>
    <div id="tut-hand">👆</div>
    <div id="tut-bubble" role="dialog" aria-live="polite">
      <div class="tb-head"><span class="tb-step" id="tb-step"></span><span class="tb-tools"><button class="tut-ico" id="tb-replay" aria-label="Hear it again">🔁</button><button class="tut-ico tut-voice" aria-label="Turn voice off">🔊</button><button class="tb-skip" id="tb-skip">Skip tutorial</button></span></div>
      <div class="tb-text" id="tb-text"></div>
      <div class="tb-wait" id="tb-wait">Waiting for you…</div>
      <div class="tb-actions" id="tb-actions"></div>
    </div>
    <div id="tut-card" role="dialog">
      <div class="tc-box">
        <div class="tc-tools"><button class="tut-ico" id="tc-replay" aria-label="Hear it again">🔁</button><button class="tut-ico tut-voice" aria-label="Turn voice off">🔊</button></div>
        <div class="tc-title" id="tc-title"></div>
        <div class="tc-text" id="tc-text"></div>
        <div class="tc-actions" id="tc-actions"></div>
      </div>
    </div>`;
  document.body.appendChild(L);
  document.getElementById('tb-skip').onclick = tutAskSkip;
  const replay = ()=>{ const st = tutStep(); if(st){ AudioSysSafe('click'); voSpeak(st.id || (st.start?'welcome':'done'), tutVo(st)); } };
  document.getElementById('tb-replay').onclick = replay;
  document.getElementById('tc-replay').onclick = replay;
  L.querySelectorAll('.tut-voice').forEach(b=>{ b.onclick = (e)=>{ e.stopPropagation(); voToggle(); }; b.textContent = VO.on ? '🔊' : '🔇'; });
}

function startTutorial(after){
  if(TUT.on) return;
  tutEnsureUI();
  TUT.on = true; TUT.after = after || null; TUT.i = -1; TUT.holdWatch = true; TUT.confirmSkip = false;
  TUT.steps = tutSteps();          // built once per run, so step identity checks hold
  if(typeof AudioSys!=='undefined'){ AudioSys.init(); AudioSys.startMusic('bright'); }
  voPreload();
  document.body.classList.add('tut-on');
  tutGo(0);
  const loop = ()=>{ if(!TUT.on) return; tutPlace(); TUT.raf = requestAnimationFrame(loop); };
  TUT.raf = requestAnimationFrame(loop);
}

function tutStep(){ return TUT.steps[TUT.i]; }
function tutStepId(){ const s = TUT.on && tutStep(); return s ? s.id : null; }

function tutGo(i){
  const steps = TUT.steps;
  TUT.i = i; TUT.confirmSkip = false;
  const st = steps[i];
  const card = document.getElementById('tut-card'), bub = document.getElementById('tut-bubble');
  if(st.release) TUT.holdWatch = false;
  if(st.card){
    bub.classList.remove('on'); document.getElementById('tut-ring').classList.remove('on'); document.getElementById('tut-hand').className = '';
    document.getElementById('tc-title').textContent = st.title;
    document.getElementById('tc-text').innerHTML = st.text;
    const acts = document.getElementById('tc-actions'); acts.innerHTML = '';
    if(st.start){
      acts.append(tutBtn(st.btn, 'primary', ()=>{ card.classList.remove('on'); tutBeginPractice(); tutGo(1); }));
      acts.append(tutBtn('Skip for now', 'ghost', ()=>{ tutFinish(false); }));
    } else if(st.finish){
      acts.append(tutBtn(TUT.after ? 'Start my session ▶' : 'Back to menu', 'primary', ()=>tutFinish(true)));
    }
    card.classList.add('on');
    AudioSysSafe(st.finish ? 'fanfare' : 'pop');
    voSpeak(st.start ? 'welcome' : 'done', tutVo(st));
    return;
  }
  card.classList.remove('on');
  const n = steps.filter(s=>!s.card).length, k = steps.slice(0,i+1).filter(s=>!s.card).length;
  document.getElementById('tb-step').textContent = `Step ${k} of ${n}`;
  document.getElementById('tb-text').innerHTML = st.text;
  document.getElementById('tb-wait').style.display = st.wait ? '' : 'none';
  const acts = document.getElementById('tb-actions'); acts.innerHTML = '';
  if(st.btn) acts.append(tutBtn(st.btn, 'primary', ()=>tutGo(i+1)));
  document.getElementById('tut-hand').className = st.hand ? 'on ' + st.hand : '';
  bub.classList.add('on');
  bub.classList.remove('pop'); void bub.offsetWidth; bub.classList.add('pop');
  AudioSysSafe('pop');
  voSpeak(st.id, tutVo(st));
  if(navigator.vibrate) navigator.vibrate(12);
  tutPlace();
}
function tutBtn(label, kind, fn){
  const b = document.createElement('button');
  b.className = 'tut-btn ' + kind; b.innerHTML = label;
  b.onclick = (e)=>{ e.stopPropagation(); AudioSysSafe('click'); fn(); };
  return b;
}

// Game events (fired from game-logic.js / game-engine.js). Only the event the current
// step is waiting for advances it, so the steps can't be skipped out of order.
function tutEvent(name){
  if(!TUT.on) return;
  const st = tutStep();
  if(!st || st.wait !== name) return;
  if(name !== 'answer' && name !== 'gateway') AudioSysSafe('sparkle');   // those have their own sounds
  setTimeout(()=>{ if(TUT.on && tutStep() === st) tutGo(TUT.i+1); }, name==='answer' ? 1300 : name==='narrationEnd' ? 500 : 450);
}
// Lets the game ask whether an action is allowed right now (e.g. no answering while
// the tutorial is still explaining the question layout).
function tutAllows(action){
  if(!TUT.on) return true;
  const id = tutStepId();
  if(action === 'answer') return id === 'answer';
  if(action === 'toggleQuestion') return id === 'hide' || id === 'view';
  return true;
}

function tutBeginPractice(){
  showScreen('s-game');
  startGrade(7, null, 'Practice', { gd: PRACTICE_GD, tutorial: true });
}

// Position the highlight ring and the bubble next to the current target, re-done every
// frame because panels animate and the layout changes with rotation.
function tutPlace(){
  const st = TUT.on && tutStep();
  const ring = document.getElementById('tut-ring'), bub = document.getElementById('tut-bubble'), hand = document.getElementById('tut-hand');
  if(!st || st.card || !ring) return;
  const el = document.querySelector(st.target);
  const vis = el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  if(!vis){ ring.classList.remove('on'); return; }
  const r = el.getBoundingClientRect(), pad = 6;
  ring.classList.add('on');
  Object.assign(ring.style, { left:(r.left-pad)+'px', top:(r.top-pad)+'px', width:(r.width+pad*2)+'px', height:(r.height+pad*2)+'px' });
  hand.style.left = (r.left + r.width/2 - 18) + 'px';
  hand.style.top = (r.top + r.height/2 - 10) + 'px';
  // bubble: beside / below / above the target, or a screen corner — whichever covers
  // the least of the highlighted control (ties go to the earlier, closer option)
  const W = innerWidth, H = innerHeight, bw = bub.offsetWidth, bh = bub.offsetHeight, m = 10;
  const opts = [
    [r.right + m, r.top + r.height/2 - bh/2],
    [r.left - m - bw, r.top + r.height/2 - bh/2],
    [r.left + r.width/2 - bw/2, r.bottom + m],
    [r.left + r.width/2 - bw/2, r.top - m - bh],
    [m, H - bh - m], [W - bw - m, H - bh - m], [m, m], [W - bw - m, m]
  ];
  let pos = null, best = Infinity;
  for(const [x,y] of opts){
    const cx = Math.min(Math.max(x, m), W - bw - m), cy = Math.min(Math.max(y, m), H - bh - m);
    const ov = Math.max(0, Math.min(cx+bw, r.right) - Math.max(cx, r.left)) * Math.max(0, Math.min(cy+bh, r.bottom) - Math.max(cy, r.top));
    if(ov < best - 1){ best = ov; pos = [cx, cy]; }
    if(ov === 0) break;
  }
  bub.style.left = pos[0] + 'px'; bub.style.top = pos[1] + 'px';
}

function tutAskSkip(){
  const acts = document.getElementById('tb-actions');
  if(TUT.confirmSkip) return;
  TUT.confirmSkip = true;
  acts.innerHTML = '';
  const t = document.createElement('div'); t.className = 'tb-confirm';
  t.textContent = 'Skip the tutorial? You can replay it any time from the menu (“How to play”).';
  acts.append(t, tutBtn('Yes, skip', 'ghost', ()=>tutFinish(true)), tutBtn('Keep going', 'primary', ()=>tutGo(TUT.i)));
}

// done=true marks the tutorial complete for this account. Then either starts the real
// session (when the tutorial was shown on the way in) or returns to the menu.
function tutFinish(done){
  if(!TUT.on) return;
  if(done) markTutorialDone();
  tutCleanup();
  const after = TUT.after; TUT.after = null;
  if(GS && GS.tutorial){ GS.tutorial = false; }
  if(after) transitionTo(()=>{ document.getElementById('fb-wrap').classList.remove('on'); after(); });
  else if(document.getElementById('s-game').classList.contains('on')) goMenu();
}
// Leaving mid-way (e.g. ← Menu) just closes the tutorial without marking it done.
function tutAbort(){ if(TUT.on){ TUT.after = null; tutCleanup(); } }
function tutCleanup(){
  TUT.on = false; TUT.holdWatch = false;
  voStop();
  cancelAnimationFrame(TUT.raf);
  document.body.classList.remove('tut-on');
  ['tut-ring','tut-bubble','tut-card'].forEach(id=>{ const e = document.getElementById(id); if(e) e.classList.remove('on'); });
  const h = document.getElementById('tut-hand'); if(h) h.className = '';
}
