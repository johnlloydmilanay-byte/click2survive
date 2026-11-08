'use strict';
// ═══════════════════════════════════════════════
//  GRADES 11–12 — one purpose-built scene per decision item
// ═══════════════════════════════════════════════
// Same approach as grade7-scenes.js, whose helpers (g7World, g7Label, g7Arrow, g7Tag,
// g7SafePad, g7Gateway, hazards, …) these reuse so the senior-high items look and play
// exactly like Grade 7: the physics is made visible (force, velocity, momentum and
// energy arrows or bars), and in the control phase the student walks to the safe spot
// while hazard areas refuse entry. Grade 12's hanging-sign item reuses g7Sign.
//
// G7.heightAt (new here) lets a scene have raised ground — the ramp scenes walk the
// learner up a ramp onto the evacuation platform.

// ─── shared builders ───
// Low street by the river with a boat landing, as in the Grade 7 trash-bin item. The
// river runs along z at x > 14; the dock reaches out at z = 3.
function shsLanding(o){
  clearScene();
  g7World({ mood:o.mood||'overcast', rain:o.rain==null?4500:o.rain, rainK:o.rainK||1, wind:o.wind,
    keepOut:(x,z)=> (o.keepOut && o.keepOut(x,z)) || x>13,
    wet:(x,z)=> x>12 || !!(o.wet && o.wet(x,z)),
    houses:o.houses||[[-10,-17,0],[-2,-18,0],[7,-17,0],[-18,-6,Math.PI/2],[-18,6,Math.PI/2]],
    trees:o.trees||[[-14,-11,'palm'],[4,-14,''],[12,-12,'palm'],[-6,-13,'banana']],
    bushes:o.bushes||[[-1,-11],[9,-10],[-12,-4]] });
  g7Water(24,70,26,0,.06,true,[0,.9]);
  g7Current(15,37,-30,30,.06,()=>1.1,true);
  const dock = new THREE.Mesh(new THREE.BoxGeometry(4.5,.25,3), pbr({color:0x6b4f30,map:woodTex(),roughness:.9}));
  dock.position.set(15.5,.2,3); dock.castShadow = dock.receiveShadow = true; scene.add(dock);
  [[-2,-1.3],[2,-1.3],[-2,1.3],[2,1.3]].forEach(([dx,dz])=>{ const p = new THREE.Mesh(new THREE.CylinderGeometry(.1,.1,1,12), pbr({color:0x4a3520,map:woodTex()})); p.position.set(15.5+dx,-.2,3+dz); scene.add(p); });
  g7Tag('BOAT LANDING', 15.5, 2.2, 3, {size:.85});
}
// A bancá without the Grade 9 load-line overlay.
function shsBanca(scale){
  const b = makeBanca(false); b.scale.setScalar(scale||.8);
  b.children.forEach(c=>{ if(c.material && c.material.isMeshBasicMaterial) c.visible = false; });
  return b;
}
// River channel along z between x = ±4.8 with muddy banks, as in the Grade 7 bottle item.
function shsRiver(o){
  clearScene();
  g7World({ mood:o.mood||'overcast', rain:o.rain==null?3500:o.rain, rainK:o.rainK||1, wind:o.wind,
    keepOut:(x,z)=> x>-5.4 && x<5.4,
    wet:(x,z)=> Math.abs(x)<6.4,
    houses:[[-17,-7,Math.PI/2],[-17,4,Math.PI/2],[12,-9,-Math.PI/2],[12,6,-Math.PI/2,true]],
    trees:[[-9,-13,'palm'],[-10,11,''],[-7,13,'banana'],[8,-3,'palm'],[8,11,'']],
    bushes:[[-8,-2.5],[7,6],[-12,-12]] });
  [-1,1].forEach(sd=>{
    const bank = new THREE.Mesh(new THREE.PlaneGeometry(1.4,80,1,1), pbr({color:0x6e5a40, map:g7PathTex('dirt'), roughness:1, rim:0}));
    bank.rotation.x = -Math.PI/2; bank.position.set(sd*5.1,.03,0); bank.receiveShadow = true; scene.add(bank);
  });
  g7Water(9.6,80,0,0,.08,true,[0,o.flow||1.4]);
  g7Current(-4.4,4.4,-30,30,.08,()=>o.flow||1.4,true);
  g7Debris(14, -4.2, 4.2, -30, 30, .08, ()=>(o.flow||1.4)*.95, true);
  const stoneM = [0x7a746a,0x8a8478,0x6a655c].map(c=>pbr({color:c,roughness:.95,rim:.1}));
  for(let z=-26;z<=26;z+=1.15){ [-4.9,4.9].forEach((x,j)=>{ const s = new THREE.Mesh(blobGeo(.32+Math.random()*.22,16,.5,z*7+x), stoneM[(Math.abs(Math.round(z))+j)%3]); s.position.set(x+(Math.random()-.5)*.35,.06,z+(Math.random()-.5)*.4); s.scale.y = .5; s.castShadow = true; s.receiveShadow = true; scene.add(s); }); }
}
// The bridge approach used by the Grade 7 sign and wind-update items: learner side is
// x < −6.2, the pathway runs along z = 0 into the hanging bridge.
function shsBridge(scen, mood){
  buildBridgeScene({wind:scen.wind||60, noRider:true, bankMat:g7BankMat()});
  g7Light(mood || (scen.wind>80 ? 'storm' : 'overcast'));
  g7Path([[-20,0],[-6.2,0]], 2, 0x958b7c, .03, 'dirt');
}
// Arrow pointing straight up (dir 1) or down (dir −1).
function shsVArrow(color, len, dir, thick){
  const a = g7Arrow(color, len, thick); a.rotation.z = dir<0 ? -Math.PI/2 : Math.PI/2;
  scene.add(a); return a;
}
// Curved "turning" arrow drawn in its group's xy-plane, around the origin.
function shsSpinArrow(color, r){
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({color, transparent:true, opacity:.95, depthTest:false, toneMapped:false});
  const arc = new THREE.Mesh(new THREE.TorusGeometry(r, .045, 10, 40, Math.PI*1.45), m);
  arc.rotation.z = Math.PI*.3; arc.renderOrder = 19; g.add(arc);
  const a1 = Math.PI*.3 + Math.PI*1.45;               // arrow head at the arc's end, turning clockwise seen from +z
  const tip = new THREE.Mesh(new THREE.ConeGeometry(.12,.3,20), m);
  tip.position.set(Math.cos(Math.PI*.3)*r, Math.sin(Math.PI*.3)*r, 0); tip.rotation.z = Math.PI*.3 + Math.PI; tip.renderOrder = 19;
  g.add(tip); g.userData.a1 = a1;
  scene.add(g); return g;
}
// Cardboard relief box with a printed label.
function shsReliefBox(s){
  s = s||1;
  const tex = texCache['shs-relief'] || (texCache['shs-relief'] = g7Tex(g7Canvas(256,256,(c,W)=>{
    c.fillStyle = '#c89b62'; c.fillRect(0,0,W,W);
    c.fillStyle = 'rgba(0,0,0,.08)'; for(let i=0;i<24;i++) c.fillRect(0, i*W/24, W, 2);
    c.fillStyle = '#b91c1c'; c.fillRect(W*.1,W*.36,W*.8,W*.28);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `800 40px ${G7_FONT}`; c.fillText('RELIEF', W/2, W*.5);
  })));
  const m = new THREE.Mesh(new THREE.BoxGeometry(.55*s,.42*s,.45*s), new THREE.MeshStandardMaterial({map:tex, roughness:.85}));
  m.castShadow = m.receiveShadow = true;
  return m;
}
// Two-bar energy (or momentum) meter standing on the ground; set(a,b) takes 0–1 values.
function shsBars(x, z, rotY, names, colors){
  const g = new THREE.Group(); g.position.set(x,0,z); g.rotation.y = rotY||0;
  const H = 2.6, bars = [];
  const frame = pbr({color:0x334155, roughness:.6, metalness:.3});
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.1,.12,.5), frame); base.position.y = .06; g.add(base);
  names.forEach((n,i)=>{
    const px = (i-.5)*1.1;
    const track = new THREE.Mesh(new THREE.BoxGeometry(.6,H,.06), new THREE.MeshBasicMaterial({color:0x0b1220, transparent:true, opacity:.45}));
    track.position.set(px, .12+H/2, -.05); g.add(track);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(.5,1,.2), new THREE.MeshBasicMaterial({color:colors[i], toneMapped:false}));
    bar.position.set(px, .12, 0); g.add(bar); bars.push(bar);
    const l = g7Label(n, {size:.55, fg:'#'+colors[i].toString(16).padStart(6,'0')}); l.position.set(px, H+.65, 0); g.add(l);
  });
  scene.add(g);
  g.userData.set = (...v)=> v.forEach((f,i)=>{ const h = Math.max(.02, Math.min(1,f))*H; bars[i].scale.y = h; bars[i].position.y = .12 + h/2; });
  return g;
}

// ═══ GRADE 11 ═══

// 1 · FLOOD · Translational + rotational motion — a loose water container rolls down the
// slightly inclined pathway toward the boat landing.
function shsDrum(scen){
  const inPath = (x,z)=> z>1.5 && z<4.5 && x>-13 && x<14;
  shsLanding({ rain:4000,
    keepOut:(x,z)=> z>0 && z<6 && x>-14.5,
    wet:(x,z)=> z>-.5 && z<6.5 && x>-15.5 });
  g7Water(28,11,-.5,3,.16,false,[1,0]);
  g7Current(-13,13,-1.5,7.5,.16,()=>1,false);
  g7Debris(16, -13, 13, -1, 7, .16, ()=>.9, false);
  g7Path([[-12,3],[13.5,3]], 2.4, 0xa29d92, .04, 'concrete');
  for(let x=-8;x<=10;x+=4.5) g7Chevron(x, 5.2, 0, 0xfacc15);
  g7Tag('Slight slope ↘ toward the river', -6, 1.5, 5.6, {size:.55, fg:'#fde047'});

  const hg = new THREE.Mesh(new THREE.CylinderGeometry(3.4,3.7,.18,40), pbr({color:0x8f8775,map:g7PathTex('dirt'),roughness:.95}));
  hg.position.set(-5,.06,-8.5); hg.receiveShadow = true; scene.add(hg);
  g7SafePad(-5,-8.5,'SAFE SPOT · clear of the path');

  // Blue plastic water drum, axis along z, ribbed, with a white stripe so the spin reads.
  const R = .5;
  const drum = new THREE.Group(); scene.add(drum);
  const spinner = new THREE.Group(); spinner.position.y = R; drum.add(spinner);
  const blue = pbr({color:0x1d4ed8, roughness:.42, rim:.2});
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R,R,1.05,40), blue); body.rotation.x = Math.PI/2; body.castShadow = true; spinner.add(body);
  [-.36,0,.36].forEach(z=>{ const rib = new THREE.Mesh(new THREE.TorusGeometry(R+.015,.03,10,40), blue); rib.position.z = z; spinner.add(rib); });
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(.12,.05,1.08), pbr({color:0xf8fafc, roughness:.5}));
  stripe.position.y = R-.005; spinner.add(stripe);
  const capM = pbr({color:0xf8fafc, roughness:.5});
  [-1,1].forEach(sd=>{ const cap = new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,.06,20), capM); cap.rotation.x = Math.PI/2; cap.position.set(.22,.18,sd*.54); spinner.add(cap); });
  const shadow = g7Decal(g7SoftTex('g7-contact','rgba(0,0,0,.45)','rgba(0,0,0,0)'), 1.4, 1.1, 0, .16, 3);
  const vArrow = g7Arrow(0xfacc15, 1, .08); scene.add(vArrow);
  const spin = shsSpinArrow(0x38bdf8, .78);
  const lv = g7Label('TRANSLATION: centre moves  v_cm', {size:.56, fg:'#fde047'}); scene.add(lv);
  const lw = g7Label('ROTATION about its axis  ω', {size:.56, fg:'#7dd3fc'}); scene.add(lw);
  const ln = g7Label('ROLLING = translation + rotation', {size:.72, fg:'#fecaca', border:'#ef4444'}); scene.add(ln);
  const lt = g7Label('WATER CONTAINER', {size:.55, pin:true, bg:'rgba(30,58,138,.9)', border:'#60a5fa'}); scene.add(lt);
  let dx = -11, dv = .4;
  animCallbacks.push((t,dt)=>{
    dv = Math.min(3.2, dv + .75*dt);                 // gravity along the slope keeps it speeding up
    dx += dv*dt;
    if(dx > 12.4){ dx = -11; dv = .4; }
    drum.position.set(dx, .06, 3);
    spinner.rotation.z = -dx/R;                      // rolling without slipping: v_cm = rω
    shadow.position.set(dx, .165, 3);
    vArrow.position.set(dx+.2, 1.55, 3); vArrow.userData.setLen(.6 + dv*.45);
    spin.position.set(dx, R+.06, 3.62); spin.rotation.z = -t*2.2*dv*.4;
    lv.position.set(dx+1.6, 2.05, 3); lw.position.set(dx-.2, -.05+R, 4.7); ln.position.set(dx, 3.35, 3);
    lt.position.set(dx, 1.25, 3);
  });

  g7Human(4,-.8);
  humanGroup.rotation.y = Math.PI/2;
  g7Gateway(-5,-8.5,0);
  G7 = { bounds:[-12,12,-13,9], camOff:[6,4.5,5],
    hazards:[{test:inPath, msg:'⚠ That is the rolling container’s path — it is still moving and turning. Stay away!'},
             {test:(x,z)=> x>12.5, msg:'⚠ Stay away from the boat landing until the area is clear.'}] };
  g7Camera([-1,8,18.5],[.5,0,-1.5]);
}

// Spoked cart wheel, axis along z, in a holder that turns about z.
function shsMakeWheel(R){
  const w = new THREE.Group();
  const wood = pbr({color:0x7a5532, map:woodTex(), roughness:.85});
  const iron = pbr({color:0x2b2f35, roughness:.45, metalness:.7, rim:.1});
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, .07, 12, 44), wood); rim.castShadow = true; w.add(rim);
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(R+.05, .035, 8, 44), iron); w.add(tyre);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,.22,18), iron); hub.rotation.x = Math.PI/2; w.add(hub);
  for(let i=0;i<8;i++){ const s = new THREE.Mesh(new THREE.CylinderGeometry(.025,.03,R*2-.06,8), wood); s.rotation.z = i*Math.PI/8; w.add(s); }
  const mark = new THREE.Mesh(new THREE.BoxGeometry(.16,.16,.16), pbr({color:0xef4444, roughness:.5})); mark.position.y = R; w.add(mark);
  return w;
}

// 2 · TYPHOON · Translational + rotational motion — a wheel torn off a damaged cart rolls
// along the pathway toward the hanging bridge.
function shsWheel(scen){
  shsBridge(scen);
  g7Clear(-18.5,-2.8,2.4); g7Clear(-16,-5.5,4.6); g7Clear(-9.8,-2.8,2); g7Clear(-14,3.5,3.2);
  g7Tag('Pathway to the bridge', -15, 1.1, 1.5, {size:.6});

  // The damaged cart, tipped onto its axle where the wheel came off.
  const cart = new THREE.Group();
  const wood = pbr({color:0x8a6236, map:woodTex(), roughness:.88});
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.1,.12,1.2), wood); bed.position.y = .62; bed.castShadow = true; cart.add(bed);
  [[0,.6],[0,-.6]].forEach(([x,z])=>{ const s = new THREE.Mesh(new THREE.BoxGeometry(2.1,.36,.06), wood); s.position.set(x,.82,z); s.castShadow = true; cart.add(s); });
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.6,.07,.07), wood); shaft.position.set(1.7,.5,0); shaft.rotation.z = -.2; cart.add(shaft);
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,1.5,10), pbr({color:0x2b2f35, metalness:.7, roughness:.4})); axle.rotation.x = Math.PI/2; axle.position.y = .45; cart.add(axle);
  const kept = shsMakeWheel(.45); kept.position.set(0,.45,.72); cart.add(kept);
  cart.rotation.x = .22; cart.position.set(-18.5,0,-2.8); scene.add(cart);
  g7Tag('DAMAGED CART', -18.5, 2.2, -2.8, {size:.55});

  const R = .45;
  const wheel = new THREE.Group(); scene.add(wheel);
  const spinner = shsMakeWheel(R); spinner.position.y = R; wheel.add(spinner);
  const shadow = g7Decal(g7SoftTex('g7-contact','rgba(0,0,0,.45)','rgba(0,0,0,0)'), 1.1, .6, 0, .045, 0);
  const vArrow = g7Arrow(0xfacc15, 1, .075); scene.add(vArrow);
  const spin = shsSpinArrow(0x38bdf8, .7);
  const lv = g7Label('Centre moves →  v_cm', {size:.55, fg:'#fde047'}); scene.add(lv);
  const lw = g7Label('Rim rotates  ω', {size:.55, fg:'#7dd3fc'}); scene.add(lw);
  const ln = g7Label('ROLLING WHEEL: v_center = ωR', {size:.7, fg:'#fecaca', border:'#ef4444'}); scene.add(ln);
  const pz = g7Decal(g7SoftTex('g7-danger','rgba(239,68,68,.55)','rgba(239,68,68,0)'), 3, 1, 0, .05, 0);
  pz.material.toneMapped = false; pz.scale.set(4.2,1,1); pz.position.x = -12.5;
  animCallbacks.push((t)=>{ pz.material.opacity = .45 + Math.sin(t*3)*.25; });
  let wx = -17, wv = .6;
  animCallbacks.push((t,dt)=>{
    const gust = .5 + Math.max(0, Math.sin(t*1.6))*.9;
    wv = Math.min(3, wv + gust*dt*.8);
    wx += wv*dt;
    if(wx > -6.8){ wx = -17; wv = .6; }
    const wob = Math.sin(t*7)*.04;
    wheel.position.set(wx, 0, Math.sin(wx*.6)*.25); wheel.rotation.x = wob;
    spinner.rotation.z = -wx/R;
    shadow.position.set(wx, .045, wheel.position.z);
    vArrow.position.set(wx+.1, 1.35, wheel.position.z); vArrow.userData.setLen(.5 + wv*.45);
    spin.position.set(wx, R, wheel.position.z+.5); spin.rotation.z = -t*3*wv*.4;
    lv.position.set(wx+1.4, 1.85, wheel.position.z); lw.position.set(wx-.4, 1.45, wheel.position.z+.8); ln.position.set(wx, 3, 0);
  });

  g7SafePad(-16,-5.5,'SAFE SPOT');
  g7Human(-9.8,-2.8, 0x1e3a8a);
  humanGroup.rotation.y = -Math.PI/2;
  g7Gateway(-16,-5.5,0);
  G7 = { bounds:[-19,-6.4,-9,9], camOff:[6,4.5,5],
    hazards:[{test:(x,z)=> Math.abs(z)<1.5 && x>-19.5, msg:'⚠ That is the wheel’s path — it is still rolling. Move away and postpone crossing!'}] };
  g7Camera([-22,6.5,6],[-12.5,.4,-1.8]);
}

// 3 · FLOOD · Simple machines (Grade 11) and 3 · FLOOD · Work and energy (Grade 12) —
// relief boxes from the boat landing up to a raised evacuation area. One layout, two
// variants: G11 compares lifting straight up with a stable ramp; G12 compares carrying
// up wet steps with pushing a cart up a dry ramp.
function shsRampScene(scen, cart){
  const H = 1.6;                                   // platform height
  const RX0 = -4, RX1 = 6, RZ0 = -11.4, RZ1 = -8.6; // ramp: low end at x = 6, top at x = −4
  const onPlat = (x,z)=> x<RX0 && x>-13 && z>-13.2 && z<-3;
  const onRamp = (x,z)=> x>=RX0 && x<=RX1 && z>RZ0 && z<RZ1;
  const heightAt = (x,z)=> onPlat(x,z) ? H : onRamp(x,z) ? H*(RX1-x)/(RX1-RX0) : 0;
  const stepZone = (x,z)=> x>-4.4 && x<-1.6 && z>-6.6 && z<-3.4;
  shsLanding({ rain:cart?2600:1800,
    keepOut:(x,z)=> onPlat(x-.5,z) || (x>-4.5 && x<7 && z>-12 && z<-3) || (z>1 && z<5 && x>-1),
    wet:(x,z)=> (z>-1 && z<7 && x>-2) || (cart && stepZone(x,z)) });
  g7Water(14,6,7,3,.12,false,[.5,0]);        // receding floodwater at the landing
  g7Path([[11,1.5],[6.8,-2],[6.8,-10]], 2, 0xb79c6c, .035, 'dirt');

  // Raised evacuation platform with a concrete hall on it.
  const concrete = pbr({color:0xb0aca4, map:g7PathTex('concrete'), roughness:.95});
  const plat = new THREE.Mesh(new THREE.BoxGeometry(9,H,10.2), concrete); plat.position.set(-8.5,H/2,-8.1); plat.castShadow = plat.receiveShadow = true; scene.add(plat);
  const hall = makeConcreteHouse(-10,-9,4.4,3,5.6); hall.position.y = H; hall.rotation.y = Math.PI/2; scene.add(hall);
  const ban = new THREE.Mesh(new THREE.PlaneGeometry(4.2,.75), new THREE.MeshStandardMaterial({side:THREE.DoubleSide, roughness:.8, map:g7Tex(g7Canvas(1024,184,(c,W,h)=>{
    c.fillStyle = '#166534'; c.fillRect(0,0,W,h); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `800 92px ${G7_FONT}`; c.fillText('EVACUATION AREA', W/2, h/2+4);
  }))}));
  ban.position.set(-7.6,H+2.6,-9); ban.rotation.y = Math.PI/2; scene.add(ban);
  g7Tag('RAISED EVACUATION AREA', -8.5, H+4.4, -8, {bg:'rgba(20,83,45,.92)', border:'#4ade80', size:.8});
  // a few relief boxes already up there
  [[-6,-11.5],[-5.5,-12.2],[-6.6,-12.3]].forEach(([x,z],i)=>{ const b = shsReliefBox(); b.position.set(x,H+.21+(i===2?.42:0),z); scene.add(b); });

  // The ramp: a long, gentle concrete slope with rails, checked and stable.
  const L = Math.hypot(RX1-RX0, H), ang = Math.atan2(H, RX1-RX0);
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(L,.14,RZ1-RZ0), pbr({color:0xc9c3b6, map:g7PathTex('concrete'), roughness:.92}));
  ramp.position.set((RX0+RX1)/2, H/2, (RZ0+RZ1)/2); ramp.rotation.z = -ang;   // high end toward the platform (−x)
  ramp.castShadow = ramp.receiveShadow = true; scene.add(ramp);
  const railM = pbr({color:0x64748b, roughness:.4, metalness:.7, rim:.1});
  [RZ0+.05, RZ1-.05].forEach(z=>{
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,L,10), railM); rail.rotation.z = Math.PI/2 - ang; rail.position.set((RX0+RX1)/2, H/2+.9, z); scene.add(rail);
    for(let i=0;i<=4;i++){ const f = i/4, px = RX1 - f*(RX1-RX0); const p = new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.9,8), railM); p.position.set(px, H*f+.45, z); scene.add(p); }
  });
  g7Signboard(7.4, -7.4, Math.PI/4, { w:1.5, h:.75, post:1.05, draw:(ctx,W,h)=>{
    ctx.fillStyle = '#15803d'; ctx.fillRect(0,0,W,h);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 16; g7RR(ctx,14,14,W-28,h-28,26); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 110px ${G7_FONT}`; ctx.fillText(cart ? 'DRY RAMP ✓' : 'RAMP ✓', W/2, h*.4);
    ctx.font = `700 62px ${G7_FONT}`; ctx.fillText('CHECKED · STABLE', W/2, h*.76);
  }});
  g7Tag(cart ? 'CART + DRY RAMP\nlonger distance · smaller force' : 'STABLE RAMP\nsmaller force · longer distance', 2, H+2.1, -10, {size:.66, fg:'#bbf7d0', border:'#22c55e'});
  for(let k=1;k<4;k++) g7Chevron(RX1 - k*2.5, -10, Math.PI, 0x4ade80);

  // East face of the platform: lifting straight up (G11) or wet steps (G12).
  let lifted = null;
  if(cart){
    const stepM = pbr({color:0x8c877c, map:g7PathTex('concrete'), roughness:.35, metalness:.05});
    for(let i=0;i<5;i++){
      const s = new THREE.Mesh(new THREE.BoxGeometry(.55, H*(i+1)/5, 2.6), stepM);
      s.position.set(-1.9-(i*.5), H*(i+1)/10, -5); s.castShadow = s.receiveShadow = true; scene.add(s);
    }
    const sheen = g7Decal(g7SoftTex('g7-wet','rgba(150,180,200,.55)','rgba(150,180,200,0)'), 3.8, 3.4, -2.6, .05, -5);
    animCallbacks.push((t)=>{ sheen.material.opacity = .7 + Math.sin(t*2)*.2; });
    g7Signboard(-.8, -3.2, Math.PI*.8, { w:1.1, h:1.1, post:.9, draw:(ctx,W,h)=>g7DrawWarning(ctx, W, h, 'WET STEPS', 'SLIPPERY', (c,x,y,r)=>{
      c.fillStyle = '#111827'; c.beginPath(); c.arc(x-r*.2, y-r*.75, r*.22, 0, 6.28); c.fill();
      c.lineWidth = r*.22; c.strokeStyle = '#111827'; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x-r*.2,y-r*.45); c.lineTo(x+r*.25,y+r*.1); c.lineTo(x+r*.9,y+r*.05); c.moveTo(x+r*.25,y+r*.1); c.lineTo(x-r*.4,y+r*.55); c.stroke();
      c.beginPath(); c.moveTo(x-r*1.2,y+r*.85); c.lineTo(x+r*1.2,y+r*.85); c.stroke();
    })});
    g7Tag('WET STEPS\nshorter · slippery', -2.6, H+1.9, -5, {size:.66, fg:'#fecaca', border:'#ef4444'});
  } else {
    // Two responders straining to lift a box straight up the wall.
    [[-2.6,-4.4],[-2.6,-5.6]].forEach(([x,z],i)=>{ const h = makeHuman(x,0,z, i?0xb45309:0x0f766e); h.rotation.y = -Math.PI/2; scene.add(h); });
    lifted = shsReliefBox(1.1); scene.add(lifted);
    const fUp = shsVArrow(0xef4444, 1.6, 1, .1);
    const lu = g7Label('LIFT: effort = full weight  F = mg', {size:.62, fg:'#fecaca', border:'#ef4444'}); scene.add(lu);
    let lt = 0;
    animCallbacks.push((t,dt)=>{
      lt = (lt + dt) % 5;
      const f = lt < 3.5 ? Math.sin(lt/3.5*Math.PI*.5) : 1 - (lt-3.5)/1.5;   // slow, heavy climb, then drop back
      const y = .9 + f*(H+.1);
      lifted.position.set(-3.3, y, -5); lifted.rotation.z = Math.sin(t*9)*.03*(1-f);
      fUp.position.set(-3.3, y-.35, -4.1); fUp.userData.setLen(1.6);
      lu.position.set(-2.8, H+2.4, -4.6);
    });
  }

  // A responder already using the ramp, so the method is visible before deciding.
  const pusher = makeHuman(0,0,-10, 0x0f766e); scene.add(pusher);
  pusher.userData.baseY = 0; pusher.userData.moving = true;
  // hands on the load: a cart handle at waist height, or a box pushed with a forward lean
  pusher.userData.pose = cart ? 'cart' : 'push';
  pusher.rotation.order = 'YXZ';                     // lean about the body's own x axis
  let load;
  if(cart){
    load = new THREE.Group();
    const tray = new THREE.Mesh(new THREE.BoxGeometry(1.1,.12,.75), pbr({color:0x1e3a8a, roughness:.5, metalness:.3})); tray.position.y = .38; load.add(tray);
    [-.38,.38].forEach(z=>[-.4,.4].forEach(x=>{ const wh = new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.08,16), pbr({color:0x111827, roughness:.7})); wh.rotation.x = Math.PI/2; wh.position.set(x,.15,z); load.add(wh); }));
    const b1 = shsReliefBox(); b1.position.y = .65; load.add(b1);
    const b2 = shsReliefBox(.9); b2.position.set(.05,1.04,0); load.add(b2);
  } else { load = shsReliefBox(1.78); }
  scene.add(load);
  const fRamp = g7Arrow(0x4ade80, .8, .07); scene.add(fRamp);
  const lr = g7Label('RAMP: F_incline = mg(h/L)  (smaller)', {size:.58, fg:'#bbf7d0'}); scene.add(lr);
  let rt = 0, mine = null;
  animCallbacks.push((t,dt)=>{
    if(mine){
      // Take Control: the force-along-the-ramp label rides with the learner's own load
      const p = mine.getWorldPosition(new THREE.Vector3()), on = p.x > RX0 && p.x < RX1 && Math.abs(p.z+10) < 1.5;
      fRamp.visible = lr.visible = on; pusher.visible = load.visible = false;
      fRamp.position.set(p.x+.55, p.y+.6, p.z-.9); fRamp.rotation.set(0, Math.PI, ang); lr.position.set(p.x+.4, p.y+1.9, p.z-.9);
      return;
    }
    rt = (rt + dt) % 9;
    const f = Math.min(1, rt/7.5);
    const x = RX1 + .6 - f*(RX1-RX0+1.6);
    const y = heightAt(Math.min(RX1, x), -10);
    const gap = cart ? .71 : 1.14;
    pusher.position.x = x + gap; pusher.userData.baseY = heightAt(Math.min(RX1, x+gap), -10); pusher.rotation.y = -Math.PI/2;
    pusher.rotation.x = cart ? .1 : .5;
    pusher.userData.moving = rt < 7.5;
    load.position.set(x, y + (cart ? 0 : .38), -10); load.rotation.z = (x>RX0 && x<RX1) ? -ang : 0;
    fRamp.position.set(x+.55, y+.55, -10.9); fRamp.rotation.set(0, Math.PI, (x>RX0 && x<RX1) ? ang : 0);   // up the slope
    lr.position.set(x+.4, y+1.9, -10.9);
  });

  // The learner's own load waits beside the dirt path near the landing: a relief box on the
  // ground (G11) or the loaded cart (G12). They fetch it, take it up the ramp and set it down
  // with the other relief supplies on the platform.
  g7Human(11,-4.6, 0x1e3a8a);
  humanGroup.rotation.y = -Math.PI*.6; humanGroup.rotation.order = 'YXZ';
  const LX = 8.6, LZ = -2.6;                          // where the load waits
  const myLoad = cart ? load.clone() : shsReliefBox(.82);
  if(cart){ myLoad.position.set(LX, 0, LZ); myLoad.rotation.y = 0; }
  else { myLoad.position.set(LX, .172, LZ); myLoad.rotation.y = .3; }
  scene.add(myLoad);
  const loadTag = g7Tag(cart ? 'your cart of relief goods' : 'your relief box', LX, cart ? 2.1 : 1.3, LZ, {size:.5});
  const CG = .74;                                     // cart: hands-to-cart-centre distance
  const dropX = cart ? -5.75 : -5.0, dropZ = cart ? -10 : -11.45;
  g7Gateway(-6.6,-10,Math.PI/2);
  gatewayGroup.position.y += H;
  g7Tag('Gateway: top of the ramp', -6.6, H+4, -10, {size:.5});
  // cart: rolls in front of the hands, following the ground and pitching with the slope
  const cartFollow = ()=>{
    const h = humanGroup, fx = Math.sin(h.rotation.y), fz = Math.cos(h.rotation.y);
    const cx = h.position.x + fx*CG, cz = h.position.z + fz*CG;
    const hb = heightAt(cx - fx*.5, cz - fz*.5), hf = heightAt(cx + fx*.5, cz + fz*.5);
    myLoad.rotation.order = 'YXZ';
    myLoad.position.set(cx, (hb+hf)/2, cz); myLoad.rotation.set(0, h.rotation.y + Math.PI/2, Math.atan2(hb - hf, 1));
    h.rotation.x = .1;
  };
  const stepMsg = cart ? '⚠ The wet steps are slippery — push the cart up the dry, stable ramp instead.'
                       : '⚠ Lifting straight up takes the box’s full weight as effort — use the ramp.';
  G7 = { bounds:[-11.5,11,-12,7], camOff:[5,5.5,4], heightAt,
    onControl(){ mine = myLoad; },
    tasks:[
      cart ? {at:[LX+CG+.02, LZ], face:[LX, LZ], act:'✋ Grip the cart handle', obj:myLoad, short:'Go to your cart and grip the handle',
               text:'Go to your loaded cart and grip its handle',
               done:'Handle gripped — push it to the low end of the ramp',
               run(next){ loadTag.visible = false; humanGroup.userData.pose = 'cart'; G7.onMove = cartFollow; cartFollow(); G7.probe = 1.35; G7.speed = 2.2; G7.turnRate = 5; next(); }}
           : {at:[LX+.78, LZ+.24], face:[LX, LZ], act:'✋ Pick up the box', obj:myLoad, short:'Pick up your relief box',
               text:'Go to your relief box and pick it up',
               done:'Box lifted — carry it to the low end of the ramp',
               run(next){ loadTag.visible = false; g7Carry(myLoad, [0,1.06,.42], 0, ()=>{ G7.probe = .7; G7.speed = 2.6; next(); }); }},
      cart ? {at:[dropX+CG, dropZ], face:[dropX-1, dropZ], act:'🅿 Park the cart', ghost:[{src:load, at:[dropX, H, dropZ], rotY:0}],
               short:'Push it up the dry ramp and park it', text:'Push the cart up the dry, stable ramp and park it on the platform',
               done:'Cart parked at the evacuation area — W = F·d with a smaller force',
               run(next){ G7.onMove = null; G7.probe = 0; humanGroup.rotation.x = 0; humanGroup.userData.pose = null;
                 g7Tween(myLoad, new THREE.Vector3(dropX, H, dropZ), .5, 0, next, f=>{ myLoad.rotation.set(0, myLoad.rotation.y*(1-f), myLoad.rotation.z*(1-f)); }); }}
           : {at:[dropX, dropZ+.82], face:[dropX, dropZ], act:'⬇ Put it down', ghost:[{src:myLoad, at:[dropX, H+.172, dropZ], rotY:0}],
               short:'Carry it up the ramp and set it down', text:'Carry the box up the stable ramp and set it with the other relief boxes',
               done:'Box delivered — the ramp made the effort smaller',
               run(next){ G7.probe = 0; g7PutDown(myLoad, new THREE.Vector3(dropX, H+.172, dropZ), next, 0); }}],
    hazards:[{test:stepZone, msg:stepMsg},
             {test:(x,z)=> x>RX0-.6 && x<RX0+.6 && z>-13.4 && z<-2.6 && !(z>RZ0 && z<RZ1), msg:'⚠ That is the platform wall — go round to the ramp.'},
             {test:(x,z)=> x<RX0 && z>-3.6 && z<-2.4, msg:'⚠ That is the platform wall — go round to the ramp.'},
             {test:(x,z)=> x>=RX0 && x<RX1-2.5 && ((z>=RZ1 && z<RZ1+.7) || (z<=RZ0 && z>RZ0-.7)), msg:'⚠ Step onto the ramp from its low end.'},
             {test:(x,z)=> x>12.3, msg:'⚠ Stay off the dock — bring the box to the evacuation area.'}] };
  g7Camera([12.5,6.5,2.5],[-1.5,1,-7.5]);
}
function shsRamp(scen){ shsRampScene(scen, false); }
function shsCartRamp(scen){ shsRampScene(scen, true); }

// 4 · TYPHOON · Simple machines — trained responders pry a heavy fallen branch off the
// pathway with a lever on a stable fulcrum; learners keep their distance.
function shsLever(scen){
  shsBridge(scen);
  const BX = -11.5, WZ = 2.4;                      // branch across the path at x = BX; work zone centre z
  g7Clear(BX,1,4.5); g7Clear(-16.5,-5.5,3); g7Clear(-15.5,6.5,2);

  // Fallen branch lying across the path, leaves still on it.
  const branch = new THREE.Group(); branch.position.set(BX,0,-2.4); scene.add(branch);   // pivots about its far end
  const bark = pbr({color:0x5a4030,map:woodTex(),roughness:.92});
  const log = new THREE.Mesh(new THREE.CylinderGeometry(.2,.32,5.2,18), bark); log.rotation.x = Math.PI/2; log.position.set(0,.3,2.6); log.castShadow = true; branch.add(log);
  const leafM = [0x2a5220,0x356628,0x427a30].map(c=>pbr({color:c,roughness:.85,map:leafTex(),rim:.07}));
  for(let i=0;i<9;i++){ const b = new THREE.Mesh(blobGeo(.45+Math.random()*.35,18,.38,i*5+2), leafM[i%3]); b.position.set((Math.random()-.5)*1.6,.4+Math.random()*.6,.2+Math.random()*1.4); b.castShadow = true; branch.add(b); }
  g7Tag('HEAVY FALLEN BRANCH', BX, 2.4, -.8, {size:.62, fg:'#fecaca', border:'#ef4444'});

  // Lever: a long steel bar along z, over a block fulcrum, under the branch's near end.
  const fulcrum = new THREE.Mesh(new THREE.BoxGeometry(.55,.5,.5), pbr({color:0x6b7280, roughness:.9}));
  fulcrum.position.set(BX,.25,3.2); fulcrum.castShadow = true; scene.add(fulcrum);
  g7Tag('FULCRUM', BX+.9, 1.1, 3.2, {size:.5});
  const pivot = new THREE.Group(); pivot.position.set(BX,.55,3.2); scene.add(pivot);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,4.6,12), pbr({color:0x9ca3af, roughness:.35, metalness:.85, rim:.12}));
  bar.rotation.x = Math.PI/2; bar.position.z = 1.3; bar.castShadow = true; pivot.add(bar);   // runs z = 2.2 (under branch) … 6.8 (effort end)
  const responders = [[-.45,6.3,0xea580c],[.45,6.6,0xca8a04]].map(([dx,z,c])=>{ const h = makeHuman(BX+dx,0,z,c); h.rotation.y = Math.PI; scene.add(h); return h; });
  const fIn = shsVArrow(0xfb923c, .9, -1, .07);
  const fOut = shsVArrow(0xef4444, 2, 1, .11);
  const li = g7Label('Effort F_in (small, far from fulcrum)', {size:.52, fg:'#fdba74'}); scene.add(li);
  const lo = g7Label('Load F_out (large, close to fulcrum)', {size:.52, fg:'#fecaca'}); scene.add(lo);
  const lma = g7Label('F_effort · d_effort = F_load · d_load', {size:.62, fg:'#fde047', border:'#facc15'}); lma.position.set(BX,4.6,3); scene.add(lma);
  const zone = g7Decal(g7SoftTex('g7-danger','rgba(239,68,68,.55)','rgba(239,68,68,0)'), 9, 9, BX, .05, WZ);
  zone.material.toneMapped = false;
  g7Tag('WORK AREA · responders only', BX-3.4, 1.4, WZ+3.2, {size:.55, fg:'#fecaca', border:'#ef4444'});
  animCallbacks.push((t)=>{
    zone.material.opacity = .75 + Math.sin(t*3)*.2;
    const push = (Math.sin(t*1.1) + 1)/2;          // responders press down, then ease off
    pivot.rotation.x = -.06 + push*.2;              // effort end down → short end (under branch) up
    branch.rotation.x = -push*.09;                  // near end of the branch lifts
    responders.forEach((h,i)=>{ h.position.y = -push*.08; h.rotation.x = push*.12; });
    fIn.position.set(BX+.8, 1.9 - push*.25, 6.5); fIn.userData.setLen(.7 + push*.2);
    fOut.position.set(BX+.75, .25, 2.2); fOut.userData.setLen(1.6 + push*.5);
    li.position.set(BX+2.9, 2.2, 6.5); lo.position.set(BX+2.9, 2.9, 2.2);
  });

  g7SafePad(-16.5,-5.5,'SAFE SPOT · away from the work');
  g7Human(-15.5,6.5, 0x1e3a8a);
  humanGroup.rotation.y = Math.PI;
  g7Gateway(-16.5,-5.5,0);
  G7 = { bounds:[-19,-6.4,-9,9], camOff:[-5,5,4],
    hazards:[{test:(x,z)=> Math.hypot(x-BX, z-WZ) < 4.4, msg:'⚠ Let the trained responders work the lever — keep a safe distance from the branch!'}] };
  g7Camera([-20.5,6.5,8],[-13,.6,-.4]);
}

// 5 · FLOOD · Physics of fluids — a small boat loaded all on one side tilts at the
// landing, though the total load is within capacity.
function shsTiltBoat(scen){
  shsLanding({ rain:3000 });
  const hg = new THREE.Mesh(new THREE.CylinderGeometry(3.4,3.7,.18,40), pbr({color:0x8f8775,map:g7PathTex('dirt'),roughness:.95}));
  hg.position.set(-5,.06,-8.5); hg.receiveShadow = true; scene.add(hg);
  g7Path([[-12,3],[13.5,3]], 2.4, 0xa29d92, .04, 'concrete');
  g7SafePad(-5,-8.5,'SAFE SPOT');

  const BX = 21.2;                                   // stern just off the end of the landing
  const boat = shsBanca(1.05); boat.position.set(BX,.12,3); scene.add(boat);
  // Passengers and boxes, all on the +z side; `even` is where each goes once spread out.
  const load = [];
  [[-1.5,.38],[0,.42],[1.5,.38]].forEach(([x,z],i)=>{ const h = makeHuman(x,.15,z,[0xb91c1c,0x7c3aed,0xca8a04][i],0x334155,.8); h.rotation.y = .3; boat.add(h); load.push({o:h, from:new THREE.Vector3(x,.15,z), to:new THREE.Vector3(x,.15,0)}); });
  [[-.75,.48],[.75,.48],[.75,.48,.4]].forEach(([x,z,y],i)=>{ const b = shsReliefBox(.8); b.position.set(x,.35+(y||0),z); boat.add(b); load.push({o:b, from:b.position.clone(), to:new THREE.Vector3(i===2?-2.2:x, .35, i===2?0:-.42)}); });
  const fW = shsVArrow(0xfb923c, 1.2, -1, .08);
  const fB = shsVArrow(0x38bdf8, 1.2, 1, .08);
  const lw = g7Label('Weight at the CG', {size:.52, fg:'#fdba74'}); scene.add(lw);
  const lb = g7Label('Buoyant force F_b', {size:.52, fg:'#7dd3fc'}); scene.add(lb);
  const ls = g7Label('LOAD within capacity ✓\nPLACEMENT all on one side ✗', {size:.62, fg:'#fecaca', border:'#ef4444'}); ls.position.set(BX,4,3); scene.add(ls);
  const lt = g7Label('Off-centre weight + buoyancy → torque → TILT', {size:.6, fg:'#fde047'}); lt.position.set(BX,2.9,3); scene.add(lt);
  // Take Control: from the landing the learner has the passengers move to the centre line,
  // then the boxes spread evenly, and checks the boat is level. sp[0] passengers, sp[1] boxes.
  const sp = [0, 0], go = [false, false];
  let relabelled = false;
  animCallbacks.push((t,dt)=>{
    go.forEach((g,i)=>{ if(g) sp[i] = Math.min(1, sp[i] + dt*.6); });
    load.forEach((l,i)=> l.o.position.lerpVectors(l.from, l.to, ease(sp[i < 3 ? 0 : 1])));
    load.forEach((l,i)=>{ if(i < 3) l.o.userData.moving = sp[0] > 0 && sp[0] < 1; });
    const e = (sp[0]*.55 + sp[1]*.45);                          // share of the off-centre load moved
    const heel = (.2 + Math.sin(t*.9)*.04) * (1-e);
    boat.rotation.x = heel + Math.sin(t*1.1)*.02;
    boat.position.y = .12 + Math.sin(t*1.3)*.04;
    const cgz = 3 + .55*(1-e);
    fW.position.set(BX, 1.5, cgz); fB.position.set(BX, -.2, 3);
    lw.position.set(BX+1.6, 1.2, cgz+.4); lb.position.set(BX-1.6, .9, 3);
    if(e > .98 && !relabelled){ relabelled = true; lt.visible = false; }
  });

  g7Human(6,1.2, 0x1e3a8a);
  humanGroup.rotation.y = Math.PI/2;
  g7Gateway(-5,-8.5,0);
  const onDock = (x,z)=> x > 13.1 && x < 17.7 && Math.abs(z-3) < 1.45;
  const end = [17.15, 3];
  G7 = { bounds:[-12,12,-13,9], camOff:[6,4.5,5],
    hazards:[{test:(x,z)=> x>11.5, msg:'⚠ Do not board the tilting boat — wait at the safe spot while the load is spread evenly.'}],
    onControl(){
      G7.bounds = [-12,17.6,-13,9];
      G7.heightAt = (x,z)=> onDock(x,z) ? .33 : 0;
      G7.hazards = [{test:(x,z)=> x > 13.3 && !onDock(x,z), msg:'⚠ Stay on the landing — do not board or step into the water.'}];
    },
    tasks:[
      {at:[17.15, 3.75], face:[BX, 3.4], act:'📣 Ask them to centre', obj:load[1].o, short:'Ask the passengers to sit in the middle', text:'Walk to the end of the landing and ask the passengers to sit along the centre line', done:'Passengers centred — the boat is heeling less',
       run(next){
         humanGroup.userData.pose = 'wave';
         g7Say(humanGroup, 'Please move to the middle of the boat, one by one!', 2400);
         g7Seq([[1200, ()=>{ humanGroup.userData.pose = null; go[0] = true; }], [1900, next]]);
       }},
      {at:[17.15, 2.25], face:[BX, 2.6], act:'📣 Ask to move the boxes', obj:load[4].o, short:'Have the boxes spread evenly', text:'Have the boxes moved so the load is spread evenly', done:'Boxes spread out — weight is balanced on both sides',
       run(next){
         humanGroup.userData.pose = 'wave';
         g7Say(humanGroup, 'Move one box to the bow and one to the other side, please.', 2400);
         g7Seq([[1200, ()=>{ humanGroup.userData.pose = null; go[1] = true; }], [1900, next]]);
       }},
      {at:end, face:[BX, 3], act:'✔ Check the boat', obj:boat, short:'Check it is level and within capacity', text:'Check the boat is level and within capacity', done:'Level and within capacity ✓ — cross only when conditions are safe',
       run(next){
         g7Relabel(ls, 'LOAD spread evenly ✓  Within capacity ✓\nBoat level & stable', {size:.62, fg:'#bbf7d0', border:'#22c55e'});
         setTimeout(next, 900);
       }}],
    finish:[-5,-8.5], finishText:'Wait at the safe spot until conditions are safe to cross' };
  g7Camera([16.5,4.2,11.5],[21,.6,2.6]);
}

// 6 · TYPHOON · Physics of fluids — a sealed container of emergency supplies floats but is
// swept along by fast floodwater.
function shsFloatBox(scen){
  shsRiver({ mood:'storm', wind:scen.wind, rain:7000, rainK:1.4, flow:3 });
  const box = new THREE.Group(); box.scale.setScalar(1.35); scene.add(box);
  const tub = new THREE.Mesh(new THREE.BoxGeometry(1.1,.7,.8), pbr({color:0x2563eb, roughness:.4, rim:.2})); tub.castShadow = true; box.add(tub);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.18,.1,.88), pbr({color:0x1e40af, roughness:.4})); lid.position.y = .38; box.add(lid);
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(.9,.32), new THREE.MeshStandardMaterial({roughness:.6, map:g7Tex(g7Canvas(512,180,(c,W,h)=>{
    c.fillStyle = '#f8fafc'; c.fillRect(0,0,W,h); c.fillStyle = '#b91c1c'; c.fillRect(0,0,W,h*.18); c.fillRect(0,h*.82,W,h*.18);
    c.fillStyle = '#111827'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `800 54px ${G7_FONT}`; c.fillText('EMERGENCY', W/2, h*.5);
  }))}));
  lbl.position.set(-.56,.05,0); lbl.rotation.y = -Math.PI/2; box.add(lbl);
  const ring = g7Decal(g7SoftTex('g7-wake','rgba(240,236,224,.85)','rgba(240,236,224,0)', true), 2.2, 2.2, 0, .1, 0);
  const fB = shsVArrow(0x38bdf8, 1.2, 1, .08);
  const fW = shsVArrow(0xfb923c, 1.2, -1, .08);
  const lb = g7Label('F_b = ρ_water·g·V_displaced', {size:.62, fg:'#7dd3fc'}); scene.add(lb);
  const lw = g7Label('Weight W', {size:.62, fg:'#fdba74'}); scene.add(lw);
  const lk = g7Label('ρ_container < ρ_water → it FLOATS\n…but the fast current carries it away', {size:.66, fg:'#fecaca', border:'#ef4444'}); lk.position.set(2,3.8,0); scene.add(lk);
  const lc = g7Label('FAST CURRENT → downstream', {size:.62, fg:'#e2e8f0'}); lc.position.set(3.2,1.2,-6); scene.add(lc);
  let bz = -12;
  animCallbacks.push((t,dt)=>{
    bz += 3.1*dt; if(bz > 15) bz = -12;
    box.position.set(-2+Math.sin(t*.8)*.4, .16+Math.sin(t*2.6)*.05, bz);
    box.rotation.set(Math.sin(t*2.1)*.12, Math.sin(t*.7)*.5, Math.sin(t*1.7)*.1);
    ring.position.set(box.position.x, .105, bz);
    fB.position.set(box.position.x, .2, bz); fW.position.set(box.position.x+.05, 1.8, bz+.5);
    lb.position.set(box.position.x+2.2, 1.6, bz); lw.position.set(box.position.x+1.3, .2, bz+.5);
  });

  g7SafePad(-11,-9,'SAFE SPOT · away from the river');
  g7Human(-5.8,-3);
  humanGroup.rotation.y = Math.PI/2;
  g7Gateway(-11,-9,Math.PI/2);
  G7 = { bounds:[-15,4,-12,12], camOff:[5,4.5,-3],
    hazards:[{test:(x,z)=> x>-4.7, msg:'⚠ Do not enter the fast floodwater to get the container — step back!'}] };
  g7Camera([-11,5.2,-6.5],[-.5,.3,2.5]);
}

// ═══ GRADE 12 ═══

// 1 · FLOOD · Newton's laws — a boat leaving the bank is pushed sideways by the stronger
// current, off its intended crossing path.
function shsBoatDrift(scen){
  shsRiver({ flow:2.2, rain:4200 });
  const CZ = -5;
  for(let x=-3.6;x<=3.6;x+=1.2) g7Chevron(x, CZ, 0, 0x4ade80);
  g7Tag('INTENDED CROSSING PATH', 0, 1.6, CZ-1.4, {size:.6, fg:'#bbf7d0', border:'#22c55e'});
  // small landing on the near bank
  const dock = new THREE.Mesh(new THREE.BoxGeometry(2.4,.2,2), pbr({color:0x6b4f30,map:woodTex(),roughness:.9}));
  dock.position.set(-5.3,.15,CZ); dock.castShadow = dock.receiveShadow = true; scene.add(dock);
  [[-8,CZ-1.6,0x7c3aed],[-8.6,CZ-.6,0xca8a04]].forEach(([x,z,c])=>{ const h = makeHuman(x,0,z,c); h.rotation.y = Math.PI/2; scene.add(h); });
  g7Tag('Waiting passengers', -8.3, 2.6, CZ-1.1, {size:.5});

  const boat = shsBanca(.62); scene.add(boat);
  const fNet = g7Arrow(0xef4444, 1, .09); fNet.rotation.y = -Math.PI/2; scene.add(fNet);   // points +z, downstream
  const ln = g7Label('ΣF ≠ 0  →  a = ΣF / m  (sideways)', {size:.62, fg:'#fecaca', border:'#ef4444'}); scene.add(ln);
  const lf = g7Label('Push of the current', {size:.52, fg:'#fecaca'}); scene.add(lf);
  const trail = [];
  for(let i=0;i<10;i++){ const d = g7Decal(g7SoftTex('g7-trail','rgba(240,236,224,.5)','rgba(240,236,224,0)'), .8, .8, 0, .09, 0); d.visible = false; trail.push(d); }
  let bt = 0, last = 0, ti = 0;
  animCallbacks.push((t,dt)=>{
    bt += dt; if(bt > 7.5){ bt = 0; trail.forEach(d=> d.visible = false); }
    const rest = 1.2, tt = Math.max(0, bt-rest);
    const bx = -3.4 + Math.min(tt, 6)*.75;          // paddling forward across the river
    const bz = CZ + .5*.32*tt*tt;                   // z = ½·a·t²: the current accelerates it sideways
    boat.position.set(bx, .1+Math.sin(t*1.4)*.04, Math.min(bz, 18));
    boat.rotation.y = -Math.min(.6, tt*.09); boat.rotation.x = Math.sin(t*1.1)*.04;
    fNet.position.set(bx, 1, boat.position.z+.6); fNet.userData.setLen(tt>0 ? 1.4 : .25);
    ln.position.set(bx+1.6, 2.9, boat.position.z+1.2); lf.position.set(bx+1.4, 1.8, boat.position.z+1.8);
    if(tt > 0 && t - last > .45){ last = t; const d = trail[ti++ % trail.length]; d.position.set(bx, .09, boat.position.z); d.visible = true; }
  });

  g7SafePad(-11,-10,'SAFE SPOT · away from the river');
  g7Human(-6.2,CZ+2.2);
  humanGroup.rotation.y = Math.PI/2;
  g7Gateway(-11,-10,Math.PI/2);
  G7 = { bounds:[-15,4,-13,12], camOff:[5,4.5,-3],
    hazards:[{test:(x,z)=> x>-4.7, msg:'⚠ The current pushes boats sideways — postpone the crossing!'},
             {test:(x,z)=> x>-6.6 && Math.abs(z-CZ)<1.1, msg:'⚠ Do not board — the crossing is postponed.'}] };
  g7Camera([-9.5,6.5,9.5],[.5,0,-3.5]);   // downstream, so the sideways drift comes toward the viewer
}

// 4 · TYPHOON · Work and energy — wind lifts a loose metal panel high near the bridge; when
// it falls its potential energy becomes kinetic energy.
function shsPanel(scen){
  shsBridge(scen, 'storm');
  const LX = -11, LZ = 1;                          // where the panel lands
  g7Clear(LX,LZ,3.4); g7Clear(-17,-5.5,3); g7Clear(-15,4,2); g7Clear(-16.5,-1.6,2.2);
  // Kiosk the panel was torn from.
  const kiosk = makeHouse(-12.5,-5.8,3,2.8,2.6,true); scene.add(kiosk);
  const panel = new THREE.Group(); scene.add(panel);
  const sheet = new THREE.Mesh(new THREE.BoxGeometry(1.8,.04,1), pbr({color:0xa1a1aa, map:giTex(), metalness:.6, roughness:.4, rim:.15}));
  sheet.castShadow = true; panel.add(sheet);
  const zone = g7Decal(g7SoftTex('g7-danger','rgba(239,68,68,.55)','rgba(239,68,68,0)'), 6.4, 6.4, LX, .05, LZ);
  zone.material.toneMapped = false;
  g7Tag('POSSIBLE LANDING AREA', LX, 1, LZ+2.4, {size:.55, fg:'#fecaca', border:'#ef4444'});
  const hLine = new THREE.Mesh(new THREE.CylinderGeometry(.02,.02,1,6), new THREE.MeshBasicMaterial({color:0xfacc15, transparent:true, opacity:.8, toneMapped:false})); scene.add(hLine);
  const lh = g7Label('h', {size:.6, fg:'#fde047'}); scene.add(lh);
  const lp = g7Label('PE = mgh', {size:.62, fg:'#fde047', border:'#facc15'}); scene.add(lp);
  const lk = g7Label('Falling: PE → KE = ½mv²', {size:.62, fg:'#fecaca', border:'#ef4444'}); lk.visible = false; scene.add(lk);
  const bars = shsBars(-16.5,-1.6,-.45, ['PE','KE'], [0xfacc15, 0xef4444]);
  const H0 = 5.2;
  let pt = 0;
  animCallbacks.push((t,dt)=>{
    zone.material.opacity = .75 + Math.sin(t*3)*.2;
    pt = (pt + dt) % 7;
    let y, x, z, u;
    if(pt < 4){                                     // held aloft, flapping in the gusts
      y = H0 + Math.sin(t*2.3)*.35; x = LX + Math.sin(t*1.3)*.6; z = LZ + Math.cos(t*1.1)*.4;
      panel.rotation.set(Math.sin(t*3.1)*.5, t*.6, Math.sin(t*2.7)*.4);
      lk.visible = false; lp.visible = true;
    } else if(pt < 5.1){                            // free fall: y = H − ½gt²
      const f = (pt-4)/1.1; y = Math.max(.08, H0*(1-f*f)); x = LX + .4*f; z = LZ;
      panel.rotation.x += dt*6; panel.rotation.z += dt*3;
      lk.visible = true; lp.visible = false;
    } else { y = .08; x = LX + .4; z = LZ; panel.rotation.set(0, panel.rotation.y, 0); }
    panel.position.set(x, y, z);
    u = Math.max(0, (y-.08)/(H0-.08));
    bars.userData.set(u, pt < 4 ? 0 : pt < 5.1 ? 1-u : 0);
    hLine.position.set(x+1.3, y/2, z); hLine.scale.y = Math.max(.01, y);
    lh.position.set(x+1.6, y/2, z); lh.visible = y > .5;
    lp.position.set(x, y+1.1, z); lk.position.set(x, Math.max(1.6, y+1.1), z);
  });
  g7Tag('Energy of the panel', -16.5, 4, -1.6, {size:.5});

  g7SafePad(-17,-5.5,'SAFE SPOT');
  g7Human(-14.8,3.6, 0x1e3a8a);
  humanGroup.rotation.y = Math.PI/2;
  g7Gateway(-17,-5.5,0);
  G7 = { bounds:[-19,-6.4,-9,9], camOff:[-4,5,6],
    hazards:[{test:(x,z)=> Math.hypot(x-LX, z-LZ) < 3.3, msg:'⚠ The panel could fall here — its potential energy becomes kinetic energy. Move away!'}] };
  g7Camera([-21.5,6,9],[-12,2.6,-.5]);
}

// 5 · FLOOD · Momentum — a heavy log and a light container drift at the same velocity
// toward a small boat waiting at the crossing.
function shsMomentum(scen, mode){
  const ke = mode === 'ke';
  shsRiver({ flow:1.8, rain:3800 });
  const BZ = 7;
  const boat = shsBanca(.62); boat.position.set(-1.8,.1,BZ); boat.rotation.y = .1; scene.add(boat);
  const rower = makeHuman(-.6,.15,0,0x065f46,0x334155,.62); rower.rotation.y = -Math.PI/2; boat.add(rower);
  const boatTag = g7Tag(ke ? 'Boat at the landing' : 'Boat waiting at the crossing', -1.8, 2.3, BZ, {size:.52});
  const logG = new THREE.Group(); scene.add(logG);
  const logM = new THREE.Mesh(new THREE.CylinderGeometry(.42,.5,4.2,20), pbr({color:0x5a4030,map:woodTex(),roughness:.92}));
  logM.rotation.z = Math.PI/2; logM.castShadow = true; logG.add(logM);
  [-1,1].forEach(sd=>{ const end = new THREE.Mesh(new THREE.CircleGeometry(.46,20), pbr({color:0xb08a5a, roughness:.9})); end.position.x = sd*2.11; end.rotation.y = sd*Math.PI/2; logG.add(end); });
  const can = new THREE.Group(); scene.add(can);
  if(ke){ const b = g7MakeBottle(); b.scale.setScalar(1.8); b.rotation.y = Math.PI/2; can.add(b); }
  else { const cm = new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.5,18), pbr({color:0xf59e0b, roughness:.4})); cm.rotation.z = Math.PI/2; cm.castShadow = true; can.add(cm); }
  const pLog = g7Arrow(0xef4444, 3.4, .11); pLog.rotation.y = -Math.PI/2; scene.add(pLog);
  const pCan = g7Arrow(0xfacc15, .45, .07); pCan.rotation.y = -Math.PI/2; scene.add(pCan);
  const ll = g7Label(ke ? 'LOG: large m → large KE = ½mv²' : 'LOG: large m → large p = mv', {size:.6, fg:'#fecaca', border:'#ef4444'}); scene.add(ll);
  const lc = g7Label(ke ? 'Bottle: small m → small KE' : 'Container: small m → small p', {size:.54, fg:'#fde047'}); scene.add(lc);
  const lv = g7Label('Same velocity v', {size:.55}); scene.add(lv);
  const bars = shsBars(7,1.5,-1, ke ? ['KE log','KE bottle'] : ['p log','p can'], [0xef4444, 0xfacc15]); bars.userData.set(1, ke ? .04 : .1);
  // The log drifts down the lane x ≈ 0.2 (its ends at −1.9 … 2.3), the small object at x ≈ 3.4.
  // The safe decision moves the boat out of that lane: it turns and moors alongside the near
  // bank (hull centre x = −3.6, outriggers −4.65 … −2.55, clear of the log and of the bank).
  const LX = .2, CX = 3.4;
  let z = -24, away = 0, going = false;
  animCallbacks.push((t,dt)=>{
    if(going || (ke && ctrl.on)) away = Math.min(1, away + dt*.3);
    z += 2.1*dt;
    const stop = BZ - 2.6 + away*12;
    if(z > Math.min(stop, 24)){ z = -24; }
    logG.position.set(LX, .14+Math.sin(t*1.7)*.04, z); logG.rotation.y = Math.sin(t*.4)*.08;
    can.position.set(CX, .14+Math.sin(t*2.3+1)*.05, z); can.rotation.x += dt*1.4;
    pLog.position.set(LX, 1.15, z+.2); pCan.position.set(CX, .8, z+.2);
    ll.position.set(LX, 2.2, z); lc.position.set(CX+.2, 1.5, z); lv.position.set(1.5, 3, z);
    const e = ease(away);
    boat.position.set(-1.8 - e*1.8, .1 + Math.sin(t*1.3)*.04, BZ + e*1.6); boat.rotation.y = .1 + e*(Math.PI/2 - .1);
    boatTag.position.set(boat.position.x, 2.3, boat.position.z);
    if(away > .99 && !boatTag.userData.moved){ boatTag.userData.moved = true; g7Relabel(boatTag, ke ? 'Boat moved out of the log’s path' : 'Crossing postponed · boat out of the log’s path', {size:.52, pin:true, bg:'rgba(20,83,45,.92)', border:'#4ade80'}); }
  });
  g7Tag(ke ? 'Kinetic energy KE = ½mv²' : 'Momentum p = mv', 7, 4, 1.5, {size:.5});

  g7SafePad(-11,-6,'SAFE SPOT · away from the river');
  g7Human(-5.9,3.2);
  humanGroup.rotation.y = Math.PI/2;
  g7Gateway(-11,-6,Math.PI/2);
  G7 = { bounds:[-15,4,-12,12], camOff:[5,4.5,-3],
    hazards:[{test:(x,z)=> x>-4.7, msg: ke ? '⚠ The log carries far more kinetic energy — stay away from its path!' : '⚠ The log has far more momentum — stay out of its path and postpone crossing!'}] };
  // Momentum items: the learner warns the boat operator, who postpones the crossing and moves aside.
  if(!ke) Object.assign(G7, {
    tasks:[
      {at:[-5.45, BZ-.9], face:[-1.8, BZ], act:'📣 Warn the operator', obj:rower, short:'Warn the boat operator', text:'Go to the riverbank by the boat and warn the operator to postpone the crossing',
       done:'The operator postponed the crossing and is moving out of the log’s path',
       run(next){
         humanGroup.userData.pose = 'wave';
         g7Say(humanGroup, 'Wait! A big log is drifting this way — don’t cross yet!', 2600);
         g7Seq([[1600, ()=>{ humanGroup.userData.pose = null; g7Say(rower, 'Thanks — I’ll move out of its path and wait!', 2600, {border:'#4ade80', h:1.6}); going = true; }],
                [1200, next]]);
       }}],
    finish:[-11,-6], finishRot:Math.PI/2, finishText:'Now move away from the river to the safe spot' });
  g7Camera([-9,6.5,15],[.5,0,-1]);   // downstream: the log drifts toward the boat and the viewer
}

// Force–time sketch for the barrier scene: the same area (impulse) as a tall, narrow spike
// without padding and a low, wide hump with it.
function shsDrawImpulse(c, W, H, labels){
  labels = labels || ['no padding', 'padding: longer Δt, smaller F'];
  c.fillStyle = 'rgba(10,18,34,.9)'; g7RR(c,0,0,W,H,36); c.fill();
  c.fillStyle = '#e2e8f0'; c.font = `800 46px ${G7_FONT}`; c.textAlign = 'center'; c.fillText('Same impulse  J = F·Δt = Δp', W/2, 64);
  const x0 = 70, y0 = H-70, gw = W-120, gh = H-170;
  c.strokeStyle = '#94a3b8'; c.lineWidth = 5; c.beginPath(); c.moveTo(x0,y0-gh); c.lineTo(x0,y0); c.lineTo(x0+gw,y0); c.stroke();
  c.fillStyle = '#94a3b8'; c.font = `700 34px ${G7_FONT}`; c.textAlign = 'left'; c.fillText('F', x0-44, y0-gh+20); c.fillText('t', x0+gw-20, y0+44);
  const curve = (col, w, h, lbl, lx)=>{
    c.beginPath(); c.moveTo(x0+20, y0);
    for(let i=0;i<=60;i++){ const u = i/60; c.lineTo(x0+20+u*w, y0 - Math.sin(u*Math.PI)*h); }
    c.closePath(); c.fillStyle = col.replace('1)', '.28)'); c.fill(); c.strokeStyle = col; c.lineWidth = 7; c.stroke();
    c.fillStyle = col; c.font = `800 34px ${G7_FONT}`; c.fillText(lbl, lx, y0 - h - 16);
  };
  curve('rgba(239,68,68,1)', gw*.16, gh*.92, labels[0], x0+30);
  curve('rgba(74,222,128,1)', gw*.72, gh*.3, labels[1], x0+gw*.3);
}

// 6 · TYPHOON · Impulse — windblown debris strikes a padded barrier beside the pathway;
// the padding stretches the stopping time.
function shsBarrier(scen){
  shsBridge(scen, 'storm');
  const BXc = -11, BZc = -1.9;                     // barrier centre (runs along x, faces −z)
  g7Clear(BXc,-3,4.5); g7Clear(-17.5,6.5,3); g7Clear(-12,4.5,2); g7Clear(-14,-8,2.5);
  const frame = pbr({color:0x475569, roughness:.45, metalness:.6, rim:.1});
  [-2.6,2.6].forEach(dx=>{ const p = new THREE.Mesh(new THREE.BoxGeometry(.16,2.4,.16), frame); p.position.set(BXc+dx,1.2,BZc+.2); p.castShadow = true; scene.add(p); });
  const back = new THREE.Mesh(new THREE.BoxGeometry(5.4,2,.1), frame); back.position.set(BXc,1.15,BZc+.25); back.castShadow = true; scene.add(back);
  const padM = pbr({color:0xf97316, roughness:.9, rim:.08});
  const pads = [];
  for(let i=0;i<4;i++){ const p = new THREE.Mesh(new THREE.BoxGeometry(1.2,1.8,.4), padM); p.position.set(BXc-1.95+i*1.3,1.15,BZc); p.castShadow = true; scene.add(p); pads.push(p); }
  g7Tag('PADDED BARRIER', BXc, 3, BZc, {size:.6});
  const graph = new THREE.Sprite(new THREE.SpriteMaterial({map:g7Tex(g7Canvas(1024,560,shsDrawImpulse)), transparent:true, depthTest:false, toneMapped:false}));
  graph.scale.set(3.6,1.97,1); graph.position.set(BXc-1,4.9,BZc-1); graph.renderOrder = 20; graph.userData.base = graph.scale.clone(); scene.add(graph); G7_LABELS.push(graph);
  const zone = g7Decal(g7SoftTex('g7-danger','rgba(239,68,68,.55)','rgba(239,68,68,0)'), 8, 9, BXc, .05, -1.4);
  zone.material.toneMapped = false;
  g7Tag('COLLISION AREA', BXc+3.6, .9, -4.5, {size:.52, fg:'#fecaca', border:'#ef4444'});

  // Debris: a plank flung on the wind toward the pathway, stopped by the padding.
  const deb = new THREE.Mesh(new THREE.BoxGeometry(1.1,.12,.35), pbr({color:0x8a6236, map:woodTex(), roughness:.88}));
  deb.castShadow = true; scene.add(deb);
  const pArrow = g7Arrow(0xfacc15, 1, .07); pArrow.rotation.y = -Math.PI/2; scene.add(pArrow);
  const lpd = g7Label('Δp fixed  ·  F_avg = Δp / Δt', {size:.55, fg:'#fde047'}); scene.add(lpd);
  const hit = pads[1];
  let dt0 = 0;
  animCallbacks.push((t,dt)=>{
    zone.material.opacity = .75 + Math.sin(t*3)*.2;
    dt0 = (dt0 + dt) % 5.5;
    let z, y, squash = 0;
    if(dt0 < 1.4){ const f = dt0/1.4; z = -8.5 + f*(BZc-.45+8.5); y = 2.2 + Math.sin(f*Math.PI)*.6; deb.rotation.y += dt*8; }
    else if(dt0 < 2.3){ const f = (dt0-1.4)/.9; squash = Math.sin(f*Math.PI*.5)*(1-f*.4); z = BZc - .45 + squash*.28; y = 1.5; }   // stopping over a longer Δt
    else if(dt0 < 3){ const f = (dt0-2.3)/.7; z = BZc-.6; y = 1.5 - f*f*1.4; squash = (1-f)*.3; }
    else { z = BZc-.6; y = .1; }
    deb.position.set(hit.position.x, y, z);
    hit.scale.z = 1 - squash*.55; hit.position.z = BZc + squash*.11;
    pArrow.visible = dt0 < 1.4; pArrow.position.set(hit.position.x, y+.4, z); pArrow.userData.setLen(1.2);
    lpd.position.set(hit.position.x-.3, 3.7, BZc-1.2); lpd.visible = dt0 >= 1.4 && dt0 < 3;
  });

  g7SafePad(-17.5,6.5,'SAFE SPOT');
  g7Human(-12,4.5, 0x1e3a8a);
  humanGroup.rotation.y = -Math.PI/2;
  g7Gateway(-17.5,6.5,0);
  G7 = { bounds:[-19,-6.4,-9,9], camOff:[0,5,7],
    hazards:[{test:(x,z)=> x>-15.2 && x<-6.8 && z>-6.5 && z<2.8, msg:'⚠ Stay away from the collision area — the padding softens impacts, but debris can still fly past!'}] };
  g7Camera([-19,5.5,-8.5],[-11,1.8,0]);
}

Object.assign(G7_SCENES, {
  drum:shsDrum, wheel:shsWheel, ramp:shsRamp, lever:shsLever, tiltboat:shsTiltBoat, floatbox:shsFloatBox,
  boatdrift:shsBoatDrift, cartramp:shsCartRamp, panel:shsPanel, momentum:shsMomentum, barrier:shsBarrier
});
