'use strict';
// ═══════════════════════════════════════════════
//  GRADES 8–10 — one purpose-built scene per decision item
// ═══════════════════════════════════════════════
// Built from the same pieces as grade7-scenes.js and shs-scenes.js (village ground,
// labels, force arrows, hazard areas that refuse entry, a safe spot with the gateway),
// so every grade looks and plays alike. Each scene shows its item's physics happening:
// speeds that visibly change, equal-and-opposite force pairs, projectile paths, energy
// stored up high and released, collisions that stick together or are cushioned.
// Grade 8 #3 reuses the Grade 12 log scene in a kinetic-energy version; Grade 10 #3 and
// #4 reuse the Grade 12 momentum and padded-barrier scenes.

// ─── small shared pieces ───
// Rows of motion-map posts: drop() places one at (x,z); clear() removes them for the loop.
function jMarkers(color){
  const items = [], m = new THREE.MeshBasicMaterial({color: color||0xfacc15, toneMapped:false});
  const geo = new THREE.CylinderGeometry(.05,.05,.9,8);
  return {
    drop(x, y, z){ const p = new THREE.Mesh(geo, m); p.position.set(x, (y||0)+.45, z); scene.add(p); items.push(p); },
    clear(){ items.splice(0).forEach(p=> scene.remove(p)); }
  };
}
// A dotted trajectory/guide through world points (dots every `gap` units; thin GL lines
// are 1 px wide and vanish at game distances).
function jDashed(points, color, gap){
  gap = gap || .4;
  const grp = new THREE.Group(), m = new THREE.MeshBasicMaterial({color, toneMapped:false, transparent:true, opacity:.95, depthTest:false});
  const geo = new THREE.SphereGeometry(.075, 10, 8);
  let acc = gap;
  for(let i=1;i<points.length;i++){
    const a = new THREE.Vector3(...points[i-1]), b = new THREE.Vector3(...points[i]), L = a.distanceTo(b);
    for(let d = gap - acc; d < L; d += gap){ const dot = new THREE.Mesh(geo, m); dot.position.lerpVectors(a, b, d/L); dot.renderOrder = 17; grp.add(dot); }
    acc = (acc + L) % gap;
  }
  scene.add(grp);
  return grp;
}
// Rope between two moving points; call set(a, b) with Vector3s each frame.
function jRope(color){
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({color: color||0xd6b98c})); scene.add(l);
  l.userData.set = (a, b)=>{ const p = g.attributes.position.array; p[0]=a.x;p[1]=a.y;p[2]=a.z;p[3]=b.x;p[4]=b.y;p[5]=b.z; g.attributes.position.needsUpdate = true; };
  return l;
}
function jSheet(w, d){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w||1.6,.04,d||1), pbr({color:0xa1a1aa, map:giTex(), metalness:.6, roughness:.4, rim:.15}));
  m.castShadow = true; return m;
}
function jBoard(){
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.9,.12,.38), pbr({color:0x8a6236, map:woodTex(), roughness:.88}));
  m.castShadow = true; return m;
}
// Plastic container: empty (light, see-through) or water-filled (heavy).
function jContainer(filled){
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(.8,.7,.62), new THREE.MeshStandardMaterial({color: filled?0x1d4ed8:0xe5e7eb, transparent:!filled, opacity: filled?1:.55, roughness:.3}));
  body.position.y = .35; body.castShadow = true; g.add(body);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(.86,.07,.68), pbr({color: filled?0x1e3a8a:0x9ca3af, roughness:.4})); lid.position.y = .72; g.add(lid);
  if(filled){ const w = new THREE.Mesh(new THREE.BoxGeometry(.74,.55,.56), new THREE.MeshStandardMaterial({color:0x38bdf8, transparent:true, opacity:.55})); w.position.y = .32; g.add(w); }
  return g;
}
function jSack(color){
  const m = new THREE.Mesh(blobGeo(.3,16,.18,color&255), pbr({color, roughness:.9})); m.scale.set(1.1,.75,.85); m.castShadow = true; return m;
}
const jDanger = (w, d, x, z, k)=>{ const m = g7Decal(g7SoftTex('g7-danger','rgba(239,68,68,.55)','rgba(239,68,68,0)'), w, d, x, .05, z); m.material.toneMapped = false;
  animCallbacks.push((t)=>{ m.material.opacity = (k||.7) + Math.sin(t*3)*.2; }); return m; };
const ease = f=> f*f*(3-2*f);

// ═══ GRADE 8 ═══

// 1 · FLOOD · Acceleration — floodwater speeds up through a narrowing drainage channel.
function jChannel(scen){
  const half = x=> x < -2 ? 3.9 : x < 2.5 ? 3.9 - (x+2)/4.5*2.3 : 1.6;
  const speed = x=> x < -2 ? .9 : x < 2.5 ? .9 + (x+2)/4.5*2.2 : 3.1;
  shsLanding({ rain:4500, keepOut:(x,z)=> Math.abs(z) < half(x)+1.2 && x > -17, wet:(x,z)=> Math.abs(z) < half(x)+2 && x > -18 });
  // glossy flood-green water (the muddy shader reads as soil from this high camera)
  const cw = (w,d,x,flow)=>{ const m = makeWater(w,d,.7,0x6f8a74,0x2c4a46,70,{muddy:false, flow:[flow,0], edge:.35, amp:.6}); m.position.set(x,.3,0); scene.add(m); };
  cw(14,7.8,-9,.9); cw(5,6.2,.25,2); cw(11.6,3.2,8.5,3);
  g7Current(-15,-2.4,-3.2,3.2,.3,()=>.9,false);
  g7Current(-2,13.8,-1.2,1.2,.3,(p)=>speed(p.x),false);
  const wm = pbr({color:0x9ca3af, map:g7PathTex('concrete'), roughness:.9});
  const wall = (x0,z0,x1,z1)=>{ const L = Math.hypot(x1-x0,z1-z0); const w = new THREE.Mesh(new THREE.BoxGeometry(L,.8,.28), wm);
    w.position.set((x0+x1)/2,.4,(z0+z1)/2); w.rotation.y = -Math.atan2(z1-z0,x1-x0); w.castShadow = w.receiveShadow = true; scene.add(w); };
  [-1,1].forEach(s=>{ wall(-16,s*4.05,-2,s*4.05); wall(-2,s*4.05,2.5,s*1.75); wall(2.5,s*1.75,13.6,s*1.75); });
  g7Tag('WIDE · slower', -9, 1.6, 0, {size:.65, fg:'#bae6fd'});
  g7Tag('NARROW · faster', 8, 1.6, 0, {size:.65, fg:'#fecaca', border:'#ef4444'});
  const hg = new THREE.Mesh(new THREE.CylinderGeometry(3.4,3.7,.18,40), pbr({color:0x8f8775,map:g7PathTex('dirt'),roughness:.95}));
  hg.position.set(-5,.06,-9.5); hg.receiveShadow = true; scene.add(hg);
  g7SafePad(-5,-9.5,'SAFE SPOT · away from the channel');

  const box = new THREE.Group(); box.add(jContainer(false)); scene.add(box);
  const vA = g7Arrow(0xfacc15, 1, .08); scene.add(vA);
  const lv = g7Label('v', {size:.6, fg:'#fde047'}); scene.add(lv);
  const la = g7Label('Speed increasing → accelerating   a = Δv/Δt > 0', {size:.72, fg:'#fde047', border:'#facc15'}); la.position.set(1,4.4,0); scene.add(la);
  const mk = jMarkers(0xfacc15);
  let x = -14, since = 0;
  animCallbacks.push((t,dt)=>{
    const v = speed(x); x += v*dt; since += dt;
    if(since > .7){ since = 0; mk.drop(x, .8, -(half(x)+.15)); }
    if(x > 13){ x = -14; mk.clear(); }
    box.position.set(x, .17+Math.sin(t*3)*.03, Math.sin(t*1.3)*.25); box.rotation.y = Math.sin(t*.8)*.25;
    vA.position.set(x+.3, 1.3, box.position.z); vA.userData.setLen(.3 + v*.55);
    lv.position.set(x+.6+v*.3, 1.75, box.position.z);
  });
  g7Human(2,-4.6); humanGroup.rotation.y = -Math.PI*.6;
  g7Gateway(-5,-9.5,0);
  G7 = { bounds:[-14,12,-13,9], camOff:[6,5,5],
    hazards:[{test:(x,z)=> x > -16.5 && x < 13.6 && Math.abs(z) < half(x)+.9, msg:'⚠ Stay away from the channel — the floodwater is speeding up!'},
             {test:(x,z)=> x > 12.5, msg:'⚠ Stay away from the boat landing.'}] };
  g7Camera([-3,10,15],[1,0,-1.5]);
}

// 2 · TYPHOON · Acceleration — a loose roofing sheet blown toward the pathway, faster and faster.
function jRoofSlide(scen){
  shsBridge(scen);
  const SX = -12.5;
  g7Clear(SX,4,4.2); g7Clear(-17,-5.5,3); g7Clear(-9,-3.5,1.8);
  const hut = makeHouse(-15.6,10.5,3.2,2.8,3,true); scene.add(hut);
  jDanger(3.6, 11, SX, 3.6, .65);
  g7Tag('Its path → pathway', SX+2.4, 1, 6.5, {size:.55, fg:'#fecaca', border:'#ef4444'});
  const sheet = jSheet(); scene.add(sheet);
  const vA = g7Arrow(0xfacc15, 1, .08); vA.rotation.y = Math.PI/2; scene.add(vA);       // points −z
  const wA = g7Arrow(0xe2e8f0, 1.4, .07); wA.rotation.y = Math.PI/2; scene.add(wA);
  const lw = g7Label('wind gusts', {size:.55}); scene.add(lw);
  const la = g7Label('Speeding up: a = Δv/Δt · ΣF = ma', {size:.7, fg:'#fde047', border:'#facc15'}); la.position.set(SX,4,4); scene.add(la);
  g7Tag('LOOSE ROOFING SHEET', SX, 2.2, 9.3, {size:.55});
  const mk = jMarkers(0xfacc15);
  let z = 9.5, v = .5, since = 0;
  animCallbacks.push((t,dt)=>{
    const gust = .6 + Math.max(0, Math.sin(t*1.7))*1.4;
    v = Math.min(6, v + gust*dt*.9); z -= v*dt; since += dt;
    if(since > .5){ since = 0; mk.drop(SX+1.9, 0, z); }
    if(z < -2.5){ z = 9.5; v = .5; mk.clear(); }
    sheet.position.set(SX + Math.sin(t*2)*.2, .25 + Math.abs(Math.sin(t*3.2))*.35, z);
    sheet.rotation.set(Math.sin(t*4)*.6, t*.8, Math.sin(t*3.3)*.4);
    vA.position.set(SX, 1.4, z-.2); vA.userData.setLen(.4 + v*.35);
    wA.position.set(SX-1.2, 1.9, z+1.6); lw.position.set(SX-1.6, 2.5, z+1.4);
  });
  g7SafePad(-17,-5.5,'SAFE SPOT');
  g7Human(-9,-3.5, 0x1e3a8a); humanGroup.rotation.y = -Math.PI/2;
  g7Gateway(-17,-5.5,0);
  G7 = { bounds:[-19,-6.4,-9,9], camOff:[6,4.5,5],
    hazards:[{test:(x,z)=> Math.abs(x-SX) < 2.3 && z > -2.6 && z < 10, msg:'⚠ The roofing sheet is speeding up along this path — stay away!'}] };
  g7Camera([-19.5,8,-9.5],[-12.5,.6,3.5]);
}

// 4 · TYPHOON · Potential energy — a heavy flowerpot on a high ledge near the pathway.
function jFlowerpot(scen){
  shsBridge(scen);
  const WX = -11, WZ = 2.6, H = 1.8;
  g7Clear(WX,WZ,3.6); g7Clear(-14,4.8,2); g7Clear(-17,-5.5,3); g7Clear(-19.5,-6.5,3.2);
  const concrete = pbr({color:0xb6b0a4, map:g7PathTex('concrete'), roughness:.95});
  const wall = new THREE.Mesh(new THREE.BoxGeometry(3.2,H,1), concrete); wall.position.set(WX,H/2,WZ+.6); wall.castShadow = wall.receiveShadow = true; scene.add(wall);
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(3.4,.14,1.4), concrete); ledge.position.set(WX,H+.07,WZ+.4); ledge.castShadow = true; scene.add(ledge);
  // clay pot with a leafy plant
  const pot = new THREE.Group();
  const prof = [[0,0],[.22,0],[.3,.42],[.34,.5],[.34,.56],[0,.56]].map(([r,y])=> new THREE.Vector2(r,y));
  const clay = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), pbr({color:0xb45309, roughness:.85})); clay.castShadow = true; pot.add(clay);
  [[0,.75,0,.32],[.18,.68,.1,.24],[-.16,.7,-.08,.26]].forEach(([x,y,z,r])=>{ const b = new THREE.Mesh(blobGeo(r,16,.35,x*40+7), pbr({color:0x3f7d2a,roughness:.85,map:leafTex(),rim:.07})); b.position.set(x,y,z); pot.add(b); });
  pot.scale.setScalar(.85); scene.add(pot);          // its body fits between the learner's hands
  const start = new THREE.Vector3(WX+1.2, H+.14, WZ-.15);
  pot.position.copy(start);
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.3,.7,1.1), pbr({color:0x6b4f30,map:woodTex(),roughness:.9})); crate.position.set(-14.2,.35,5); crate.castShadow = true; scene.add(crate);
  const end = new THREE.Vector3(-14.2,.72,5);
  const lowTag = g7Tag('LOW & SECURE', -14.2, 1.7, 5, {size:.55, bg:'rgba(20,83,45,.92)', border:'#4ade80'});
  const zone = jDanger(4, 3.4, WX+1.2, WZ-1.6, .7);
  const zoneTag = g7Tag('fall zone', WX+1.2, .8, WZ-2.6, {size:.5, fg:'#fecaca', border:'#ef4444'});
  const hLine = new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,1,6), new THREE.MeshBasicMaterial({color:0xfacc15, toneMapped:false})); scene.add(hLine);
  const lh = g7Label('h', {size:.65, fg:'#fde047'}); scene.add(lh);
  const lu = g7Label('High up: PE = mgh (large h)', {size:.66, fg:'#fde047', border:'#facc15'}); scene.add(lu);
  // The learner lifts the pot down and sets it on the low crate (Take Control steps below);
  // until then it rocks on the ledge in the gusts.
  let state = 'ledge';
  const p = new THREE.Vector3();
  animCallbacks.push((t)=>{
    if(state === 'ledge') pot.rotation.set(0, 0, -(Math.sin(t*2.6)*.09 + Math.max(0, Math.sin(t*1.3))*.08));
    pot.getWorldPosition(p);
    hLine.position.set(p.x+.5, p.y/2, p.z); hLine.scale.y = Math.max(.01, p.y);
    lh.position.set(p.x+.8, p.y/2, p.z); lu.position.set(p.x, p.y+1.5, p.z);
    zone.visible = zoneTag.visible = state === 'ledge';
  });
  g7SafePad(-17,-5.5,'SAFE SPOT');
  g7Human(-9,-3.5, 0x1e3a8a); humanGroup.rotation.y = -Math.PI/2;
  g7Gateway(-17,-5.5,0);
  const wallBody = {test:(x,z)=> Math.abs(x-WX) < 2 && Math.abs(z-WZ-.6) < .95, msg:'⚠ That’s the wall — go around it.'};
  const crateBody = {test:(x,z)=> Math.abs(x+14.2) < .95 && Math.abs(z-5) < .85, msg:'⚠ Set the pot on the crate from the front.'};
  G7 = { bounds:[-19,-6.4,-9,9], camOff:[-6,5,-3],
    hazards:[{test:(x,z)=> Math.hypot(x-(WX+1.2), z-(WZ-1.4)) < 2.6 || (Math.abs(x-WX) < 2 && Math.abs(z-WZ-.6) < 1), msg:'⚠ Don’t stand under the ledge — the pot could fall here!'}],
    // The decision is something to DO: take the pot down before the wind gets stronger.
    onControl(){ G7.hazards = [wallBody, crateBody]; },
    tasks:[
      {at:[WX+1.2, WZ-.96], face:[WX+1.2, WZ-.15], act:'✋ Lift the pot down', obj:pot, short:'Lift the flowerpot down from the ledge', text:'Stand in front of the ledge and lift the flowerpot down',
       done:'Pot lifted down — carry it with both hands',
       run(next){ state = 'held'; pot.rotation.set(0,0,0); g7Carry(pot, [0,.82,.42], 0, ()=> setTimeout(next, 250));
         g7Relabel(lu, 'Lifted down: smaller h → less PE', {size:.62, fg:'#fde047', border:'#facc15'}); }},
      {at:[-14.2, 3.98], face:[-14.2, 5], act:'⬇ Set it on the crate', obj:crate, ghost:[{src:pot, at:[end.x,end.y,end.z]}], short:'Set it on the low, secure crate', text:'Carry the pot to the low crate and set it down',
       done:'Pot is low and secure: small h → small PE',
       run(next){ g7PutDown(pot, end, ()=>{ state = 'low'; lowTag.visible = false; g7Relabel(lu, 'Low & secure: small h → small PE', {size:.66, fg:'#bbf7d0', border:'#22c55e'}); next(); }); }}],
    finish:[-17,-5.5], finishText:'Pot secured — now walk to the safe spot, away from the ledge' };
  g7Camera([-20,5.5,-6.5],[-11.5,1.6,2]);
}

// 5 · FLOOD · Work — a box caught on a raised lip doesn't move (W = 0); on a clear path it does (W = Fd).
function jStuckBox(scen){
  const lane = (z)=> Math.abs(z-5.2) < 1.5;
  shsLanding({ rain:1500, keepOut:(x,z)=> (lane(z) || Math.abs(z+1.5) < 1.6) && x > -12 });
  g7Path([[12,5.2],[-9,5.2]], 2.4, 0xa29d92, .03, 'concrete');
  g7Path([[12,-1.5],[-9,-1.5]], 2.4, 0xb79c6c, .035, 'dirt');
  const lip = new THREE.Mesh(new THREE.BoxGeometry(.5,.32,2.6), pbr({color:0x78716c, map:g7PathTex('concrete'), roughness:.95})); lip.position.set(4,.16,5.2); lip.castShadow = lip.receiveShadow = true; scene.add(lip);
  g7Tag('raised portion', 4, 1.1, 6.7, {size:.5});
  // dry waiting area: a tent on a raised floor
  const tent = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(4.6,.3,5.2), pbr({color:0x9ca3af, map:g7PathTex('concrete'), roughness:.95})); floor.position.y = .15; floor.receiveShadow = true; tent.add(floor);
  [[-2,-2.4],[2,-2.4],[-2,2.4],[2,2.4]].forEach(([x,z])=>{ const p = new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,2.6,10), pbr({color:0x475569})); p.position.set(x,1.4,z); tent.add(p); });
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6,1.3,4), pbr({color:0x2563eb, roughness:.7})); roof.position.y = 3.2; roof.rotation.y = Math.PI/4; roof.castShadow = true; tent.add(roof);
  tent.position.set(-10.5,0,1.8); scene.add(tent);
  g7Tag('DRY WAITING AREA', -10.5, 4.6, 1.8, {bg:'rgba(20,83,45,.92)', border:'#4ade80', size:.75});
  // stuck: push, no displacement
  const sBox = shsReliefBox(1.78); sBox.position.set(4.6,.38,5.2); scene.add(sBox);
  const pusher = makeHuman(5.74,0,5.2,0x0f766e); pusher.rotation.order = 'YXZ'; pusher.rotation.y = -Math.PI/2; scene.add(pusher);
  pusher.userData.pose = 'push';                     // hands on the box, leaning in
  const fS = g7Arrow(0xfb923c, .9, .08); fS.rotation.y = Math.PI; scene.add(fS); fS.position.set(5.6,.9,5.6);
  const lS = g7Label('Pushing, but d = 0 → W = 0', {size:.62, fg:'#fecaca', border:'#ef4444'}); lS.position.set(4.6,2.6,5.2); scene.add(lS);
  // clear path: push and it moves
  const mBox = shsReliefBox(1.78); scene.add(mBox);
  const mover = makeHuman(0,0,-1.5,0xb45309); mover.rotation.order = 'YXZ'; mover.rotation.y = -Math.PI/2; mover.userData.baseY = 0; scene.add(mover);
  mover.userData.pose = 'push';
  const fM = g7Arrow(0xfb923c, .9, .08); fM.rotation.y = Math.PI; scene.add(fM);
  const dA = g7Arrow(0xfacc15, 1, .06); dA.rotation.y = Math.PI; scene.add(dA);
  const lM = g7Label('Moves with the push: W = F·d', {size:.62, fg:'#bbf7d0', border:'#22c55e'}); scene.add(lM);
  // Take Control: the learner pushes their own relief box along the clear path — the
  // force now produces a displacement, so work is done (W = F·d, d measured live).
  const myBox = shsReliefBox(1.78); myBox.visible = false; scene.add(myBox);
  const X0 = 8.6, GAP = 1.14;
  let mt = 0, mine = false, shownD = -1;
  animCallbacks.push((t,dt)=>{
    const strain = Math.sin(t*6)*.04;
    pusher.rotation.x = .5 + strain; sBox.position.x = 4.6 + strain*.15;
    if(mine){
      const h = humanGroup, fx = Math.sin(h.rotation.y), fz = Math.cos(h.rotation.y);
      myBox.position.set(h.position.x + fx*GAP, .38, h.position.z + fz*GAP); myBox.rotation.y = h.rotation.y;
      h.rotation.x = .5 + (h.userData.moving ? Math.sin(t*8.5)*.02 : 0);
      const d = Math.max(0, X0 - myBox.position.x);
      fM.rotation.y = h.rotation.y - Math.PI/2; fM.position.set(h.position.x + fx*.35, .9, h.position.z + fz*.35 + .45);
      dA.position.set(X0, .12, -2.9); dA.userData.setLen(Math.max(.05, d)); dA.visible = d > .1;
      lM.position.set(myBox.position.x, 2.6, myBox.position.z);
      const r = Math.round(d);
      if(r !== shownD){ shownD = r; g7Relabel(lM, `Your push moves it: d ≈ ${r} m → W = F·d > 0`, {size:.62, fg:'#bbf7d0', border:'#22c55e'}); }
      return;
    }
    mt = (mt + dt) % 7;
    const f = Math.min(1, mt/6), x = 10 - f*15;
    mBox.position.set(x, .38, -1.5); mover.position.x = x + GAP; mover.userData.moving = mt < 6; mover.rotation.x = .5;
    fM.position.set(x+1.1, .9, -1.1); dA.position.set(10, .12, -2.9); dA.userData.setLen(Math.max(.05, 10 - x));
    lM.position.set(x, 2.6, -1.5);
  });
  g7Human(11,-4.2, 0x1e3a8a); humanGroup.rotation.y = -Math.PI/2; humanGroup.rotation.order = 'YXZ';
  g7Gateway(-9.4,-1.5,Math.PI/2);
  G7 = { bounds:[-12,12,-12,8], camOff:[6,4.5,-4],
    hazards:[{test:(x,z)=> z > 3.4, msg:'⚠ That path is blocked by the raised portion — use the clear path.'},
             {test:(x,z)=> x > 12.3, msg:'⚠ Stay off the dock — take the box to the dry waiting area.'}],
    onControl(){
      // the demonstration pusher steps aside; the learner's own box waits at the start of the clear path
      mover.visible = mBox.visible = false;
      myBox.position.set(X0, .38, -1.5); myBox.rotation.y = -Math.PI/2; myBox.visible = true;
      fM.rotation.y = Math.PI; fM.position.set(X0+1.1, .9, -1.1); dA.visible = false; lM.position.set(X0, 2.6, -1.5);
      g7Relabel(lM, 'Your relief box — push it along the clear path', {size:.6, fg:'#fde047', border:'#facc15'});
    },
    tasks:[
      {at:[X0+GAP, -1.5], face:[X0, -1.5], act:'✋ Grip the box', obj:myBox, short:'Get behind your relief box', text:'Walk behind your relief box on the clear path',
       done:'Hands on the box — now push it (force → displacement)',
       run(next){ humanGroup.userData.pose = 'push';
         g7Anim(.4, f=>{ humanGroup.rotation.x = .5*f; }, ()=>{ mine = true; G7.speed = 1.8; G7.turnRate = 3; G7.probe = GAP + .45; next(); }); }}],
    finish:[-9.4,-1.5], finishRot:Math.PI/2, finishText:'Push the box along the clear path to the dry waiting area' };
  g7Camera([3,8.5,-13],[-1,.5,2]);
}

// 6 · TYPHOON · Mechanical energy — loose objects on a high platform are secured low.
function jPlatform(scen){
  shsBridge(scen);
  const PX = -11, PZ = 3.2, H = 1.5;
  g7Clear(PX,PZ,3.8); g7Clear(-15,5,2.2); g7Clear(-17,-5.5,3); g7Clear(-19.5,-7,3.6);
  const wood = pbr({color:0x7a5532, map:woodTex(), roughness:.88});
  const top = new THREE.Mesh(new THREE.BoxGeometry(3,.16,2), wood); top.position.set(PX,H,PZ); top.castShadow = true; scene.add(top);
  [[-1.35,-.85],[1.35,-.85],[-1.35,.85],[1.35,.85]].forEach(([x,z])=>{ const l = new THREE.Mesh(new THREE.BoxGeometry(.14,H,.14), wood); l.position.set(PX+x,H/2,PZ+z); l.castShadow = true; scene.add(l); });
  // low enclosed storage: an open-topped steel box with a lid hinged at the back
  const SX = -15, SZ = 5.2;
  const store = new THREE.Group(); store.position.set(SX,0,SZ); scene.add(store);
  const sm = pbr({color:0x334155, roughness:.6, metalness:.3});
  [[0,.03,0,2.2,.06,1.6],[0,.45,-.77,2.2,.9,.06],[0,.45,.77,2.2,.9,.06],[-1.07,.45,0,.06,.9,1.6],[1.07,.45,0,.06,.9,1.6]].forEach(([x,y,z,w,h,d])=>{
    const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), sm); m.position.set(x,y,z); m.castShadow = m.receiveShadow = true; store.add(m); });
  const lidPivot = new THREE.Group(); lidPivot.position.set(0,.9,.8); store.add(lidPivot);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(2.3,.1,1.7), pbr({color:0x1e293b, roughness:.6})); lid.position.set(0,.05,-.85); lid.castShadow = true; lidPivot.add(lid);
  lidPivot.rotation.x = 1.25;                                    // open, ready to receive the objects
  const latch = new THREE.Mesh(new THREE.BoxGeometry(.3,.12,.05), pbr({color:0xfacc15, metalness:.5})); latch.position.set(0,.84,-.82); latch.visible = false; store.add(latch);
  g7Tag('LOW ENCLOSED STORAGE', SX, 2.2, SZ, {size:.55, bg:'rgba(20,83,45,.92)', border:'#4ade80'});
  // loose objects on the platform; `b` is each one's place inside the storage box
  const objs = [
    {m: shsReliefBox(.82), from:[-1,.17,-.3], b:[SX-.5,.23,SZ+.25]}, {m: shsReliefBox(.7), from:[-.3,.15,.35], b:[SX-.5,.57,SZ+.25]},
    {m: new THREE.Mesh(new THREE.CylinderGeometry(.22,.18,.45,16), pbr({color:0x16a34a, roughness:.5})), from:[.8,.23,-.2], b:[SX+.45,.29,SZ+.2]},
    {m: jBoard(), from:[.3,.06,-.62], b:[SX,.12,SZ-.45]} ];
  objs.forEach((o,i)=>{ o.m.castShadow = true; scene.add(o.m); o.a = new THREE.Vector3(PX+o.from[0], H+.08+o.from[1], PZ+o.from[2]); o.m.position.copy(o.a); o.loose = true; });
  const zone = jDanger(5, 5.5, PX, PZ-1.8, .65);
  const lu = g7Label('Elevated & loose: PE = mgh', {size:.66, fg:'#fde047', border:'#facc15'}); lu.position.set(PX,H+2,PZ); scene.add(lu);
  const lk = g7Label('wind can turn PE → KE', {size:.58, fg:'#fecaca'}); lk.position.set(PX,H+1.25,PZ); scene.add(lk);
  const wA = g7Arrow(0xe2e8f0, 1.6, .07); wA.position.set(PX-3.4,H+.6,PZ); scene.add(wA);
  animCallbacks.push((t)=>{
    const gust = Math.max(0, Math.sin(t*1.6));
    wA.userData.setLen(1.1 + gust*1.2);
    objs.forEach((o,i)=>{ if(o.loose) o.m.rotation.set(0, i*.7, Math.sin(t*5+i)*.08*(.5+gust)); });   // rattling in the gusts
  });
  g7SafePad(-17,-5.5,'SAFE SPOT');
  g7Human(-9,-3.5, 0x1e3a8a); humanGroup.rotation.y = -Math.PI/2;
  g7Gateway(-17,-5.5,0);
  // Take Control: two trips from the platform to the storage box, then the lid is closed and latched.
  const take = (list, next)=>{ list.forEach(([i, local, ry])=>{ objs[i].loose = false; g7Carry(objs[i].m, local, ry); }); setTimeout(next, 750); };
  const stow = (list, next)=>{ list.forEach((i,k)=> setTimeout(()=> g7PutDown(objs[i].m, new THREE.Vector3(...objs[i].b), null, i === 3 ? 0 : i*.25, k < list.length-1), k*200)); setTimeout(next, 200*(list.length-1) + 800); };
  const stand = [SX, SZ-1.48];
  G7 = { bounds:[-19,-6.4,-9,9], camOff:[-6,5,-3],
    hazards:[{test:(x,z)=> Math.hypot(x-PX, z-(PZ-1)) < 3.4, msg:'⚠ Stay away from the platform — loose objects could fall or fly off!'}],
    onControl(){ lk.visible = false; G7.hazards = [
      {test:(x,z)=> Math.abs(x-PX) < 1.65 && Math.abs(z-PZ) < 1.15, msg:'⚠ Reach the objects from the front of the platform.'},
      {test:(x,z)=> Math.abs(x-SX) < 1.3 && Math.abs(z-SZ) < 1, msg:'⚠ Load the storage box from the front.'}]; },
    tasks:[
      {at:[PX-.65, PZ-1.43], face:[PX-.65, PZ], act:'✋ Take the boxes', obj:objs[0].m, short:'Take the two relief boxes down', text:'Stand in front of the platform and take the two loose relief boxes', done:'Boxes in hand — carry them to the storage',
       run(next){ take([[0,[0,1.06,.42],0],[1,[0,1.38,.42],0]], next); }},
      {at:stand, face:[SX, SZ], act:'⬇ Put them in storage', obj:store, ghost:[0,1].map(i=>({src:objs[i].m, at:objs[i].b, rotY:i*.25})), short:'Put them in the low storage', text:'Carry the boxes to the low enclosed storage and put them in', done:'Boxes stored low — go back for the rest',
       run(next){ stow([0,1], next); }},
      {at:[PX+.55, PZ-1.43], face:[PX+.55, PZ], act:'✋ Take them', obj:objs[2].m, short:'Take the container and the board', text:'Go back and take the water container and the loose board', done:'Got them — carry them to the storage',
       run(next){ take([[2,[0,1.06,.42],0],[3,[0,1.34,.42],0]], next); }},
      {at:stand, face:[SX, SZ], act:'⬇ Store & close the lid', obj:store, ghost:[2,3].map(i=>({src:objs[i].m, at:objs[i].b, rotY:i === 3 ? 0 : i*.25})), short:'Store them and latch the lid', text:'Store them, then close and latch the lid', done:'All objects secured low & enclosed: little PE',
       run(next){ stow([2,3], ()=>{
         humanGroup.userData.pose = 'reach';
         g7Anim(.8, f=>{ lidPivot.rotation.x = 1.25*(1-f); }, ()=>{
           latch.visible = true; humanGroup.userData.pose = null; zone.visible = false;
           g7Relabel(lu, 'Secured low & enclosed: little PE', {size:.66, fg:'#bbf7d0', border:'#22c55e'}); lu.position.set(SX, 2.9, SZ);
           next(); });
       }); }}],
    finish:[-17,-5.5], finishText:'Everything is secured — now go to the safe spot' };
  g7Camera([-20,6,-7],[-12.5,1.2,2.5]);
}

// ═══ GRADE 9 ═══

// 1 · FLOOD · Inertia — a boat stops on a submerged object; the loose bag keeps going.
function jBoatStop(scen){
  shsRiver({ flow:1.2, rain:3000 });
  const BZ = -1, stopX = -.6;
  const rock = new THREE.Mesh(blobGeo(.7,18,.4,77), pbr({color:0x3f3f46, roughness:.95})); rock.scale.set(1.3,.45,1); rock.position.set(stopX-2.2,-.12,BZ); scene.add(rock);
  const ripple = g7Decal(g7SoftTex('g7-wake','rgba(240,236,224,.85)','rgba(240,236,224,0)', true), 2.2, 2.2, stopX-2.2, .1, BZ);
  g7Tag('submerged object', stopX-2.2, 1, BZ+1.6, {size:.5});
  const boat = shsBanca(.62); scene.add(boat);
  const loose = jSack(0xdc2626); scene.add(loose);
  const tied = jSack(0x2563eb); scene.add(tied);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(.32,.025,6,20), pbr({color:0xfacc15})); strap.rotation.y = Math.PI/2; scene.add(strap);
  const lL = g7Label('Loose bag keeps moving — inertia', {size:.6, fg:'#fecaca', border:'#ef4444'}); scene.add(lL);
  const lT = g7Label('Tied-down bag stays put', {size:.56, fg:'#bbf7d0'}); scene.add(lT);
  const lS = g7Label('Boat stops suddenly', {size:.6, fg:'#fde047'}); scene.add(lS);
  const vA = g7Arrow(0xfacc15, 1, .07); vA.rotation.y = Math.PI; scene.add(vA);
  const strap2 = new THREE.Mesh(new THREE.TorusGeometry(.32,.025,6,20), pbr({color:0xfacc15})); strap2.visible = false; scene.add(strap2);
  const tieLine = g7Cord(0xfacc15, .022); tieLine.visible = false;
  const DX = -2.75;                                   // end-on against the bank (outriggers stay over the water)
  let t0 = 0, dock = -1, tiedK = 0;
  const L = (x,y,z)=> boat.localToWorld(new THREE.Vector3(x,y,z));
  animCallbacks.push((t,dt)=>{
    if(dock >= 0){
      // Take Control: the boatman has brought the boat in; both bags sit in it, one still loose
      dock = Math.min(1, dock + dt/1.4); const e = ease(dock);
      boat.position.set(stopX + (DX-stopX)*e, .1 + Math.sin(t*1.4)*.025, BZ); boat.updateMatrixWorld();
      loose.position.copy(L(-2.2,(.42-.1)/.62,0)); loose.rotation.set(0, 0, tiedK ? 0 : Math.sin(t*1.8)*.08);
      tied.position.copy(L(1.2,(.4-.1)/.62,.05)); strap.position.copy(tied.position); strap.rotation.y = boat.rotation.y + Math.PI/2;
      strap2.position.copy(loose.position); strap2.rotation.y = boat.rotation.y + Math.PI/2;
      if(tiedK) tieLine.userData.set(loose.position.clone().add(new THREE.Vector3(.12,-.1,0)), L(-1.75,.02,-.5));
      vA.visible = lS.visible = false; lL.position.set(loose.position.x+.2, 1.9, loose.position.z-.4); lT.position.set(tied.position.x+.2, 1.4, tied.position.z+.6);
      ripple.position.set(boat.position.x+.2, .1, BZ); ripple.scale.setScalar(.6);
      return;
    }
    t0 = (t0 + dt) % 7.5;
    const tStop = 2.4, v0 = 2.2;
    const jolt = t0 >= tStop && t0 < tStop+.25 ? -Math.sin((t0-tStop)/.25*Math.PI)*.08 : 0;   // the bump
    const bx = t0 < tStop ? stopX + v0*(tStop - t0) : stopX + jolt;
    boat.position.set(bx, .1 + Math.sin(t*1.4)*.03, BZ);
    // loose bag: rides along, then keeps sliding forward (−x) after the stop, tumbling over the bow
    let lx = (t0 < tStop ? bx : stopX) + .9, ly = .42;
    if(t0 >= tStop){ const s = t0 - tStop, d = Math.min(v0*s - .9*s*s, 1.4); lx = stopX + .9 - d; if(d > 1.2){ ly = .42 - (s - .9)*1.2; } }
    loose.position.set(lx, Math.max(-.2, ly), BZ - .15); loose.rotation.z = t0 >= tStop ? Math.min(1.4, (t0-tStop)*2) : 0;
    tied.position.set((t0 < tStop ? bx : stopX) - .3, .4, BZ + .22); strap.position.copy(tied.position);
    vA.visible = t0 < tStop; vA.position.set((t0 < tStop ? bx : stopX) - 1.8, 1.1, BZ); vA.userData.setLen(1.2);
    lS.visible = t0 >= tStop; lS.position.set(stopX + 1.2, 3.1, BZ);
    lL.visible = t0 >= tStop + .3; lL.position.set(lx - .4, 2.2, BZ - 1);
    lT.visible = t0 >= tStop + .6; lT.position.set(stopX + .6, 1.3, BZ + 1.5);
    ripple.scale.setScalar(1 + Math.sin(t*2.4)*.12);
  });
  g7SafePad(-11,-9,'SAFE SPOT · on the bank');
  g7Human(-6.2,2.5); humanGroup.rotation.y = Math.PI/2;
  g7Gateway(-11,-9,Math.PI/2);
  G7 = { bounds:[-15,4,-12,12], camOff:[5,4.5,-3],
    hazards:[{test:(x,z)=> x > -4.7, msg:'⚠ Stay on the bank — the boat’s loose cargo isn’t secured yet.'}],
    onControl(){
      dock = 0; lL.visible = true; lT.visible = true;
      g7Relabel(lL, 'Loose bag — it would keep moving if the boat stops', {size:.56, fg:'#fecaca', border:'#ef4444'});
      G7.hazards = [{test:(x,z)=> x > -4.85, msg:'⚠ Stay on the bank — reach the bag from the edge, don’t step into the boat.'}];
    },
    tasks:[
      {at:[-5.0, BZ], face:[DX, BZ], act:'🪢 Tie down the bag', obj:loose, short:'Tie down the loose bag', text:'Go to the boat’s end at the bank and tie down the loose bag',
       done:'Bag tied down — it now moves with the boat',
       run(next){
         humanGroup.userData.pose = 'reach';
         strap2.visible = true;
         g7Anim(1.1, f=>{ strap2.scale.setScalar(.2 + .8*f); }, ()=>{
           tiedK = 1; tieLine.visible = true; humanGroup.userData.pose = null;
           loose.material = tied.material;                      // now strapped like the other bag
           g7Relabel(lL, 'Both bags secured ✓ — safe to travel', {size:.58, fg:'#bbf7d0', border:'#22c55e'}); lT.visible = false;
           next(); });
       }}],
    finish:[-11,-9], finishRot:Math.PI/2, finishText:'Cargo secured — wait at the safe spot on the bank' };
  g7Camera([-6.5,3.8,5.5],[-.8,.5,-1.2]);
}

// 2 · TYPHOON · Inertia — an evacuation vehicle brakes; loose containers keep moving forward.
function jVehicleStop(scen){
  clearScene();
  const road = (x,z)=> Math.abs(z) < 2.4;
  g7World({ mood:'overcast', wind:scen.wind, rain:4000, keepOut:(x,z)=> Math.abs(z) < 3 || Math.hypot(x+4,z+9) < 3.5,
    houses:[[-12,-13,0],[0,-15,0],[11,-13,0],[-16,14,Math.PI],[18,14,Math.PI]], trees:[[-18,-6,'palm'],[15,-7,''],[-12,16,'palm']], bushes:[[5,-7],[-9,-6]] });
  g7Path([[-22,0],[22,0]], 4.2, 0x6b7280, .03, 'concrete');
  const stopLine = new THREE.Mesh(new THREE.PlaneGeometry(.3,4), new THREE.MeshBasicMaterial({color:0xf8fafc, toneMapped:false})); stopLine.rotation.x = -Math.PI/2; stopLine.position.set(5.6,.05,0); scene.add(stopLine);
  g7Signboard(6.4,-2.9,0,{w:1.3,h:.65,post:1.1,draw:(ctx,W,H)=>{ ctx.fillStyle='#b91c1c'; ctx.fillRect(0,0,W,H); ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font=`800 ${Math.round(H*.5)}px ${G7_FONT}`; ctx.fillText('STOP', W/2, H/2+4); }});
  // truck: cab at +x, open cargo bed with containers
  const truck = new THREE.Group(); scene.add(truck);
  const body = pbr({color:0x15803d, roughness:.5, metalness:.2});
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(5,.4,2.1), pbr({color:0x1f2937})); chassis.position.y = .75; truck.add(chassis);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.5,1.5,2.05), body); cab.position.set(2.1,1.7,0); cab.castShadow = true; truck.add(cab);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.7,.7), new THREE.MeshStandardMaterial({color:0x93c5fd, roughness:.1, metalness:.4})); glass.rotation.y = Math.PI/2; glass.position.set(2.86,2,0); truck.add(glass);
  const bed = new THREE.Mesh(new THREE.BoxGeometry(3.4,.12,2.1), body); bed.position.set(-.7,1,0); truck.add(bed);
  [[-.7,1.95,-1.04,3.4,.06],[-.7,1.95,1.04,3.4,.06]].forEach(([x,y,z,w,d])=>{ const s = new THREE.Mesh(new THREE.BoxGeometry(w,.5,d), body); s.position.set(x,1.3,z); truck.add(s); });
  const front = new THREE.Mesh(new THREE.BoxGeometry(.08,.9,2.1), body); front.position.set(1.0,1.5,0); truck.add(front);
  const wheels = [];
  [[1.9,-1.05],[1.9,1.05],[-1.5,-1.05],[-1.5,1.05]].forEach(([x,z])=>{ const w = new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,.3,22), pbr({color:0x111827, roughness:.8})); w.rotation.x = Math.PI/2; w.position.set(x,.42,z); truck.add(w); wheels.push(w); });
  // containers: loose (blue drums) and secured (orange crates with straps), in truck-local coordinates
  const loose = [[-2,-.5],[-1.6,.45],[-1.2,-.2]].map(([x,z])=>{ const d = new THREE.Mesh(new THREE.CylinderGeometry(.3,.3,.7,18), pbr({color:0x2563eb, roughness:.4})); d.castShadow = true; truck.add(d); return {m:d, x0:x, z}; });
  const tiedM = [[-.1,-.5],[-.1,.5]].map(([x,z])=>{ const c = new THREE.Mesh(new THREE.BoxGeometry(.6,.6,.6), pbr({color:0xea580c, roughness:.6})); c.position.set(x,1.36,z); truck.add(c);
    const s = new THREE.Mesh(new THREE.BoxGeometry(.64,.62,.05), pbr({color:0xfacc15})); s.position.set(x,1.37,z); truck.add(s); return c; });
  const lL = g7Label('Loose containers keep moving forward — inertia', {size:.6, fg:'#fecaca', border:'#ef4444'}); scene.add(lL);
  const lT = g7Label('Strapped containers stay put', {size:.55, fg:'#bbf7d0'}); scene.add(lT);
  const lB = g7Label('Sudden stop!', {size:.66, fg:'#fde047'}); scene.add(lB);
  // Take Control: the truck waits, engine off, beside the waiting area; the learner straps
  // the loose drums down before it travels (bands round each drum + two straps across the bed).
  const bands = loose.map(o=>{ const b = new THREE.Mesh(new THREE.TorusGeometry(.31,.03,6,22), pbr({color:0xfacc15})); b.rotation.x = Math.PI/2; b.visible = false; truck.add(b); return b; });
  const cross = [-1.95,-1.25].map(x=>{ const s = new THREE.Mesh(new THREE.BoxGeometry(.07,.04,2.16), pbr({color:0xfacc15})); s.position.set(x,1.79,0); s.visible = false; truck.add(s); return s; });
  const PARK = -18 + 6*3.2 + .3;
  let tt = 0, parked = false;
  animCallbacks.push((t,dt)=>{
    if(parked){
      truck.position.set(PARK, 0, 0); truck.rotation.z = 0;
      loose.forEach((o,i)=>{ o.m.position.set(o.x0, 1.41, o.z); o.m.rotation.z = 0; bands[i].position.set(o.x0, 1.45, o.z); });
      lB.visible = lL.visible = false; lT.position.set(PARK-.1, 2.6, 1.6);
      return;
    }
    tt = (tt + dt) % 8;
    const tStop = 3.2, v0 = 6;
    const x = tt < tStop ? -18 + v0*tt : -18 + v0*tStop + .3;
    truck.position.set(x, 0, 0);
    truck.rotation.z = (tt > tStop && tt < tStop+.4) ? -Math.sin((tt-tStop)/.4*Math.PI)*.04 : 0;
    wheels.forEach(w=> w.rotation.y = 0);
    if(tt < tStop) wheels.forEach(w=> w.rotation.z -= v0*dt/.42);
    loose.forEach((o,i)=>{
      let lx = o.x0;
      if(tt >= tStop){ const s = tt - tStop; lx = Math.min(.65 - i*.05, o.x0 + v0*s - 4*s*s); }
      o.m.position.set(lx, 1.41, o.z); o.m.rotation.z = tt >= tStop + .35 ? Math.min(.5, (tt-tStop-.35)*2) * (lx > .4 ? -1 : 0) : 0;
    });
    lB.visible = tt >= tStop && tt < tStop + 2; lB.position.set(x+1.5, 3.6, 0);
    lL.visible = tt >= tStop + .4; lL.position.set(x, 4.3, 0);
    lT.visible = tt >= tStop + .8; lT.position.set(x-.1, 2.6, 1.6);
  });
  const hg = new THREE.Mesh(new THREE.CylinderGeometry(3.2,3.5,.18,40), pbr({color:0x8f8775,map:g7PathTex('dirt'),roughness:.95})); hg.position.set(-4,.06,-9); hg.receiveShadow = true; scene.add(hg);
  g7SafePad(-4,-9,'WAITING AREA');
  g7Human(6,-5, 0x1e3a8a); humanGroup.rotation.y = -Math.PI*.7;
  g7Gateway(-4,-9,0);
  const truckBody = {test:(x,z)=> x > PARK-2.75 && x < PARK+3 && Math.abs(z) < 1.3, msg:'⚠ That’s the truck — strap the drums from beside the cargo bed.'};
  G7 = { bounds:[-14,12,-13,8], camOff:[6,5,5],
    hazards:[{test:road, msg:'⚠ Stay off the road — wait in the waiting area while the cargo is secured.'}],
    onControl(){ parked = true; lT.visible = true; G7.hazards = [truckBody]; },
    tasks:[
      {at:[PARK-1.75, -1.62], face:[PARK-1.75, 0], act:'🪢 Strap the drums', obj:loose[1].m, short:'Strap down the loose drums', text:'Stand beside the cargo bed and strap down the loose drums', done:'All drums strapped — they will move with the truck',
       run(next){
         humanGroup.userData.pose = 'reach';
         const seq = [...bands, ...cross];
         g7Seq(seq.map((m,i)=> [i ? 380 : 150, ()=>{ m.visible = true; g7Anim(.3, f=>{ m.scale.setScalar(Math.max(.05, f)); }); AudioSysSafe('click'); }]));
         setTimeout(()=>{ humanGroup.userData.pose = null; g7Relabel(lT, 'All containers secured ✓ — no sliding when it brakes', {size:.56, fg:'#bbf7d0', border:'#22c55e'}); next(); }, 150 + 380*(seq.length-1) + 500);
       }}],
    finish:[-4,-9], finishText:'Cargo secured — go to the waiting area until it is time to travel' };
  g7Camera([3,5.5,10.5],[0,1.2,-1]);
}

// 3 · FLOOD · F = ma — the same push of floodwater on an empty and a water-filled container.
function jTwoContainers(scen){
  shsLanding({ rain:3500, keepOut:(x,z)=> z > -.5 && z < 7 && x > -14.5, wet:(x,z)=> z > -1.5 && z < 8 && x > -15.5 });
  g7Water(28,8,-.5,3,.16,false,[1.2,0]);
  g7Current(-13,13,0,6.5,.16,()=>1.2,false);
  const hg = new THREE.Mesh(new THREE.CylinderGeometry(3.4,3.7,.18,40), pbr({color:0x8f8775,map:g7PathTex('dirt'),roughness:.95})); hg.position.set(-5,.06,-8.5); hg.receiveShadow = true; scene.add(hg);
  g7SafePad(-5,-8.5,'SAFE SPOT · higher ground');
  const E = jContainer(false), Fd = jContainer(true); E.scale.setScalar(1.2); Fd.scale.setScalar(1.2); scene.add(E, Fd);
  const fa = [g7Arrow(0x38bdf8,1.4,.08), g7Arrow(0x38bdf8,1.4,.08)]; fa.forEach(a=> scene.add(a));
  const aE = g7Arrow(0xef4444,1,.08), aF = g7Arrow(0xef4444,1,.08); scene.add(aE, aF);
  const lE = g7Label('EMPTY: small m → large a', {size:.6, fg:'#fecaca', border:'#ef4444'}); scene.add(lE);
  const lF = g7Label('FILLED: large m → small a', {size:.6, fg:'#bbf7d0'}); scene.add(lF);
  const lf = g7Label('same push F', {size:.55, fg:'#7dd3fc'}); scene.add(lf);
  const lm = g7Label('a = Fnet / m', {size:.85, fg:'#fde047', border:'#facc15'}); lm.position.set(0,4.4,3); scene.add(lm);
  const ZE = 1.4, ZF = 4.8, aEmpty = 1.6, aFull = .45;
  let tt = 0;
  animCallbacks.push((t,dt)=>{
    tt = (tt + dt) % 6.5;
    const s = Math.max(0, tt - .6);
    const xe = -11 + .5*aEmpty*s*s, xf = -11 + .5*aFull*s*s;
    E.position.set(Math.min(12.5, xe), .05 + Math.sin(t*3)*.03, ZE); Fd.position.set(xf, .02 + Math.sin(t*2.4)*.02, ZF);
    E.rotation.y = Math.sin(t*1.6)*.2;
    fa[0].position.set(E.position.x-2, .7, ZE); fa[1].position.set(xf-2, .7, ZF);
    aE.position.set(E.position.x-.3, 1.55, ZE); aE.userData.setLen(1.6); aF.position.set(xf-.3, 1.55, ZF); aF.userData.setLen(.45);
    lE.position.set(E.position.x, 2.4, ZE); lF.position.set(xf, 2.4, ZF); lf.position.set(Math.min(E.position.x, xf)-2, 1.35, (ZE+ZF)/2);
  });
  g7Human(4,-1.6); humanGroup.rotation.y = Math.PI/2;
  g7Gateway(-5,-8.5,0);
  G7 = { bounds:[-12,12,-13,9], camOff:[6,4.5,5],
    hazards:[{test:(x,z)=> z > -.3 && z < 7.2 && x > -13, msg:'⚠ Stay out of the moving floodwater — the containers are being pushed along!'},
             {test:(x,z)=> x > 12.5, msg:'⚠ Stay away from the boat landing.'}] };
  g7Camera([-1,8,17],[.5,0,0]);
}

// 4 · TYPHOON · F = ma — the same wind force on a light roofing sheet and a heavy board.
function jRoofBoard(scen){
  shsBridge(scen);
  const XS = -15, XB = -11.5;
  g7Clear(-13,4,4.5); g7Clear(-17.5,-6,3); g7Clear(-9,-4,1.8);
  jDanger(3.2, 12, XS, 3, .6);
  const sheet = jSheet(1.5,.95), board = jBoard(); board.rotation.y = Math.PI/2; scene.add(sheet, board);
  const wa = [g7Arrow(0xe2e8f0,1.5,.07), g7Arrow(0xe2e8f0,1.5,.07)]; wa.forEach(a=>{ a.rotation.y = Math.PI/2; scene.add(a); });
  const aS = g7Arrow(0xef4444,1,.08), aB = g7Arrow(0xef4444,1,.08); [aS,aB].forEach(a=>{ a.rotation.y = Math.PI/2; scene.add(a); });
  const lS = g7Label('ROOFING SHEET: light → large a', {size:.58, fg:'#fecaca', border:'#ef4444'}); scene.add(lS);
  const lB = g7Label('BOARD: heavier → small a', {size:.55, fg:'#bbf7d0'}); scene.add(lB);
  const lw = g7Label('same wind force', {size:.55}); scene.add(lw);
  const lm = g7Label('a = ΣF / m', {size:.85, fg:'#fde047', border:'#facc15'}); lm.position.set(-13.2,4.6,5); scene.add(lm);
  let tt = 0;
  animCallbacks.push((t,dt)=>{
    tt = (tt + dt) % 6.5;
    const s = Math.max(0, tt - .6);
    const zs = 9 - .5*2.2*s*s, zb = 9 - .5*.5*s*s;
    sheet.position.set(XS + Math.sin(t*2.2)*.25, .2 + Math.abs(Math.sin(t*3.6))*.4, Math.max(-3, zs)); sheet.rotation.set(Math.sin(t*4)*.5, t*.9, Math.sin(t*3)*.35);
    board.position.set(XB, .07, zb);
    wa[0].position.set(XS-1, 1.4, Math.max(-3,zs)+2.3); wa[1].position.set(XB-1, 1.1, zb+2.3);
    aS.position.set(XS+.9, 1.3, Math.max(-3,zs)-.2); aS.userData.setLen(1.6); aB.position.set(XB+.9, 1, zb-.2); aB.userData.setLen(.4);
    lS.position.set(XS, 2.4, Math.max(-3,zs)); lB.position.set(XB, 1.9, zb); lw.position.set((XS+XB)/2-1.4, 2.1, Math.max(zs,zb)+2.6);
  });
  g7SafePad(-17.5,-6,'SAFE SPOT');
  g7Human(-9,-4, 0x1e3a8a); humanGroup.rotation.y = -Math.PI/2;
  g7Gateway(-17.5,-6,0);
  G7 = { bounds:[-19,-6.4,-9,9], camOff:[6,4.5,5],
    hazards:[{test:(x,z)=> Math.abs(x-XS) < 2 && z > -3.2 && z < 10, msg:'⚠ That is the roofing sheet’s path — it accelerates fast. Stay away!'},
             {test:(x,z)=> Math.abs(x-XB) < 1.4 && z > -1 && z < 10, msg:'⚠ Keep clear of the board too.'}] };
  g7Camera([-21,6.5,10],[-12.5,.8,1.5]);
}

// 5 · FLOOD · Action–reaction — stepping hard off a small boat pushes it away; held and slow, it stays.
function jBoatStep(scen){
  shsRiver({ flow:1, rain:2500 });
  const BZ = 1.5, bank = -5.1;
  const dock = new THREE.Mesh(new THREE.BoxGeometry(2.4,.2,3.4), pbr({color:0x6b4f30,map:woodTex(),roughness:.9})); dock.position.set(-6.1,.15,BZ); dock.receiveShadow = true; scene.add(dock);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(.09,.1,1.2,12), pbr({color:0x4a3520,map:woodTex()})); post.position.set(-5.2,.6,BZ+1.4); scene.add(post);
  const boat = shsBanca(.6); boat.rotation.y = Math.PI/2; scene.add(boat);
  const stepper = makeHuman(0,0,0,0xdc2626); stepper.userData.baseY = 0; scene.add(stepper);
  const holder = makeHuman(-6.6,.25,BZ+1.2,0x0f766e); holder.rotation.y = Math.PI/2; scene.add(holder);
  const rope = jRope();
  const fB = g7Arrow(0xef4444,1.3,.09), fP = g7Arrow(0xfb923c,1.3,.09); fP.rotation.y = Math.PI; scene.add(fB, fP);
  const lB = g7Label('force on boat', {size:.5, fg:'#fecaca'}), lP = g7Label('force on learner', {size:.5, fg:'#fdba74'}); scene.add(lB, lP);
  const lEq = g7Label('F learner on boat = −F boat on learner', {size:.66, fg:'#fde047', border:'#facc15'}); lEq.position.set(-1.6,3.9,BZ); scene.add(lEq);
  const l1 = g7Label('Hard step → boat pushed away ✗', {size:.62, fg:'#fecaca', border:'#ef4444'}); l1.position.set(-1.6,3,BZ); scene.add(l1);
  const l2 = g7Label('Boat held + slow step → boat stays ✓', {size:.62, fg:'#bbf7d0', border:'#22c55e'}); l2.position.set(-1.6,3,BZ); scene.add(l2);
  let tt = 0, mine = false;
  animCallbacks.push((t,dt)=>{
    if(mine){
      // Take Control: the learner is the one stepping off — the boat is held, so it stays put
      const h = humanGroup, x = h.position.x, crossing = x < -3.5 && x > -5.3;
      boat.position.set(-3.7, .1 + Math.sin(t*1.3)*.03, BZ);
      stepper.visible = false; holder.visible = rope.visible = true;
      rope.userData.set(new THREE.Vector3(-6.3,1.1,BZ+1.2), new THREE.Vector3(-3.7-.2,.4,BZ+1.4));
      fB.visible = fP.visible = lB.visible = lP.visible = crossing;
      const k = h.userData.moving ? .35 : .15;            // a slow step → only a small push on the boat
      fB.position.set(-3.2, .9, BZ-.4); fB.userData.setLen(k); fP.position.set(Math.min(-3.6, x), 1.6, BZ-.4); fP.userData.setLen(k);
      lB.position.set(-2.4, 1.35, BZ-.4); lP.position.set(Math.min(-4.4, x-.8), 2.05, BZ-.4);
      l1.visible = false; l2.visible = x < -5;
      return;
    }
    tt = (tt + dt) % 11;
    const held = tt >= 5.5, s = held ? tt - 5.5 : tt;
    let bx = -3.7, px = -3.4, py = .3;
    if(!held){
      if(s > 1 && s < 1.6){ const f = (s-1)/.6; px = -3.4 - f*2.6; py = .3 + Math.sin(f*Math.PI)*.5; }
      else if(s >= 1.6){ px = -6; py = .25; }
      if(s > 1) bx = -3.7 + Math.min(2.6, (s-1)*1.4 - Math.max(0,(s-2.6))*.4);
    } else {
      if(s > 1.2 && s < 3.6){ const f = (s-1.2)/2.4; px = -3.4 - f*2.6; py = .3 + Math.sin(f*Math.PI)*.25; }
      else if(s >= 3.6){ px = -6; py = .25; }
    }
    boat.position.set(bx, .1 + Math.sin(t*1.3)*.03, BZ);
    stepper.position.set(px, py, BZ); stepper.rotation.y = -Math.PI/2; stepper.userData.baseY = py; stepper.userData.moving = (!held && s > 1 && s < 1.6) || (held && s > 1.2 && s < 3.6);
    holder.visible = held; rope.visible = held;
    if(held) rope.userData.set(new THREE.Vector3(-6.3,1.1,BZ+1.2), new THREE.Vector3(bx-1.6,.4,BZ+.3));
    const push = !held && s > .9 && s < 1.8;
    fB.visible = fP.visible = lB.visible = lP.visible = push || (held && s > 1.2 && s < 3.6);
    const k = push ? 1.4 : .35;
    fB.position.set(-3.2, .9, BZ-.4); fB.userData.setLen(k); fP.position.set(-3.6, 1.6, BZ-.4); fP.userData.setLen(k);
    lB.position.set(-2.4+k*.3, 1.35, BZ-.4); lP.position.set(-4.4-k*.3, 2.05, BZ-.4);
    l1.visible = !held && s > 1; l2.visible = held && s > 2;
  });
  g7SafePad(-11,-8,'SAFE SPOT · on the bank');
  g7Human(-7.5,4.5); humanGroup.rotation.y = Math.PI;
  g7Gateway(-11,-8,Math.PI/2);
  // walking surfaces once the learner is the one in the boat: hull floor, the step across, the dock
  const onDock = (x,z)=> x > -7.3 && x < -4.9 && Math.abs(z-BZ) < 1.7;
  const inBoat = (x,z)=> x >= -4.1 && x < -3.3 && Math.abs(z-BZ) < 1.6;
  const across = (x,z)=> x > -4.95 && x < -4.05 && Math.abs(z-BZ) < .45;
  G7 = { bounds:[-15,4,-12,12], camOff:[5,4.5,-3],
    hazards:[{test:(x,z)=> x > -4.8, msg:'⚠ Stay on the bank — only step off a boat slowly while it is held.'}],
    onControl(){
      mine = true; l2.visible = false;
      g7Relabel(l2, 'Boat held + slow step → boat stays ✓', {size:.62, fg:'#bbf7d0', border:'#22c55e'});
      humanGroup.position.set(-3.6, .3, BZ); humanGroup.userData.baseY = .3; humanGroup.rotation.y = -Math.PI/2;
      G7.speed = 1;
      G7.heightAt = (x,z)=> inBoat(x,z) ? .3 : across(x,z) ? .3 - (-4.05 - x)/.9*.05 : onDock(x,z) ? .25 : .02;
      G7.onMove = (dt, s)=>{ G7.speed = s.position.x > -5.6 ? 1 : 3.2; };       // slow and careful until you’re on the dock
      G7.hazards = [{test:(x,z)=> x > -4.85 && !inBoat(x,z) && !across(x,z), msg:'⚠ Careful — step straight across onto the dock, slowly.'},
                    {test:(x,z)=> x > -3.3, msg:'⚠ Step toward the dock, not the far side of the boat.'}];
    },
    tasks:[
      {at:[-5.9, BZ], face:[-7.2, BZ], r:.7, auto:true, short:'Step off slowly onto the dock', text:'Walk slowly across onto the dock while the boat is held',
       done:'Off the boat safely — small, equal forces; the held boat barely moved',
       run(next){ g7Say(holder, 'Good — slow and steady!', 2000, {border:'#4ade80'}); setTimeout(next, 600); }}],
    finish:[-11,-8], finishRot:Math.PI/2, finishText:'Now walk to the safe spot on the bank' };
  g7Camera([-10,5,-7.5],[-3,.8,1.5]);
}

// 6 · TYPHOON · Action–reaction — a branch bent against the bridge's side support.
function jBranchSpring(scen){
  shsBridge(scen);
  const SX = -7.6, SZ = 2;
  g7Clear(-10,3.5,4); g7Clear(-14,7,2.4); g7Clear(-17,-6,3); g7Clear(-16,-3.5,3.6);
  const sup = new THREE.Mesh(new THREE.BoxGeometry(.5,2.6,.5), pbr({color:0x9ca3af, map:g7PathTex('concrete'), roughness:.9})); sup.position.set(SX,1.3,SZ); sup.castShadow = true; scene.add(sup);
  g7Tag('side support', SX, 3, SZ, {size:.5});
  const pivot = new THREE.Group(); pivot.position.set(-12.5,.3,5.8); scene.add(pivot);
  const curve = new THREE.CatmullRomCurve3([[0,0,0],[1.6,.7,-1.2],[3.4,1.2,-2.4],[4.7,1.4,-3.7]].map(p=> new THREE.Vector3(...p)));
  const branch = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, .17, 10), pbr({color:0x5a4030, map:woodTex(), roughness:.92})); branch.castShadow = true; pivot.add(branch);
  const leafM = pbr({color:0x356628,roughness:.85,map:leafTex(),rim:.07});
  for(let i=0;i<6;i++){ const p = curve.getPoint(.45 + i*.09); const b = new THREE.Mesh(blobGeo(.45,16,.35,i*9+3), leafM); b.position.copy(p).add(new THREE.Vector3(0,.35,0)); pivot.add(b); }
  const contact = new THREE.Vector3(SX-.3, 1.7, SZ+.2);
  // force pair at the contact: branch → support along u, support → branch along −u
  const u = new THREE.Vector3(SX+12.5, 0, SZ-5.8).normalize();
  const fOnS = g7Arrow(0xef4444,1,.09), fOnB = g7Arrow(0xfb923c,1,.09);
  fOnS.position.copy(contact).addScaledVector(u, -1.15); fOnS.rotation.y = Math.atan2(-u.z, u.x); scene.add(fOnS);
  fOnB.position.copy(contact).add(new THREE.Vector3(0,.45,0)); fOnB.rotation.y = Math.atan2(u.z, -u.x); scene.add(fOnB);
  const lS = g7Label('branch pushes support', {size:.5, fg:'#fecaca'}); lS.position.set(SX-1.6,2.5,SZ+1.6); scene.add(lS);
  const lB = g7Label('support pushes back', {size:.5, fg:'#fdba74'}); lB.position.set(SX-.2,2.6,SZ-.6); scene.add(lB);
  const lEq = g7Label('Equal & opposite forces · stores elastic PE', {size:.64, fg:'#fde047', border:'#facc15'}); lEq.position.set(-10.2,4.4,3.5); scene.add(lEq);
  const zone = jDanger(4.6, 4.6, -10.2, 2.2, .7);
  const springTag = g7Tag('springs this way if released', -10.4, .9, .6, {size:.5, fg:'#fecaca', border:'#ef4444'});
  // trained adults with equipment, standing to the side
  const adults = [[-14.6,8.2],[-13.6,8.6]].map(([x,z],i)=>{ const h = makeHuman(x,0,z,0xfacc15); h.rotation.y = Math.PI*.8; h.userData.baseY = 0; scene.add(h);
    const hat = new THREE.Mesh(new THREE.SphereGeometry(.17,14,10,0,6.28,0,Math.PI/2), pbr({color:0xf97316})); hat.position.set(0,1.78,0); h.add(hat); return h; });
  const tag = g7Tag('trained adults · proper equipment', -14.1, 2.8, 8.4, {size:.5, bg:'rgba(20,83,45,.92)', border:'#4ade80'});
  // their release line: tied to the branch, paid out slowly so it unbends under control
  const line = g7Cord(0xfacc15, .03); line.visible = false;
  const tieP = new THREE.Vector3();
  let rel = 0, relabelled = false, releasing = false;
  animCallbacks.push((t,dt)=>{
    if(releasing) rel = Math.min(1, rel + dt*.32);
    if(line.visible){ tieP.copy(curve.getPoint(.55)); pivot.localToWorld(tieP); const a = adults[0].position; line.userData.set(new THREE.Vector3(a.x, 1.1, a.z), tieP); }
    const quiver = Math.sin(t*9)*.01 + Math.max(0, Math.sin(t*1.4))*.02;
    pivot.rotation.y = -quiver + rel*.9;                       // released by the adults: it springs away from the support
    pivot.rotation.z = rel*.25;
    fOnS.userData.setLen(.9 + quiver*10); fOnB.userData.setLen(.9 + quiver*10);
    fOnS.visible = fOnB.visible = lS.visible = lB.visible = rel < .1;
    zone.visible = springTag.visible = rel < .95;
    if(rel > .98 && !relabelled){ relabelled = true; g7Relabel(lEq, 'Released safely by trained adults', {size:.64, fg:'#bbf7d0', border:'#22c55e'}); }
  });
  g7SafePad(-17,-6,'SAFE SPOT');
  g7Human(-9,-3.6, 0x1e3a8a); humanGroup.rotation.y = -Math.PI/2;
  g7Gateway(-17,-6,0);
  G7 = { bounds:[-19,-6.4,-9,9], camOff:[6,4.5,5],
    hazards:[{test:(x,z)=> Math.hypot(x+10.2, z-2.4) < 3, msg:'⚠ Don’t pull the branch — it can spring out. Leave it to trained adults!'}],
    tasks:[
      {at:[-14.3, 6.9], face:[-14.1, 8.4], act:'🗣 Ask for help', obj:adults[1], short:'Ask the trained adults for help', text:'Go round the branch to the trained adults and ask them to remove it',
       done:'The trained adults will release it with proper equipment',
       run(next){
         humanGroup.userData.pose = 'wave';
         g7Say(humanGroup, 'The branch is bent against the support — please remove it safely!', 2600);
         g7Seq([
           [1500, ()=>{ humanGroup.userData.pose = null; g7Say(adults[1], 'Thanks — we’ll handle it. Stay back!', 2600, {border:'#4ade80'}); }],
           [1300, ()=>{ next();
             tag.visible = false;
             // they walk round to the branch's root (outside its swing) and tie on a release line
             g7WalkTo(adults[0], -13.4, 6.1, 1.4, ()=>{ adults[0].rotation.y = Math.atan2(-10.2+13.4, 2.4-6.1); adults[0].userData.pose = 'reach'; line.visible = true; });
             g7WalkTo(adults[1], -12.4, 7.1, 1.4, ()=>{ adults[1].rotation.y = Math.atan2(-10.2+12.4, 2.4-7.1); adults[1].userData.pose = 'reach'; setTimeout(()=>{ releasing = true; }, 900); });
           }]]);
       }}],
    finish:[-17,-6], finishText:'Stay clear — wait at the safe spot while they release it' };
  g7Camera([-17,6,-5],[-10,1.4,3]);
}

// ═══ GRADE 10 ═══

// Projectile points from (x0,y0) with speed v0 at angle th (deg), until y falls to yEnd after the peak.
function jParabola(x0, y0, z, v0, th, yEnd, g){
  g = g || 9.8; const r = th*Math.PI/180, vx = v0*Math.cos(r), vy = v0*Math.sin(r), pts = [];
  for(let t=0;t<6;t+=.04){ const y = y0 + vy*t - .5*g*t*t; pts.push([x0 + vx*t, y, z]); if(t > vy/g && y <= yEnd) break; }
  return pts;
}

// 1 · FLOOD · Projectile motion — a rescue worker throws a rope across a flooded gap.
function jRopeThrow(scen){
  clearScene();
  g7World({ mood:'overcast', rain:3500, keepOut:(x,z)=> x > -4.6 && x < 13 || Math.hypot(x+12,z+6) < 3,
    wet:(x,z)=> x > -5.6 && x < 5, houses:[[-17,-10,Math.PI/2],[-17,6,Math.PI/2]], trees:[[-12,10,'palm'],[-9,-12,''],[16,10,'palm']], bushes:[[-8,8],[-14,-2]] });
  g7Water(9,70,0,0,.08,true,[0,1.2]);
  g7Current(-4.2,4.2,-30,30,.08,()=>1.2,true);
  g7Debris(10,-4,4,-30,30,.08,()=>1.1,true);
  const P = 1.6;
  const plat = new THREE.Mesh(new THREE.BoxGeometry(7,P,9), pbr({color:0xa8a29e, map:g7PathTex('concrete'), roughness:.95})); plat.position.set(8.5,P/2,0); plat.castShadow = plat.receiveShadow = true; scene.add(plat);
  const people = [[7,-1,0xb91c1c],[8.4,.8,0x7c3aed],[9.6,-.4,0xca8a04]].map(([x,z,c])=>{ const h = makeHuman(x,P,z,c); h.rotation.y = -Math.PI/2; scene.add(h); return h; });
  g7Tag('People waiting · raised platform', 8.5, P+2.9, 0, {size:.6, bg:'rgba(20,83,45,.92)', border:'#4ade80'});
  const target = g7Decal(g7SoftTex('g7-safe-ring','rgba(134,239,172,.95)','rgba(134,239,172,0)', true), 2.4, 2.4, 6.8, P+.03, 0); target.material.toneMapped = false;
  const rescuer = makeHuman(-5.4,0,0,0xea580c); rescuer.rotation.y = Math.PI/2; scene.add(rescuer);
  g7Tag('rescue worker', -5.4, 2.6, -.8, {size:.5});
  const missPts = jParabola(-5, 1.6, 0, 6.5, 22, .1), hitPts = jParabola(-5, 1.6, 0, 10.8, 52, P+.1);
  const miss = jDashed(missPts, 0xef4444), hit = jDashed(hitPts, 0x4ade80);
  const coil = new THREE.Mesh(new THREE.TorusGeometry(.22,.08,10,20), pbr({color:0xfacc15, roughness:.6})); scene.add(coil);
  const rope = jRope(0xfacc15);
  const splash = g7Decal(g7SoftTex('g7-wake','rgba(240,236,224,.85)','rgba(240,236,224,0)', true), 1.8, 1.8, missPts[missPts.length-1][0], .1, 0);
  const l1 = g7Label('No aim: too low, too slow → falls short ✗', {size:.6, fg:'#fecaca', border:'#ef4444'}); scene.add(l1);
  const l2 = g7Label('Adjusted angle θ and speed v₀ → lands on target ✓', {size:.6, fg:'#bbf7d0', border:'#22c55e'}); scene.add(l2);
  const lEq = g7Label('x = v₀cos θ · t     y = y₀ + v₀sin θ · t − ½gt²', {size:.62, fg:'#fde047', border:'#facc15'}); lEq.position.set(0,7.2,0); scene.add(lEq);
  // Take Control: the learner helps the rescue worker aim — estimate the distance, set θ and
  // v₀, throw. The rope follows the real projectile path from the release point (−5, 1.6).
  const X0 = -5, Y0 = 1.6, TX = 6.8, TR = 1.2, hand = new THREE.Vector3(-5.1,1.5,0);
  let mode = 'demo', shot = null, trace = null;
  const simThrow = (v, th)=>{
    const r = th*Math.PI/180, vx = v*Math.cos(r), vy = v*Math.sin(r), pts = [];
    let px = X0;
    for(let t=0; t<6; t+=.02){
      const x = X0 + vx*t, y = Y0 + vy*t - 4.9*t*t;
      pts.push([x, Math.max(y, .1), 0]);
      if(px < 5 && x >= 5 && y < P) return {pts, x:5, t, res:'wall'};              // hits the platform's side
      if(x >= 5 && x <= 12 && y <= P+.08 && vy - 9.8*t < 0) return {pts, x, t, res: Math.abs(x-TX) <= TR ? 'hit' : 'long'};
      if(y <= .1) return {pts, x, t, res: x < 5 ? 'short' : 'over'};
      px = x;
    }
    return {pts, x:px, t:6, res:'over'};
  };
  let tt = 0;
  animCallbacks.push((t,dt)=>{
    if(mode !== 'demo'){
      miss.visible = hit.visible = l1.visible = l2.visible = false; splash.visible = false;
      if(shot){
        shot.s += dt; const f = Math.min(1, shot.s/shot.t), i = Math.min(shot.pts.length-1, Math.floor(f*(shot.pts.length-1)));
        coil.position.set(...shot.pts[i]); if(f < 1) coil.rotation.x += dt*6;
        rescuer.rotation.z = shot.s < .25 ? -.25 : 0;
        if(f >= 1 && !shot.ended){ shot.ended = true; shot.end(); }
      } else coil.position.copy(hand);
      rope.userData.set(hand, coil.position);
      return;
    }
    tt = (tt + dt) % 9;
    const first = tt < 4.2, s = first ? tt - .5 : tt - 4.7;
    const pts = first ? missPts : hitPts, dur = first ? 1.1 : 1.9;
    miss.visible = l1.visible = first; hit.visible = l2.visible = !first;
    let p = [-5,1.6,0];
    if(s > 0){ const i = Math.min(pts.length-1, Math.floor(s/dur*(pts.length-1))); p = pts[i]; }
    coil.position.set(...p); coil.rotation.x += dt*6;
    rope.userData.set(new THREE.Vector3(-5.1,1.5,0), coil.position);
    splash.visible = first && s > dur; splash.scale.setScalar(1 + (s-dur)*.6);
    l1.position.set(-1,4.6,0); l2.position.set(1.5,5.6,0);
    rescuer.rotation.z = s > -.3 && s < .2 ? -.25 : 0;
  });
  g7SafePad(-12,-6,'SAFE SPOT · back from the edge');
  g7Human(-7.5,3); humanGroup.rotation.y = -Math.PI*.75;
  g7Gateway(-12,-6,0);
  let dLine = null, dTag = null;
  const openAim = (next)=>{
    G7.camView = {pos:new THREE.Vector3(3,8,-19), look:new THREE.Vector3(-.5,1.2,0)};   // rescuer, gap and platform all in view
    const p = document.createElement('div'); p.className = 'g7-panel'; p.id = 'g7-aim';
    p.innerHTML = `<div class="g7p-h">🎯 Help aim the rescue rope</div>
      <div class="g7p-d">Estimated distance to the target: <b>≈ ${(TX-X0).toFixed(1)} m</b> · released at the same height as the platform top (1.6 m)</div>
      <label class="g7p-l">Release angle θ <b id="ga-at"></b><input type="range" id="ga-a" min="10" max="75" step="1" value="25"></label>
      <label class="g7p-l">Release speed v₀ <b id="ga-vt"></b><input type="range" id="ga-v" min="4" max="14" step="0.5" value="7"></label>
      <div class="g7p-f">Predicted range R = v₀² sin 2θ / g ≈ <b id="ga-r"></b></div>
      <div class="g7p-msg" id="ga-m">Match the range to the distance, then throw.</div>
      <button class="lab-go" id="ga-go">Throw the rope</button>`;
    document.body.appendChild(p);
    const A = p.querySelector('#ga-a'), V = p.querySelector('#ga-v'), M = p.querySelector('#ga-m'), go = p.querySelector('#ga-go');
    const upd = ()=>{ const a = +A.value, v = +V.value;
      p.querySelector('#ga-at').textContent = a + '°'; p.querySelector('#ga-vt').textContent = v.toFixed(1) + ' m/s';
      p.querySelector('#ga-r').textContent = (v*v*Math.sin(2*a*Math.PI/180)/9.8).toFixed(1) + ' m'; };
    A.oninput = V.oninput = upd; upd();
    go.onclick = ()=>{
      if(shot && !shot.ended) return;
      AudioSysSafe('click');
      const r = simThrow(+V.value, +A.value);
      if(trace) scene.remove(trace);
      trace = jDashed(r.pts, r.res === 'hit' ? 0x4ade80 : 0xef4444, .35);
      go.disabled = true; M.className = 'g7p-msg';  M.textContent = 'Throwing…';
      shot = {pts:r.pts, t:r.t, s:0, end:()=>{
        const d = (r.x - X0).toFixed(1);
        const msg = { hit:`On target ✓ — it landed ${d} m away, right where the people can grab it.`,
          short:`Too short — it fell into the water at ${d} m. Give it more speed, or an angle closer to 45°.`,
          wall:'It hit the side of the platform — throw higher: more speed or a bigger angle.',
          long:`It landed ${d} m away — past the people. Lower the speed a little.`,
          over:'It flew over the platform. Lower the speed or the angle.' }[r.res];
        M.textContent = msg; M.className = 'g7p-msg ' + (r.res === 'hit' ? 'ok' : 'bad');
        if(r.res === 'hit'){
          AudioSysSafe('correct');
          people[0].userData.pose = 'reach'; g7Say(people[0], 'Got it!', 1800, {border:'#4ade80'});
          setTimeout(()=>{ p.remove(); G7.camView = null; mode = 'done'; [dLine, dTag].forEach(o=> o && (o.visible = false)); next(); }, 2200);
        } else { AudioSysSafe('wrong'); if(r.res === 'short' || r.res === 'over') { splash.position.set(r.x, .1, 0); splash.visible = true; } go.disabled = false; go.textContent = 'Adjust and throw again'; }
      }};
    };
  };
  G7 = { bounds:[-15,-3,-12,10], camOff:[6,4.5,5],
    hazards:[{test:(x,z)=> x > -4.7, msg:'⚠ Stay back from the flooded gap — let the rescuer throw.'},
             {test:(x,z)=> Math.hypot(x+5.4,z) < 1.4, msg:'⚠ Give the rescuer room to throw.'}],
    onControl(){ mode = 'aim'; coil.position.copy(hand); },
    tasks:[
      {at:[-6.75,-1.1], face:[-5.4,0], act:'📏 Estimate the distance', obj:rescuer, short:'Estimate the distance to the platform', text:'Go to the rescue worker and estimate the distance to the platform',
       done:'Distance estimated: about 11.8 m to the target',
       run(next){
         g7Say(rescuer, 'Help me aim — how far is the platform?', 2200);
         dLine = jDashed([[X0,Y0,1.4],[TX,Y0,1.4]], 0x38bdf8, .3);
         dTag = g7Tag(`d ≈ ${(TX-X0).toFixed(1)} m`, (X0+TX)/2, Y0+.7, 1.4, {size:.6, fg:'#7dd3fc', border:'#38bdf8'});
         setTimeout(next, 1400);
       }},
      {at:[-6.75,-1.1], face:[-5.4,0], act:'🎯 Aim the throw', obj:rescuer, short:'Set the angle and speed, then throw', text:'Set the release angle and speed, then throw', done:'Rope delivered — adjusted angle and speed reached the target',
       run(next){ openAim(next); }}],
    finish:[-12,-6], finishText:'Now step back from the edge to the safe spot' };
  g7Camera([-3,7,-15],[1.5,2,0]);
}

// 2 · TYPHOON · Projectile motion — roofing torn off a structure flies in a curve, not straight down.
function jRoofProj(scen){
  shsBridge(scen, 'storm');
  g7Clear(-15.5,6,3.5); g7Clear(-11,2,3); g7Clear(-16,-5.5,3.5);
  const hut = makeHouse(-15.5,6.2,3.4,3,3.2,true); scene.add(hut);
  const shelter = makeConcreteHouse(-16.5,-6,4.4,3.2,3.6); shelter.rotation.y = Math.PI/2; scene.add(shelter);
  g7Tag('SECURE SHELTER', -16.5, 4.4, -6, {bg:'rgba(20,83,45,.92)', border:'#4ade80', size:.7});
  const x0 = -15, y0 = 3.6, z0 = 5.2;
  const path = jParabola(x0, y0, 0, 6.2, 35, .1).map(([x,y])=> [x, y, z0 - (x-x0)*.55]);
  const end = path[path.length-1];
  jDashed(path, 0xfacc15);
  jDashed([[x0,y0,z0],[x0,.05,z0]], 0x94a3b8, .2);
  g7Tag('NOT straight down', x0, .9, z0-.2, {size:.5, fg:'#cbd5e1'});
  jDanger(4, 4, end[0], end[2], .75);
  g7Tag('possible landing area', end[0], 1, end[2]-1.6, {size:.55, fg:'#fecaca', border:'#ef4444'});
  const piece = jSheet(1.4,.9); scene.add(piece);
  const lEq = g7Label('Projectile: x = v₀ₓt,  y = y₀ + v₀ᵧt − ½gt²', {size:.6, fg:'#fde047', border:'#facc15'}); lEq.position.set(-12,6.4,3); scene.add(lEq);
  let tt = 0;
  animCallbacks.push((t,dt)=>{
    tt = (tt + dt) % 5.5;
    const s = Math.max(0, tt - .8), dur = 1.6;
    const i = Math.min(path.length-1, Math.floor(s/dur*(path.length-1)));
    const p = tt < .8 ? [x0, y0 + Math.sin(t*12)*.05, z0] : path[i];
    piece.position.set(...p); piece.rotation.set(s*4, s*2.4, s*3.2);
  });
  g7Human(-10,-3.2, 0x1e3a8a); humanGroup.rotation.y = -Math.PI/2;
  g7Gateway(-14.2,-6,Math.PI/2);
  G7 = { bounds:[-19,-6.4,-9,9], camOff:[6,4.5,5],
    hazards:[{test:(x,z)=> Math.hypot(x-end[0], z-end[2]) < 2.8 || (x > -16 && x < end[0]+1 && z > -.2 && z < z0+1.5), msg:'⚠ That is the roofing’s path and landing area — get to the shelter!'}] };
  g7Camera([-21,6,-1.5],[-12,2,1.5]);
}

// 5 · FLOOD · Collision and impact reduction — a floating log meets a rubber fender on a moored boat.
function jFender(scen){
  shsRiver({ flow:1.3, rain:3000 });
  const BX = -3, BZ = 4;
  const boat = shsBanca(.7); boat.rotation.y = Math.PI/2; boat.position.set(BX,.1,BZ); scene.add(boat);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(.09,.1,1.2,12), pbr({color:0x4a3520,map:woodTex()})); post.position.set(-5.4,.6,BZ+1.5); scene.add(post);
  const tie = jRope(); tie.userData.set(new THREE.Vector3(-5.4,1,BZ+1.5), new THREE.Vector3(BX-.2,.4,BZ+1.7));
  const fenders = [-.9,0,.9].map(dz=>{ const f = new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,.7,16), pbr({color:0x111827, roughness:.9})); f.position.set(BX+.7,.25,BZ+dz); scene.add(f); return f; });
  g7Tag('RUBBER FENDERS', BX+.7, 1.4, BZ, {size:.55});
  const log = new THREE.Group(); scene.add(log);
  const lm = new THREE.Mesh(new THREE.CylinderGeometry(.38,.45,3.4,18), pbr({color:0x5a4030,map:woodTex(),roughness:.92})); lm.rotation.x = Math.PI/2; lm.castShadow = true; log.add(lm);
  const g = new THREE.Sprite(new THREE.SpriteMaterial({map:g7Tex(g7Canvas(1024,560,(c,W,H)=>shsDrawImpulse(c,W,H,['no fender','fender: longer Δt, smaller F']))), transparent:true, depthTest:false, toneMapped:false}));
  g.scale.set(3.4,1.86,1); g.position.set(1.6,4.2,2); g.renderOrder = 20; g.userData.base = g.scale.clone(); scene.add(g); G7_LABELS.push(g);
  const lt = g7Label('Δt longer → F_avg smaller · absorbs some KE', {size:.6, fg:'#bbf7d0', border:'#22c55e'}); scene.add(lt);
  let tt = 0;
  animCallbacks.push((t,dt)=>{
    tt = (tt + dt) % 7;
    let lx = 1.6, lz = -10 + tt*3.6, squash = 0;
    const hitZ = BZ - .2;
    if(tt > 3.9){ const s = Math.min(1, (tt-3.9)/1.1); squash = Math.sin(s*Math.PI); lx = 1.6 - (1.6-(BX+1.35))*1; lz = hitZ + s*.6; if(tt > 5) { lz = hitZ + .6 + (tt-5)*1.2; lx = BX+1.35 + (tt-5)*.5; } }
    else lx = 1.6 - Math.max(0, tt-2.4)/1.5*(1.6-(BX+1.35));
    log.position.set(lx, .14 + Math.sin(t*1.6)*.04, lz);
    fenders.forEach(f=>{ f.scale.x = 1 - squash*.45; f.position.x = BX + .7 - squash*.06; });
    boat.position.x = BX - squash*.05;
    lt.visible = tt > 3.9 && tt < 6.6; lt.position.set(BX+1, 2.4, BZ);
  });
  g7SafePad(-11,-9,'SAFE SPOT · away from the landing');
  g7Human(-6.2,-3); humanGroup.rotation.y = Math.PI/2;
  g7Gateway(-11,-9,Math.PI/2);
  G7 = { bounds:[-15,4,-12,12], camOff:[5,4.5,-3],
    hazards:[{test:(x,z)=> x > -4.9, msg:'⚠ Stay off the boat and the landing while debris is drifting in.'}] };
  g7Camera([-9.5,5.5,-6],[-1,1,2.5]);
}

// 6 · TYPHOON · Inelastic collision — a windblown board hits a container and they move together.
function jInelastic(scen){
  shsBridge(scen, 'storm');
  g7Clear(-13,4,4); g7Clear(-17,-6,3); g7Clear(-8.6,-3.6,1.8); g7Clear(-15,-2,3.2);
  const board = jBoard(); scene.add(board);
  const cont = jContainer(false); cont.scale.setScalar(1.1); scene.add(cont);
  const p1 = g7Arrow(0xfacc15,1.8,.09), p2 = g7Arrow(0xfacc15,1.8,.09); scene.add(p1, p2);
  const l1 = g7Label('Before: p = m₁v₁ (board)', {size:.58, fg:'#fde047'}); scene.add(l1);
  const l2 = g7Label('After: one common velocity, m₁u₁ + m₂u₂ = (m₁+m₂)v', {size:.58, fg:'#fde047', border:'#facc15'}); scene.add(l2);
  const lI = g7Label('PERFECTLY INELASTIC collision — momentum conserved', {size:.66, fg:'#fecaca', border:'#ef4444'}); lI.position.set(-13,4.4,3.6); scene.add(lI);
  const C0 = new THREE.Vector3(-13.2,0,4.4), dirv = new THREE.Vector3(1,0,-.55).normalize(), ang = Math.atan2(-dirv.z, dirv.x);
  jDanger(3.6, 6.5, -11.6, 3.4, .65);
  let tt = 0;
  animCallbacks.push((t,dt)=>{
    tt = (tt + dt) % 7;
    const tHit = 1.8, vB = 4.2;
    let bp, cp = C0.clone();
    if(tt < tHit){ bp = C0.clone().addScaledVector(dirv, -(tHit-tt)*vB); bp.y = .9 + Math.sin(tt*3)*.15; }
    else { const s = tt - tHit, v1 = vB*.42, d = Math.min(v1*s - .2*s*s, v1*v1/.4*.5); cp = C0.clone().addScaledVector(dirv, Math.max(0, d)); bp = cp.clone(); bp.y = .75; }
    board.position.copy(bp); board.rotation.set(tt < tHit ? t*5 : .2, ang, tt < tHit ? Math.sin(t*4)*.4 : 0);
    cont.position.set(cp.x, 0, cp.z); cont.rotation.y = ang;
    p1.visible = l1.visible = tt < tHit; p2.visible = l2.visible = tt >= tHit + .2;
    p1.rotation.y = ang; p1.position.set(bp.x, 1.7, bp.z); p1.userData.setLen(1.8);
    p2.rotation.y = ang; p2.position.set(cp.x, 1.7, cp.z); p2.userData.setLen(1.8);
    l1.position.set(bp.x, 2.5, bp.z); l2.position.set(cp.x, 2.6, cp.z);
  });
  g7SafePad(-17,-6,'SAFE SPOT');
  g7Human(-8.6,-3.6, 0x1e3a8a); humanGroup.rotation.y = -Math.PI/2;
  g7Gateway(-17,-6,0);
  G7 = { bounds:[-19,-6.4,-9,9], camOff:[6,4.5,5],
    hazards:[{test:(x,z)=> Math.hypot(x+11.6, z-3.4) < 3.2, msg:'⚠ Stay out of their path — the joined objects are still moving!'}] };
  g7Camera([-19.5,6,-6],[-12,1,2.5]);
}

Object.assign(G7_SCENES, {
  channel:jChannel, roofslide:jRoofSlide, logbottle:(s)=> shsMomentum(s, 'ke'), flowerpot:jFlowerpot, stuckbox:jStuckBox, platform:jPlatform,
  boatstop:jBoatStop, vehiclestop:jVehicleStop, twocontainers:jTwoContainers, roofboard:jRoofBoard, boatstep:jBoatStep, branchspring:jBranchSpring,
  ropethrow:jRopeThrow, roofproj:jRoofProj, fender:jFender, inelastic:jInelastic
});
