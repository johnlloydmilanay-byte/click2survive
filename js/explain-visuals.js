'use strict';
// ═══════════════════════════════════════════════
//  ANIMATED VISUAL EXPLANATIONS for the feedback card
// ═══════════════════════════════════════════════
// Every question gets a short looping diagram of the physics behind its answer, drawn
// as inline SVG with SMIL animation (no canvas, no libraries), plus 3–5 numbered steps
// that light up in time with the animation. The diagram is chosen by the item's
// `scene` (Grades 7, 11, 12 and the tutorial) or by the grade's scenario type (Grade 8
// rainfall/current, Grade 9 buoyancy lab, Grade 10 wind), and uses that question's own
// numbers where it has them (rainfall, current speed, wind speed, hull volume, …).
//
// Public API:
//   renderExplainVisual(scen, {grade, lab})  → fills #fb-visual, starts step sync
//   explainVisualFor(scen, opts)             → {T, svg, steps} (used by the preview page)

const XV = (()=>{
  const C = { water:'#38bdf8', resist:'#fb923c', net:'#f87171', safe:'#4ade80', vel:'#facc15',
              purple:'#a78bfa', white:'#e2e8f0', dim:'#64748b', wood:'#a16207', ground:'#334155' };
  let uid = 0;

  // ─── animation helpers (times in seconds; T = loop length) ───
  function pts(T, p){
    p = p.slice();
    if(p[0][0] > 0) p.unshift([0, p[0][1]]);
    if(p[p.length-1][0] < T) p.push([T, p[p.length-1][1]]);
    return p;
  }
  const kt = (T, p)=> p.map(q=>(q[0]/T).toFixed(4)).join(';');
  // <animate> through [t, value] points
  function A(attr, T, p, extra){
    p = pts(T, p);
    return `<animate attributeName="${attr}" dur="${T}s" repeatCount="indefinite" values="${p.map(q=>q[1]).join(';')}" keyTimes="${kt(T,p)}" ${extra||''}/>`;
  }
  // <animateTransform>; ease:true eases every segment, 'in' accelerates (falling, pushed)
  function AT(type, T, p, ease){
    p = pts(T, p);
    const spl = ease ? ` calcMode="spline" keySplines="${p.slice(1).map(()=> ease==='in' ? '.55 0 1 .6' : '.42 0 .58 1').join(';')}"` : '';
    return `<animateTransform attributeName="transform" type="${type}" dur="${T}s" repeatCount="indefinite" values="${p.map(q=>q[1]).join(';')}" keyTimes="${kt(T,p)}"${spl}/>`;
  }
  // fade in at t0 (and out at t1, default just before the loop restarts)
  const show = (T, t0, t1)=> A('opacity', T, [[0,0],[t0,0],[t0+.35,1],[(t1||T-.45),1],[(t1||T-.45)+.3,0]]);
  const hide = (T, t0)=> A('opacity', T, [[0,1],[t0,1],[t0+.35,0],[T-.3,0],[T,1]]);

  // ─── drawing helpers ───
  function arrowDefs(id){
    return '<defs>' + Object.entries(C).map(([k,c])=>
      `<marker id="${id}-${k}" viewBox="0 0 10 10" refX="7.5" refY="5" markerWidth="3.6" markerHeight="3.6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker>`).join('') + '</defs>';
  }
  const arrow = (id, x1, y1, x2, y2, col, w)=>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C[col]}" stroke-width="${w||3.5}" stroke-linecap="round" marker-end="url(#${id}-${col})"/>`;
  const escT = s=> String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  function text(x, y, s, o){
    o = o || {}; s = escT(s);
    return `<text x="${x}" y="${y}" font-size="${o.size||11}" font-weight="${o.weight||700}" fill="${o.fill||C.white}" text-anchor="${o.anchor||'middle'}"`
      + ` stroke="#020617" stroke-width="3" paint-order="stroke" stroke-linejoin="round"${o.style?` font-style="${o.style}"`:''}>${s}</text>`;
  }
  const person = (x, y, col, s)=>{ s = s||1; return `<g transform="translate(${x},${y}) scale(${s})" stroke="${col||C.white}" stroke-width="2.2" stroke-linecap="round" fill="none">`
    + `<circle cx="0" cy="-23" r="4.2" fill="${col||C.white}" stroke="none"/><line x1="0" y1="-18" x2="0" y2="-7"/><line x1="0" y1="-7" x2="-4" y2="0"/><line x1="0" y1="-7" x2="4" y2="0"/><line x1="-5" y1="-14" x2="5" y2="-14"/></g>`; };
  const check = (x, y, ok)=> `<g transform="translate(${x},${y})"><circle r="8" fill="${ok?'#14532d':'#7f1d1d'}" stroke="${ok?C.safe:C.net}" stroke-width="1.6"/>`
    + (ok ? `<path d="M-3.6,0 L-1,2.8 L3.8,-2.8" stroke="${C.safe}" stroke-width="2" fill="none" stroke-linecap="round"/>`
          : `<path d="M-3,-3 L3,3 M3,-3 L-3,3" stroke="${C.net}" stroke-width="2" stroke-linecap="round"/>`) + '</g>';
  const water = (y0, y1, x0, x1)=> `<rect x="${x0||0}" y="${y0}" width="${(x1||400)-(x0||0)}" height="${y1-y0}" fill="#0c4a6e" opacity=".55"/>`
    + `<line x1="${x0||0}" y1="${y0}" x2="${x1||400}" y2="${y0}" stroke="${C.water}" stroke-width="1.4" opacity=".8"/>`;
  // drifting current streaks between x0 and x1, speed = px/s
  function streaks(T, y0, y1, speed, n, x0, x1){
    n = n || 7; x0 = x0 || 0; x1 = x1 == null ? 400 : x1;
    const span = x1 - x0 - 16, d = Math.max(.6, span/speed);
    let s = '';
    for(let i=0;i<n;i++){
      const y = y0 + (y1-y0)*((i*.37+.08)%1);
      s += `<line x1="${x0}" y1="${y.toFixed(1)}" x2="${x0+16}" y2="${y.toFixed(1)}" stroke="#bae6fd" stroke-width="1.6" stroke-linecap="round" opacity="0">`
        + `<animateTransform attributeName="transform" type="translate" from="0 0" to="${span} 0" dur="${d.toFixed(2)}s" begin="${(-i*d/n).toFixed(2)}s" repeatCount="indefinite"/>`
        + `<animate attributeName="opacity" values="0;.6;.6;0" keyTimes="0;.15;.85;1" dur="${d.toFixed(2)}s" begin="${(-i*d/n).toFixed(2)}s" repeatCount="indefinite"/></line>`;
    }
    return s;
  }
  // stroke "drawing" of a path of known length
  const draw = (T, t0, t1, len)=> `stroke-dasharray="${len}" stroke-dashoffset="${len}"`;
  const drawAnim = (T, t0, t1, len)=> A('stroke-dashoffset', T, [[0,len],[t0,len],[t1,0],[T-.45,0],[T-.15,len]]);
  const S = (t, s)=> ({t, s});
  // Bar standing on y = base that grows to fractions of hFull at given times: pts = [[t, 0–1], …]
  function growBar(T, x, base, w, hFull, fill, p, ease, extra){
    return `<g transform="translate(${x} ${base})"><rect x="0" y="${-hFull}" width="${w}" height="${hFull}" rx="3" fill="${fill}" ${extra||''}>`
      + AT('scale', T, p.map(([t,f])=>[t, `1 ${Math.max(.0001, f).toFixed(4)}`]), ease) + '</rect></g>';
  }
  const fmt = (n, d)=> Number(n).toLocaleString('en-US', {maximumFractionDigits: d==null?0:d, minimumFractionDigits: d||0});

  // ═══ TEMPLATES ═══

  // Net force on a floating bin (G7 #1): push vs friction → net force → acceleration.
  function binForce(id){
    const T = 9;
    const body = water(108, 170) + streaks(T, 116, 166, 90)
      + `<path d="M0,74 Q40,66 92,74 L92,108 L0,108 Z" fill="#3f6212" opacity=".7"/>` + text(46, 64, 'Higher ground', {size:9, fill:'#bef264', weight:600})
      + person(46, 104, C.safe) + `<g opacity="0">${show(T,6.2)}${check(62,78,true)}</g>`
      + `<g transform="translate(70,0)"><g>${AT('translate', T, [[0,'0 0'],[3.8,'0 0'],[7.6,'190 0']], 'in')}`
      +   `<rect x="56" y="98" width="30" height="34" rx="4" fill="#2f7d3a" stroke="#14532d" stroke-width="2"/><rect x="53" y="94" width="36" height="6" rx="2" fill="#1f5a2a"/>`
      +   `<g opacity="0">${show(T,.6)}${arrow(id,8,116,50,116,'water',4)}${text(26,108,'F_water',{fill:C.water,size:10})}</g>`
      +   `<g opacity="0">${show(T,1.8)}${arrow(id,112,124,92,124,'resist',3.5)}${text(112,145,'F_friction',{fill:C.resist,size:10})}</g>`
      +   `<g opacity="0">${show(T,3)}${arrow(id,60,84,96,84,'net',4)}${text(78,76,'F_net',{fill:C.net,size:10})}</g>`
      + `</g></g>`
      + `<g opacity="0">${show(T,3)}${text(250,40,'F_net = F_water − F_friction ≠ 0',{size:12,fill:'#fecaca'})}</g>`
      + `<g opacity="0">${show(T,4.2)}${text(250,58,'unbalanced → the bin speeds up ⟶',{size:10.5,fill:C.vel})}</g>`
      + `<rect x="345" y="92" width="55" height="16" fill="#78350f"/>` + text(372,88,'boat landing',{size:8.5,fill:'#fde68a',weight:600});
    return { T, body, steps:[
      S(.6,'The moving floodwater pushes the bin forward (F_water).'),
      S(1.8,'Friction pushes back on the bin, but it is smaller (F_friction).'),
      S(3,'The forces are unbalanced: F_net = F_water − F_friction ≠ 0.'),
      S(3.8,'A net force makes the bin accelerate along the path toward the landing.'),
      S(6.2,'Safe decision: stay out of its path, on higher ground.')] };
  }

  // Hanging sign in a gust (G7 #2, G12 #2): balanced → unbalanced → tilts → falls.
  function sign(id, scen){
    const T = 10, eq = scen && scen.comp && /Newton/.test(scen.comp);
    const signG = `<g>${AT('rotate', T, [[0,'0 160 46'],[2.2,'0 160 46'],[3.6,'-38 160 46'],[5,'-34 160 46'],[5.3,'-34 160 46']], true)}`
      + `<g>${AT('translate', T, [[0,'0 0'],[5.3,'0 0'],[6.4,'40 92'],[T-.4,'40 92'],[T-.1,'0 0']], 'in')}`
      + `<line x1="148" y1="46" x2="148" y2="58" stroke="#94a3b8" stroke-width="1.6"/><line x1="172" y1="46" x2="172" y2="58" stroke="#94a3b8" stroke-width="1.6"/>`
      + `<rect x="134" y="58" width="52" height="30" rx="3" fill="#2563eb" stroke="#e2e8f0" stroke-width="2"/>` + text(160,77,'BRIDGE →',{size:8.5})
      + `</g></g>`;
    const body = `<rect x="0" y="152" width="400" height="38" fill="${C.ground}"/>` + text(70,172,'pathway',{size:9,fill:'#94a3b8',weight:600})
      + `<line x1="112" y1="152" x2="112" y2="40" stroke="#64748b" stroke-width="5"/><line x1="112" y1="44" x2="176" y2="44" stroke="#64748b" stroke-width="4"/>`
      + signG
      + `<ellipse cx="205" cy="154" rx="46" ry="7" fill="${C.net}" opacity="0">${show(T,4.6)}</ellipse>` + `<g opacity="0">${show(T,4.6)}${text(205,183,'possible fall zone',{size:9,fill:'#fecaca'})}</g>`
      + `<g opacity="0">${show(T,.5,2.3)}${arrow(id,64,72,124,72,'white',3.5)}${arrow(id,248,72,194,72,'resist',3.5)}${text(250,40,eq?'At rest: ΣF = 0 and Στ = 0':'Balanced: wind push = holding force',{size:11,fill:C.safe})}</g>`
      + `<g opacity="0">${show(T,2.3,5.3)}${arrow(id,40,72,124,72,'white',4.5)}${arrow(id,236,72,208,72,'resist',3)}${text(276,40,eq?'F_wind > F_support → ΣF ≠ 0':'Gust: F_wind > F_holding → unbalanced',{size:11,fill:'#fecaca'})}</g>`
      + `<g opacity="0">${show(T,2.3,5.3)}${text(74,64,'F_wind',{size:10})}</g>`
      + `<g opacity="0">${show(T,5.3)}${text(290,40,eq?'ΣF = ma: it accelerates, then gravity takes over':'Fastenings give way — gravity pulls it down',{size:10.5,fill:'#fecaca'})}</g>`
      + person(352, 152, C.safe) + `<g opacity="0">${show(T,6.6)}${check(366,118,true)}${text(352,104,'stay clear',{size:9,fill:C.safe})}</g>`;
    return { T, body, steps:[
      S(.5, eq ? 'At rest the sign is in equilibrium: ΣF = 0 and Στ = 0.' : 'The wind push and the holding force balance — the sign hangs still.'),
      S(2.3, eq ? 'A strong gust makes F_wind bigger than the support force: ΣF ≠ 0.' : 'A strong gust: the wind push becomes bigger than the holding force.'),
      S(3, 'The unbalanced force swings the sign toward the pathway.'),
      S(5.3, 'If the fastenings fail, gravity pulls it down onto the path.'),
      S(6.6, 'Safe decision: stay away from the sign and its fall zone.')] };
  }

  // Two routes, same displacement (G7 #3, #4, tutorial practice).
  function routes(id, kind){
    const T = 10;
    const lbl = kind==='tree' ? {a:'direct path · blocked', b:'marked route · longer', d:'Δx = 100 m East'}
              : kind==='puddle' ? {a:'straight · deep puddle', b:'dry path · longer', d:'same Δx'}
              : {a:'Route A · shorter · flooded', b:'Route B · longer · dry', d:'same Δx'};
    const pB = 'M50,140 L50,48 L350,48 L350,140', lenB = 92+300+92;
    const obstacle = kind==='tree'
      ? `<g transform="translate(200,140) rotate(-8)"><rect x="-58" y="-7" width="116" height="14" rx="7" fill="${C.wood}"/><circle cx="-62" cy="-2" r="16" fill="#3f6212"/><circle cx="-50" cy="-14" r="12" fill="#4d7c0f"/></g>`
      : `<ellipse cx="200" cy="140" rx="70" ry="20" fill="#0c4a6e" opacity=".85"/>` + streaks(T,132,148,40,4,150,250);
    const body = `<rect x="0" y="0" width="400" height="190" fill="#14261a" opacity=".55"/>`
      + `<line x1="50" y1="140" x2="350" y2="140" stroke="#64748b" stroke-width="10" stroke-linecap="round" opacity=".7"/>`
      + `<path d="${pB}" stroke="#92785a" stroke-width="10" fill="none" stroke-linejoin="round" opacity=".75"/>`
      + obstacle
      + `<circle cx="50" cy="140" r="7" fill="${C.white}"/>` + text(50,166,'start',{size:9})
      + `<rect x="336" y="126" width="28" height="22" rx="3" fill="#166534" stroke="${C.safe}" stroke-width="1.5"/>` + text(350,166,kind==='tree'?'shelter':'safe area',{size:9,fill:C.safe})
      + `<g opacity="0">${show(T,.5)}${arrow(id,58,112,338,112,'vel',3)}${text(200,104,lbl.d,{fill:C.vel,size:11})}</g>`
      + `<g opacity="0">${show(T,1.8)}<line x1="50" y1="140" x2="350" y2="140" stroke="${C.net}" stroke-width="3" stroke-dasharray="6 5"/>${text(200,182,lbl.a,{fill:'#fecaca',size:10})}${check(200,140,false)}</g>`
      + `<path d="${pB}" stroke="${C.safe}" stroke-width="3.5" fill="none" stroke-linejoin="round" ${draw(T,3,6,lenB)}>${drawAnim(T,3.2,7,lenB)}</path>`
      + `<g opacity="0">${show(T,3.2)}${text(200,38,lbl.b,{fill:C.safe,size:10.5})}</g>`
      + `<circle r="6" fill="${C.safe}" stroke="#052e16" stroke-width="1.5" opacity="0">${show(T,3.2)}<animateMotion dur="${T}s" repeatCount="indefinite" path="${pB}" keyPoints="0;0;1;1" keyTimes="0;${(3.2/T).toFixed(3)};${(7/T).toFixed(3)};1" calcMode="linear"/></circle>`
      + `<g opacity="0">${show(T,7)}${text(200,72,'distance d = l₁ + l₂ + l₃  (longer, but safe)',{size:10.5,fill:C.white})}</g>`;
    return { T, body, steps:[
      S(.5, kind==='tree' ? 'Displacement is the straight-line change in position: 100 m East.' : 'Both paths start and end at the same places, so the displacement Δx is the same.'),
      S(1.8, kind==='tree' ? 'The direct path is blocked by the fallen tree.' : kind==='puddle' ? 'The straight path goes through a deep puddle.' : 'The shorter route goes through floodwater.'),
      S(3.2, 'The other route covers a longer distance d = l₁ + l₂ + l₃ …'),
      S(7, '… but it is dry and passable, so it is the safe choice. Shortest is not always safest.')] };
  }

  // Equal time intervals, growing distances (G7 #5): the current is speeding up.
  function equalTime(id){
    const T = 9, xs = [40,58,94,148,220,310], t0 = .6;
    let marks = '';
    xs.forEach((x,i)=>{
      const t = t0 + i;
      marks += `<g opacity="0">${show(T,t)}<line x1="${x}" y1="70" x2="${x}" y2="150" stroke="${C.vel}" stroke-width="1.4" stroke-dasharray="3 3"/>${text(x,64,i+' s',{size:9.5,fill:C.vel})}</g>`;
      if(i) marks += `<g opacity="0">${show(T,t)}<line x1="${xs[i-1]+2}" y1="160" x2="${x-2}" y2="160" stroke="${C.vel}" stroke-width="3"/>${text((x+xs[i-1])/2,176,'d'+'₁₂₃₄₅'[i-1],{size:9.5,fill:C.vel})}</g>`;
    });
    const p = xs.map((x,i)=>[t0+i, `${x} 0`]);
    const body = water(84, 150) + streaks(T, 92, 146, 70)
      + `<g>${AT('translate', T, [[0,'40 0'],...p,[T-.4,'310 0'],[T-.1,'40 0']])}<g transform="translate(-40,0)"><rect x="28" y="104" width="26" height="10" rx="5" fill="#a7f3d0" stroke="#065f46" stroke-width="1.4"/><rect x="52" y="106" width="5" height="6" fill="#dc2626"/></g></g>`
      + marks
      + `<g opacity="0">${show(T,5.8)}${text(200,30,'Equal time intervals, growing distances',{size:11.5})}${text(200,46,'→ speed is increasing:  a = Δv / Δt > 0',{size:11,fill:C.vel})}</g>`
      + `<g transform="translate(330,6)" opacity="0">${show(T,6.4)}<rect width="64" height="40" rx="4" fill="#0f172a" stroke="#334155"/><path d="M8,34 Q32,30 56,8" stroke="${C.net}" stroke-width="2.4" fill="none"/>${text(32,12,'v ↑',{size:8.5,fill:'#fecaca'})}</g>`;
    return { T, body, steps:[
      S(.6, 'Marks are placed every 1 second as the bottle floats along.'),
      S(2.6, 'In each equal time interval the bottle travels farther: d₁ < d₂ < d₃ …'),
      S(5.8, 'Greater distance in the same time means the speed is increasing (a > 0).'),
      S(6.4, 'The bottle moves with the water, so the current is getting faster — do not cross.')] };
  }

  // Wind updates 40 → 65 → 90 km/h, force ∝ v² (G7 #6).
  function windUpdates(id, scen){
    const T = 9, v = scen.windSteps || [40,65,90], max = v[v.length-1];
    let bars = '', fbars = '';
    v.forEach((s,i)=>{
      const h = s/max*96, x = 40 + i*52, t = .5 + i*1.4;
      bars += growBar(T, x, 150, 34, h, i===v.length-1?C.net:i?C.resist:C.vel, [[0,0],[t,0],[t+.6,1],[T-.45,1],[T-.15,0]], true)
        + `<g opacity="0">${show(T,t+.4)}${text(x+17,144-h,s,{size:10})}</g>` + text(x+17,166,'#'+(i+1),{size:9,fill:'#94a3b8'});
      const f = (s/v[0])**2, fh = Math.min(100, f/((max/v[0])**2)*100);
      fbars += `<g opacity="0">${show(T,5.2)}<rect x="${238+i*44}" y="${150-fh}" width="30" height="${fh}" rx="3" fill="${C.purple}"/>${text(253+i*44,144-fh,'×'+fmt(f,1),{size:9.5,fill:'#ddd6fe'})}</g>`;
    });
    const body = `<line x1="30" y1="150" x2="200" y2="150" stroke="#475569"/>` + text(110,184,'wind speed (km/h)',{size:9.5,fill:'#94a3b8',weight:600})
      + bars + `<g opacity="0">${show(T,4.4)}${arrow(id,46,30,190,30,'vel',3)}${text(118,22,'Δv > 0 → a = Δv/Δt > 0',{size:10,fill:C.vel})}</g>`
      + `<line x1="228" y1="150" x2="380" y2="150" stroke="#475569"/>` + fbars
      + `<g opacity="0">${show(T,5.2)}${text(306,184,'wind force  F ∝ v²',{size:9.5,fill:'#ddd6fe',weight:600})}</g>`
      + `<g opacity="0">${show(T,6.6)}${text(306,30,'≈ 5× the push on the bridge',{size:10.5,fill:'#fecaca'})}</g>`;
    return { T, body, steps:[
      S(.5, `Update 1: ${v[0]} km/h.`), S(1.9, `Update 2: ${v[1]} km/h.`), S(3.3, `Update 3: ${v[2]} km/h — the wind keeps speeding up (a > 0).`),
      S(5.2, 'Wind force grows with the square of speed, F ∝ v²: about 5× the push at 90 km/h.'),
      S(6.6, 'The hanging bridge sways far more — postpone crossing and stay in a safe place.')] };
  }

  // Grade 8: rainfall → current speed → force on a person (F ∝ v²), with PAGASA levels.
  function currentForce(id, scen){
    const T = 9, r = scen.rain||0, v = scen.vel||0;
    const lvl = r>30 ? ['RED','#ef4444'] : r>15 ? ['ORANGE','#f97316'] : r>7.5 ? ['YELLOW','#eab308'] : ['NONE','#64748b'];
    const gh = Math.min(1, r/45)*96;
    const fv = Math.min(1, (v/1.6)**2), fx = 238 + fv*140;
    const zone = v>1 ? ['UNSAFE', C.net] : v>.5 ? ['RISKY', C.resist] : ['SAFE', C.safe];
    const ratio = (v/.5)**2;
    const body =
      // rain gauge
        `<g opacity="0">${show(T,.4)}<rect x="22" y="44" width="36" height="104" rx="4" fill="none" stroke="#94a3b8" stroke-width="1.6"/>`
      + [[7.5,'#eab308'],[15,'#f97316'],[30,'#ef4444']].map(([m,c])=>`<line x1="20" y1="${148-m/45*96}" x2="60" y2="${148-m/45*96}" stroke="${c}" stroke-width="1.2" stroke-dasharray="3 2"/>`).join('')
      + growBar(T, 24, 148, 32, gh, lvl[1], [[0,0],[.5,0],[1.8,1],[T-.45,1],[T-.15,0]], true, 'opacity=".85"')
      + text(40,36,r+' mm/hr',{size:10}) + text(40,166,'PAGASA',{size:8.5,fill:'#94a3b8'}) + text(40,180,lvl[0],{size:10,fill:lvl[1]}) + `</g>`
      // upstream → current
      + `<g opacity="0">${show(T,1.8)}${arrow(id,70,96,104,96,'water',3)}${text(88,86,'more',{size:8.5,fill:C.water})}${text(88,114,'water',{size:8.5,fill:C.water})}</g>`
      // river with person
      + `<g opacity="0">${show(T,2.4)}${water(96,150,110,222)}${streaks(T,100,146,30+v*90,5,110,222)}${person(166,140,C.white)}`
      + `${arrow(id,118,128,118+Math.min(44,14+v*24),128,'water',3+v*2)}${text(166,184,'current '+fmt(v,1)+' m/s',{size:10,fill:C.water})}</g>`
      // force meter
      + `<g opacity="0">${show(T,4)}${text(308,36,'push of the water on a person',{size:9.5,fill:'#94a3b8',weight:600})}`
      + `<rect x="238" y="70" width="${140*(.5/1.6)**2}" height="16" fill="#14532d"/><rect x="${238+140*(.5/1.6)**2}" y="70" width="${140*((1/1.6)**2-(.5/1.6)**2)}" height="16" fill="#7c2d12"/><rect x="${238+140*(1/1.6)**2}" y="70" width="${140-140*(1/1.6)**2}" height="16" fill="#7f1d1d"/>`
      + text(238+70*(.5/1.6)**2,100,'safe',{size:8,fill:C.safe}) + text(238+140*((.5/1.6)**2+(1/1.6)**2)/2,100,'risky',{size:8,fill:C.resist}) + text(238+140*(1+(1/1.6)**2)/2,100,'unsafe',{size:8,fill:C.net})
      + text(238+140*(.5/1.6)**2,64,'0.5',{size:8,fill:'#94a3b8'}) + text(238+140*(1/1.6)**2,64,'1.0 m/s',{size:8,fill:'#94a3b8'})
      + `<g>${AT('translate',T,[[0,'0 0'],[4.2,'0 0'],[5.6,`${(fx-238).toFixed(1)} 0`],[T-.45,`${(fx-238).toFixed(1)} 0`],[T-.15,'0 0']],true)}<path d="M238,66 l-6,-9 h12 z" fill="${zone[1]}"/><line x1="238" y1="68" x2="238" y2="88" stroke="${zone[1]}" stroke-width="3"/></g></g>`
      + `<g opacity="0">${show(T,5.6)}${text(308,124,'F ∝ v²',{size:13,fill:'#ddd6fe'})}${text(308,142,v>=.5?`${fmt(ratio,1)}× the push at 0.5 m/s`:'small push',{size:10,fill:'#ddd6fe'})}${text(308,166,zone[0],{size:13,fill:zone[1]})}</g>`;
    const verdict = v>1 ? 'Above 1.0 m/s the current can sweep a person off their feet — do not cross.'
      : v>.5 ? 'Between 0.5 and 1.0 m/s the push is risky and rising — waiting is the safer choice.'
      : 'Below 0.5 m/s the push is small — a careful crossing is manageable.';
    return { T, body, steps:[
      S(.4, `Rainfall is ${r} mm/hr — PAGASA ${lvl[0] === 'NONE' ? 'no warning' : lvl[0]+' level'}.`),
      S(1.8, 'Rain upstream adds water to the river, so the current speeds up.'),
      S(2.4, `Here the current is ${fmt(v,1)} m/s — it pushes on anyone standing in it.`),
      S(4, 'The push grows with the square of the speed (F ∝ v²): double the speed, four times the force.'),
      S(5.6, verdict)] };
  }

  // Grade 9 buoyancy lab: people added one by one; W rises toward F_b,max; one too many swamps.
  function boatLoad(id, w, loaded){
    const T = 10;
    const Fb = w.rho*w.g*w.hullV, per = w.pM*w.g, hull = w.hullM*w.g;
    const max = Math.max(0, Math.floor((w.rho*w.hullV - w.hullM)/w.pM));
    const n = max + 1, dt = 6/(n+1);
    let ppl = '', wbar = [], sink = [[0,'0 0']];
    const Wmax = hull + n*per, scale = 100/Math.max(Fb, Wmax);
    for(let i=1;i<=n;i++){
      const t = .8 + i*dt, x = 66 + ((i-1)%5)*18 + (i>5?9:0), y = i>5 ? 82 : 90;
      ppl += `<g opacity="0">${show(T,t)}${person(x, y, i>max ? C.net : C.white, .55)}</g>`;
      const W = hull + i*per;
      wbar.push([t, W/Wmax]);
      const sinkPx = Math.min(1.25, (W/Fb))*30;
      sink.push([t, `0 ${sinkPx.toFixed(1)}`]);
    }
    const tSwamp = .8 + n*dt;
    wbar.unshift([0, hull/Wmax]);
    wbar.push([T-.4, 1], [T-.1, hull/Wmax]);
    sink.push([tSwamp+.6, '0 44'], [T-.4,'0 44'], [T-.1,'0 0']);
    const wH = Wmax*scale;
    const body = water(110, 170, 0, 210) + streaks(T,116,166,25,4,0,210)
      + `<g>${AT('translate',T,sink)}<path d="M36,82 L184,82 L166,124 L54,124 Z" fill="#7c4a1e" stroke="#451a03" stroke-width="2"/>${ppl}</g>`
      + water(110, 170, 0, 210).replace('opacity=".55"','opacity=".35"')
      + `<g opacity="0">${show(T,tSwamp)}${text(110,40,'SWAMPED — one person too many',{size:11,fill:'#fecaca'})}</g>`
      + `<line x1="236" y1="150" x2="390" y2="150" stroke="#475569"/>`
      + growBar(T, 252, 150, 44, wH, C.resist, wbar)
      + text(274,166,'W total',{size:9.5,fill:C.resist})
      + `<rect x="318" y="${150-Fb*scale}" width="44" height="${Fb*scale}" fill="${C.water}" opacity=".85" rx="3"/>` + text(340,166,'F_b max',{size:9.5,fill:C.water})
      + `<line x1="244" y1="${150-Fb*scale}" x2="372" y2="${150-Fb*scale}" stroke="${C.water}" stroke-dasharray="4 3"/>` + text(340,144-Fb*scale,fmt(Fb)+' N',{size:9,fill:C.water})
      + text(316,20,'n_max = (ρV − m_hull) / m_person',{size:9.5,fill:C.vel}) + text(316,36,`= ${max} people`,{size:11,fill:C.vel})
      + text(110,184,`each person adds ${fmt(per)} N`,{size:9.5,fill:'#94a3b8',weight:600});
    return { T, body, steps:[
      S(.3, `The hull can displace at most V = ${w.hullV} m³, so F_b,max = ρgV = ${fmt(Fb)} N.`),
      S(.8+dt, `Each ${w.pM} kg person adds ${fmt(per)} N to the total weight W.`),
      S(.8+max*dt, `With ${max} aboard, W is still below F_b,max — the boat floats.`),
      S(tSwamp, `Person ${n} makes W > F_b,max: the hull can't push aside enough water and it swamps.`)],
      final: tSwamp - .1 };
  }

  // Grade 10: wind force grows with v² — marker climbs the curve to this scenario's speed.
  function windSquare(id, scen){
    const T = 8, v = scen.wind||0, vmax = 120;
    const X = s=> 46 + s/vmax*190, Y = s=> 152 - (s/vmax)**2*118;
    let curve = '', sub = '';
    for(let s=0;s<=vmax;s+=4) curve += (s?'L':'M') + X(s).toFixed(1) + ',' + Y(s).toFixed(1);
    for(let s=0;s<=v;s+=2) sub += (s?'L':'M') + X(s).toFixed(1) + ',' + Y(s).toFixed(1);
    const zone = scen.out==='unsafe' ? ['UNSAFE',C.net] : scen.out==='risky' ? ['RISKY',C.resist] : ['SAFE',C.safe];
    const sway = Math.min(14, 2 + (v/110)**2*14);
    const rel = (v/30)**2;
    const body = `<rect x="${X(0)}" y="34" width="${X(40)-X(0)}" height="118" fill="#14532d" opacity=".35"/><rect x="${X(40)}" y="34" width="${X(60)-X(40)}" height="118" fill="#7c2d12" opacity=".35"/><rect x="${X(60)}" y="34" width="${X(vmax)-X(60)}" height="118" fill="#7f1d1d" opacity=".35"/>`
      + text((X(0)+X(40))/2,46,'safe',{size:8.5,fill:C.safe}) + text((X(40)+X(60))/2,46,'risky',{size:8.5,fill:C.resist}) + text((X(60)+X(vmax))/2,46,'unsafe',{size:8.5,fill:C.net})
      + `<line x1="46" y1="152" x2="240" y2="152" stroke="#94a3b8"/><line x1="46" y1="152" x2="46" y2="30" stroke="#94a3b8"/>`
      + text(143,176,'wind speed v (km/h)',{size:9,fill:'#94a3b8',weight:600}) + `<text x="30" y="96" font-size="9" fill="#94a3b8" font-weight="600" text-anchor="middle" transform="rotate(-90 30 96)">wind force F</text>`
      + [0,40,60,120].map(s=>text(X(s),165,s,{size:8,fill:'#94a3b8',weight:600})).join('')
      + `<path d="${curve}" fill="none" stroke="${C.purple}" stroke-width="2.4" opacity=".45"/>`
      + `<path d="${sub}" fill="none" stroke="${zone[1]}" stroke-width="3.4" stroke-linecap="round" ${draw(T,.5,3,600)}>${drawAnim(T,.6,3,600)}</path>`
      + `<circle r="6" fill="${zone[1]}" stroke="#020617" stroke-width="1.6" opacity="0">${show(T,.6)}<animateMotion dur="${T}s" repeatCount="indefinite" path="${sub}" keyPoints="0;0;1;1" keyTimes="0;${(.6/T).toFixed(3)};${(3/T).toFixed(3)};1" calcMode="linear"/></circle>`
      + `<g opacity="0">${show(T,3)}${text(Math.min(214,X(v)+4),Math.max(30,Y(v)-10),v+' km/h',{size:10.5,fill:zone[1]})}</g>`
      + `<g opacity="0">${show(T,3.6)}${text(318,30,'F ≈ ½·ρ·C_d·A·v²',{size:11,fill:'#ddd6fe'})}${text(318,46,`${fmt(rel,1)}× the force at 30 km/h`,{size:10,fill:'#ddd6fe'})}</g>`
      // bridge sway icon
      + `<g opacity="0">${show(T,4.4)}<line x1="262" y1="70" x2="262" y2="150" stroke="#94a3b8" stroke-width="3"/><line x1="374" y1="70" x2="374" y2="150" stroke="#94a3b8" stroke-width="3"/>`
      + `<g>${AT('translate',T,[[0,'0 0'],[4.4,'0 0'],[4.9,`0 ${sway}`],[5.4,`0 ${-sway*.6}`],[5.9,`0 ${sway}`],[6.4,`0 ${-sway*.6}`],[6.9,`0 ${sway}`],[7.4,'0 0']],true)}<path d="M262,74 Q318,${118+sway} 374,74" stroke="${C.wood}" stroke-width="2.4" fill="none"/>${person(318,114+sway,zone[1],.7)}</g>`
      + text(318,172,zone[0]==='SAFE'?'gentle sway':'violent sway',{size:10,fill:zone[1]}) + `</g>`;
    const verdict = scen.out==='unsafe' ? 'Force this large makes the bridge sway violently — no crossing method is safe. Wait.'
      : scen.out==='risky' ? 'In the risky range: slow, careful crossing gripping both rails is the most that is reasonable — or wait.'
      : 'Light wind: only a small force acts, so a normal crossing is safe.';
    return { T, body, steps:[
      S(.6, `The wind is ${v} km/h.`),
      S(2, 'Wind force grows with the square of wind speed: twice the speed → four times the force.'),
      S(3.6, `So ${v} km/h pushes about ${fmt(rel,1)}× as hard as 30 km/h.`),
      S(4.4, verdict)] };
  }

  // Rolling = translation + rotation (G11 #1 drum, #2 wheel).
  function rolling(id, kind){
    const T = 8, r = 20, x0 = 40, x1 = 300, deg = ((x1-x0)/r*180/Math.PI).toFixed(0);
    const wheel = kind==='wheel'
      ? `<circle r="${r}" fill="none" stroke="${C.wood}" stroke-width="4"/>${[0,45,90,135].map(a=>`<line x1="${-r*Math.cos(a*Math.PI/180)}" y1="${-r*Math.sin(a*Math.PI/180)}" x2="${r*Math.cos(a*Math.PI/180)}" y2="${r*Math.sin(a*Math.PI/180)}" stroke="${C.wood}" stroke-width="2"/>`).join('')}<circle r="4" fill="#78350f"/>`
      : `<circle r="${r}" fill="#1d4ed8" stroke="#bfdbfe" stroke-width="2"/><circle r="${r*.62}" fill="none" stroke="#93c5fd" stroke-width="1.4"/><line x1="0" y1="${-r}" x2="0" y2="${r}" stroke="#f8fafc" stroke-width="3"/>`;
    const ghosts = [0,.25,.5,.75,1].map(f=>{ const x = x0 + f*(x1-x0), a = (x-x0)/r*180/Math.PI;
      return `<g transform="translate(${x},${150-r}) rotate(${a.toFixed(0)})" opacity=".28">${wheel}<circle cx="0" cy="${-r}" r="3.4" fill="${C.net}"/></g>`; }).join('');
    const body = `<rect x="0" y="150" width="400" height="40" fill="${C.ground}"/><rect x="${x0-20}" y="150" width="${x1-x0+50}" height="7" fill="${C.net}" opacity=".45"/>`
      + text(170,176,kind==='wheel'?'pathway to the bridge':'pathway to the boat landing',{size:9,fill:'#94a3b8',weight:600})
      + `<g opacity="0">${show(T,4.6)}${ghosts}${text(170,98,'snapshots: the red mark turns as the centre moves',{size:9.5,fill:'#fecaca',weight:600})}</g>`
      + `<g>${AT('translate',T,[[0,`${x0} ${150-r}`],[.6,`${x0} ${150-r}`],[4.4,`${x1} ${150-r}`],[T-.4,`${x1} ${150-r}`],[T-.1,`${x0} ${150-r}`]],'in')}`
      +   `<g>${AT('rotate',T,[[0,'0'],[.6,'0'],[4.4,deg],[T-.4,deg],[T-.1,'0']],'in')}${wheel}<circle cx="0" cy="${-r}" r="4" fill="${C.net}"/></g>`
      +   `<g opacity="0">${show(T,.8)}${arrow(id,0,-r-12,34,-r-12,'vel',3)}${text(18,-r-18,'v_cm',{size:10,fill:C.vel})}</g>`
      +   `<g opacity="0">${show(T,1.8)}<path d="M${r+8},-6 A${r+8},${r+8} 0 0 1 -6,${r+8}" fill="none" stroke="${C.water}" stroke-width="2.6" marker-end="url(#${id}-water)"/>${text(r+20,r+4,'ω',{size:13,fill:C.water})}</g>`
      + `</g>`
      + `<g opacity="0">${show(T,2.8)}${text(200,26,'Rolling = translation + rotation',{size:12})}${text(200,44,'rolling without slipping:  v_center = ωR',{size:11,fill:C.vel})}</g>`
      + person(366, 100, C.safe) + `<path d="M344,108 L392,108" stroke="${C.safe}" stroke-width="3"/>`
      + `<g opacity="0">${show(T,4.6)}${check(382,66,true)}${text(396,124,'clear of the path',{size:8.5,fill:C.safe,anchor:'end'})}</g>`;
    return { T, body, steps:[
      S(.8, 'Translation: the centre of the '+(kind==='wheel'?'wheel':'container')+' moves along the path (v_cm).'),
      S(1.8, 'Rotation: at the same time it turns about its own axis (ω).'),
      S(2.8, 'Rolling is both at once; for rolling without slipping, v_center = ωR.'),
      S(4.6, 'It keeps moving and speeding up along its path — stand clear'+(kind==='wheel'?' and postpone crossing.':' until the area is clear.'))] };
  }

  // Ramp vs lifting straight up (G11 #3), or wet steps vs cart on a dry ramp (G12 #3).
  function ramp(id, work){
    const T = 9, H = 90, gy = 156;
    const left = work
      ? [0,1,2,3,4].map(i=>`<rect x="${100+i*14}" y="${gy-(i+1)*18}" width="${70-i*14}" height="18" fill="#64748b" stroke="#94a3b8"/>`).join('')
        + `<g opacity=".85">${[0,1,2,3].map(i=>`<ellipse cx="${112+i*14}" cy="${gy-(i+1)*18}" rx="6" ry="1.6" fill="#7dd3fc"/>`).join('')}</g>` + text(132,gy+16,'wet steps · slippery',{size:9,fill:'#fecaca'})
      : `<rect x="140" y="${gy-H}" width="30" height="${H}" fill="#64748b"/>` + text(110,gy+16,'lift straight up',{size:9,fill:'#fecaca'});
    const box = `<rect x="-10" y="-18" width="20" height="18" rx="2" fill="#c89b62" stroke="#78350f" stroke-width="1.4"/>`;
    const cart = work ? `<rect x="-14" y="-24" width="28" height="18" rx="2" fill="#c89b62" stroke="#78350f" stroke-width="1.4"/><rect x="-16" y="-8" width="32" height="5" fill="#1e3a8a"/><circle cx="-9" cy="-1" r="3" fill="#111827"/><circle cx="9" cy="-1" r="3" fill="#111827"/>` : box;
    const rx0 = 220, rx1 = 380, ang = Math.atan2(H, rx1-rx0)*180/Math.PI;
    const body = `<rect x="0" y="${gy}" width="400" height="34" fill="${C.ground}"/>`
      + left + `<rect x="${rx1}" y="${gy-H}" width="20" height="${H}" fill="#64748b"/>`
      + `<polygon points="${rx0},${gy} ${rx1},${gy-H} ${rx1},${gy}" fill="#94a3b8" opacity=".85"/>` + text(300,gy+16,work?'cart on a dry, stable ramp':'stable ramp',{size:9,fill:C.safe})
      + `<line x1="196" y1="${gy}" x2="196" y2="${gy-H}" stroke="#94a3b8" stroke-dasharray="3 3"/>` + text(206,gy-H/2,'h',{size:12,fill:'#cbd5e1'})
      // left box: straight up (or step-by-step with a wobble)
      + `<g>${AT('translate',T,[[0,`120 ${gy}`],[.6,`120 ${gy}`],[3.6,`155 ${gy-H}`],[T-.4,`155 ${gy-H}`],[T-.1,`120 ${gy}`]],true)}${box}`
      +   `<g opacity="0">${show(T,.6,3.6)}${arrow(id,0,-22,0,-62,'net',4.5)}${text(-26,-48,work?'F (large)':'F = mg',{size:10,fill:'#fecaca'})}</g>`
      + `</g>`
      + (work ? `<g opacity="0">${show(T,2.2,3)}${text(118,34,'slip!',{size:12,fill:C.net})}</g>` : '')
      // right: along the ramp
      + `<g>${AT('translate',T,[[0,`${rx0} ${gy}`],[.6,`${rx0} ${gy}`],[6,`${rx1-6} ${gy-H+4}`],[T-.4,`${rx1-6} ${gy-H+4}`],[T-.1,`${rx0} ${gy}`]],true)}<g transform="rotate(${-ang.toFixed(1)})">${cart}`
      +   `<g opacity="0">${show(T,.6,6)}${arrow(id,-30,-9,-14,-9,'safe',3.5)}</g></g>`
      +   `<g opacity="0">${show(T,.6,6)}${text(-6,-34,work?'F (small)':'F ≈ mg·h/L',{size:10,fill:C.safe})}</g>`
      + `</g>`
      + `<g opacity="0">${show(T,3.8)}${text(196,22,work?'Raising it always adds ΔPE = mgh':'Ramp: smaller force × longer distance',{size:11})}${text(196,38,work?'W = Fd cos θ → longer d, smaller F':'F_incline · L = mgh  →  F_incline = mg(h/L)',{size:10.5,fill:C.vel})}</g>`
      + `<g opacity="0">${show(T,6.2)}${check(366,40,true)}</g>`;
    return { T, body, steps: work ? [
      S(.6, 'Carrying a box up the steps takes a big force at every step — on a wet, slippery surface.'),
      S(2.2, 'Wet steps can make the carrier slip and drop the load.'),
      S(3.8, 'Raising the supplies adds the same ΔPE = mgh, whether the route is short or long.'),
      S(4.6, 'On the long dry ramp the cart spreads that work over more distance (W = F·d), so the force is smaller.'),
      S(6.2, 'Safe choice: the cart on the stable, dry ramp.')] : [
      S(.6, 'Lifting straight up needs a force equal to the box’s full weight, F = mg.'),
      S(1.6, 'On the ramp the same box is pushed along a longer distance L.'),
      S(3.8, 'Ignoring friction, F_incline · L = mgh, so F_incline = mg(h/L) — less than mg when L is longer than h.'),
      S(5, 'The ramp doesn’t reduce the energy needed — it trades a smaller force for a longer distance.'),
      S(6.2, 'Safe choice: use the stable, checked ramp.')] };
  }

  // Lever: torque balance and mechanical advantage (G11 #4).
  function lever(id){
    const T = 8, fx = 150, gy = 150;
    const beam = `<g>${AT('rotate',T,[[0,`-6 ${fx} 118`],[1.2,`-6 ${fx} 118`],[3.2,`7 ${fx} 118`],[T-.4,`7 ${fx} 118`],[T-.1,`-6 ${fx} 118`]],true)}`
      + `<rect x="80" y="114" width="280" height="8" rx="3" fill="#9ca3af"/>`
      + `<g transform="translate(96,104)"><rect x="-20" y="-10" width="40" height="14" rx="7" fill="${C.wood}"/><circle cx="-16" cy="-14" r="9" fill="#3f6212"/><circle cx="-4" cy="-18" r="8" fill="#4d7c0f"/></g>`
      + `<g opacity="0">${show(T,.6)}${arrow(id,96,128,96,170,'net',4.5)}${text(104,172,'load F_out',{size:9.5,fill:'#fecaca',anchor:'start'})}</g>`
      + `<g opacity="0">${show(T,1.2)}${arrow(id,358,78,358,106,'resist',3.2)}${text(352,70,'effort F_in',{size:9.5,fill:'#fdba74'})}</g>`
      + person(342, 112, C.resist, .9) + person(326, 112, C.resist, .9)
      + `</g>`;
    const body = `<rect x="0" y="${gy}" width="400" height="40" fill="${C.ground}"/>`
      + `<polygon points="${fx},118 ${fx-14},${gy} ${fx+14},${gy}" fill="#6b7280"/>` + text(fx,gy+16,'fulcrum',{size:9,fill:'#cbd5e1'})
      + beam
      + `<g opacity="0">${show(T,2)}<line x1="96" y1="96" x2="${fx}" y2="96" stroke="${C.vel}" stroke-width="1.5"/>${text(123,90,'r_out',{size:9.5,fill:C.vel})}<line x1="${fx}" y1="70" x2="346" y2="70" stroke="${C.vel}" stroke-width="1.5"/>${text(248,64,'r_in (long)',{size:9.5,fill:C.vel})}</g>`
      + `<g opacity="0">${show(T,3.6)}${text(250,24,'F_effort · d_effort = F_load · d_load',{size:11.5})}${text(250,40,'longer effort arm → smaller force needed',{size:10.5,fill:C.vel})}</g>`
      + `<g opacity="0">${show(T,5)}<circle cx="96" cy="128" r="62" fill="none" stroke="${C.net}" stroke-dasharray="5 4" stroke-width="1.6"/>${text(96,58,'work area',{size:9,fill:'#fecaca'})}</g>`
      + person(18, gy, C.safe, .9) + `<g opacity="0">${show(T,5.6)}${check(30,112,true)}${text(4,gy+30,'learners wait',{size:8.5,fill:C.safe,anchor:'start'})}</g>`;
    return { T, body, steps:[
      S(.6, 'The heavy branch is the load, close to the fulcrum.'),
      S(1.2, 'Responders push down on the far end with a small effort force.'),
      S(2, 'The effort acts far from the fulcrum (long r_in); the load is near it (short r_out).'),
      S(3.6, 'Torques balance: F_in·r_in = F_out·r_out, so MA = r_in/r_out > 1 — a small force lifts a big load.'),
      S(5, 'The branch is still heavy — trained responders work while learners keep a safe distance.')] };
  }

  // Boat stability: one-sided load → CG off-centre → torque → tilt; even load → level (G11 #5).
  function boatTilt(id){
    const T = 10, cx = 200, wy = 120;
    const loadSide = (t0, t1)=> AT('translate',T,[[0,'0 0'],[t0,'0 0'],[t1,'-34 0'],[T-.4,'-34 0'],[T-.1,'0 0']],true);
    const boat = `<g>${AT('rotate',T,[[0,`0 ${cx} ${wy}`],[1,`0 ${cx} ${wy}`],[2.4,`11 ${cx} ${wy}`],[5,`11 ${cx} ${wy}`],[6.6,`0 ${cx} ${wy}`],[T-.4,`0 ${cx} ${wy}`]],true)}`
      + `<path d="M120,96 L280,96 L258,140 L142,140 Z" fill="#7c4a1e" stroke="#451a03" stroke-width="2"/>`
      + `<g>${loadSide(5,6.6)}${person(232,96,'#fca5a5',.7)}${person(250,96,'#c4b5fd',.7)}<rect x="258" y="84" width="14" height="12" fill="#c89b62"/><rect x="240" y="72" width="14" height="12" fill="#c89b62"/></g>`
      + person(176,96,'#fde68a',.7)
      + `</g>`;
    const cg = `<g>${AT('translate',T,[[0,'38 0'],[5,'38 0'],[6.6,'0 0'],[T-.4,'0 0'],[T-.1,'38 0']],true)}`
      + `<circle cx="${cx}" cy="104" r="6" fill="${C.vel}" stroke="#020617"/>${text(cx,94,'CG',{size:9,fill:C.vel})}`
      + `<g opacity="0">${show(T,1.4)}${arrow(id,cx,110,cx,150,'resist',3.5)}${text(cx+20,160,'W',{size:10,fill:C.resist})}</g></g>`;
    const body = water(wy, 190) + streaks(T, wy+8, 184, 22, 5)
      + boat + cg
      + `<g opacity="0">${show(T,1.4)}${arrow(id,cx,168,cx,128,'water',3.5)}${text(cx-24,172,'F_b',{size:10,fill:C.water})}</g>`
      + `<g opacity="0">${show(T,2.2,5)}<path d="M268,62 A60,60 0 0 1 298,110" fill="none" stroke="${C.net}" stroke-width="2.6" marker-end="url(#${id}-net)"/>${text(318,64,'tipping moment τ = rF',{size:10.5,fill:'#fecaca'})}</g>`
      + `<g opacity="0">${show(T,.4,5)}${text(110,30,'load within capacity ✓',{size:10.5,fill:C.safe})}${text(110,46,'but all on one side ✗',{size:10.5,fill:'#fecaca'})}</g>`
      + `<g opacity="0">${show(T,6.6)}${text(200,30,'Even load → CG over the centre → stable',{size:11.5,fill:C.safe})}${check(330,30,true)}</g>`;
    return { T, body, steps:[
      S(.4, 'The total load is within capacity, so the boat can float…'),
      S(1.4, '…but with everything on one side, the centre of gravity (CG) moves off-centre.'),
      S(2.2, 'Buoyancy F_b = ρ_water·g·V_displaced still balances the weight, but off-centre they form a tipping moment τ = rF.'),
      S(5, 'Spreading passengers and boxes evenly moves the CG back over the centre.'),
      S(6.6, 'The boat levels and is stable — cross only after the load is even and conditions are safe.')] };
  }

  // Floating sealed container in fast floodwater (G11 #6).
  function floatAway(id){
    const T = 9, wy = 100;
    const body = `<path d="M0,${wy} L70,${wy} L84,64 L0,64 Z" fill="#3f6212" opacity=".7"/>` + water(wy, 190, 0, 400)
      + `<g opacity="0">${show(T,3.6)}${streaks(T, wy+8, 184, 160, 8)}</g>`
      + `<g>${AT('translate',T,[[0,'150 0'],[3.6,'150 0'],[7.4,'420 0'],[T-.4,'420 0'],[T-.1,'150 0']],'in')}`
      +   `<g>${AT('translate',T,[[0,'0 0'],[.6,'0 -3'],[1.2,'0 2'],[1.8,'0 -2'],[2.4,'0 1'],[3,'0 0']])}`
      +   `<rect x="-24" y="${wy-16}" width="48" height="30" rx="4" fill="#2563eb" stroke="#bfdbfe" stroke-width="1.6"/><rect x="-26" y="${wy-20}" width="52" height="6" rx="2" fill="#1e40af"/>`
      +   `<g opacity="0">${show(T,.6,3.6)}${arrow(id,0,wy+46,0,wy+18,'water',3.5)}${text(16,wy+58,'F_b',{size:10,fill:C.water})}${arrow(id,0,wy-24,0,wy-52,'resist',3.5)}${text(16,wy-56,'W',{size:10,fill:C.resist})}</g></g>`
      + `</g>`
      + `<g opacity="0">${show(T,1.4)}<rect x="250" y="24" width="16" height="22" fill="#2563eb"/><rect x="288" y="12" width="16" height="34" fill="${C.water}"/>${text(258,58,'box',{size:8.5})}${text(296,58,'water',{size:8.5,fill:C.water})}${text(354,28,'ρ_box < ρ_water',{size:10,fill:C.vel})}${text(354,44,'→ it floats',{size:10,fill:C.vel})}</g>`
      + `<g opacity="0">${show(T,2.2,3.6)}${text(200,30,'F_b = W  (floating equilibrium)',{size:11})}</g>`
      + `<g opacity="0">${show(T,3.8)}${text(240,80,'…but the fast current carries it away ⟶',{size:11,fill:'#fecaca'})}</g>`
      + person(40, 64, C.safe) + `<g opacity="0">${show(T,5.6)}${check(56,30,true)}${text(40,82,'stay on the bank',{size:8.5,fill:C.safe})}<g transform="translate(108,128)">${check(0,0,false)}</g>${text(108,150,'don’t go in',{size:8.5,fill:'#fecaca'})}</g>`;
    return { T, body, steps:[
      S(.6, 'Buoyant force F_b = ρ_water·g·V_displaced pushes up; the weight W pulls down.'),
      S(1.4, 'The sealed box’s average density is lower than water’s, so it only needs to sink a little to float.'),
      S(2.2, 'It floats in equilibrium: F_b = W.'),
      S(3.8, 'Floating does not stop it moving — the fast current sweeps it downstream, and would push a person too.'),
      S(5.6, 'Safe decision: let it go and stay out of the floodwater.')] };
  }

  // Boat pushed sideways by the current (G12 #1) — top view.
  function boatDrift(id){
    const T = 9, y0 = 160, y1 = 36, bx = 110;
    const body = `<rect x="0" y="160" width="400" height="30" fill="#3f6212" opacity=".6"/><rect x="0" y="0" width="400" height="30" fill="#3f6212" opacity=".6"/>`
      + water(30, 160) + streaks(T, 40, 154, 110, 9)
      + `<line x1="${bx}" y1="${y0}" x2="${bx}" y2="${y1-2}" stroke="${C.safe}" stroke-width="2.6" stroke-dasharray="7 5"/>` + text(bx-40,96,'intended path',{size:9.5,fill:C.safe})
      + `<g>${AT('translate',T,[[0,'0 0'],[1,'0 0'],[7,`0 ${y1-y0+18}`],[T-.4,`0 ${y1-y0+18}`],[T-.1,'0 0']])}`
      +   `<g>${AT('translate',T,[[0,'0 0'],[1,'0 0'],[7,'190 0'],[T-.4,'190 0'],[T-.1,'0 0']],'in')}`
      +   `<g transform="translate(${bx},${y0-10})"><path d="M-7,10 L-7,-12 L0,-22 L7,-12 L7,10 Z" fill="#a16207" stroke="#451a03" stroke-width="1.5"/>`
      +   `<g opacity="0">${show(T,1.6)}${arrow(id,10,-4,40,-4,'net',3.6)}${text(26,-12,'ΣF',{size:10,fill:'#fecaca'})}</g></g></g></g>`
      + `<g opacity="0">${show(T,2.6)}${text(316,126,'ΣF ≠ 0  →  a = ΣF / m',{size:11.5})}${text(316,142,'(sideways, downstream)',{size:10,fill:'#fecaca'})}</g>`
      + `<g opacity="0">${show(T,6.6)}<g transform="translate(350,46)">${check(0,0,false)}</g>${text(350,68,'lands far off target',{size:9.5,fill:'#fecaca'})}</g>`
      + `<g transform="translate(40,176)">${person(0,0,C.safe,.6)}${person(14,0,C.safe,.6)}</g>` + `<g opacity="0">${show(T,7.2)}${text(110,178,'passengers wait — crossing postponed',{size:9,fill:C.safe,anchor:'start'})}</g>`;
    return { T, body, steps:[
      S(.3, 'The boat plans to go straight across (green line).'),
      S(1.6, 'The strong current adds a sideways force that nothing balances: ΣF ≠ 0.'),
      S(2.6, 'By Newton’s second law, a = ΣF/m — the boat accelerates downstream.'),
      S(6.6, 'It drifts farther and farther off the crossing path.'),
      S(7.2, 'Safe decision: postpone the crossing until the current weakens.')] };
  }

  // Falling panel: potential → kinetic energy (G12 #4).
  function energyFall(id){
    const T = 9, top = 40, gy = 150, tFall = 3.4, tHit = 4.6;
    const bar = (x, col, from, to, lbl)=> growBar(T, x, 150, 26, 100, col, [[0,from],[tFall,from],[tHit,to],[T-.4,to],[T-.1,from]], 'in')
      + text(x+13,166,lbl,{size:10,fill:col});
    const body = `<rect x="0" y="${gy}" width="260" height="40" fill="${C.ground}"/>`
      + `<rect x="18" y="56" width="48" height="94" fill="#475569"/><path d="M12,58 L72,58 L42,34 Z" fill="#64748b"/>` + text(42,166,'kiosk',{size:8.5,fill:'#94a3b8'})
      + `<ellipse cx="150" cy="${gy+2}" rx="40" ry="6" fill="${C.net}" opacity=".6"/>` + text(150,182,'possible landing area',{size:9,fill:'#fecaca'})
      + `<g>${AT('translate',T,[[0,`150 ${top}`],[.7,`146 ${top-4}`],[1.4,`154 ${top+3}`],[2.1,`146 ${top-3}`],[2.8,`153 ${top+2}`],[tFall,`150 ${top}`],[tHit,`150 ${gy-4}`],[T-.4,`150 ${gy-4}`],[T-.1,`150 ${top}`]],'in')}`
      +   `<g>${AT('rotate',T,[[0,'-10'],[1,'12'],[2,'-14'],[tFall,'0'],[tHit,'170'],[T-.4,'180'],[T-.1,'-10']])}<rect x="-22" y="-3" width="44" height="6" fill="#a1a1aa" stroke="#e4e4e7"/></g></g>`
      + `<g opacity="0">${show(T,.4,tFall)}<line x1="196" y1="${top}" x2="196" y2="${gy}" stroke="${C.vel}" stroke-dasharray="3 3"/>${text(206,100,'h',{size:12,fill:C.vel})}${text(150,22,'PE = mgh  (stored, even at rest)',{size:10.5,fill:C.vel})}</g>`
      + `<g opacity="0">${show(T,tFall,T-.5)}${text(150,22,'falling: PE → KE = ½mv²',{size:10.5,fill:'#fecaca'})}</g>`
      + `<circle cx="150" cy="${gy-2}" r="4" fill="none" stroke="${C.net}" stroke-width="3" opacity="0">${A('r',T,[[0,4],[tHit,4],[tHit+.5,30],[tHit+.51,4]])}${A('opacity',T,[[0,0],[tHit-.01,0],[tHit,1],[tHit+.5,0]])}</circle>`
      + `<line x1="276" y1="150" x2="380" y2="150" stroke="#475569"/>` + bar(288, C.vel, 1, .02, 'PE') + bar(330, C.net, .02, 1, 'KE')
      + `<line x1="282" y1="50" x2="364" y2="50" stroke="#e2e8f0" stroke-dasharray="4 3"/>` + text(372,46,'Emech = PE + KE',{size:9,fill:'#cbd5e1',anchor:'end'})
      + person(236, gy, C.safe) + `<g opacity="0">${show(T,5.4)}${check(250,116,true)}${text(236,gy+16,'stay away',{size:8.5,fill:C.safe})}</g>`;
    return { T, body, steps:[
      S(.4, 'At height h the panel stores gravitational potential energy PE = mgh — even while it isn’t moving.'),
      S(tFall, 'As it falls, PE turns into kinetic energy KE = ½mv².'),
      S(tFall+.6, 'Air resistance takes a little, but by the ground most of mgh has become motion.'),
      S(tHit, 'So it hits hard where it lands.'),
      S(5.4, 'Safe decision: move away from its possible landing area.')] };
  }

  // Same velocity, different mass → different momentum (G12 #5).
  function momentum(id, ke){
    const T = 9, by = 66;
    const body = water(30, 170) + streaks(T, 36, 166, 50, 8)
      + `<g>${AT('translate',T,[[0,'0 0'],[1,'0 0'],[5.4,'210 0'],[T-.4,'260 0'],[T-.1,'0 0']])}`
      +   `<rect x="20" y="${by-14}" width="96" height="28" rx="14" fill="${C.wood}" stroke="#451a03" stroke-width="2"/>`
      +   `<rect x="44" y="130" width="22" height="14" rx="6" fill="#f59e0b" stroke="#78350f" stroke-width="1.4"/>`
      +   `<g opacity="0">${show(T,.6)}${arrow(id,120,by,150,by,'vel',3)}${arrow(id,70,137,100,137,'vel',3)}${text(135,by-10,'v',{size:10,fill:C.vel})}${text(85,127,'v',{size:10,fill:C.vel})}</g>`
      +   `<g opacity="0">${show(T,1.8)}${arrow(id,20,by+26,140,by+26,'net',5)}${text(80,by+42,ke?'KE_log = ½mv²  (large)':'p_log = m·v  (large)',{size:9.5,fill:'#fecaca'})}${arrow(id,44,158,58,158,'resist',3)}${text(96,168,ke?'KE small':'p small',{size:9,fill:'#fdba74'})}</g>`
      + `</g>`
      + `<g>${AT('translate',T,[[0,'0 0'],[4.2,'0 0'],[5.4,'0 -40'],[T-.4,'0 -40'],[T-.1,'0 0']],true)}<g transform="translate(330,${by})"><path d="M-20,-10 L20,-10 L26,0 L20,10 L-20,10 L-26,0 Z" fill="#7c4a1e" stroke="#451a03" stroke-width="1.6"/>${person(0,6,'#fde68a',.5)}</g></g>`
      + `<g opacity="0">${show(T,.6,2.8)}${text(200,22,'Same velocity v for both',{size:11})}</g>`
      + `<g opacity="0">${show(T,3)}${text(330,22,ke?'KE = ½mv² → more mass,':'p = m·v → more mass,',{size:10.5,fill:'#fecaca'})}${text(330,38,ke?'more kinetic energy':'more momentum',{size:10.5,fill:'#fecaca'})}</g>`
      + `<g opacity="0">${show(T,5.4)}${text(330,106,'boat moves out of its path ✓',{size:9.5,fill:C.safe})}</g>`;
    if(ke) return { T, body, steps:[
      S(.6, 'The heavy log and the light plastic bottle drift at about the same speed v.'),
      S(1.8, 'Kinetic energy KE = ½mv²: at about the same speed, the more massive log has greater kinetic energy.'),
      S(3, 'It can transfer more energy during an impact — a much stronger hit.'),
      S(4.2, 'Safe decision: stay away from the log’s path.')] };
    return { T, body, steps:[
      S(.6, 'The log and the plastic container drift at the same velocity v.'),
      S(1.8, 'Momentum p = m·v: the log has far more mass, so far more momentum.'),
      S(3, 'Stopping it takes an impulse J = F·Δt = Δp — a much bigger impact on a small boat.'),
      S(4.2, 'Safe decision: move the boat out of the log’s path and postpone the crossing.')] };
  }

  // Impulse: padding stretches the stopping time, lowering the force (G12 #6).
  function impulse(id, kind){
    const T = 9, fender = kind === 'fender';
    const gx0 = 232, gy0 = 158, gw = 150, gh = 110;
    const spike = `M${gx0},${gy0} C${gx0+8},${gy0} ${gx0+10},${gy0-gh} ${gx0+16},${gy0-gh} C${gx0+22},${gy0-gh} ${gx0+24},${gy0} ${gx0+32},${gy0}`;
    const hump = `M${gx0},${gy0} C${gx0+30},${gy0} ${gx0+40},${gy0-gh*.3} ${gx0+75},${gy0-gh*.3} C${gx0+110},${gy0-gh*.3} ${gx0+120},${gy0} ${gx0+150},${gy0}`;
    const obj = `<rect x="-14" y="-5" width="28" height="10" rx="2" fill="${C.wood}" stroke="#451a03"/>`;
    const body = text(100,22,fender?'bare hull':'without padding',{size:9.5,fill:'#fecaca'}) + text(100,108,fender?'with rubber fender':'with padding',{size:9.5,fill:C.safe})
      + `<rect x="170" y="30" width="10" height="58" fill="#64748b"/>`
      + `<g>${AT('translate',T,[[0,'30 60'],[.6,'30 60'],[1.6,'154 60'],[1.7,'154 60'],[T-.4,'154 60'],[T-.1,'30 60']])}${obj}</g>`
      + `<g opacity="0">${show(T,1.6,3)}${text(150,46,'BANG',{size:11,fill:C.net})}</g>`
      + `<rect x="170" y="116" width="10" height="58" fill="#64748b"/>`
      + `<rect x="150" y="116" width="20" height="58" rx="4" fill="#f97316">${A('width',T,[[0,20],[4,20],[5.6,9],[6.4,12],[T-.4,12],[T-.1,20]])}${A('x',T,[[0,150],[4,150],[5.6,161],[6.4,158],[T-.4,158],[T-.1,150]])}</rect>`
      + `<g>${AT('translate',T,[[0,'30 146'],[3,'30 146'],[4,'136 146'],[5.6,'147 146'],[6.4,'144 146'],[T-.4,'144 146'],[T-.1,'30 146']])}${obj}</g>`
      + `<line x1="${gx0}" y1="${gy0}" x2="${gx0+gw+6}" y2="${gy0}" stroke="#94a3b8"/><line x1="${gx0}" y1="${gy0}" x2="${gx0}" y2="${gy0-gh-14}" stroke="#94a3b8"/>`
      + text(gx0-8,gy0-gh-4,'F',{size:10,fill:'#94a3b8'}) + text(gx0+gw+4,gy0+14,'t',{size:10,fill:'#94a3b8'})
      + `<path d="${spike}" fill="${C.net}" fill-opacity=".25" stroke="${C.net}" stroke-width="2.4" ${draw(T,1.6,2.4,260)}>${drawAnim(T,1.6,2.6,260)}</path>`
      + `<path d="${hump}" fill="${C.safe}" fill-opacity=".2" stroke="${C.safe}" stroke-width="2.4" ${draw(T,4,6,330)}>${drawAnim(T,4,6.2,330)}</path>`
      + `<g opacity="0">${show(T,6.4)}${text(gx0+80,24,'same area: J = F_avg·Δt = Δp',{size:10.5,fill:C.vel})}${text(gx0+80,40,'longer Δt → smaller F_avg',{size:10.5,fill:C.safe})}</g>`
      + `<g opacity="0">${show(T,7.2)}${text(100,186,fender?'the fender also absorbs part of the KE':'still keep away from the collision area',{size:9.5,fill:fender?C.safe:'#fecaca'})}</g>`;
    if(fender) return { T, body, steps:[
      S(.6, 'A log hitting a bare hull stops almost instantly — a huge force spike.'),
      S(3, 'A rubber fender squashes, so the log takes longer to stop.'),
      S(4, 'The momentum to remove, Δp, is the same either way.'),
      S(6.4, 'J = F_avg·Δt = Δp: a longer impact time means a smaller average force on the boat.'),
      S(7.2, 'Deforming, the fender turns some energy into heat and internal motion — it does not remove momentum.')] };
    return { T, body, steps:[
      S(.6, 'Hitting a hard wall, the object stops almost instantly — a huge force spike.'),
      S(3, 'Flexible padding squashes, so the object takes longer to stop.'),
      S(4, 'The momentum to remove, Δp = mv, is the same either way.'),
      S(6.4, 'Since J = F_avg·Δt = Δp, a longer Δt means a smaller average force.'),
      S(7.2, 'Padding softens impacts but doesn’t remove the danger — stay out of the collision area.')] };
  }


  // ═══ GRADES 8–10 ═══

  // Narrowing channel: same water, smaller opening → faster flow → the container accelerates (G8 #1).
  function channel(id){
    const T = 9, top = (x)=> x < 150 ? 40 : x < 230 ? 40 + (x-150)/80*42 : 82, bot = (x)=> 190 - top(x) - 20;
    const xs = [30,62,96,136,186,250,330];
    let marks = '';
    xs.forEach((x,i)=>{ const t = .6 + i*.85; marks += `<g opacity="0">${show(T,t)}<circle cx="${x}" cy="150" r="4" fill="${C.vel}"/>${i?`<line x1="${xs[i-1]+5}" y1="166" x2="${x-5}" y2="166" stroke="${C.vel}" stroke-width="2"/>`:''}</g>`; });
    const p = xs.map((x,i)=> [.6 + i*.85, `${x} 0`]);
    const body = `<path d="M0,40 L150,40 L230,82 L400,82 L400,108 L230,108 L150,150 L0,150 Z" fill="#0c4a6e" opacity=".6" stroke="${C.water}" stroke-width="1.4"/>`
      + streaks(T, 50, 140, 50, 6, 0, 150) + streaks(T, 86, 104, 170, 4, 232, 400)
      + text(70,30,'wide · slower',{size:10,fill:'#bae6fd'}) + text(320,124,'narrow · faster',{size:10,fill:'#fecaca'})
      + `<g>${AT('translate',T,[[0,'30 0'],...p,[T-.4,'330 0'],[T-.1,'30 0']])}<g transform="translate(-30,0)"><rect x="18" y="86" width="24" height="18" rx="3" fill="#e5e7eb" stroke="#64748b"/></g></g>`
      + marks + text(200,184,'1 mark per second → the gaps keep growing',{size:9.5,fill:C.vel,weight:600})
      + `<g opacity="0">${show(T,3)}${arrow(id,40,72,64,72,'vel',3)}${text(52,64,'v',{size:10,fill:C.vel})}</g>`
      + `<g opacity="0">${show(T,4.8)}${arrow(id,300,72,360,72,'vel',4)}${text(330,64,'v (much larger)',{size:10,fill:C.vel})}</g>`
      + `<g opacity="0">${show(T,5.6)}${text(200,22,'Speed increases: a = Δv / Δt > 0',{size:11.5,fill:C.vel})}</g>`;
    return { T, body, steps:[
      S(.6, 'Floodwater carries the container along the drainage channel.'),
      S(3, 'Where the channel narrows, the same water squeezes through a smaller gap, so it flows faster.'),
      S(4.8, 'The container’s speed keeps increasing — it is accelerating (a = Δv/Δt > 0).'),
      S(5.6, 'Faster water pushes harder: stay away from the channel.')] };
  }

  // Motion map of an object speeding up on land (G8 #2 roofing sheet).
  function motionMap(id){
    const T = 9, xs = [40,56,84,124,176,240,316];
    let marks = '';
    xs.forEach((x,i)=>{ const t = .6 + i*.8; marks += `<g opacity="0">${show(T,t)}<rect x="${x-8}" y="126" width="16" height="4" fill="#a1a1aa"/>${text(x,146,i+'s',{size:8.5,fill:C.vel})}</g>`
      + (i ? `<g opacity="0">${show(T,t)}${arrow(id,xs[i-1],108,x-4,108,'vel',1.6+i*.35)}</g>` : ''); });
    const p = xs.map((x,i)=> [.6 + i*.8, `${x} 0`]);
    const body = `<rect x="0" y="150" width="400" height="40" fill="${C.ground}"/>` + text(200,174,'pathway →',{size:9,fill:'#94a3b8'})
      + `<g opacity=".7">${streaks(T,40,90,160,6)}</g>`
      + `<g>${AT('translate',T,[[0,'40 0'],...p,[T-.4,'316 0'],[T-.1,'40 0']])}<g transform="translate(-40,0)"><rect x="24" y="122" width="32" height="6" rx="1" fill="#d4d4d8" stroke="#71717a"/></g></g>`
      + marks + `<g opacity="0">${show(T,4.4)}${text(200,30,'Each second it moves farther: speeding up',{size:11})}${text(200,48,'a = Δv / Δt > 0   ·   ΣF = ma (unbalanced wind force)',{size:10.5,fill:C.vel})}</g>`
      + person(372, 104, C.safe, .9) + `<g opacity="0">${show(T,6.4)}${check(386,72,true)}${text(370,124,'out of its path',{size:8.5,fill:C.safe})}</g>`;
    return { T, body, steps:[
      S(.6, 'The wind pushes the loose roofing sheet along the ground.'),
      S(2, 'Each gust adds speed: it covers more distance every second.'),
      S(4.4, 'A changing speed means it is accelerating: a = Δv/Δt. The wind gives an unbalanced net force, ΣF = ma.'),
      S(6.4, 'The faster it goes, the harder it hits — stay away from its path.')] };
  }

  // Raised object: U = mgh; moving it low makes U small (G8 #4).
  function potentialPot(id){
    const T = 9, gy = 150;
    const pot = `<g><path d="M-9,0 L9,0 L12,-18 L-12,-18 Z" fill="#b45309"/><circle cx="-5" cy="-24" r="7" fill="#3f7d2a"/><circle cx="5" cy="-26" r="8" fill="#4d7c0f"/></g>`;
    const body = `<rect x="0" y="${gy}" width="260" height="40" fill="${C.ground}"/>`
      + `<rect x="40" y="56" width="50" height="94" fill="#78716c"/><rect x="36" y="50" width="72" height="8" fill="#a8a29e"/>` + text(64,166,'high ledge',{size:9,fill:'#cbd5e1'})
      + `<rect x="180" y="128" width="46" height="22" fill="#6b4f30"/>` + text(203,166,'low & secure',{size:9,fill:C.safe})
      + `<g>${AT('translate',T,[[0,'92 50'],[3.8,'92 50'],[5.6,'203 128'],[T-.4,'203 128'],[T-.1,'92 50']],true)}${pot}</g>`
      + `<g opacity="0">${show(T,.6,3.8)}<line x1="122" y1="50" x2="122" y2="${gy}" stroke="${C.vel}" stroke-dasharray="3 3"/>${text(132,104,'h',{size:12,fill:C.vel})}${text(130,24,'High up: PE = mgh is large',{size:11,fill:C.vel})}</g>`
      + `<g opacity="0">${show(T,1.8,3.8)}<path d="M100,60 Q110,110 104,148" stroke="${C.net}" stroke-width="2" stroke-dasharray="4 3" fill="none" marker-end="url(#${id}-net)"/>${text(150,140,'if it falls: PE → KE',{size:9.5,fill:'#fecaca'})}</g>`
      + `<g opacity="0">${show(T,5.6)}${text(130,24,'Low & secure: small h → small PE',{size:11,fill:C.safe})}</g>`
      + `<line x1="276" y1="150" x2="380" y2="150" stroke="#475569"/>`
      + growBar(T, 300, 150, 30, 100, C.vel, [[0,.92],[3.8,.92],[5.6,.08],[T-.4,.08],[T-.1,.92]], true) + text(315,166,'PE = mgh',{size:9.5,fill:C.vel})
      + text(350,30,'stored energy',{size:9,fill:'#94a3b8',weight:600});
    return { T, body, steps:[
      S(.6, 'On the high ledge the heavy pot stores gravitational potential energy PE = mgh because of its height.'),
      S(1.8, 'If strong wind dislodges it, that PE becomes kinetic energy as it falls onto the path.'),
      S(3.8, 'Moving it low and securing it makes h small…'),
      S(5.6, '…so its PE is small and it can no longer fall far. Do this before strong winds arrive.')] };
  }

  // Work needs displacement: stuck box (d = 0 → W = 0) vs moving box (W = F·d) (G8 #5).
  function workDisp(id){
    const T = 9;
    const box = (x,y)=> `<rect x="${x}" y="${y}" width="30" height="24" rx="2" fill="#c89b62" stroke="#78350f" stroke-width="1.4"/>`;
    const body = `<rect x="0" y="80" width="400" height="6" fill="${C.ground}"/><rect x="0" y="170" width="400" height="6" fill="${C.ground}"/>`
      + text(10,22,'Box caught on a raised portion',{size:10,anchor:'start',fill:'#fecaca'})
      + `<rect x="160" y="66" width="12" height="14" fill="#78716c"/>` + box(128,56) + person(212,80,C.resist,.9)
      + `<g opacity="0">${show(T,.6)}${arrow(id,200,62,170,62,'resist',3.5)}${text(186,52,'F',{size:10,fill:C.resist})}</g>`
      + `<g opacity="0">${show(T,1.8)}${text(300,52,'d = 0',{size:12,fill:'#fecaca'})}${text(300,70,'W = F × 0 = 0',{size:12,fill:'#fecaca'})}</g>`
      + text(10,112,'Box on a clear path',{size:10,anchor:'start',fill:C.safe})
      + `<g>${AT('translate',T,[[0,'0 0'],[3.4,'0 0'],[6.6,'-170 0'],[T-.4,'-170 0'],[T-.1,'0 0']],true)}${box(300,146)}${person(352,170,C.resist,.9)}`
      +   `<g opacity="0">${show(T,3.4,6.6)}${arrow(id,342,152,332,152,'resist',3.5)}</g></g>`
      + `<g opacity="0">${show(T,3.6)}<line x1="315" y1="186" x2="${315-170}" y2="186" stroke="${C.vel}" stroke-width="2.4" marker-end="url(#${id}-vel)"/>${text(230,184,'d',{size:11,fill:C.vel})}</g>`
      + `<g opacity="0">${show(T,5.4)}${text(100,140,'W = F · d  (work is done)',{size:12,fill:C.safe})}</g>`
      + `<g opacity="0">${show(T,6.8)}${text(300,112,'W = F·d·cos θ',{size:11,fill:C.vel})}</g>`;
    return { T, body, steps:[
      S(.6, 'The learner pushes the stuck box with force F…'),
      S(1.8, '…but it doesn’t move: displacement d = 0, so the work done on it is W = 0.'),
      S(3.4, 'On a clear path the same push makes the box move.'),
      S(5.4, 'Now the force produces displacement in its direction, so work is done: W = F·d.'),
      S(6.8, 'In general W = F·d·cos θ — no displacement, no work.')] };
  }

  // Mechanical energy hazard: loose objects up high → secured low (G8 #6).
  function mechEnergy(id){
    const T = 9, gy = 150;
    const objs = [[66,44,'#c89b62'],[84,40,'#16a34a'],[100,46,'#c89b62']];
    let o = '';
    objs.forEach(([x,y,c],i)=>{ o += `<g>${AT('translate',T,[[0,`${x} ${y}`],[3.6+i*.3,`${x} ${y}`],[5.2+i*.3,`${206+i*14} ${gy-26}`],[T-.4,`${206+i*14} ${gy-26}`],[T-.1,`${x} ${y}`]],true)}<rect x="-7" y="-14" width="14" height="14" fill="${c}"/></g>`; });
    const body = `<rect x="0" y="${gy}" width="260" height="40" fill="${C.ground}"/>`
      + `<rect x="54" y="44" width="70" height="6" fill="#7a5532"/><line x1="58" y1="50" x2="58" y2="${gy}" stroke="#7a5532" stroke-width="4"/><line x1="120" y1="50" x2="120" y2="${gy}" stroke="#7a5532" stroke-width="4"/>`
      + text(88,166,'high platform',{size:9,fill:'#cbd5e1'})
      + `<rect x="196" y="${gy-30}" width="56" height="30" fill="#334155" stroke="#94a3b8"/>` + text(224,166,'low, enclosed',{size:9,fill:C.safe})
      + o
      + `<g opacity="0">${show(T,.6,3.6)}${arrow(id,8,36,48,36,'white',3)}${text(26,28,'wind',{size:9})}</g>`
      + `<g opacity="0">${show(T,1.4,3.6)}<path d="M110,50 Q150,90 160,148" stroke="${C.net}" stroke-width="2" stroke-dasharray="4 3" fill="none" marker-end="url(#${id}-net)"/>${text(176,98,'PE → KE',{size:10,fill:'#fecaca'})}</g>`
      + `<line x1="276" y1="150" x2="390" y2="150" stroke="#475569"/>`
      + growBar(T, 290, 150, 26, 100, C.vel, [[0,.85],[3.6,.85],[5.8,.06],[T-.4,.06],[T-.1,.85]], true) + text(303,166,'PE',{size:10,fill:C.vel})
      + growBar(T, 340, 150, 26, 100, C.net, [[0,.02],[1.4,.02],[2.4,.5],[3.4,.02],[T,.02]], true) + text(353,166,'KE',{size:10,fill:C.net})
      + text(334,30,'Emech = KE + PE',{size:10,fill:'#cbd5e1'})
      + `<g opacity="0">${show(T,5.8)}${text(130,24,'Secured & low: little energy to release',{size:10.5,fill:C.safe})}</g>`;
    return { T, body, steps:[
      S(.6, 'Loose objects on the high platform store gravitational potential energy PE = mgh.'),
      S(1.4, 'If strong wind knocks them off, PE converts into kinetic energy KE as they fall or fly at people.'),
      S(3.6, 'Securing them, or moving them to a low, enclosed area…'),
      S(5.8, '…leaves little mechanical energy (Emech = KE + PE) to release — secure or lower them before the typhoon.')] };
  }

  // Inertia: the vehicle/boat stops, the loose load keeps going (G9 #1 boat, #2 vehicle).
  function inertia(id, kind){
    const T = 9, gy = kind==='boat' ? 128 : 150;
    const ground = kind==='boat' ? water(118,190) + `<rect x="300" y="118" width="100" height="72" fill="#3f6212" opacity=".7"/>`
      : `<rect x="0" y="${gy}" width="400" height="40" fill="${C.ground}"/><rect x="300" y="${gy-60}" width="8" height="60" fill="#b91c1c"/>`;
    const veh = kind==='boat'
      ? `<path d="M-60,-6 L50,-6 L62,-22 L-64,-22 Z" fill="#7c4a1e" stroke="#451a03" stroke-width="1.6"/>`
      : `<rect x="-62" y="-30" width="96" height="10" fill="#15803d"/><rect x="34" y="-50" width="30" height="40" rx="3" fill="#15803d"/><rect x="40" y="-46" width="20" height="14" fill="#93c5fd"/><circle cx="-40" cy="-10" r="10" fill="#111827"/><circle cx="46" cy="-10" r="10" fill="#111827"/>`;
    const stopX = 250, startX = 70;
    const body = ground + text(kind==='boat'?350:304, kind==='boat'?110:84, kind==='boat'?'submerged object':'sudden stop', {size:9,fill:'#fecaca'})
      + `<g>${AT('translate',T,[[0,`${startX} ${gy}`],[2.4,`${stopX} ${gy}`],[T-.4,`${stopX} ${gy}`],[T-.1,`${startX} ${gy}`]])}${veh}`
      +   `<rect x="-30" y="${kind==='boat'?-36:-44}" width="16" height="14" fill="#ea580c"/><line x1="-34" y1="${kind==='boat'?-30:-38}" x2="-10" y2="${kind==='boat'?-30:-38}" stroke="${C.vel}" stroke-width="2"/>`
      + `</g>`
      // loose item: moves with the vehicle, then keeps going after the stop
      + `<g>${AT('translate',T,[[0,`${startX} ${gy}`],[2.4,`${stopX} ${gy}`],[3.1,`${stopX+44} ${gy}`],[3.5,`${stopX+56} ${gy+(kind==='boat'?30:0)}`],[T-.4,`${stopX+56} ${gy+(kind==='boat'?30:0)}`],[T-.1,`${startX} ${gy}`]])}`
      +   `<circle cx="10" cy="${kind==='boat'?-30:-38}" r="8" fill="#dc2626"/></g>`
      + `<g opacity="0">${show(T,.4,2.4)}${arrow(id,20,40,70,40,'vel',3)}${text(45,32,'v (all together)',{size:9.5,fill:C.vel})}</g>`
      + `<g opacity="0">${show(T,2.6)}${text(200,26,'Vehicle stops — loose load keeps moving',{size:11,fill:'#fecaca'})}${text(200,44,'Newton’s 1st law (inertia): no net force ⇒ velocity unchanged',{size:10,fill:C.vel})}</g>`
      + `<g opacity="0">${show(T,4.4)}${text(150,kind==='boat'?84:64,'strapped load stays put ✓',{size:10,fill:C.safe})}</g>`;
    return { T, body, steps:[
      S(.4, kind==='boat' ? 'The boat and everything in it move toward the bank at the same speed.' : 'The vehicle, learners and supplies all move at the same speed.'),
      S(2.4, kind==='boat' ? 'The boat hits a submerged object and stops suddenly.' : 'The vehicle stops suddenly.'),
      S(2.6, 'Nothing stops the loose load, so it keeps moving forward — inertia (ΣF = 0 ⇒ v constant).'),
      S(4.4, kind==='boat' ? 'A tied-down bag is stopped with the boat. Secure supplies before travel to prevent impact injuries.' : 'Restraints supply the force that slows the containers with the vehicle. Secure them before departure and avoid abrupt stops.')] };
  }

  // Same force, different mass → different acceleration (G9 #3 containers, #4 roofing vs board).
  function fma(id, kind){
    const T = 9;
    const [n1, n2] = kind==='wind' ? ['roofing sheet (light)','wooden board (heavy)'] : ['empty container (light)','filled container (heavy)'];
    const shape1 = kind==='wind' ? `<rect x="-16" y="-4" width="32" height="5" fill="#d4d4d8" stroke="#71717a"/>` : `<rect x="-14" y="-24" width="28" height="24" rx="3" fill="#e5e7eb" opacity=".7" stroke="#64748b"/>`;
    const shape2 = kind==='wind' ? `<rect x="-20" y="-7" width="40" height="8" fill="#8a6236" stroke="#451a03"/>` : `<rect x="-14" y="-24" width="28" height="24" rx="3" fill="#1d4ed8" stroke="#1e3a8a"/><rect x="-11" y="-17" width="22" height="15" fill="#38bdf8" opacity=".7"/>`;
    const lane = (y, shape, far, label)=> `<line x1="0" y1="${y}" x2="400" y2="${y}" stroke="#334155"/>`
      + `<g>${AT('translate',T,[[0,`60 ${y}`],[1.6,`60 ${y}`],[6.4,`${60+far} ${y}`],[T-.4,`${60+far} ${y}`],[T-.1,`60 ${y}`]],'in')}${shape}`
      +   `<g opacity="0">${show(T,.5)}${arrow(id,-56,-10,-20,-10,kind==='wind'?'white':'water',3.5)}</g></g>` + text(60,y+16,label,{size:9.5,fill:'#cbd5e1'});
    const body = (kind==='wind' ? '' : water(30,190).replace('opacity=".55"','opacity=".35"'))
      + lane(84, shape1, 300, n1) + lane(160, shape2, 90, n2)
      + `<g opacity="0">${show(T,.5)}${text(200,22,'same force F on both',{size:11,fill:kind==='wind'?C.white:C.water})}</g>`
      + `<g opacity="0">${show(T,3.4)}${text(330,62,'large a',{size:11,fill:'#fecaca'})}${text(250,140,'small a',{size:11,fill:C.safe})}</g>`
      + `<g opacity="0">${show(T,5)}${text(330,108,'a = Fnet / m',{size:14,fill:C.vel})}</g>`;
    return { T, body, steps:[
      S(.5, kind==='wind' ? 'The wind pushes both objects with about the same force F.' : 'The floodwater pushes both containers with about the same force F.'),
      S(1.6, 'Both start to speed up…'),
      S(3.4, kind==='wind' ? '…but the light roofing sheet gains speed much faster than the heavy board.' : '…but the light, empty container gains speed much faster than the filled one.'),
      S(5, 'Newton’s second law: a = Fnet/m — with about equal net forces, less mass means more acceleration.'),
      S(6.4, kind==='wind' ? 'The fast-moving sheet is the bigger danger: stay away from its path.' : 'Stay clear of light objects in moving water — they are swept away quickly.')] };
  }

  // Action–reaction stepping off a boat (G9 #5).
  function actionReaction(id){
    const T = 11, gy = 128;
    const body = water(gy, 190, 120, 400) + `<rect x="0" y="${gy-8}" width="122" height="70" fill="#3f6212" opacity=".75"/>`
      + text(60,184,'riverbank',{size:9,fill:'#d9f99d'})
      // hard step: boat pushed away
      + `<g>${AT('translate',T,[[0,'0 0'],[1.2,'0 0'],[3.4,'110 0'],[5,'110 0'],[5.4,'0 0'],[T,'0 0']])}<path d="M136,${gy-4} L300,${gy-4} L286,${gy+14} L150,${gy+14} Z" fill="#7c4a1e" stroke="#451a03" stroke-width="1.6"/></g>`
      + `<g>${AT('translate',T,[[0,'170 0'],[1,'170 0'],[1.6,'92 0'],[5,'92 0'],[5.4,'170 0'],[6.6,'170 0'],[8.6,'92 0'],[T,'92 0']])}${person(0, gy-4, C.white, .9)}</g>`
      + `<g opacity="0">${show(T,1,2.4)}${arrow(id,150,gy-22,200,gy-22,'net',4)}${text(176,gy-30,'F on boat',{size:9.5,fill:'#fecaca'})}${arrow(id,138,gy-50,88,gy-50,'resist',4)}${text(112,gy-58,'F on learner',{size:9.5,fill:'#fdba74'})}</g>`
      + `<g opacity="0">${show(T,1.2,5)}${text(270,30,'F learner on boat = −F boat on learner',{size:10.5,fill:C.vel})}${text(270,48,'Hard step → boat shoots away ✗',{size:10.5,fill:'#fecaca'})}</g>`
      // held + slow step
      + `<g opacity="0">${show(T,5.6)}<line x1="40" y1="${gy-30}" x2="142" y2="${gy+2}" stroke="#d6b98c" stroke-width="2"/>${person(36, gy-6, C.safe, .9)}${text(270,30,'Boat held + slow step',{size:10.5,fill:C.safe})}${text(270,48,'→ small forces, boat stays ✓',{size:10.5,fill:C.safe})}</g>`;
    return { T, body, steps:[
      S(1, 'Stepping off, the learner pushes back on the boat…'),
      S(1.2, '…and the boat pushes the learner forward with an equal and opposite force (Newton’s third law).'),
      S(2.2, 'The boat, now free to move, shoots away from the bank — the learner may fall into the water.'),
      S(5.6, 'Safe way: someone holds the boat steady and the learner steps off slowly, so the forces stay small.')] };
  }

  // A bent branch held by a support: force pair; release → it springs (G9 #6).
  function branchSpring(id){
    const T = 9;
    const body = `<rect x="0" y="150" width="400" height="40" fill="${C.ground}"/><rect x="250" y="56" width="16" height="94" fill="#9ca3af"/>` + text(258,166,'bridge support',{size:9,fill:'#cbd5e1'})
      + `<g>${AT('rotate',T,[[0,'0 70 146'],[4.6,'0 70 146'],[5.2,'-30 70 146'],[5.6,'-22 70 146'],[6,'-26 70 146'],[T-.4,'-26 70 146'],[T-.1,'0 70 146']])}`
      +   `<path d="M70,146 Q150,70 248,84" stroke="#7a5532" stroke-width="9" fill="none" stroke-linecap="round"/><circle cx="190" cy="78" r="12" fill="#3f6212"/><circle cx="214" cy="72" r="10" fill="#4d7c0f"/></g>`
      + `<g opacity="0">${show(T,.6,4.6)}${arrow(id,216,96,246,96,'net',3.6)}${text(222,114,'branch → support',{size:9,fill:'#fecaca'})}${arrow(id,298,76,268,76,'resist',3.6)}${text(318,66,'support → branch',{size:9,fill:'#fdba74'})}</g>`
      + `<g opacity="0">${show(T,1.8,4.6)}${text(150,26,'Equal & opposite forces · stored elastic PE: U = ½kx²',{size:10.5,fill:C.vel})}</g>`
      + `<g opacity="0">${show(T,3,4.6)}${person(150,150,C.net,.9)}${text(150,166,'learner pulling ✗',{size:9,fill:'#fecaca'})}</g>`
      + `<g opacity="0">${show(T,4.6)}${text(150,26,'Released → the push is gone → it springs!',{size:11,fill:'#fecaca'})}<path d="M220,70 Q200,40 160,40" stroke="${C.net}" stroke-width="2" stroke-dasharray="4 3" fill="none" marker-end="url(#${id}-net)"/></g>`
      + person(370,150,C.vel,.9) + person(386,150,C.vel,.9) + `<g opacity="0">${show(T,6.2)}${text(372,44,'trained adults',{size:9,fill:C.safe})}${text(372,58,'+ equipment ✓',{size:9,fill:C.safe})}</g>`;
    return { T, body, steps:[
      S(.6, 'The bent branch pushes on the bridge support; the support pushes back equally (Newton’s third law).'),
      S(1.8, 'Bent, the branch stores elastic potential energy (U = ½kx² in a simple spring model).'),
      S(3, 'Pulling it could free it suddenly…'),
      S(4.6, '…then the support’s push is gone and the branch springs toward whoever is in front of it.'),
      S(6.2, 'Safe decision: don’t pull it — trained adults with proper equipment should remove it.')] };
  }

  // Projectile: landing point depends on angle and speed (G10 #1 rope throw).
  function projectileAim(id){
    const T = 10, x0 = 40, y0 = 132, g = 9.8;
    const path = (v, th)=>{ let d = `M${x0},${y0}`; const r = th*Math.PI/180; for(let t=.05;t<4;t+=.05){ const x = x0 + v*Math.cos(r)*t*14, y = y0 - (v*Math.sin(r)*t - .5*g*t*t)*14; d += ` L${x.toFixed(1)},${y.toFixed(1)}`; if(y > 160 || (x > 300 && y > 92)) break; } return d; };
    const tries = [[5.2,20,C.net,'too low, too slow'],[9,75,C.resist,'too steep'],[7.6,45,C.safe,'adjusted θ and v₀ ✓']];
    let ps = '';
    tries.forEach(([v,th,col,l],i)=>{ const t0 = .6 + i*2.2; ps += `<path d="${path(v,th)}" stroke="${col}" stroke-width="2.6" fill="none" ${draw(T,t0,t0+1.2,700)} stroke-linecap="round">${drawAnim(T,t0,t0+1.2,700)}</path>`
      + `<g opacity="0">${show(T,t0+1.2)}${text(i===1?120:i===0?120:230, i===1?24:i===0?150:46, l, {size:9.5,fill:col})}</g>`; });
    const body = water(150,190,80,300) + `<rect x="0" y="132" width="80" height="58" fill="#3f6212" opacity=".75"/><rect x="300" y="92" width="100" height="98" fill="#a8a29e"/>`
      + text(350,110,'raised platform',{size:9,fill:'#1f2937'}) + text(190,184,'flooded gap',{size:9,fill:'#bae6fd'})
      + person(32,132,C.resist,.9) + person(340,92,C.white,.8) + person(362,92,C.white,.8)
      + ps
      + `<g opacity="0">${show(T,7.2)}${text(150,70,'x = v₀ cos θ · t',{size:10.5,fill:C.vel})}${text(150,86,'y = y₀ + v₀ sin θ · t − ½gt²',{size:10.5,fill:C.vel})}</g>`;
    return { T, body, steps:[
      S(.6, 'Thrown without aiming — too low and too slow — the rope falls into the water.'),
      S(2.8, 'Too steep, it goes up high and still comes down short.'),
      S(5, 'After estimating the distance, the right angle and speed land it on the platform.'),
      S(7.2, 'Ideal projectile (no air resistance): launch speed, angle and relative height decide where the rope lands — estimate the gap and adjust the throw.')] };
  }

  // Windblown roofing: a curved projectile path, not straight down (G10 #2).
  function projectileRoof(id){
    const T = 9, gy = 150;
    const d = (()=>{ let s = 'M70,58'; for(let t=.05;t<3;t+=.05){ const x = 70 + 48*t*1.6, y = 58 - (12*t - 4.9*t*t)*9; s += ` L${x.toFixed(1)},${y.toFixed(1)}`; if(y > gy-4) break; } return s; })();
    const body = `<rect x="0" y="${gy}" width="400" height="40" fill="${C.ground}"/><rect x="34" y="70" width="60" height="80" fill="#78716c"/><path d="M28,72 L100,72 L64,48 Z" fill="#a16207"/>`
      + `<rect x="300" y="100" width="80" height="50" fill="#475569"/>` + text(340,166,'secure shelter',{size:9,fill:C.safe})
      + `<line x1="70" y1="58" x2="70" y2="${gy}" stroke="#94a3b8" stroke-dasharray="3 4"/>` + `<g opacity="0">${show(T,.8)}${text(110,166,'not straight down ✗',{size:9,fill:'#cbd5e1'})}</g>`
      + `<path d="${d}" stroke="${C.vel}" stroke-width="2.4" fill="none" stroke-dasharray="5 4"/>`
      + `<g opacity="0">${A('opacity',T,[[0,0],[.6,0],[.7,1],[3.2,1],[3.3,0]])}<rect x="-12" y="-3" width="24" height="5" fill="#d4d4d8" stroke="#71717a"><animateMotion dur="${T}s" repeatCount="indefinite" path="${d}" keyPoints="0;0;1;1" keyTimes="0;${(.6/T).toFixed(3)};${(3.2/T).toFixed(3)};1" calcMode="linear" rotate="auto"/></rect></g>`
      + `<ellipse cx="236" cy="${gy+2}" rx="38" ry="6" fill="${C.net}" opacity=".55"/>` + text(236,182,'landing area',{size:9,fill:'#fecaca'})
      + `<g opacity="0">${show(T,3.4)}${text(200,24,'It flies sideways as it falls: a projectile',{size:11})}${text(200,42,'x = v₀ₓ t,   y = y₀ + v₀ᵧ t − ½gt²   (wind & drag can alter it)',{size:9.5,fill:C.vel})}</g>`
      + person(278,gy,C.safe,.9) + `<g opacity="0">${show(T,5)}<path d="M286,140 L306,140" stroke="${C.safe}" stroke-width="2" marker-end="url(#${id}-safe)"/>${check(292,112,true)}</g>`;
    return { T, body, steps:[
      S(.8, 'The wind tears a piece of roofing off the structure.'),
      S(1.6, 'It starts with sideways speed, so it travels along a curved path while it falls.'),
      S(3.4, 'That is projectile motion — it lands well away from the spot below where it started.'),
      S(5, 'Its path is hard to predict: move into a secure shelter, away from where it could land.')] };
  }

  // Inelastic collision: they move together; momentum same before and after, some KE lost (G10 #6).
  function inelastic(id){
    const T = 9, gy = 120, tHit = 2.6;
    const body = `<rect x="0" y="${gy}" width="400" height="6" fill="${C.ground}"/>`
      + `<g>${AT('translate',T,[[0,'30 0'],[tHit,'170 0'],[6,'250 0'],[T-.4,'250 0'],[T-.1,'30 0']])}<rect x="0" y="${gy-12}" width="40" height="8" fill="#8a6236"/></g>`
      + `<g>${AT('translate',T,[[0,'0 0'],[tHit,'0 0'],[6,'80 0'],[T-.4,'80 0'],[T-.1,'0 0']])}<rect x="210" y="${gy-24}" width="22" height="24" rx="2" fill="#e5e7eb" stroke="#64748b"/></g>`
      + `<g opacity="0">${show(T,.4,tHit)}${arrow(id,40,70,100,70,'vel',3.2)}${text(70,62,'v₁',{size:10,fill:C.vel})}${text(222,80,'at rest',{size:9.5,fill:'#cbd5e1'})}</g>`
      + `<g opacity="0">${show(T,tHit+.2)}${arrow(id,230,70,258,70,'vel',3.2)}${text(244,62,'v′ (slower, together)',{size:10,fill:C.vel})}${text(200,24,'PERFECTLY INELASTIC: they stick together',{size:11.5,fill:'#fecaca'})}</g>`
      + `<line x1="40" y1="176" x2="380" y2="176" stroke="#475569"/>`
      + growBar(T, 70, 176, 26, 40, C.purple, [[0,1],[T,1]]) + text(83,188,'p before',{size:8.5,fill:'#ddd6fe'})
      + `<g opacity="0">${show(T,tHit+.4)}${growBar(T, 130, 176, 26, 40, C.purple, [[0,1],[T,1]])}${text(143,188,'p after',{size:8.5,fill:'#ddd6fe'})}${text(110,138,'Σp before = Σp after',{size:10,fill:'#ddd6fe'})}</g>`
      + growBar(T, 250, 176, 26, 40, C.net, [[0,1],[T,1]]) + text(263,188,'KE before',{size:8.5,fill:'#fecaca'})
      + `<g opacity="0">${show(T,tHit+.4)}${growBar(T, 310, 176, 26, 40, C.net, [[0,.45],[T,.45]])}${text(323,188,'KE after',{size:8.5,fill:'#fecaca'})}${text(300,138,'some KE lost',{size:10,fill:'#fecaca'})}</g>`
      + `<g opacity="0">${show(T,6.4)}${text(200,44,'m₁u₁ + m₂u₂ = (m₁ + m₂)v — still moving: stay out of their path',{size:9.5,fill:C.vel})}</g>`;
    return { T, body, steps:[
      S(.4, 'The windblown board moves at v₁; the plastic container is at rest.'),
      S(tHit, 'They stick together and move with one common velocity — a perfectly inelastic collision.'),
      S(tHit+.4, 'With negligible external impulse, total momentum is conserved; kinetic energy is not.'),
      S(6.4, 'm₁u₁ + m₂u₂ = (m₁ + m₂)v: the joined objects keep moving and stay dangerous.')] };
  }

  // ═══ selection ═══
  function forScenario(scen, opts){
    opts = opts || {};
    if(opts.lab) return boatLoad(opts.id, opts.lab.w, opts.lab.loaded);
    const g = opts.grade;
    switch(scen.scene){
      case 'trashbin': return binForce(opts.id);
      case 'sign': return sign(opts.id, scen);
      case 'route': return routes(opts.id, 'flood');
      case 'fallentree': return routes(opts.id, 'tree');
      case 'practice': return routes(opts.id, 'puddle');
      case 'bottle': return equalTime(opts.id);
      case 'windupdate': return windUpdates(opts.id, scen);
      case 'drum': return rolling(opts.id, 'drum');
      case 'wheel': return rolling(opts.id, 'wheel');
      case 'ramp': return ramp(opts.id, false);
      case 'cartramp': return ramp(opts.id, true);
      case 'lever': return lever(opts.id);
      case 'tiltboat': return boatTilt(opts.id);
      case 'floatbox': return floatAway(opts.id);
      case 'boatdrift': return boatDrift(opts.id);
      case 'panel': return energyFall(opts.id);
      case 'momentum': return momentum(opts.id);
      case 'barrier': return impulse(opts.id);
      case 'channel': return channel(opts.id);
      case 'roofslide': return motionMap(opts.id);
      case 'logbottle': return momentum(opts.id, true);
      case 'flowerpot': return potentialPot(opts.id);
      case 'stuckbox': return workDisp(opts.id);
      case 'platform': return mechEnergy(opts.id);
      case 'boatstop': return inertia(opts.id, 'boat');
      case 'vehiclestop': return inertia(opts.id, 'vehicle');
      case 'twocontainers': return fma(opts.id, 'water');
      case 'roofboard': return fma(opts.id, 'wind');
      case 'boatstep': return actionReaction(opts.id);
      case 'branchspring': return branchSpring(opts.id);
      case 'ropethrow': return projectileAim(opts.id);
      case 'roofproj': return projectileRoof(opts.id);
      case 'fender': return impulse(opts.id, 'fender');
      case 'inelastic': return inelastic(opts.id);
    }
    if(scen.vel !== undefined || scen.rain !== undefined) return currentForce(opts.id, scen);
    if(scen.wind !== undefined) return windSquare(opts.id, scen);
    return null;
  }

  function build(scen, opts){
    const id = 'xv' + (++uid);
    const v = forScenario(scen, Object.assign({}, opts, {id}));
    if(!v) return null;
    v.svg = `<svg class="xv-svg" viewBox="0 0 400 190" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Animated diagram of the physics in this question" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">`
      + arrowDefs(id) + v.body + '</svg>';
    return v;
  }

  // ─── mounting + step sync ───
  let timer = null;
  function render(scen, opts){
    const host = document.getElementById('fb-visual');
    if(!host) return false;
    clearInterval(timer);
    let v = null;
    try{ v = build(scen, opts); }catch(e){ console.error('Visual explanation failed:', e); }
    if(!v){ host.innerHTML = ''; host.hidden = true; return false; }
    host.hidden = false;
    // timeline: play/pause, progress with a tick per step, and "step n / N"
    const ticks = v.steps.map((st,i)=>`<i class="xv-tick" style="left:${(st.t/v.T*100).toFixed(1)}%" title="Step ${i+1}"></i>`).join('');
    host.innerHTML = `<div class="xv-stage">${v.svg}<button type="button" class="xv-replay" aria-label="Replay the animation" title="Replay">↺</button></div>`
      + `<div class="xv-bar"><button type="button" class="xv-play" aria-label="Pause the animation" title="Pause">❚❚</button>`
      + `<div class="xv-prog" aria-hidden="true"><span class="xv-fill"></span>${ticks}</div><span class="xv-count" aria-live="off">1 / ${v.steps.length}</span></div>`
      + `<ol class="xv-steps">${v.steps.map((s,i)=>`<li data-t="${s.t}"><span class="xv-n">${i+1}</span><span>${String(s.s).replace(/&/g,'&amp;').replace(/</g,'&lt;')}</span></li>`).join('')}</ol>`;
    const svg = host.querySelector('svg'), lis = [...host.querySelectorAll('.xv-steps li')];
    const fill = host.querySelector('.xv-fill'), count = host.querySelector('.xv-count'), play = host.querySelector('.xv-play');
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 'on' = reached; 'now' = the latest reached step (the first one before any is reached),
    // which compact mode shows alone as a caption.
    const mark = (t)=>{
      let now = 0;
      lis.forEach((li,i)=>{ if(+li.dataset.t <= t) now = i; });
      lis.forEach((li,i)=>{ li.classList.toggle('on', +li.dataset.t <= t); li.classList.toggle('now', i === now); });
      fill.style.width = (Math.min(1, t / v.T) * 100).toFixed(1) + '%';
      count.textContent = `${now+1} / ${lis.length}`;
    };
    const setPlaying = (on)=>{ try{ on ? svg.unpauseAnimations() : svg.pauseAnimations(); }catch(e){}
      play.textContent = on ? '❚❚' : '▶'; play.setAttribute('aria-label', on ? 'Pause the animation' : 'Play the animation'); play.title = on ? 'Pause' : 'Play'; };
    play.onclick = ()=> setPlaying(svg.animationsPaused && svg.animationsPaused());
    const restart = ()=>{ try{ svg.setCurrentTime(0); }catch(e){} setPlaying(true); };
    host.querySelector('.xv-replay').onclick = restart;
    if(reduce){
      try{ svg.pauseAnimations(); svg.setCurrentTime(v.final || v.T - .6); }catch(e){}
      lis.forEach(li=> li.classList.add('on'));
      fill.style.width = '100%'; count.textContent = `${lis.length} / ${lis.length}`; play.textContent = '▶';
      return true;
    }
    restart();
    const wrap = document.getElementById('fb-wrap');
    timer = setInterval(()=>{
      if(wrap && !wrap.classList.contains('on')){ clearInterval(timer); return; }
      let t = 0; try{ t = svg.getCurrentTime() % v.T; }catch(e){}
      mark(t);
    }, 150);
    mark(0);
    return true;
  }

  return { render, build };
})();

function renderExplainVisual(scen, opts){ return XV.render(scen, opts); }
function explainVisualFor(scen, opts){ return XV.build(scen, opts); }
