'use strict';
// ═══ PROCEDURAL AUDIO ═══
// No bundled audio files ship with this app — everything below is synthesized at
// runtime with the Web Audio API: short oscillator "blips" for UI/feedback SFX,
// filtered noise loops for environmental ambience (wind/rain/water), and a slow
// generative pad for background music. Browsers refuse to start audio before a real
// user gesture, so init() is called from the first click anywhere on the page (see
// the bottom of game-logic.js) as well as from the same click handlers that already
// request Fullscreen (enterSession/replayGrade), so it's ready the moment gameplay
// actually needs it.
const AudioSys = (() => {
  let ctx = null, master = null, musicBus = null, sfxBus = null, ambienceBus = null;
  let musicNodes = null, ambienceNodes = null;
  let muted = false;

  function ensureCtx(){
    if(ctx) return ctx;
    try{
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = .9; master.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.connect(master);
      sfxBus = ctx.createGain(); sfxBus.connect(master);
      ambienceBus = ctx.createGain(); ambienceBus.connect(master);
    }catch(e){ ctx = null; /* Web Audio unsupported — every call below becomes a harmless no-op */ }
    return ctx;
  }

  function init(){
    ensureCtx();
    if(ctx && ctx.state === 'suspended') ctx.resume().catch(()=>{});
  }

  function noiseBuffer(seconds){
    const c = ensureCtx(); if(!c) return null;
    const buf = c.createBuffer(1, Math.max(1,Math.floor(c.sampleRate*seconds)), c.sampleRate);
    const d = buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i] = Math.random()*2-1;
    return buf;
  }

  // ── short one-shot tone, the building block for the simple SFX below ──
  function tone(freq, dur, type, vol, whenOffset){
    const c = ensureCtx(); if(!c || muted) return;
    const t0 = c.currentTime + (whenOffset||0);
    const osc = c.createOscillator(); osc.type = type||'sine'; osc.frequency.setValueAtTime(freq, t0);
    const g = c.createGain(); g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0+.008);
    g.gain.exponentialRampToValueAtTime(.0001, t0+dur);
    osc.connect(g).connect(sfxBus);
    osc.start(t0); osc.stop(t0+dur+.02);
  }

  function click(){ tone(720, .07, 'sine', .12); }

  function correct(){
    if(muted) return;
    [523.25, 659.25, 783.99].forEach((f,i)=> tone(f, .22, 'triangle', .14, i*.09)); // C5-E5-G5, cheerful rise
  }

  function wrong(){
    const c = ensureCtx(); if(!c || muted) return;
    const t0 = c.currentTime;
    const osc = c.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, t0);
    osc.frequency.exponentialRampToValueAtTime(85, t0+.28);
    const g = c.createGain(); g.gain.setValueAtTime(.14, t0);
    g.gain.exponentialRampToValueAtTime(.0001, t0+.32);
    osc.connect(g).connect(sfxBus);
    osc.start(t0); osc.stop(t0+.34);
  }

  // A soft filtered-noise "whoosh" as the cinematic story overlay opens.
  function narration(){
    const c = ensureCtx(); if(!c || muted) return;
    const t0 = c.currentTime;
    const src = c.createBufferSource(); src.buffer = noiseBuffer(.7); src.loop = false;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = .8;
    bp.frequency.setValueAtTime(200, t0);
    bp.frequency.linearRampToValueAtTime(2200, t0+.6);
    const g = c.createGain(); g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(.09, t0+.15);
    g.gain.linearRampToValueAtTime(0, t0+.65);
    src.connect(bp).connect(g).connect(sfxBus);
    src.start(t0); src.stop(t0+.7);
  }

  // ── more one-shot SFX (tutorial, gameplay feedback) ──
  function glide(f0, f1, dur, type, vol, when){
    const c = ensureCtx(); if(!c || muted) return;
    const t0 = c.currentTime + (when||0);
    const osc = c.createOscillator(); osc.type = type||'sine';
    osc.frequency.setValueAtTime(f0, t0); osc.frequency.exponentialRampToValueAtTime(f1, t0+dur*.8);
    const g = c.createGain(); g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0+.01); g.gain.exponentialRampToValueAtTime(.0001, t0+dur);
    osc.connect(g).connect(sfxBus); osc.start(t0); osc.stop(t0+dur+.02);
  }
  function noiseHit(dur, ftype, freq, vol, when, q){
    const c = ensureCtx(); if(!c || muted) return;
    const t0 = c.currentTime + (when||0);
    const src = c.createBufferSource(); src.buffer = noiseBuffer(dur+.05);
    const f = c.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; f.Q.value = q||.7;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(.0001, t0+dur);
    src.connect(f).connect(g).connect(sfxBus); src.start(t0); src.stop(t0+dur+.05);
  }
  function pop(){ glide(520, 980, .14, 'sine', .13); tone(1480, .09, 'sine', .04, .06); }              // tutorial bubble appears
  function sparkle(){ [1046.5,1318.5,1568,2093].forEach((f,i)=> tone(f, .16, 'triangle', .06, i*.055)); }   // step completed
  function tick(last){ tone(last?1568:1175, .05, 'square', .035); }                                     // countdown
  function reveal(){ noiseHit(.35, 'bandpass', 1400, .05, 0, .6); glide(330, 880, .3, 'triangle', .07); } // question pops up
  function warn(){ tone(330, .09, 'square', .06); tone(262, .12, 'square', .06, .12); }                 // gentle hazard buzz
  function score(){ tone(987.8, .07, 'square', .045); tone(1318.5, .16, 'square', .045, .07); }         // coin
  let stepAlt = false;
  function footstep(){ stepAlt = !stepAlt; noiseHit(.09, 'lowpass', stepAlt?420:340, .09); }             // walking
  function fanfare(){                                                                                    // gateway / finish
    [523.25,659.25,783.99,1046.5].forEach((f,i)=> tone(f, .2, 'triangle', .1, i*.1));
    [523.25,659.25,783.99].forEach(f=> tone(f, .9, 'sine', .06, .42));
  }

  // ── MUSIC ──
  // 'calm'  : the slow generative pad (gameplay — keeps focus on reading and deciding)
  // 'bright': an upbeat, gentle loop for the menu and the tutorial — plucked arpeggios
  //           over a I–V–vi–IV progression in C, soft bass, warm pad and a light shaker,
  //           sequenced live with a look-ahead scheduler (no audio files).
  function startMusic(mode){
    mode = mode || 'bright';
    const c = ensureCtx(); if(!c) return;
    if(musicNodes && musicNodes.mode === mode) return;
    stopMusic();
    musicNodes = mode === 'calm' ? startPad(c) : startBright(c);
    musicNodes.mode = mode;
  }
  function startPad(c){
    const t0 = c.currentTime;
    const out = c.createGain(); out.gain.value = 1; out.connect(musicBus);
    const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 900; filt.Q.value = .5;
    filt.connect(out);
    const lfo = c.createOscillator(); lfo.frequency.value = .045;
    const lfoGain = c.createGain(); lfoGain.gain.value = 350;
    lfo.connect(lfoGain).connect(filt.frequency); lfo.start(t0);
    const notes = [110, 146.83, 164.81, 220, 293.66]; // A2 D3 E3 A3 D4 — open, calm pad
    const oscs = notes.map((f,i)=>{
      const osc = c.createOscillator(); osc.type = 'sine'; osc.frequency.value = f;
      const g = c.createGain(); g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(.03 + (i===0?.02:0), t0 + 4 + i*.6);
      osc.connect(g).connect(filt); osc.start(t0);
      return osc;
    });
    return { out, stop:(t)=>{ oscs.forEach(o=>o.stop(t)); lfo.stop(t); } };
  }
  const mf = (m)=> 440*Math.pow(2,(m-69)/12);
  const BRIGHT_GAIN = 10;
  function startBright(c){
    // Level-calibrated like the scene score (it measured ≈ −47 dBFS before — far too quiet):
    // boost, then a compressor so the louder mix never clips.
    const out = c.createGain(); out.gain.setValueAtTime(0, c.currentTime); out.gain.linearRampToValueAtTime(1, c.currentTime+2);
    out.connect(musicBus);
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -18; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = .01; comp.release.value = .25;
    comp.connect(out);
    const boost = c.createGain(); boost.gain.value = BRIGHT_GAIN; boost.connect(comp);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3400; lp.connect(boost);
    const chords = [[60,64,67],[55,59,62],[57,60,64],[53,57,60]];   // C  G  Am  F
    const pattern = [0,1,2,1, 0,2,1,2];                             // arpeggio over 8ths
    const spb = 60/100, step = spb/2;                               // 100 bpm, 8th notes
    let next = c.currentTime + .1, i = 0;
    const voice = (freq, t, dur, type, vol)=>{
      const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t+.012);
      g.gain.exponentialRampToValueAtTime(.0001, t+dur);
      o.connect(g).connect(lp); o.start(t); o.stop(t+dur+.05);
    };
    const shaker = (t)=>{
      const src = c.createBufferSource(); src.buffer = noiseBuffer(.08);
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6500;
      const g = c.createGain(); g.gain.setValueAtTime(.018, t); g.gain.exponentialRampToValueAtTime(.0001, t+.06);
      src.connect(hp).connect(g).connect(lp); src.start(t); src.stop(t+.08);
    };
    const timer = setInterval(()=>{
      while(next < c.currentTime + .25){
        const bar = Math.floor(i/8) % chords.length, pos = i % 8, ch = chords[bar];
        voice(mf(ch[pattern[pos]] + 12), next, .42, 'triangle', .045);           // pluck
        if(pos === 0 || pos === 4) voice(mf(ch[0] - 12), next, .55, 'sine', .085); // bass on 1 and 3
        if(pos === 0) ch.forEach(n=> voice(mf(n), next, spb*4, 'sine', .012));     // warm pad
        if(pos % 2 === 1) shaker(next);                                            // off-beat shaker
        if(i % 32 === 28) voice(mf(ch[2] + 24), next, .3, 'sine', .02);            // little sparkle every 4 bars
        next += step; i++;
      }
    }, 30);
    return { out, stop:()=> clearInterval(timer) };
  }
  // ── ADAPTIVE SCENE SCORE ──
  // Live-sequenced music for the scenarios, matched to the hazard and to what the
  // student is doing. Each scene has a mood (flood / typhoon / calm) that sets key,
  // tempo, progression and instruments; separate layers (pad, bass, melody, drums) are
  // faded in and out by phase: 'observe' (story + watching), 'question' (reading —
  // sparse so it never competes with the text) and 'control' (walking — full energy).
  // intensity (0–1) brightens the filter and lifts the drums for riskier scenes.
  const MOODS = {
    flood:   { bpm:92,  chords:[[57,60,64],[53,57,60],[48,52,55],[55,59,62]],   // Am  F  C  G — hopeful, alert
               arp:[0,1,2,1,2,1,0,2], arpOct:12, arpType:'triangle', bassType:'sine', padType:'triangle', kick:[0,8], snare:[4,12], hat:'8' },
    typhoon: { bpm:108, chords:[[50,53,57],[46,50,53],[53,57,60],[48,52,55]],   // Dm  B♭  F  C — urgent, windswept
               arp:[0,0,1,0,2,0,1,2], arpOct:12, arpType:'square',   bassType:'sawtooth', padType:'sawtooth', kick:[0,6,8,14], snare:[4,12], hat:'16', drive:true },
    calm:    { bpm:84,  chords:[[60,64,67],[57,60,64],[53,57,60],[55,59,62]],   // C  Am  F  G — light, curious
               arp:[0,1,2,1,0,1,2,1], arpOct:12, arpType:'triangle', bassType:'sine', padType:'sine', kick:[0,8], snare:[12], hat:'8' }
  };
  const PHASES = {             // target gain per layer — the music never drops out; it only thins
    observe:  { pad:1,   bass:.8,  arp:.55, lead:.85, drums:.35 },
    question: { pad:.9,  bass:.6,  arp:.4,  lead:.6,  drums:.18 },
    control:  { pad:.85, bass:1,   arp:.9,  lead:1,   drums:1 }
  };
  // Calibrated so the scene score sits at real background-music level (≈ −24 dBFS RMS),
  // a few dB above the rain/wind ambience. (It used to measure ≈ −48 dBFS: inaudible.)
  const SCENE_GAIN = 0.42;
  let reverbIR = null;
  function makeReverb(c){
    if(!reverbIR){                                            // 2.4 s synthetic room, stereo
      const len = Math.floor(c.sampleRate*2.4); reverbIR = c.createBuffer(2, len, c.sampleRate);
      for(let ch=0; ch<2; ch++){ const d = reverbIR.getChannelData(ch); for(let i=0;i<len;i++) d[i] = (Math.random()*2-1) * Math.pow(1 - i/len, 3.2); }
    }
    const cv = c.createConvolver(); cv.buffer = reverbIR; return cv;
  }
  function startScene(c, cfg){
    // cfg.theme overrides the base mood per scene (chords, bpm, arp pattern, accel…)
    const mood = Object.assign({}, MOODS[cfg.mood] || MOODS.flood, cfg.theme || {});
    let inten = Math.max(0, Math.min(1, cfg.intensity==null ? .5 : cfg.intensity));
    const out = c.createGain(); out.gain.setValueAtTime(0, c.currentTime); out.gain.linearRampToValueAtTime(SCENE_GAIN, c.currentTime + 2.5);
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 3.5; comp.attack.value = .01; comp.release.value = .25;
    comp.connect(out); out.connect(musicBus);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400 + inten*3000; lp.Q.value = .4;
    const rev = makeReverb(c), wet = c.createGain(); wet.gain.value = .22;
    lp.connect(comp); lp.connect(rev); rev.connect(wet).connect(comp);
    const layer = {}; ['pad','bass','arp','lead','drums'].forEach(k=>{ const g = c.createGain(); g.gain.value = 0; g.connect(lp); layer[k] = g; });
    const setPhase = (ph, fade)=>{
      const P = PHASES[ph] || PHASES.observe, t = c.currentTime, f = fade==null ? 1.6 : fade;
      Object.keys(layer).forEach(k=>{ const g = layer[k].gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(P[k], t + f); });
      node.phase = ph;
    };
    const setIntensity = (v)=>{                               // live: filter brightness + drum weight
      inten = Math.max(0, Math.min(1, v));
      lp.frequency.cancelScheduledValues(c.currentTime);
      lp.frequency.setTargetAtTime(2400 + inten*3000, c.currentTime, .6);
    };
    // accel: {to: tempo multiplier, bars} — tempo rises across `bars` bars then resets
    let spb = 60/mood.bpm, s16 = spb/4;
    let next = c.currentTime + .15, i = 0;                    // i counts 16th notes
    const voice = (dest, freq, t, dur, type, vol, attack, detune)=>{
      const o = c.createOscillator(); o.type = type; o.frequency.value = freq; if(detune) o.detune.value = detune;
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + (attack||.01));
      g.gain.setTargetAtTime(0, t + Math.max(attack||.01, dur*.6), dur*.35);
      o.connect(g).connect(dest); o.start(t); o.stop(t + dur*1.6 + .1);
    };
    // instruments
    const strings = (n, t, dur)=>{ const f = mf(n), sw = mood.padType==='sawtooth';           // warm detuned string pad
      voice(layer.pad, f, t, dur, sw?'sawtooth':'triangle', sw?.022:.04, .6, -7);
      voice(layer.pad, f, t, dur, sw?'sawtooth':'triangle', sw?.022:.04, .6, +7); };
    const epiano = (n, t, dur, vol)=>{ const f = mf(n);                                          // electric-piano melody
      voice(layer.lead, f, t, dur, 'sine', vol, .008); voice(layer.lead, f*2, t, dur*.5, 'triangle', vol*.28, .005); };
    const pluck = (n, t, vol)=>{ voice(layer.arp, mf(n), t, .34, mood.arpType, vol, .006);
      if(mood.arpType==='triangle') voice(layer.arp, mf(n)*2, t, .2, 'sine', vol*.3, .005); };
    const kick = (t, v)=>{ const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(mood.drive?120:105, t); o.frequency.exponentialRampToValueAtTime(42, t+.18);
      const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t+.32); o.connect(g).connect(layer.drums); o.start(t); o.stop(t+.35); };
    const noiseHit = (t, f, q, v, d, type)=>{ const src = c.createBufferSource(); src.buffer = noiseBuffer(d+.05);
      const bp = c.createBiquadFilter(); bp.type = type||'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t+d);
      src.connect(bp).connect(g).connect(layer.drums); src.start(t); src.stop(t+d+.05); };
    // a sung-style melody: two alternating one-bar rhythms built on each bar's chord tones
    const PHRASE = [
      [[0,3,2],[4,2,1],[6,2,0],[8,4,1],[12,4,2]],             // [16th position, length in 16ths, chord-tone index]
      [[0,4,0],[4,2,2],[6,2,1],[8,6,0],[14,2,1]]
    ];
    const timer = setInterval(()=>{
      while(next < c.currentTime + .3){
        const barN = Math.floor(i/16), bar = barN % mood.chords.length, pos = i % 16, ch = mood.chords[bar];
        if(mood.accel && pos === 0){
          const k = (barN % mood.accel.bars) / Math.max(1, mood.accel.bars-1);
          spb = 60/(mood.bpm * (1 + (mood.accel.to-1)*k)); s16 = spb/4;
        }
        const ctl = node.phase === 'control';
        if(pos === 0) ch.forEach(n=> strings(n, next, spb*4.2));                           // pad: whole bar
        if(mood.drive ? pos % 2 === 0 : (pos === 0 || pos === 6 || pos === 8 || pos === 14)) // bass
          { voice(layer.bass, mf(ch[0]-12), next, mood.drive ? s16*1.8 : spb*1.1, mood.bassType, mood.drive ? .07 : .11, .01);
            voice(layer.bass, mf(ch[0]-24), next, mood.drive ? s16*1.8 : spb*1.1, 'sine', .06, .01); }
        if(pos % 2 === 0 || (ctl && mood.drive)) {                                         // arpeggio
          const idx = mood.arp[Math.floor((pos/(ctl && mood.drive ? 1 : 2)) % mood.arp.length)];
          pluck(ch[idx] + mood.arpOct, next, mood.arpType==='square' ? .022 : .045);
        }
        PHRASE[barN % 2].forEach(([p, len, ti])=>{ if(p === pos) epiano(ch[ti] + 24 - (ti===2 && bar%2 ? 12 : 0), next, s16*len*1.4, .07); });
        if(mood.kick.includes(pos)) kick(next, .2 + inten*.08);                             // drums
        if(mood.snare.includes(pos)) noiseHit(next, 1800, .9, .06 + inten*.03, .14);
        if(mood.hat === '16' || pos % 2 === 0) noiseHit(next, 8000, .7, pos % 4 === 2 ? .022 : .012, .04, 'highpass');
        if(mood.drive && pos === 0 && barN % 2 === 0) noiseHit(next, 140, 1.2, .14, .5, 'lowpass');
        next += s16; i++;
      }
    }, 30);
    const node = { out, phase:'observe', setPhase, setIntensity, stop:()=> clearInterval(timer), key: cfg.key || ((cfg.mood||'flood') + ':' + inten.toFixed(2)) };
    setPhase(cfg.phase || 'observe', .1);
    return node;
  }
  // Scene music for a scenario: same mood+intensity just changes phase, otherwise crossfades.
  function sceneMusic(cfg){
    const c = ensureCtx(); if(!c) return;
    const key = cfg.key || ((cfg.mood||'flood') + ':' + Math.max(0,Math.min(1,cfg.intensity==null?.5:cfg.intensity)).toFixed(2));
    if(musicNodes && musicNodes.mode === 'scene' && musicNodes.key === key){ musicNodes.setPhase(cfg.phase || 'observe'); return; }
    cfg = Object.assign({}, cfg, { key });
    stopMusic();
    musicNodes = startScene(c, cfg); musicNodes.mode = 'scene';
  }
  function musicPhase(ph){ if(musicNodes && musicNodes.setPhase) musicNodes.setPhase(ph); }
  function musicIntensity(v){ if(musicNodes && musicNodes.setIntensity) musicNodes.setIntensity(v); }

  function stopMusic(){
    if(!musicNodes || !ctx) return;
    const n = musicNodes; musicNodes = null;
    const t0 = ctx.currentTime;
    n.out.gain.cancelScheduledValues(t0); n.out.gain.setValueAtTime(n.out.gain.value, t0);
    n.out.gain.linearRampToValueAtTime(0, t0+1.2);
    setTimeout(()=>{ try{ n.stop(ctx.currentTime); n.out.disconnect(); }catch(e){} }, 1300);
  }
  // Lower the music under the voiceover, then bring it back.
  function duck(on){
    if(!musicBus || !ctx) return;
    const t0 = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(t0); musicBus.gain.setValueAtTime(musicBus.gain.value, t0);
    musicBus.gain.linearRampToValueAtTime(on ? .28 : 1, t0 + (on ? .25 : .8));
  }

  // ── looping environmental ambience (wind / rain / water) — one active at a time,
  // crossfaded so switching scenarios doesn't click/pop ──
  function setAmbience(kind, intensity){
    const c = ensureCtx(); if(!c) return;
    if(ambienceNodes){
      const old = ambienceNodes; ambienceNodes = null;
      const t0 = c.currentTime;
      old.g.gain.cancelScheduledValues(t0); old.g.gain.setValueAtTime(old.g.gain.value, t0);
      old.g.gain.linearRampToValueAtTime(0, t0+.8);
      setTimeout(()=>{ try{ old.src.stop(); if(old.lfo) old.lfo.stop(); }catch(e){} }, 900);
    }
    if(!kind) return;
    const t0 = c.currentTime;
    const src = c.createBufferSource(); src.buffer = noiseBuffer(2); src.loop = true;
    const filt = c.createBiquadFilter();
    const g = c.createGain(); g.gain.value = 0;
    const lvl = Math.max(.15, Math.min(1, intensity==null?.5:intensity));
    let lfo = null;
    if(kind === 'wind'){
      filt.type = 'bandpass'; filt.frequency.value = 500; filt.Q.value = .6;
      lfo = c.createOscillator(); lfo.frequency.value = .15;
      const lfoGain = c.createGain(); lfoGain.gain.value = 140;
      lfo.connect(lfoGain).connect(filt.frequency); lfo.start(t0);
    } else if(kind === 'rain'){
      filt.type = 'highpass'; filt.frequency.value = 1200; filt.Q.value = .3;
    } else { // water
      filt.type = 'lowpass'; filt.frequency.value = 340; filt.Q.value = .4;
    }
    src.connect(filt).connect(g).connect(ambienceBus);
    g.gain.linearRampToValueAtTime((kind==='wind' ? .2 : .3)*lvl, t0+1.2);   // rain/wind/water bed, sitting under the scene music
    src.start(t0);
    ambienceNodes = {src, filt, g, lfo};
  }

  // ── VOICEOVER playback through Web Audio ──
  // Recorded voice lines are decoded into buffers and played here rather than with
  // <audio> elements: once the context is unlocked by the first tap, Web Audio can start
  // sound at any time, whereas iOS blocks media elements that start outside a tap (the
  // tutorial advances a moment after each action). Not routed through the music bus,
  // so ducking the music never quiets the voice.
  const voiceCache = {};
  function loadVoice(url){
    const c = ensureCtx(); if(!c) return Promise.reject(new Error('no audio'));
    if(voiceCache[url]) return voiceCache[url];
    voiceCache[url] = fetch(url).then(r=>{ if(!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(ab=> new Promise((res, rej)=>{ const p = c.decodeAudioData(ab, res, rej); if(p && p.then) p.then(res, rej); }));
    voiceCache[url].catch(()=>{ delete voiceCache[url]; });
    return voiceCache[url];
  }
  let voiceSrc = null;
  function playVoice(buf, onend){
    const c = ensureCtx(); if(!c || !buf) return;
    stopVoice();
    if(c.state === 'suspended') c.resume().catch(()=>{});
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain(); g.gain.value = 1.15;
    src.connect(g).connect(master);
    src.onended = ()=>{ if(voiceSrc === src){ voiceSrc = null; if(onend) onend(); } };
    src.start(); voiceSrc = src;
  }
  function stopVoice(){ if(voiceSrc){ const s = voiceSrc; voiceSrc = null; try{ s.onended = null; s.stop(); }catch(e){} } }

  // Developer aid: RMS level (dBFS) of the music and ambience buses, to keep the mix balanced.
  let meters = null;
  function meter(){
    const c = ensureCtx(); if(!c) return null;
    if(!meters){
      meters = {};
      [['music',musicBus],['ambience',ambienceBus],['sfx',sfxBus]].forEach(([k,b])=>{ const a = c.createAnalyser(); a.fftSize = 2048; b.connect(a); meters[k] = a; });
    }
    const out = {};
    Object.entries(meters).forEach(([k,a])=>{ const d = new Float32Array(a.fftSize); a.getFloatTimeDomainData(d); let sum=0; for(const v of d) sum += v*v; const rms = Math.sqrt(sum/d.length); out[k] = rms > 0 ? +(20*Math.log10(rms)).toFixed(1) : -120; });
    out.state = c.state;
    return out;
  }

  function toggleMute(){
    muted = !muted;
    if(master) master.gain.linearRampToValueAtTime(muted?0:.9, (ctx?ctx.currentTime:0)+.15);
    return muted;
  }
  function isMuted(){ return muted; }

  return { init, click, correct, wrong, narration, startMusic, stopMusic, setAmbience, toggleMute, isMuted,
           pop, sparkle, tick, reveal, warn, score, footstep, fanfare, duck, loadVoice, playVoice, stopVoice, sceneMusic, musicPhase, musicIntensity, meter };
})();
