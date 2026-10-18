'use strict';
// ═══════════════════════════════════════════════
//  GRADE 7 — one purpose-built scene per decision item
// ═══════════════════════════════════════════════
// Each of the six Appendix F items describes a specific situation (a trash bin pushed
// by floodwater, a sign tilting in the wind, two routes, a fallen tree, a floating
// bottle, a run of weather updates), so each gets its own scene that shows exactly
// that, with the physics made visible (force arrows, equal-time markers, a
// displacement arrow, a live wind bulletin).
//
// The "take control" phase is also scenario-specific: G7.hazards are areas the correct
// decision says to stay out of (the bin's path, the sign's fall zone, the flooded
// route, the fallen tree, the river, the bridge). Walking into one is refused with a
// warning, so the student physically carries out the safe decision to reach the gateway.
//
// Visual quality notes (the "premium" pass):
//  · Every canvas texture here is sRGB-encoded and trilinear-mipmapped with max
//    anisotropy, so labels, signs and ground stay crisp and never shimmer or go jagged
//    when they shrink into the distance. Labels and arrows also skip tone mapping, so
//    their colours stay exactly as designed instead of being washed out by ACES.
//  · Real-world objects are modelled as the thing a learner would recognise on sight —
//    a wheeled plastic trash bin, a metal road sign on chains, warning and route signs,
//    an uprooted tree behind striped barricades, a PET bottle, a weather board with a
//    spinning anemometer — rather than abstract primitives.
//  · Paths, floodwater and safe zones have soft, worn edges instead of hard rectangles.

let G7 = null; // { hazards, bounds, camOff, onControl } for the current Grade 7 scene
// Every floating label in the current scene. Sprites grow as the camera nears them, so
// once the chase camera passed close to one (e.g. "UNBALANCED FORCES…" over the trash
// bin) it filled the whole screen and hid the simulation. g7LabelGuard() caps each
// label at the size it has from G7_LABEL_NEAR units away and fades it out when the
// camera is practically on top of it.
let G7_LABELS = [];
const G7_LABEL_NEAR = 10;
const _g7wp = new THREE.Vector3();
function g7LabelGuard(){
  for(let i=G7_LABELS.length-1;i>=0;i--){
    const l = G7_LABELS[i];
    let root = l; while(root.parent) root = root.parent;
    if(root !== scene){ G7_LABELS.splice(i,1); continue; }   // removed (e.g. the bottle's time markers)
    if(!l.visible) continue;
    l.getWorldPosition(_g7wp);
    const d = _g7wp.distanceTo(camera.position);
    const k = d < G7_LABEL_NEAR ? Math.max(.05, d / G7_LABEL_NEAR) : 1;
    const b = l.userData.base;
    l.scale.set(b.x*k, b.y*k, 1);
    l.material.opacity = Math.min(1, Math.max(0, (d - 1.2) / 2.3));
  }
}

// ─── texture helpers ───
function g7Tex(cv, repeat){
  const t = new THREE.CanvasTexture(cv);
  t.encoding = THREE.sRGBEncoding;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  if(renderer && renderer.capabilities) t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if(repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}
function g7Canvas(w, h, draw){
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  return cv;
}
// Per-pixel generated texture (smooth value noise from the engine), cached by key.
function g7PixTex(key, w, h, fn, repeat){
  if(texCache[key]) return texCache[key];
  const cv = g7Canvas(w, h, (ctx)=>{
    const img = ctx.createImageData(w, h);
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){
      const i = (y*w+x)*4, c = fn(x/w, y/h);
      img.data[i]=c[0]; img.data[i+1]=c[1]; img.data[i+2]=c[2]; img.data[i+3]=c.length>3?c[3]:255;
    }
    ctx.putImageData(img, 0, 0);
  });
  return (texCache[key] = g7Tex(cv, repeat));
}
function g7RR(ctx, x, y, w, h, r){
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}
const G7_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// Natural ground: blended grass, dry patches and bare soil at several scales (no
// repeating sine pattern), seamlessly tiling.
function g7GroundTex(){
  return g7PixTex('g7-ground-v2', 512, 512, (u,v)=>{
    const m = fbm(u,v,4,101), d = fbm(u,v,16,103), f = vnoise(u,v,64,107);
    const g = [78,104,48], dk = [54,78,34], dry = [118,118,66], soil = [104,86,60];
    const t1 = Math.min(1, Math.max(0, (m-.38)*2.2));
    const t2 = Math.min(1, Math.max(0, (d-.62)*3.2));
    const r = [0,1,2].map(k=>{
      let c = dk[k] + (g[k]-dk[k])*t1;
      c = c + (dry[k]-c)*t2*.55;
      c = c + (soil[k]-c)*Math.max(0, (.34-m)*2.4);
      return c * (.88 + f*.22);
    });
    return r;
  }, true);
}
// A path texture: worn surface with ragged, soft edges across u (alpha fades out), so a
// path blends into the grass instead of ending in a hard slab edge.
function g7PathTex(kind){
  return g7PixTex('g7-path-'+kind, 128, 512, (u,v)=>{
    const e = Math.min(u, 1-u);
    const rag = .1 + vnoise(u*.2, v, 32, kind==='dirt'?7:9)*.12;
    const a = Math.max(0, Math.min(1, (e-.02)/rag));
    const n = fbm(u, v, 8, 13), s = vnoise(u, v, 48, 17);
    let c;
    if(kind==='concrete'){
      const crack = Math.abs(((v*6)%1)-.5) < .006 ? .72 : 1;
      const b = (196 + (n-.5)*34 + (s-.5)*18) * crack;
      c = [b, b*.985, b*.95];
    } else {
      const rut = 1 - Math.exp(-Math.pow((u-.32)/.06,2))*.12 - Math.exp(-Math.pow((u-.68)/.06,2))*.12;
      c = [(176 + (n-.5)*44 + (s-.5)*22)*rut, (150 + (n-.5)*38 + (s-.5)*18)*rut, (112 + (n-.5)*30 + (s-.5)*14)*rut];
    }
    return [c[0], c[1], c[2], a*255];
  }, true);
}
// Soft radial blob used for wet ground, wakes and shadows.
function g7SoftTex(key, inner, outer, ring){
  if(texCache[key]) return texCache[key];
  const cv = g7Canvas(256, 256, (ctx, w)=>{
    const g = ctx.createRadialGradient(w/2,w/2,0, w/2,w/2,w/2);
    if(ring){ g.addColorStop(0,'rgba(255,255,255,0)'); g.addColorStop(.62,'rgba(255,255,255,0)'); g.addColorStop(.8,inner); g.addColorStop(1,outer); }
    else { g.addColorStop(0,inner); g.addColorStop(1,outer); }
    ctx.fillStyle = g; ctx.fillRect(0,0,w,w);
  });
  return (texCache[key] = g7Tex(cv));
}

// ─── labels ───
// Crisp floating label: drawn at 2× on a canvas with a soft drop shadow, mipmapped, and
// exempt from tone mapping. o.pin draws a pointer at the bottom and anchors the sprite
// at that tip, so the label sits on top of the thing it names.
function g7LabelCanvas(text, o){
  const lines = String(text).split('\n');
  const S = 2, fs = 32*S, pad = 20*S, lh = fs*1.22, r = 16*S, m = 12*S;
  const pin = o.pin ? 16*S : 0, acc = o.accent ? 10*S : 0;
  const font = `700 ${fs}px ${G7_FONT}`;
  const meas = document.createElement('canvas').getContext('2d'); meas.font = font;
  const tw = Math.ceil(Math.max(...lines.map(l=>meas.measureText(l).width)));
  const bw = tw + pad*2 + acc, bh = Math.ceil(lines.length*lh + pad*1.05);
  const w = bw + m*2, h = bh + m*2 + pin;
  const cv = g7Canvas(w, h, (ctx)=>{
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 10*S; ctx.shadowOffsetY = 3*S;
    ctx.fillStyle = o.bg || 'rgba(10,18,34,.86)';
    g7RR(ctx, m, m, bw, bh, r); ctx.fill();
    if(pin){ ctx.beginPath(); ctx.moveTo(w/2-pin*.8, m+bh-1); ctx.lineTo(w/2, m+bh+pin); ctx.lineTo(w/2+pin*.8, m+bh-1); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    // subtle top sheen
    const sh = ctx.createLinearGradient(0, m, 0, m+bh);
    sh.addColorStop(0,'rgba(255,255,255,.10)'); sh.addColorStop(.5,'rgba(255,255,255,0)');
    ctx.fillStyle = sh; g7RR(ctx, m, m, bw, bh, r); ctx.fill();
    if(o.border){ ctx.strokeStyle = o.border; ctx.lineWidth = 2.5*S; g7RR(ctx, m+1.25*S, m+1.25*S, bw-2.5*S, bh-2.5*S, r-1.25*S); ctx.stroke(); }
    if(acc){ ctx.fillStyle = o.accent; g7RR(ctx, m+6*S, m+8*S, 5*S, bh-16*S, 2.5*S); ctx.fill(); }
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = o.fg || '#ffffff';
    lines.forEach((l,i)=> ctx.fillText(l, m + acc + (bw-acc)/2, m + pad*.55 + lh*(i+.5)));
  });
  return { cv, w, h, fs, m };
}
function g7Label(text, o){
  o = o || {};
  const L = g7LabelCanvas(text, o);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({map:g7Tex(L.cv), transparent:true, depthTest:false, depthWrite:false, toneMapped:false}));
  const k = (o.size||1) * .47 / L.fs;
  spr.scale.set(L.w*k, L.h*k, 1);
  spr.userData.base = spr.scale.clone();
  if(o.pin) spr.center.set(.5, L.m/L.h);
  spr.renderOrder = 20;
  G7_LABELS.push(spr);
  return spr;
}
// Replaces a label's canvas (for live-updating signs like the wind bulletin).
function g7Relabel(spr, text, o){
  const n = g7Label(text, o);
  spr.material.map.dispose(); spr.material.map = n.material.map; spr.material.needsUpdate = true;
  spr.scale.copy(n.scale); spr.center.copy(n.center);
  spr.userData.base = n.userData.base;
  G7_LABELS.splice(G7_LABELS.indexOf(n), 1);       // the temporary label isn't in the scene
  n.material.dispose();
}
// Pinned tag pointing down at (x,y,z) — e.g. naming an object right above it.
function g7Tag(text, x, y, z, o){
  const l = g7Label(text, Object.assign({pin:true}, o||{}));
  l.position.set(x, y, z); scene.add(l);
  return l;
}

// ─── small builders ───
// Horizontal arrow pointing along +x of its group; set .userData.setLen(l) to resize.
function g7Arrow(color, len, thick){
  thick = thick || .07;
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({color, transparent:true, opacity:.95, depthTest:false, toneMapped:false});
  const om = new THREE.MeshBasicMaterial({color:0x0b1220, transparent:true, opacity:.55, depthTest:false, side:THREE.BackSide});
  const sh = new THREE.Mesh(new THREE.CylinderGeometry(thick,thick,1,20), m);
  sh.rotation.z = Math.PI/2;
  const tp = new THREE.Mesh(new THREE.ConeGeometry(thick*2.6,thick*6,24), m);
  tp.rotation.z = -Math.PI/2;
  // dark outline shell so the arrow reads against bright sky and pale water alike
  const sho = new THREE.Mesh(sh.geometry, om); sho.rotation.z = Math.PI/2; sho.scale.set(1.45,1,1.45);
  const tpo = new THREE.Mesh(tp.geometry, om); tpo.rotation.z = -Math.PI/2; tpo.scale.setScalar(1.18);
  sho.renderOrder = tpo.renderOrder = 18;
  sh.renderOrder = tp.renderOrder = 19;
  g.add(sho, tpo, sh, tp);
  g.userData.setLen = (l)=>{
    sh.scale.y = sho.scale.y = Math.max(.01,l); sh.position.x = sho.position.x = l/2;
    tp.position.x = tpo.position.x = l + thick*3;
  };
  g.userData.setLen(len);
  return g;
}
// Path strip through a list of [x,z] points, with soft worn edges.
function g7Path(pts, width, color, y, kind){
  const g = new THREE.Group();
  const tex = g7PathTex(kind || 'dirt');
  const m = new THREE.MeshStandardMaterial({color:new THREE.Color(color).lerp(new THREE.Color(0xffffff),.35), map:tex,
    roughness:.96, transparent:true, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2});
  for(let i=0;i<pts.length-1;i++){
    const [x0,z0] = pts[i], [x1,z1] = pts[i+1];
    const len = Math.hypot(x1-x0, z1-z0) + width*.7;
    const geo = new THREE.PlaneGeometry(width*1.25, len, 1, 1);
    const uv = geo.attributes.uv;
    for(let k=0;k<uv.count;k++) uv.setY(k, uv.getY(k)*len/(width*2.5) + i*.37);
    geo.rotateX(-Math.PI/2);
    const seg = new THREE.Mesh(geo, m);
    seg.position.set((x0+x1)/2, (y||.03)+i*.002, (z0+z1)/2);
    seg.rotation.y = Math.atan2(x1-x0, z1-z0);
    seg.receiveShadow = true;
    g.add(seg);
  }
  scene.add(g);
  return g;
}
function g7Flag(x,z,color){
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.03,.035,1.6,14), pbr({color:0xdddddd,roughness:.4,metalness:.5}));
  pole.position.y = .8; pole.castShadow = true; g.add(pole);
  const geo = new THREE.PlaneGeometry(.55,.34,10,4);
  const cloth = new THREE.Mesh(geo, pbr({color, side:THREE.DoubleSide, roughness:.8, rim:.1}));
  cloth.position.set(.29,1.42,0); cloth.castShadow = true; g.add(cloth);
  const base = geo.attributes.position.array.slice();
  const ph = Math.random()*6.28;
  animCallbacks.push((t)=>{
    const p = geo.attributes.position.array, sp = 6 + G10Wind*.05;
    for(let i=0;i<p.length;i+=3){ const u = (base[i]+.275)/.55; p[i+2] = Math.sin(t*sp + u*5 + ph)*.07*u; }
    geo.attributes.position.needsUpdate = true; geo.computeVertexNormals();
  });
  g.position.set(x,0,z);
  scene.add(g);
  return g;
}
// Ground chevron pointing along +x of its group.
function g7Chevron(x,z,rotY,color){
  const s = new THREE.Shape();
  s.moveTo(-.35,-.4); s.lineTo(.05,0); s.lineTo(-.35,.4); s.lineTo(-.1,.4); s.lineTo(.3,0); s.lineTo(-.1,-.4);
  const m = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshBasicMaterial({color, transparent:true, opacity:.9, side:THREE.DoubleSide, depthWrite:false, toneMapped:false,
    polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-4}));
  m.rotation.x = -Math.PI/2;
  const g = new THREE.Group(); g.add(m);
  g.position.set(x,.08,z); g.rotation.y = rotY||0;
  const ph = x*.4+z*.3;
  animCallbacks.push((t)=>{ m.material.opacity = .5 + Math.sin(t*3-ph)*.35; });
  scene.add(g);
  return g;
}
// Flat decal on the ground (wet patches, wakes, safe-zone rings).
function g7Decal(tex, w, d, x, y, z, color, opacity){
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({map:tex, color:color||0xffffff, transparent:true,
    opacity:opacity==null?1:opacity, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-3, polygonOffsetUnits:-3}));
  m.rotation.x = -Math.PI/2; m.position.set(x, y, z);
  scene.add(m);
  return m;
}
function g7SafePad(x,z,label){
  const fill = g7Decal(g7SoftTex('g7-safe-fill','rgba(74,222,128,.42)','rgba(74,222,128,0)'), 5, 5, x, .06, z);
  const ring = g7Decal(g7SoftTex('g7-safe-ring','rgba(134,239,172,.95)','rgba(134,239,172,0)', true), 4.6, 4.6, x, .07, z);
  ring.material.toneMapped = fill.material.toneMapped = false;
  const pulse = g7Decal(g7SoftTex('g7-safe-ring','rgba(134,239,172,.95)','rgba(134,239,172,0)', true), 4.6, 4.6, x, .075, z);
  pulse.material.toneMapped = false;
  animCallbacks.push((t)=>{ const f = (t*.6)%1; pulse.scale.setScalar(1+f*.6); pulse.material.opacity = (1-f)*.7; });
  g7Tag(label||'SAFE SPOT', x, 5.1, z, {bg:'rgba(20,83,45,.92)', border:'#4ade80', size:.85});
}
function g7Human(x,z,shirt){
  humanGroup = makeHuman(x,0,z, shirt||0x1e3a8a);
  humanGroup.userData.baseY = 0;
  scene.add(humanGroup);
  // soft contact shadow keeps the figure grounded even where the shadow map is faint
  const cs = new THREE.Mesh(new THREE.PlaneGeometry(.9,.9), new THREE.MeshBasicMaterial({map:g7SoftTex('g7-contact','rgba(0,0,0,.45)','rgba(0,0,0,0)'), transparent:true, depthWrite:false}));
  cs.rotation.x = -Math.PI/2; cs.position.y = .02; humanGroup.add(cs);
  return humanGroup;
}
// Removes shared-scene dressing (trees, bushes, huts) standing where a Grade 7 prop or
// safe zone needs a clear line of sight. Never touches the learner, bridge or gateway.
function g7Clear(x, z, r){
  scene.children.slice().forEach(o=>{
    if(!o.isGroup || o===humanGroup || o===bridgeGroup || o===gatewayGroup) return;
    if(Math.hypot(o.position.x-x, o.position.z-z) < r){ scene.remove(o); dispose(o); }
  });
}
function g7Gateway(x,z,rotY){
  if(gatewayGroup) scene.remove(gatewayGroup);   // the shared bridge scene adds its own
  gatewayGroup = makeGateway(x,2.3,z,0x38bdf8);
  gatewayGroup.rotation.y = rotY||0;
  scene.add(gatewayGroup);
}
function g7Camera(base, look){
  cam.base.set(...base); cam.look.set(...look);
  cam.target.copy(cam.base); camera.position.copy(cam.base);
}
// Physical sign on one or two posts, face drawn on a canvas. Faces +z of its group.
// o: {w,h (board size), post:height to board bottom, draw(ctx,W,H), double:true for two posts}
function g7Signboard(x, z, rotY, o){
  const g = new THREE.Group();
  const W = 1024, H = Math.round(1024*o.h/o.w);
  const face = new THREE.MeshStandardMaterial({map:g7Tex(g7Canvas(W, H, (ctx)=>o.draw(ctx, W, H))), roughness:.55, metalness:.1});
  const back = pbr({color:0x9aa3ad, roughness:.4, metalness:.7, rim:.1});
  const board = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, .05), [back, back, back, back, face, back]);
  const post = o.post==null ? 1.4 : o.post;
  board.position.y = post + o.h/2; board.castShadow = true; g.add(board);
  const pm = pbr({color:0x7b838c, roughness:.45, metalness:.75, rim:.12});
  const xs = o.double ? [-o.w*.36, o.w*.36] : [0];
  xs.forEach(px=>{
    const p = new THREE.Mesh(new THREE.CylinderGeometry(.045,.05,post+o.h*.92,16), pm);
    p.position.set(px, (post+o.h*.92)/2, -.05); p.castShadow = true; g.add(p);
  });
  g.position.set(x, 0, z); g.rotation.y = rotY||0;
  scene.add(g);
  g.userData.board = board; g.userData.face = face;
  return g;
}
// Striped road barricade (sawhorse) — reads instantly as "blocked, do not pass".
function g7Barricade(x, z, rotY){
  const g = new THREE.Group();
  const stripe = g7Tex(g7Canvas(512, 96, (ctx, w, h)=>{
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0,0,w,h);
    ctx.fillStyle = '#ea580c';
    for(let i=-2;i<12;i++){ ctx.beginPath(); ctx.moveTo(i*64,h); ctx.lineTo(i*64+32,h); ctx.lineTo(i*64+32+h*.7,0); ctx.lineTo(i*64+h*.7,0); ctx.fill(); }
  }));
  const bm = new THREE.MeshStandardMaterial({map:stripe, roughness:.5});
  [.95,.6].forEach(y=>{ const b = new THREE.Mesh(new THREE.BoxGeometry(2,.22,.05), bm); b.position.y = y; b.castShadow = true; g.add(b); });
  const lm = pbr({color:0x334155, roughness:.6, metalness:.4});
  [-.85,.85].forEach(x0=>[-1,1].forEach(sd=>{
    const l = new THREE.Mesh(new THREE.BoxGeometry(.06,1.15,.06), lm);
    l.position.set(x0, .55, sd*.16); l.rotation.x = sd*.28; l.castShadow = true; g.add(l);
  }));
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.06,16,12), new THREE.MeshBasicMaterial({color:0xfbbf24, toneMapped:false}));
  lamp.position.set(-.85,1.12,0); g.add(lamp);
  animCallbacks.push((t)=>{ lamp.visible = Math.sin(t*6+x)>-.2; });
  g.position.set(x,0,z); g.rotation.y = rotY||0;
  scene.add(g);
  return g;
}
// Warning-sign face: yellow diamond/triangle style with a pictogram drawer.
function g7DrawWarning(ctx, W, H, title, sub, pict){
  ctx.fillStyle = '#facc15'; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle = '#111827'; ctx.lineWidth = W*.03; g7RR(ctx, W*.03, H*.03, W*.94, H*.94, W*.05); ctx.stroke();
  if(pict) pict(ctx, W*.5, H*.36, H*.22);
  ctx.fillStyle = '#111827'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `800 ${Math.round(H*.15)}px ${G7_FONT}`; ctx.fillText(title, W/2, H*.7);
  if(sub){ ctx.font = `700 ${Math.round(H*.09)}px ${G7_FONT}`; ctx.fillText(sub, W/2, H*.85); }
}
// Common village dressing on flat ground at y=0. keepOut(x,z) → true where the
// scatter (grass tufts) should not go, e.g. paths and water.
function g7World(opt){
  G10Wind = opt.wind || 0;
  const mood = opt.mood || 'overcast';
  setupLighting(mood);
  g7Light(mood);
  skyDome(mood==='storm'?0x2a3646:0x7f8fa2, mood==='storm'?0x56606e:0xc3cad3);
  const gt = g7GroundTex(); gt.repeat.set(14,14);
  // Large-scale tonal variation in vertex colour on top of the tiling texture, so the
  // field never shows an obvious repeat.
  const geo = new THREE.PlaneGeometry(90,90,72,72); geo.rotateX(-Math.PI/2);
  const pos = geo.attributes.position, cols = new Float32Array(pos.count*3);
  for(let i=0;i<pos.count;i++){
    const px = pos.getX(i), pz = pos.getZ(i);
    let k = .78 + fbm(px*.012+.5, pz*.012+.5, 4, 211)*.4;
    if(opt.wet && opt.wet(px,pz)) k *= .72;          // darker, soaked soil next to water
    cols[i*3] = k*.97; cols[i*3+1] = k; cols[i*3+2] = k*.94;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols,3));
  const ground = new THREE.Mesh(geo, pbr({color:0xffffff, map:gt, vertexColors:true, roughness:.97, rim:0}));
  ground.receiveShadow = true; scene.add(ground);
  addGroundCover({ w:60, d:60, n:620, grass:0x5a8a3c, weed:0x6f9a48,
    ok:(x,z)=> !(opt.keepOut && opt.keepOut(x,z)) });
  (opt.houses||[]).forEach(([x,z,ry,kubo])=>{
    const h = makeHouse(x,z,3.6+Math.random(),3.2+Math.random(),3.6+Math.random(), kubo);
    if(ry!==undefined) h.rotation.y = ry;
    scene.add(h);
  });
  (opt.trees||[]).forEach(([x,z,type])=>scene.add(type==='banana'?makeBanana(x,z,1):type==='bamboo'?makeBambooClump(x,z,1):makeTree(x,z,1.1,type)));
  (opt.bushes||[]).forEach(([x,z])=>scene.add(makeBush(x,z,1.1)));
  if(opt.rain) { rain = makeRain(opt.rain,60,30,60,opt.rainK||1); scene.add(rain); }
  if(opt.wind) addWindDebris(opt.wind);
  return mood;
}
// Grade 7 lighting balance: less flat ambient fill and a stronger key light, so forms
// have real light-and-shadow modelling instead of a uniform grey wash, and objects
// separate clearly from the ground.
function g7Light(mood){
  scene.children.forEach(o=>{
    if(o.isAmbientLight) o.intensity *= .55;
    else if(o.isHemisphereLight) o.intensity *= 1.05;
    else if(o.isDirectionalLight && o.castShadow){ o.intensity *= mood==='storm' ? 1.5 : 1.55; o.shadow.radius = 3; }
  });
  if(scene.fog) scene.fog.density *= .8;
  RIM_SCALE.value = .4;          // natural materials rather than a glossy toy look
  document.body.dataset.mood = (mood==='storm' ? 'storm' : 'overcast') + '-g7';   // see game.css
}
// Grass-topped bank material for the bridge scenes (instead of bare grey rock).
function g7BankMat(){
  const t = g7GroundTex().clone(); t.needsUpdate = true; t.repeat.set(4.4,16);
  return pbr({color:0xf0f0f0, map:t, roughness:.97, rim:0});
}
function g7Water(w,d,x,z,y,deep,flow){
  // Floodwater is muddy; wave amplitude is kept below the sheet's height above the
  // ground so the ground never pokes through the troughs (that was the blotchy
  // "camouflage" pattern on the old water).
  const m = makeWater(w,d,deep?.8:.3, deep?0x5d6b58:0x7d6a4a, deep?0x26332c:0x4a3b26, 80,
    {muddy:true, flow:flow||[0,0], edge:deep?.5:1.1, amp: Math.min(1, Math.max(.12, (y-.05)/.2))});
  m.position.set(x,y,z); scene.add(m);
  return m;
}
// Small floating debris (leaves, twigs, plastic) carried by the current — the clearest
// possible read of "this water is moving, and in which direction".
function g7Debris(n, x0, x1, z0, z1, y, speedFn, alongZ){
  const cols = [0x6b8e3a, 0x8a6a3a, 0x5a4a32, 0xd9d4c4, 0x3b82f6, 0x9a7b4f];
  const items = [];
  for(let i=0;i<n;i++){
    const kind = i%4;
    let mesh;
    if(kind===0) mesh = new THREE.Mesh(new THREE.CircleGeometry(.14+Math.random()*.08, 10), pbr({color:cols[i%2], side:THREE.DoubleSide, roughness:.8}));
    else if(kind===1){ mesh = new THREE.Mesh(new THREE.CylinderGeometry(.025,.03,.5+Math.random()*.4,8), pbr({color:cols[2], roughness:.9})); mesh.rotation.z = Math.PI/2; }
    else if(kind===2) mesh = new THREE.Mesh(new THREE.BoxGeometry(.22,.03,.16), pbr({color:cols[3+Math.floor(Math.random()*3)], roughness:.6}));
    else mesh = new THREE.Mesh(new THREE.CircleGeometry(.1+Math.random()*.06, 8), pbr({color:cols[5], side:THREE.DoubleSide, roughness:.8}));
    if(kind!==1) mesh.rotation.x = -Math.PI/2;
    const holder = new THREE.Group(); holder.add(mesh);
    holder.position.set(x0+Math.random()*(x1-x0), y+.03, z0+Math.random()*(z1-z0));
    holder.rotation.y = Math.random()*6.28;
    scene.add(holder);
    items.push({h:holder, ph:Math.random()*6.28, sp:.85+Math.random()*.3});
  }
  animCallbacks.push((t,dt)=>{
    items.forEach(o=>{
      const v = speedFn(o.h.position)*o.sp;
      if(alongZ){ o.h.position.z += v*dt; if(o.h.position.z>z1) o.h.position.z = z0; }
      else { o.h.position.x += v*dt; if(o.h.position.x>x1) o.h.position.x = x0; }
      o.h.position.y = y + .03 + Math.sin(t*2+o.ph)*.012;
      o.h.rotation.y += Math.sin(t*.7+o.ph)*dt*.6;
    });
  });
}
// Moving-current streaks on top of water, travelling along +x or +z (alongZ).
function g7Current(x0,x1,z0,z1,y,speedFn,alongZ){
  const n = 46, pts = [];
  const tex = g7Tex(g7Canvas(128, 16, (ctx, w, h)=>{
    const g = ctx.createLinearGradient(0,0,w,0);
    g.addColorStop(0,'rgba(255,255,255,0)'); g.addColorStop(.75,'rgba(255,255,255,.9)'); g.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(w/2,h/2,w/2,h/2.4,0,0,6.28); ctx.fill();
  }));
  const m = new THREE.MeshBasicMaterial({map:tex, color:0xeef4f8, transparent:true, opacity:.5, depthWrite:false});
  for(let i=0;i<n;i++){
    const L = .6+Math.random()*.6;
    const s = new THREE.Mesh(new THREE.PlaneGeometry(L, .09), m);
    s.rotation.x = -Math.PI/2; if(alongZ) s.rotation.z = -Math.PI/2;
    s.position.set(x0+Math.random()*(x1-x0), y+.05, z0+Math.random()*(z1-z0));
    s.renderOrder = 2;
    scene.add(s); pts.push(s);
  }
  animCallbacks.push((t,dt)=>{
    pts.forEach(s=>{
      const v = speedFn(s.position);
      if(alongZ){ s.position.z += v*dt; if(s.position.z>z1) s.position.z = z0; }
      else { s.position.x += v*dt; if(s.position.x>x1) s.position.x = x0; }
    });
  });
}

// ─── entry point ───
function buildGrade7Scene(scen){
  G7 = null;
  G7_LABELS = [];
  const b = {trashbin:g7TrashBin, sign:g7Sign, route:g7Route, fallentree:g7FallenTree, bottle:g7Bottle, windupdate:g7WindUpdate, practice:g7Practice}[scen.scene];
  if(!b) throw new Error('Unknown Grade 7 scene: '+scen.scene);
  b(scen);
  G7_LABELS = G7_LABELS.filter(l=>l.parent);     // drop throw-away labels (e.g. from relabels)
  animCallbacks.push(g7LabelGuard);
}

// 0 · TUTORIAL PRACTICE — not one of the six test items. A deep puddle sits on the
// straight path to the safe spot; a dry path goes around it. Teaches the controls and
// the "hazard areas refuse entry" rule without giving away any real item.
function g7Practice(scen){
  clearScene();
  const puddle = (x,z)=> x>-3.3 && x<3.3 && z>-1.8 && z<4.8;
  const dryPath = [[0,-9],[-5.6,-5],[-5.6,7],[0,10.5]];
  g7World({ mood:'overcast', rain:2200,
    keepOut:(x,z)=> puddle(x,z) || Math.abs(x)<1.2 || (Math.abs(x+5.6)<1.3 && z>-6 && z<8) || Math.hypot(x,z-12)<3,
    wet:(x,z)=> x>-4.3 && x<4.3 && z>-2.8 && z<5.8,
    houses:[[-14,-12,0],[10,-14,0],[14,5,-Math.PI/2],[-15,8,Math.PI/2]],
    trees:[[-11,2,'palm'],[9,11,''],[-9,15,'banana'],[8,-6,'palm']],
    bushes:[[5,-9],[-3,-12],[6,4]] });
  g7Path([[0,-11],[0,12]], 1.8, 0xa29d92, .03, 'concrete');
  g7Path(dryPath, 1.8, 0xb79c6c, .035, 'dirt');
  g7Water(6.6,6.6,0,1.5,.17,false,[.25,.15]);
  dryPath.slice(0,-1).forEach(([x0,z0],i)=>{
    const [x1,z1] = dryPath[i+1];
    for(let k=1;k<4;k++){ const f = k/4; g7Chevron(x0+(x1-x0)*f, z0+(z1-z0)*f, Math.atan2(-(z1-z0), x1-x0), 0x4ade80); }
  });
  g7Signboard(1.7, -3.2, Math.PI, { w:1.2, h:1.2, post:1.0, draw:(ctx,W,H)=>g7DrawWarning(ctx, W, H, 'DEEP WATER', 'GO AROUND', (c,x,y,r)=>{
    c.lineWidth = r*.16; c.strokeStyle = '#111827';
    for(let k=0;k<3;k++){ c.beginPath(); for(let i=0;i<=40;i++){ const px = x-r*1.3 + i*(r*2.6/40), py = y + k*r*.45 - r*.3 + Math.sin(i/40*Math.PI*4)*r*.12; i?c.lineTo(px,py):c.moveTo(px,py); } c.stroke(); }
  })});
  g7Tag('DEEP PUDDLE', 0, 1.6, 1.5, {size:.7, fg:'#fecaca', border:'#ef4444'});
  g7Tag('DRY PATH', -5.6, 2.2, 1, {size:.7, fg:'#bbf7d0', border:'#22c55e'});
  g7SafePad(0,12,'SAFE SPOT');
  g7Human(0,-9.5);
  g7Gateway(0,12,0);
  G7 = { bounds:[-9,6,-11,13], camOff:[0,5,-7],
    hazards:[{test:puddle, msg:'⚠ That puddle is deep — follow the dry path around it!'}] };
  g7Camera([8,8.5,-16],[-1.5,0,1.5]);
}

// Wheeled plastic garbage bin, the kind every barangay street has.
function g7MakeBin(){
  const bin = new THREE.Group();
  const green = pbr({color:0x2f7d3a, roughness:.45, rim:.2});
  const dark = pbr({color:0x1f5a2a, roughness:.5, rim:.15});
  const bg = new THREE.BoxGeometry(.66,1,.72, 3,6,3);
  const p = bg.attributes.position;
  for(let i=0;i<p.count;i++){                       // taper: wider at the top, softly rounded corners
    const y = p.getY(i), k = .9 + (y+.5)*.12;
    let x = p.getX(i)*k, z = p.getZ(i)*k;
    const cx = Math.sign(x)*.33*k, cz = Math.sign(z)*.36*k;
    if(Math.abs(x)>.3*k && Math.abs(z)>.33*k){ x = cx - Math.sign(x)*.02; z = cz - Math.sign(z)*.02; }
    p.setXYZ(i, x, y, z);
  }
  bg.computeVertexNormals();
  const body = new THREE.Mesh(bg, green); body.position.y = .52; body.castShadow = true; bin.add(body);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(.8,.07,.86), dark); lid.position.y = 1.06; lid.castShadow = true; bin.add(lid);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(.82,.05,.06), dark); lip.position.set(0,1.02,.43); bin.add(lip);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.7,12), pbr({color:0x111111, roughness:.5}));
  handle.rotation.z = Math.PI/2; handle.position.set(0,1.02,-.47); bin.add(handle);
  const wm = pbr({color:0x151515, roughness:.7});
  [-1,1].forEach(sd=>{
    const w = new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,.07,20), wm);
    w.rotation.z = Math.PI/2; w.position.set(sd*.36,.11,-.32); bin.add(w);
  });
  // printed front panel
  const pt = g7Tex(g7Canvas(256, 256, (ctx, w)=>{
    ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fillRect(0,0,w,w);
    ctx.strokeStyle = '#e8f5e9'; ctx.lineWidth = 14; ctx.lineCap = 'round';
    for(let i=0;i<3;i++){ const a = i*2.094 - 1.57; ctx.beginPath(); ctx.arc(w/2, w*.42, w*.2, a+.25, a+1.75); ctx.stroke(); }
    ctx.fillStyle = '#e8f5e9'; ctx.font = `800 44px ${G7_FONT}`; ctx.textAlign = 'center'; ctx.fillText('BASURA', w/2, w*.86);
  }));
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(.46,.46), new THREE.MeshStandardMaterial({map:pt, transparent:true, roughness:.5}));
  panel.position.set(0,.62,.395); panel.rotation.x = -.06; bin.add(panel);
  return bin;
}

// 1 · FLOOD · Balanced/unbalanced forces — floodwater pushes a trash bin toward the
// pathway to the boat landing.
function g7TrashBin(scen){
  clearScene();
  const inPath = (x,z)=> z>1.5 && z<4.5 && x>-13 && x<14;
  g7World({ mood:'overcast', rain:5000, rainK:1.1,
    keepOut:(x,z)=> (z>-3.5 && z<10.5 && x>-14.5) || x>13,
    wet:(x,z)=> (z>-4.5 && z<11.5 && x>-15.5 && x<14) || x>12,
    houses:[[-10,-17,0],[-2,-18,0],[7,-17,0],[-18,-6,Math.PI/2],[-18,6,Math.PI/2]],
    trees:[[-14,-11,'palm'],[4,-14,''],[12,-12,'palm'],[-6,-13,'banana']],
    bushes:[[-1,-11],[9,-10],[-12,-4]] });

  // Floodwater sheet over the low street, and the river beyond the boat landing.
  g7Water(28,13,-.5,3.5,.17,false,[1.6,0]);
  g7Water(24,70,26,0,.06,true,[0,.9]);
  g7Current(-13,13,-2.5,9.5,.17,()=>1.6,false);
  g7Debris(26, -13, 13, -2, 9, .17, ()=>1.5, false);
  // Pathway leading to the boat landing (partly under the floodwater).
  g7Path([[-12,3],[13.5,3]], 2.4, 0xa29d92, .04, 'concrete');
  const dock = new THREE.Mesh(new THREE.BoxGeometry(4.5,.25,3), pbr({color:0x6b4f30,map:woodTex(),roughness:.9}));
  dock.position.set(15.5,.2,3); dock.castShadow = dock.receiveShadow = true; scene.add(dock);
  [[-2,-1.3],[2,-1.3],[-2,1.3],[2,1.3]].forEach(([dx,dz])=>{ const p = new THREE.Mesh(new THREE.CylinderGeometry(.1,.1,1,12), pbr({color:0x4a3520,map:woodTex()})); p.position.set(15.5+dx,-.2,3+dz); scene.add(p); });
  const banca = makeBanca(false); banca.position.set(20,.12,3); banca.scale.setScalar(.8); scene.add(banca);
  banca.children.forEach(c=>{ if(c.material && c.material.isMeshBasicMaterial) c.visible = false; });   // hide the Grade 9 load-line overlay
  animCallbacks.push((t)=>{ banca.rotation.z = Math.sin(t*.9)*.04; banca.position.y = .12+Math.sin(t*1.1)*.05; });
  g7Tag('BOAT LANDING', 15.5, 2.2, 3, {size:.85});
  g7Signboard(10.5, 5.6, 0, { w:1.6, h:.8, post:1.1, draw:(ctx,W,H)=>{
    ctx.fillStyle = '#1d4ed8'; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 18; g7RR(ctx,16,16,W-32,H-32,28); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 120px ${G7_FONT}`; ctx.fillText('BOAT LANDING', W/2, H*.4);
    ctx.font = `800 140px ${G7_FONT}`; ctx.fillText('→', W/2, H*.74);
  }});

  // Higher, dry ground where the learner can wait safely.
  const hg = new THREE.Mesh(new THREE.CylinderGeometry(3.4,3.7,.18,40), pbr({color:0x8f8775,map:g7PathTex('dirt'),roughness:.95}));
  hg.position.set(-5,.06,-8.5); hg.receiveShadow = true; scene.add(hg);
  g7SafePad(-5,-8.5,'SAFE SPOT · higher ground');

  // The trash bin, pushed by the current: F_water > friction, so it speeds up along +x.
  const bin = g7MakeBin(); bin.scale.setScalar(1.1); scene.add(bin);
  const wake = g7Decal(g7SoftTex('g7-wake','rgba(240,236,224,.85)','rgba(240,236,224,0)', true), 2.2, 2.2, 0, .24, 3);
  const trail = g7Decal(g7SoftTex('g7-trail','rgba(240,236,224,.5)','rgba(240,236,224,0)'), 2.6, 1.1, 0, .23, 3);
  const fWater = g7Arrow(0x38bdf8, 1.8, .085); scene.add(fWater);
  const fFric = g7Arrow(0xf97316, .6, .065); fFric.rotation.y = Math.PI; scene.add(fFric);
  const lw = g7Label('Push of floodwater', {size:.62, fg:'#7dd3fc'}); scene.add(lw);
  const lf = g7Label('Friction', {size:.62, fg:'#fdba74'}); scene.add(lf);
  const ln = g7Label('UNBALANCED FORCES → the bin moves', {size:.72, fg:'#fecaca', border:'#ef4444'}); scene.add(ln);
  const lt = g7Label('TRASH BIN', {size:.6, pin:true, bg:'rgba(20,60,30,.9)', border:'#4ade80'}); scene.add(lt);
  let bx = -11, bv = .3;
  animCallbacks.push((t,dt)=>{
    bv = Math.min(2.8, bv + 1.1*dt);          // net force → acceleration
    bx += bv*dt;
    if(bx > 12.5){ bx = -11; bv = .3; }
    bin.position.set(bx, .02 + Math.sin(t*3)*.03, 3);
    bin.rotation.z = -.1 - Math.sin(t*2.2)*.05; bin.rotation.x = Math.sin(t*1.7)*.05; bin.rotation.y += dt*.35;
    wake.position.set(bx, .245, 3); wake.scale.setScalar(.9 + Math.sin(t*4)*.08 + bv*.05);
    trail.position.set(bx-1.3, .235, 3); trail.scale.x = .6 + bv*.4; trail.material.opacity = Math.min(1, bv*.4);
    fWater.position.set(bx-2.3, .75, 3);
    fFric.position.set(bx+1.15, .4, 3.6);
    lw.position.set(bx-2.4, 1.3, 3); lf.position.set(bx+1.7, .95, 4.3); ln.position.set(bx, 3.05, 3);
    lt.position.set(bx, 1.75, 3);
  });

  g7Human(4,-.8);
  humanGroup.rotation.y = Math.PI/2;
  g7Gateway(-5,-8.5,0);
  G7 = { bounds:[-12,12,-13,9], camOff:[6,4.5,5],
    hazards:[{test:inPath, msg:'⚠ That is the trash bin’s path — the unbalanced force keeps it moving. Stay away!'},
             {test:(x,z)=> x>12.5, msg:'⚠ Stay away from the boat landing and the river.'}] };
  g7Camera([-1,8,18.5],[.5,0,-1.5]);   // from across the flooded street: current runs left→right toward the boat landing
}

// 2 · TYPHOON · Balanced/unbalanced forces — strong wind tilts a hanging sign beside
// the bridge toward the pathway.
function g7Sign(scen){
  buildBridgeScene({wind:scen.wind, noRider:true, bankMat:g7BankMat()});
  g7Light('overcast');
  g7Clear(-17,-3.5,3); g7Clear(-8.2,-.5,2.4); g7Clear(-12.5,-1.5,2.2);
  g7Path([[-20,0],[-6.2,0]], 2, 0x958b7c, .03, 'dirt');
  g7Tag('Pathway to the bridge', -15, 1.1, -1.4, {size:.6});

  // Sign post beside the bridge entrance, with an arm reaching over the pathway.
  const SX = -8.2, post = pbr({color:0x4a525c,roughness:.4,metalness:.75});
  const p = new THREE.Mesh(new THREE.CylinderGeometry(.09,.11,3.8,20), post); p.position.set(SX,1.9,-1.8); p.castShadow = true; scene.add(p);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(.28,.32,.25,20), pbr({color:0x9a958c,roughness:.95})); foot.position.set(SX,.12,-1.8); foot.receiveShadow = true; scene.add(foot);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(.1,.1,2.2), post); arm.position.set(SX,3.7,-.8); arm.castShadow = true; scene.add(arm);
  const brace = new THREE.Mesh(new THREE.BoxGeometry(.06,.06,1.1), post); brace.position.set(SX,3.3,-1.35); brace.rotation.x = -.62; scene.add(brace);
  const pivot = new THREE.Group(); pivot.position.set(SX,3.65,-.2); scene.add(pivot);
  const cv = g7Canvas(1024, 512, (c, W, H)=>{
    const gr = c.createLinearGradient(0,0,0,H); gr.addColorStop(0,'#2563eb'); gr.addColorStop(1,'#1d4ed8');
    c.fillStyle = gr; c.fillRect(0,0,W,H);
    c.strokeStyle = '#fff'; c.lineWidth = 20; g7RR(c, 22, 22, W-44, H-44, 36); c.stroke();
    // bridge pictogram
    c.strokeStyle = '#fff'; c.lineWidth = 12; c.lineCap = 'round';
    c.beginPath(); c.moveTo(150,330); c.quadraticCurveTo(300,250,450,330); c.stroke();
    c.beginPath(); c.moveTo(150,200); c.lineTo(150,350); c.moveTo(450,200); c.lineTo(450,350); c.stroke();
    c.beginPath(); c.moveTo(150,205); c.quadraticCurveTo(300,330,450,205); c.stroke();
    for(let i=1;i<6;i++){ const x = 150+i*50, yTop = 205 + Math.sin(i/6*Math.PI)*62, yDeck = 330 - Math.sin(i/6*Math.PI)*40; c.beginPath(); c.moveTo(x,yTop); c.lineTo(x,yDeck); c.stroke(); }
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.font = `800 92px ${G7_FONT}`; c.fillText('HANGING', 520, 205); c.fillText('BRIDGE', 520, 315);
    c.font = `700 52px ${G7_FONT}`; c.fillText('→  50 m', 530, 405);
  });
  // Thin along x, so its two printed faces look along the pathway (the wind blows +x).
  const face = new THREE.MeshStandardMaterial({map:g7Tex(cv), roughness:.35, metalness:.25});
  const edge = pbr({color:0xc0c6cc, roughness:.35, metalness:.8});
  const board = new THREE.Mesh(new THREE.BoxGeometry(.06,1.15,2.3), [face, face, edge, edge, edge, edge]);
  board.position.y = -1.12; board.castShadow = true;
  // Chains: rows of small metal links instead of 1-pixel lines.
  const linkG = new THREE.TorusGeometry(.035,.009,8,16), linkM = pbr({color:0x777d84, roughness:.35, metalness:.85, rim:.1});
  [-.95,.95].forEach(dz=>{ for(let i=0;i<8;i++){ const l = new THREE.Mesh(linkG, linkM); l.position.set(0,-.04-i*.062,dz); l.rotation.y = i%2 ? Math.PI/2 : 0; pivot.add(l); } });
  pivot.add(board);
  const fWind = g7Arrow(0xe2e8f0, 1.7, .085); fWind.position.set(SX-2.6,2.55,1.45); scene.add(fWind);
  const fHold = g7Arrow(0xf97316, .6, .065); fHold.rotation.y = Math.PI; fHold.position.set(SX+1.15,2.55,1.45); scene.add(fHold);
  const lw = g7Label('Wind push', {size:.6}); lw.position.set(SX-2.1,2.05,1.45); scene.add(lw);
  const lh = g7Label('Holding force', {size:.55, fg:'#fdba74'}); lh.position.set(SX+1.4,3.05,1.45); scene.add(lh);
  const ln = g7Label('UNBALANCED FORCES → the sign tilts', {size:.72, fg:'#fecaca', border:'#ef4444'}); ln.position.set(SX,5.1,-.2); scene.add(ln);
  // Fall-zone marking on the pathway under the sign.
  const fz = g7Decal(g7SoftTex('g7-danger','rgba(239,68,68,.55)','rgba(239,68,68,0)'), 4.2, 4.2, SX, .06, -.2);
  fz.material.toneMapped = false;
  animCallbacks.push((t)=>{ fz.material.opacity = .55 + Math.sin(t*3)*.3; });

  // Tilt grows with each gust; once the student is in control, the fastenings give
  // way and the sign drops onto the pathway — exactly the danger the item describes.
  let tilt = .12, fallen = false, fallT = 0, vy = 0;
  animCallbacks.push((t,dt)=>{
    if(!fallen){
      tilt = Math.min(.55, tilt + dt*.02);
      const gust = Math.max(0, Math.sin(t*1.7)) * .25 + Math.sin(t*5.3)*.04;
      pivot.rotation.z = tilt + gust;            // bottom swings downwind (+x)
      fWind.userData.setLen(1.4 + gust*2.2);
      if(ctrl.on && (fallT += dt) > 2.2){ fallen = true; pivot.remove(board); scene.add(board);
        board.position.set(SX+.4, 2.4, -.2); board.rotation.set(0, 0, .4); ln.visible = fHold.visible = lh.visible = false; }
    } else if(board.position.y > .5){
      vy += 9.8*dt; board.position.y = Math.max(.5, board.position.y - vy*dt);
      board.position.x += dt*1.4; board.rotation.z = Math.min(1.5, board.rotation.z + dt*2.6);
      if(board.position.y <= .5 && navigator.vibrate) navigator.vibrate(80);
    }
  });

  g7SafePad(-17,-3.5,'SAFE SPOT');
  g7Human(-14,.2, 0x1e3a8a);
  humanGroup.rotation.y = Math.PI/2;
  g7Gateway(-17,-3.5,0);
  G7 = { bounds:[-19,-6.4,-9,9], camOff:[-6,5,-2],   // looking east, so the sign stays in view
    hazards:[{test:(x,z)=> Math.hypot(x-SX, z+.2) < 2.6, msg:'⚠ Stay clear of the sign — the unbalanced wind force can make it fall here!'}] };
  g7Camera([-17.5,4.3,5.6],[-8.6,2.1,-.8]);   // diagonal, so the sign's face and the wind arrow both read
}

// 3 · FLOOD · Distance and displacement — shorter flooded Route A vs longer dry Route B.
function g7Route(scen){
  clearScene();
  const flood = (x,z)=> x>-4.6 && x<4.6 && z>-5 && z<6;
  const routeB = [[0,-11],[-9,-8],[-9,8],[0,11]];
  g7World({ mood:'overcast', rain:5000,
    keepOut:(x,z)=> flood(x,z) || Math.abs(x)<1.3 || (x<-7.6 && x>-10.4 && z>-9 && z<9) || (Math.abs(x)<5 && z>11.5 && z<17.5),
    wet:(x,z)=> x>-5.6 && x<5.6 && z>-6 && z<7,
    houses:[[-17,-6,Math.PI/2],[-17,5,Math.PI/2],[9,-3,-Math.PI/2],[9,3.5,-Math.PI/2],[10,-10,-Math.PI/2],[-4,-18,0],[6,-18,0]],
    trees:[[7,9,'palm'],[-14,12,''],[-13,-13,'palm'],[5,-12,'banana'],[-5,12,'banana']],
    bushes:[[-6,-12],[6,13],[-13,0]] });

  g7Path([[0,-13],[0,12]], 1.8, 0xa29d92, .03, 'concrete');   // Route A (short, straight)
  g7Path(routeB, 1.8, 0xb79c6c, .035, 'dirt');               // Route B (long, dry)
  g7Water(9.4,11.4,0,.5,.2,false,[.9,.3]);
  g7Current(-4.4,4.4,-4.8,5.8,.2,()=>1.2,false);
  g7Debris(14, -4.2, 4.2, -4.6, 5.6, .2, ()=>1.1, false);
  // A fence closes the gap on the east side so Route B really is the only dry way.
  const fm = pbr({color:0x6b4f30,map:woodTex(),roughness:.9});
  for(let z=-7;z<=8;z+=1.2){ const f = new THREE.Mesh(new THREE.BoxGeometry(.12,1.1,.12), fm); f.position.set(5.2,.55,z); f.castShadow = true; scene.add(f); }
  [.4,.85].forEach(y=>{ const r = new THREE.Mesh(new THREE.BoxGeometry(.06,.08,15.4), fm); r.position.set(5.2,y,.5); r.castShadow = true; scene.add(r); });

  // Real signs at the fork: a flood warning on Route A, a green route sign for B.
  // Both signs face −z, toward the learner coming from START.
  g7Signboard(1.6, -6.6, Math.PI, { w:1.3, h:1.3, post:1.0, draw:(ctx,W,H)=>g7DrawWarning(ctx, W, H, 'FLOODED', 'DO NOT ENTER', (c,x,y,r)=>{
    c.fillStyle = '#111827';
    for(let k=0;k<3;k++){ c.beginPath(); for(let i=0;i<=40;i++){ const px = x-r*1.3 + i*(r*2.6/40), py = y + k*r*.45 - r*.3 + Math.sin(i/40*Math.PI*4)*r*.12; i?c.lineTo(px,py):c.moveTo(px,py); } c.lineWidth = r*.16; c.strokeStyle = '#111827'; c.stroke(); }
  })});
  g7Signboard(-2.4, -10.6, Math.PI*.85, { w:1.9, h:.75, post:1.15, draw:(ctx,W,H)=>{
    ctx.fillStyle = '#15803d'; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 16; g7RR(ctx,14,14,W-28,H-28,26); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 110px ${G7_FONT}`; ctx.fillText('ROUTE B  →', W/2, H*.4);
    ctx.font = `700 64px ${G7_FONT}`; ctx.fillText('EVACUATION AREA', W/2, H*.75);
  }});
  g7Tag('ROUTE A\nshorter · flooded', 1.8, 3.1, -7.5, {size:.75, fg:'#fecaca', border:'#ef4444'});
  g7Tag('ROUTE B\nlonger · dry & passable', -9, 3.1, -3, {size:.75, fg:'#bbf7d0', border:'#22c55e'});
  g7Tag('START', 0, 2.6, -13.2, {size:.65});
  // Displacement is the same for both routes: one straight arrow start → evacuation area.
  const disp = g7Arrow(0xfacc15, 21, .06); disp.rotation.y = -Math.PI/2; disp.position.set(1.3,.5,-12); scene.add(disp);
  const ld = g7Label('Same displacement for both routes', {size:.55, fg:'#fde047'}); ld.position.set(3.2,1.3,-1); scene.add(ld);
  routeB.slice(0,-1).forEach(([x0,z0],i)=>{
    const [x1,z1] = routeB[i+1];
    for(let k=1;k<4;k++){ const f = k/4; g7Chevron(x0+(x1-x0)*f, z0+(z1-z0)*f, Math.atan2(-(z1-z0), x1-x0), 0x4ade80); }
  });

  // Evacuation area: covered stage with a banner.
  const ev = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(8,.2,4), pbr({color:0xb0aca4,map:g7PathTex('concrete'),roughness:.95})); floor.position.y = .1; floor.receiveShadow = true; ev.add(floor);
  [[-3.7,-1.8],[3.7,-1.8],[-3.7,1.8],[3.7,1.8]].forEach(([x,z])=>{ const c = new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,3.2,16), pbr({color:0x7a7a7a,metalness:.5,roughness:.4})); c.position.set(x,1.7,z); c.castShadow = true; ev.add(c); });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(8.6,.15,4.6), pbr({color:0x9a9a9a,map:giTex(),metalness:.5,roughness:.5})); roof.position.y = 3.35; roof.castShadow = true; ev.add(roof);
  const ban = new THREE.Mesh(new THREE.PlaneGeometry(5,.8), new THREE.MeshStandardMaterial({side:THREE.DoubleSide, roughness:.8, map:g7Tex(g7Canvas(1024,164,(c,W,H)=>{
    c.fillStyle = '#166534'; c.fillRect(0,0,W,H); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `800 96px ${G7_FONT}`; c.fillText('EVACUATION AREA', W/2, H/2+4);
  }))}));
  ban.position.set(0,2.8,-2.05); ban.rotation.y = Math.PI; ev.add(ban);
  // a few evacuees waiting under the roof
  [[-2.2,.4,0xb91c1c],[-1.2,-.5,0x7c3aed],[2.4,.2,0xca8a04]].forEach(([x,z,c])=>{ const h = makeHuman(x,.2,z,c,0x334155,.9); h.rotation.y = Math.PI + (Math.random()-.5); ev.add(h); });
  ev.position.set(0,0,14.5); scene.add(ev);

  g7Human(0,-12.2);
  g7Gateway(0,11.6,0);
  G7 = { bounds:[-12,5,-14,12.5], camOff:[0,5,-7],
    hazards:[{test:flood, msg:'⚠ Route A passes through floodwater. Safety first — take Route B!'},
             {test:(x,z)=> x>4.9, msg:'⚠ That way is fenced off — follow Route B.'}] };
  g7Camera([9,10,-19],[-3,0,0]);
}

// 4 · TYPHOON · Distance and displacement — shelter 100 m east of the covered court,
// direct path blocked by a fallen tree, longer marked route around it.
function g7FallenTree(scen){
  clearScene();
  const route = [[-8,0],[-8,8.5],[8,8.5],[8,0]];
  const onRoute = (x,z)=> (Math.abs(x+8)<1.2 && z>-1 && z<9.5) || (Math.abs(z-8.5)<1.2 && x>-9 && x<9) || (Math.abs(x-8)<1.2 && z>-1 && z<9.5);
  g7World({ mood:'storm', wind:scen.wind, rain:7000, rainK:1.4,
    keepOut:(x,z)=> onRoute(x,z) || Math.abs(z)<1.2 || (Math.abs(x)<1.8 && z<-6) || (x<-8 && x>-16 && Math.abs(z)<3.6),
    houses:[[-6,-15,0],[4,-16,0],[-18,8,Math.PI/2],[18,-8,-Math.PI/2]],
    trees:[[-15,-10,'palm'],[14,12,'palm'],[-12,13,''],[3,13,'banana'],[-4,-11,'bamboo'],[13,-13,'']] });

  // Covered court (west): a real basketball court under a GI roof, and the
  // evacuation shelter (east).
  const ct = new THREE.Group();
  const courtTex = g7Tex(g7Canvas(1024, 880, (c,W,H)=>{
    c.fillStyle = '#5b7f9a'; c.fillRect(0,0,W,H);
    c.fillStyle = '#b4573a'; c.fillRect(W*.06,H*.07,W*.88,H*.86);
    c.strokeStyle = '#f8fafc'; c.lineWidth = 10;
    c.strokeRect(W*.06,H*.07,W*.88,H*.86);
    c.beginPath(); c.moveTo(W*.06,H/2); c.lineTo(W*.94,H/2); c.stroke();
    c.beginPath(); c.arc(W/2,H/2,H*.1,0,6.28); c.stroke();
    [H*.07, H*.93].forEach((y,i)=>{ c.strokeRect(W*.36, i?y-H*.2:y, W*.28, H*.2); c.beginPath(); c.arc(W/2, i?y-H*.2:y+H*.2, W*.14, i?Math.PI:0, i?0:Math.PI); c.stroke(); });
  }));
  const cf = new THREE.Mesh(new THREE.BoxGeometry(7,.18,6), [pbr({color:0x9aa0a6}),pbr({color:0x9aa0a6}),new THREE.MeshStandardMaterial({map:courtTex,roughness:.7}),pbr({color:0x9aa0a6}),pbr({color:0x9aa0a6}),pbr({color:0x9aa0a6})]);
  cf.position.y = .09; cf.receiveShadow = true; cf.rotation.y = Math.PI/2; ct.add(cf);
  [[-3.3,-2.8],[3.3,-2.8],[-3.3,2.8],[3.3,2.8],[0,-2.8],[0,2.8]].forEach(([x,z])=>{ const c = new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,4,16), pbr({color:0x6a6a6a,metalness:.5,roughness:.4})); c.position.set(x,2,z); c.castShadow = true; ct.add(c); });
  const cr = new THREE.Mesh(new THREE.BoxGeometry(7.6,.16,6.6), pbr({color:0x8a8a8a,map:giTex(),metalness:.5,roughness:.5})); cr.position.y = 4.1; cr.castShadow = true; ct.add(cr);
  [-1,1].forEach(sd=>{                                 // hoops at both ends
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,2.9,12), pbr({color:0x334155,metalness:.6,roughness:.4})); pole.position.set(0,1.45,sd*2.7); ct.add(pole);
    const bb = new THREE.Mesh(new THREE.BoxGeometry(1,.62,.04), pbr({color:0xf8fafc,roughness:.4})); bb.position.set(0,2.95,sd*2.55); ct.add(bb);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.2,.015,8,24), pbr({color:0xea580c,metalness:.4})); rim.rotation.x = Math.PI/2; rim.position.set(0,2.75,sd*2.32); ct.add(rim);
  });
  ct.position.set(-12,0,0); scene.add(ct);
  g7Tag('COVERED COURT', -12, 4.75, 0, {size:.85});
  const sh = makeConcreteHouse(14,0,4.6,3.4,5); sh.rotation.y = -Math.PI/2; scene.add(sh);
  const shBan = new THREE.Mesh(new THREE.PlaneGeometry(3.6,.7), new THREE.MeshStandardMaterial({roughness:.8, map:g7Tex(g7Canvas(1024,200,(c,W,H)=>{
    c.fillStyle = '#166534'; c.fillRect(0,0,W,H); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `800 86px ${G7_FONT}`; c.fillText('EVACUATION CENTER', W/2, H/2+4);
  }))}));
  shBan.position.set(11.65,2.7,0); shBan.rotation.y = -Math.PI/2; scene.add(shBan);
  g7Tag('EVACUATION SHELTER', 14, 4.9, 0, {bg:'rgba(20,83,45,.92)', border:'#4ade80', size:.85});
  const lnE = g7Label('N ↑   E →', {size:.6}); lnE.position.set(-15,3,8); scene.add(lnE);

  // Displacement: straight arrow court → shelter, 100 m east.
  const disp = g7Arrow(0xfacc15, 20, .09); disp.position.set(-10,.35,-1.9); scene.add(disp);
  const ld = g7Label('Displacement: 100 m EAST', {size:.7, fg:'#fde047'}); ld.position.set(-4,1.4,-2.6); scene.add(ld);
  g7Path([[-9,0],[11.5,0]], 1.6, 0x958b7c, .03, 'concrete');   // direct path (blocked)
  g7Path(route, 1.6, 0xb79c6c, .035, 'dirt');                  // marked route
  route.slice(0,-1).forEach(([x0,z0],i)=>{
    const [x1,z1] = route[i+1];
    const n = Math.round(Math.hypot(x1-x0,z1-z0)/2.4);
    for(let k=1;k<n;k++){ const f = k/n; g7Chevron(x0+(x1-x0)*f, z0+(z1-z0)*f, Math.atan2(-(z1-z0), x1-x0), 0xfb923c); }
  });
  [[-9,4],[-9,9.6],[0,9.6],[9,9.6],[9,4]].forEach(([x,z])=>g7Flag(x,z,0xf97316));
  g7Tag('MARKED ROUTE\nlonger distance · safe', 0, 2.9, 10, {size:.72, fg:'#fed7aa', border:'#f97316'});

  // The fallen tree lying across the direct path, still thrashing in the wind. Its
  // root plate has been torn out of the ground at the south end.
  const tree = new THREE.Group();
  const bark = pbr({color:0x5a4030,map:woodTex(),roughness:.92});
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.3,.46,11,24,6), bark);
  trunk.rotation.x = Math.PI/2; trunk.position.set(0,.42,-1.5); trunk.castShadow = trunk.receiveShadow = true; tree.add(trunk);
  const soilT = g7PixTex('g7-soil', 256, 256, (u,v)=>{
    const n = fbm(u,v,8,401), r = Math.abs(Math.sin((u*9 + fbm(u,v,4,409)*2.5)*Math.PI));
    const fiber = r > .93 ? .55 : 1;
    const b = (70 + n*55) * fiber;
    return [b*1.08, b*.84, b*.6];
  }, true);
  const plate = new THREE.Mesh(blobGeo(1.35,28,.45,5), pbr({color:0xffffff, map:soilT, roughness:1, rim:0}));
  plate.scale.set(1,1,.32); plate.position.set(0,1.0,-7.3); plate.castShadow = true; tree.add(plate);
  for(let i=0;i<9;i++){                               // torn roots
    const a = i/9*6.28, r = new THREE.Mesh(new THREE.CylinderGeometry(.03,.07,.9+Math.random()*.6,8), pbr({color:0x3a2a1c,roughness:1,rim:0}));
    r.position.set(Math.cos(a)*1.1, 1.0+Math.sin(a)*1.1, -7.45); r.rotation.set(Math.PI/2+(Math.random()-.5)*.6, 0, a); tree.add(r);
  }
  const pit = g7Decal(g7SoftTex('g7-pit','rgba(40,28,18,.95)','rgba(40,28,18,0)'), 3.2, 2.2, 0, .05, -8.2);
  const leaves = [];
  const leafM = [0x2a5220,0x356628,0x427a30].map(c=>pbr({color:c,roughness:.85,map:leafTex(),rim:.07}));
  [[.9,.9,2.2,.6],[-1,.7,2.8,.55],[1.1,.5,4.6,.7],[-.8,.8,5.2,.6]].forEach(([dx,dy,z,r])=>{   // branches
    const b = new THREE.Mesh(new THREE.CylinderGeometry(.06,.12,2.2,10), bark);
    b.position.set(dx*.6, .5+dy*.3, z); b.rotation.set(Math.PI/2.4, 0, -Math.sign(dx)*.9); b.castShadow = true; tree.add(b);
  });
  for(let i=0;i<16;i++){
    const b = new THREE.Mesh(blobGeo(.55+Math.random()*.45,20,.38,i*3+1), leafM[i%3]);
    b.position.set((Math.random()-.5)*3.2, .45+Math.random()*1.1, 2.2+Math.random()*3.8); b.castShadow = true; tree.add(b); leaves.push(b);
  }
  scene.add(tree);
  animCallbacks.push((t)=>{ leaves.forEach((b,i)=>{ b.rotation.y = Math.sin(t*2.4+i)*.12; b.position.x += Math.sin(t*3+i)*.002; }); });
  g7Barricade(-2.4, 0, Math.PI/2); g7Barricade(2.4, 0, Math.PI/2);
  g7Tag('BLOCKED — fallen tree', 0, 3.1, -1, {size:.75, fg:'#fecaca', border:'#ef4444'});
  // Drainage canal south of the tree, so the only way round is the marked route.
  g7Water(3,9,0,-11,.07,true,[0,-.5]);

  g7Human(-11,0, 0x1e3a8a);
  humanGroup.rotation.y = Math.PI/2;
  g7Gateway(10.5,0,Math.PI/2);
  G7 = { bounds:[-15,11.5,-14,11], camOff:[-3,7,7],
    hazards:[{test:(x,z)=> Math.abs(x)<2 && z>-7.8 && z<7, msg:'⚠ Do not climb over the fallen tree — follow the marked route.'},
             {test:(x,z)=> Math.abs(x)<2 && z<=-7.8, msg:'⚠ That is a drainage canal, not the marked route.'}] };
  g7Camera([1,11,18],[0,0,1]);   // from the south-facing side so east reads left→right
}

// Smooth PET bottle from a lathe profile (axis along +z once rotated).
function g7MakeBottle(){
  const prof = [[0,0],[.13,0],[.155,.03],[.16,.08],[.16,.36],[.15,.4],[.11,.47],[.065,.53],[.06,.58],[.068,.585],[.068,.64],[0,.645]]
    .map(([r,y])=>new THREE.Vector2(r,y));
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 36), new THREE.MeshStandardMaterial({color:0xa7e3d0, transparent:true, opacity:.62, roughness:.08, metalness:.1}));
  const label = new THREE.Mesh(new THREE.CylinderGeometry(.163,.163,.14,36,1,true), pbr({color:0x1d4ed8, roughness:.5, side:THREE.DoubleSide}));
  label.position.y = .22;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(.072,.072,.07,24), pbr({color:0xdc2626, roughness:.4}));
  cap.position.y = .62;
  [body,label,cap].forEach(m=>{ m.castShadow = true; g.add(m); });
  g.rotation.x = Math.PI/2; g.position.z = -.32;
  const holder = new THREE.Group(); holder.add(g);
  return holder;
}

// 5 · FLOOD · Speed and motion — a floating bottle covers increasing distances in
// equal time intervals, i.e. the current is speeding up.
function g7Bottle(scen){
  clearScene();
  g7World({ mood:'overcast', rain:3500,
    keepOut:(x,z)=> x>-5.4 && x<5.4,
    wet:(x,z)=> Math.abs(x)<6.4,
    houses:[[-17,-7,Math.PI/2],[-17,4,Math.PI/2],[12,-9,-Math.PI/2],[12,6,-Math.PI/2,true]],
    trees:[[-9,-11,'palm'],[-10,9,''],[-7,12,'banana'],[8,-3,'palm'],[8,11,'']],
    bushes:[[-8,-2],[7,6],[-12,-12]] });
  // Sunken river channel: muddy banks slope down to the water.
  [-1,1].forEach(sd=>{
    const bank = new THREE.Mesh(new THREE.PlaneGeometry(1.4,80,1,1), pbr({color:0x6e5a40, map:g7PathTex('dirt'), roughness:1, rim:0}));
    bank.rotation.x = -Math.PI/2; bank.position.set(sd*5.1,.03,0); bank.receiveShadow = true; scene.add(bank);
  });
  g7Water(9.6,80,0,0,.08,true,[0,1.4]);
  const accel = (z)=> .6 + Math.max(0,(z+16))*.16;              // current speeds up downstream (+z)
  g7Current(-4.4,4.4,-30,30,.08,(p)=>accel(p.z),true);
  g7Debris(18, -4.2, 4.2, -30, 30, .08, (p)=>accel(p.z), true);
  // Stones along both banks and a line of half-submerged crossing stones.
  const stoneM = [0x7a746a,0x8a8478,0x6a655c].map(c=>pbr({color:c,roughness:.95,rim:.1}));
  for(let z=-26;z<=26;z+=1.15){ [-4.9,4.9].forEach((x,j)=>{ const s = new THREE.Mesh(blobGeo(.32+Math.random()*.22,16,.5,z*7+x), stoneM[(Math.abs(Math.round(z))+j)%3]); s.position.set(x+(Math.random()-.5)*.35,.06,z+(Math.random()-.5)*.4); s.scale.y = .5; s.castShadow = true; s.receiveShadow = true; scene.add(s); }); }
  for(let x=-3.3;x<=3.3;x+=1.1){ const s = new THREE.Mesh(blobGeo(.38,18,.35,x*13), stoneM[1]); s.scale.y = .35; s.position.set(x,.08,-4); s.castShadow = true; scene.add(s); }
  g7Tag('River crossing', 0, .9, -4, {size:.55});

  // The bottle and its equal-time markers on the near bank.
  const bottle = g7MakeBottle(); bottle.scale.setScalar(2.4); scene.add(bottle);
  const ring = g7Decal(g7SoftTex('g7-wake','rgba(240,236,224,.85)','rgba(240,236,224,0)', true), 1.6, 1.6, 0, .17, 0);
  const lb = g7Label('Floating bottle', {size:.55, pin:true}); scene.add(lb);
  const markers = [], MX = -3.9;                          // time markers along the near edge of the river
  const postM = new THREE.MeshStandardMaterial({color:0xfacc15, roughness:.5});
  const barM = new THREE.MeshBasicMaterial({color:0xfacc15, toneMapped:false});
  const mkMarker = (z, i, prevZ)=>{
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,1.2,12), postM);
    post.position.set(MX,.6,z); post.castShadow = true; g.add(post);
    const l = g7Label(i+' s', {size:.78, fg:'#fde047', pin:true}); l.position.set(MX,1.35,z); g.add(l);
    if(prevZ!==undefined){
      const d = z-prevZ;
      const br = new THREE.Mesh(new THREE.BoxGeometry(.06,.06,d), barM);
      br.position.set(MX,.3,(z+prevZ)/2); g.add(br);
      const dl = g7Label(`d${['₁','₂','₃','₄','₅'][i-1]}`, {size:.68, fg:'#fde047', bg:'rgba(0,0,0,.6)'}); dl.position.set(MX,.75,(z+prevZ)/2); g.add(dl);
    }
    scene.add(g); markers.push(g);
  };
  const Z0 = -10, V0 = .8, A = 1.2, T = 5;                  // z(t) = z0 + v0·t + ½·a·t²
  let cycleT = 0, lastSec = -1;
  animCallbacks.push((t,dt)=>{
    cycleT += dt;
    if(cycleT > T + 1.6){ cycleT = 0; lastSec = -1; markers.splice(0).forEach(m=>{ scene.remove(m); dispose(m); }); }
    const tt = Math.min(cycleT, T);
    const z = Z0 + V0*tt + .5*A*tt*tt;
    bottle.position.set(.6+Math.sin(t*1.3)*.2, .17+Math.sin(t*2.4)*.03, z);
    bottle.rotation.y = Math.sin(t*.9)*.3; bottle.rotation.z = Math.sin(t*1.9)*.15;
    ring.position.set(bottle.position.x, .175, z); ring.scale.setScalar(1 + Math.sin(t*3)*.1);
    lb.position.set(.6,1.0,z);
    const sec = Math.floor(tt+1e-6);
    if(sec !== lastSec && sec <= T){
      const zs = Z0 + V0*sec + .5*A*sec*sec;
      mkMarker(zs, sec, sec>0 ? Z0 + V0*(sec-1) + .5*A*(sec-1)*(sec-1) : undefined);
      lastSec = sec;
    }
  });
  const lk = g7Label('Equal time intervals → increasing distances', {size:.7, fg:'#fde047', border:'#facc15'}); lk.position.set(2,3.4,0); scene.add(lk);

  g7SafePad(-11,-9,'SAFE SPOT · away from the river');
  g7Human(-5.8,-4);
  humanGroup.rotation.y = Math.PI/2;
  g7Gateway(-11,-9,Math.PI/2);
  G7 = { bounds:[-15,4,-12,12], camOff:[5,4.5,-3],
    hazards:[{test:(x,z)=> x>-4.7, msg:'⚠ The current is speeding up — do not cross the river!'}] };
  g7Camera([-14,7,-1],[1,0,0]);   // looking across the river: downstream runs left→right
}

// Weather bulletin board face: every update so far as a rising bar, newest highlighted.
function g7DrawBulletin(ctx, W, H, steps, idx){
  ctx.fillStyle = '#f8fafc'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle = '#b91c1c'; ctx.fillRect(0,0,W,H*.2);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `800 ${Math.round(H*.12)}px ${G7_FONT}`; ctx.fillText('WEATHER UPDATE', W/2, H*.105);
  const max = steps[steps.length-1]*1.08, x0 = W*.08, bw = W*.84, rh = H*.17;
  steps.forEach((v,i)=>{
    const y = H*.27 + i*rh*1.18;
    const on = i<=idx;
    ctx.fillStyle = '#e2e8f0'; g7RR(ctx, x0, y, bw, rh, rh*.25); ctx.fill();
    if(on){ ctx.fillStyle = i===idx ? (i===steps.length-1?'#dc2626':'#f97316') : '#94a3b8'; g7RR(ctx, x0, y, bw*v/max, rh, rh*.25); ctx.fill(); }
    ctx.fillStyle = on ? '#0f172a' : '#94a3b8'; ctx.textAlign = 'left';
    ctx.font = `700 ${Math.round(rh*.5)}px ${G7_FONT}`; ctx.fillText(`Update ${i+1}`, x0+rh*.35, y+rh/2);
    ctx.textAlign = 'right'; ctx.fillStyle = on ? '#fff' : '#94a3b8';
    if(on) ctx.fillText(`${v} km/h`, x0 + bw*v/max - rh*.35, y+rh/2);
    else { ctx.fillStyle = '#94a3b8'; ctx.fillText('…', x0 + bw - rh*.4, y+rh/2); }
  });
  if(idx>0){
    ctx.fillStyle = '#b91c1c'; ctx.textAlign = 'center';
    ctx.font = `800 ${Math.round(H*.085)}px ${G7_FONT}`; ctx.fillText('▲ WIND SPEED INCREASING', W/2, H*.93);
  }
}

// 6 · TYPHOON · Speed and motion — wind-speed updates 40 → 65 → 90 km/h; the learner
// planning to use the hanging bridge should postpone crossing.
function g7WindUpdate(scen){
  const steps = scen.windSteps || [40,65,90];
  buildBridgeScene({wind:steps[steps.length-1], noRider:true, bankMat:g7BankMat()});
  g7Light('storm');
  g7Path([[-20,0],[-6.2,0]], 2, 0x958b7c, .03, 'dirt');

  g7Clear(-10.5,3.8,2.6); g7Clear(-9.4,-5.4,1.6); g7Clear(-13.5,-3.5,3);
  // Barangay weather bulletin board at the bridge approach, its face redrawn live.
  const pm = pbr({color:0x6b4f30,map:woodTex(),roughness:.9});
  [-1,1].forEach(s=>{ const p = new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,3,14), pm); p.position.set(-10.5,1.5,3.8+s*1.35); p.castShadow = true; scene.add(p); });
  const BW = 1024, BH = 640;
  const bcv = g7Canvas(BW, BH, (c)=>g7DrawBulletin(c, BW, BH, steps, 0));
  const btex = g7Tex(bcv);
  const faceM = new THREE.MeshStandardMaterial({map:btex, roughness:.6});
  const frameM = pbr({color:0x5a4028, map:woodTex(), roughness:.85});
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.9,1.8,.08), [frameM,frameM,frameM,frameM,faceM,frameM]);
  board.rotation.y = -Math.PI/2; board.position.set(-10.55,2.15,3.8); board.castShadow = true; scene.add(board);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(.5,.08,3.2), pbr({color:0x8a8a8a,map:giTex(),metalness:.5,roughness:.5})); cap.position.set(-10.45,3.12,3.8); cap.rotation.z = -.2; scene.add(cap);
  const bulletin = g7Label('WEATHER UPDATE', {size:.72, pin:true}); bulletin.position.set(-10.3,3.55,3.8); scene.add(bulletin);
  const trendL = g7Label('Wind speed is INCREASING ▲', {size:.7, fg:'#fecaca', border:'#ef4444'}); trendL.position.set(-10.3,5.75,3.8); trendL.visible = false; scene.add(trendL);

  // Cup anemometer on a mast — spins visibly faster with every update.
  const mast = new THREE.Group(); mast.position.set(-9.4,0,-5.4); scene.add(mast);
  const mm = pbr({color:0xcbd5e1, roughness:.35, metalness:.8, rim:.12});
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.04,.05,3.6,14), mm); pole.position.y = 1.8; pole.castShadow = true; mast.add(pole);
  const rotor = new THREE.Group(); rotor.position.y = 3.65; mast.add(rotor);
  const cupG = new THREE.SphereGeometry(.12,20,12,0,6.28,0,Math.PI/2), cupM = pbr({color:0xef4444, roughness:.4, side:THREE.DoubleSide});
  for(let i=0;i<3;i++){
    const a = i*2.094;
    const armM = new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.5,8), mm); armM.rotation.z = Math.PI/2; armM.position.set(Math.cos(a)*.25,0,Math.sin(a)*.25); armM.rotation.y = -a; rotor.add(armM);
    const cup = new THREE.Mesh(cupG, cupM); cup.position.set(Math.cos(a)*.5,0,Math.sin(a)*.5); cup.rotation.set(0,-a,Math.PI/2); rotor.add(cup);
  }
  g7Tag('Wind-speed meter', -9.4, 4.15, -5.4, {size:.5});

  // Ramp the actual wind in the scene with each update: bridge sway, trees, rain drift.
  const bg = bridgeGroup;
  let idx = -1, since = 0;
  const show = (i)=>{
    idx = i;
    const hist = steps.slice(0,i+1).map(v=>v+' km/h').join('  →  ');
    g7Relabel(bulletin, `WEATHER UPDATE ${i+1}/${steps.length}\n${hist}`, {size:.72, pin:true, border: i>0?'#f97316':undefined});
    trendL.visible = i>0;
    // the music builds with the wind: brighter and stronger at each update
    try{ if(typeof AudioSys!=='undefined' && AudioSys.musicIntensity) AudioSys.musicIntensity(.45 + .25*i); }catch(e){}
    const ctx = bcv.getContext('2d'); ctx.clearRect(0,0,BW,BH); g7DrawBulletin(ctx, BW, BH, steps, i); btex.needsUpdate = true;
  };
  show(0);
  let windNow = steps[0];
  animCallbacks.push((t,dt)=>{
    since += dt;
    if(idx < steps.length-1 && since > 3.2){ since = 0; show(idx+1); }
    windNow += (steps[idx] - windNow) * Math.min(1, dt*1.5);
    G10Wind = windNow;
    if(bg) bg.userData.windK = windNow / steps[steps.length-1];
    rotor.rotation.y -= windNow*.09*dt;
  });

  g7SafePad(-13.5,-3.5,'SAFE PLACE');
  g7Human(-8,1.2, 0x065f46);
  humanGroup.rotation.y = Math.PI/2;
  g7Gateway(-13.5,-3.5,0);
  G7 = { bounds:[-19,-6.4,-9,9], camOff:[4,4.5,5],
    hazards:[{test:(x,z)=> x>-7 && Math.abs(z)<2.5, msg:'⚠ Wind speed keeps increasing — postpone crossing the hanging bridge!'}] };
  g7Camera([-21,6.5,4.5],[-7.5,1.6,-.5]);
}

// ─── CONTROL PHASE (called from updateControl) ───
let g7WarnTimer = null;
function g7Warn(msg){
  const mb = document.getElementById('mission');
  const mt = document.getElementById('m-text');
  if(!mb.classList.contains('warn')){
    mb.classList.add('warn');
    mt.textContent = msg;
    if(navigator.vibrate) navigator.vibrate([40,30,40]);
    AudioSysSafe('warn');
  }
  clearTimeout(g7WarnTimer);
  g7WarnTimer = setTimeout(()=>{
    mb.classList.remove('warn');
    if(ctrl.on && !ctrl.done && ctrl.scen) mt.textContent = missionText(ctrl.proceed, 7);
  }, 1600);
}
function g7InHazard(x,z){
  if(!G7) return null;
  for(const h of G7.hazards) if(h.test(x,z)) return h;
  return null;
}
function g7UpdateControl(dt, s, mv, moving){
  const speed = 3.2;
  const nx = s.position.x + mv.x*speed*dt, nz = s.position.z + mv.z*speed*dt;
  const [x0,x1,z0,z1] = G7 ? G7.bounds : [-20,20,-20,20];
  const cx = THREE.MathUtils.clamp(nx,x0,x1), cz = THREE.MathUtils.clamp(nz,z0,z1);
  const hz = g7InHazard(cx,cz);
  if(hz){
    g7Warn(hz.msg);
    // Slide along the edge: allow whichever single-axis move stays safe.
    if(!g7InHazard(cx, s.position.z)) s.position.x = cx;
    else if(!g7InHazard(s.position.x, cz)) s.position.z = cz;
  } else {
    s.position.x = cx; s.position.z = cz;
  }
  if(moving) s.rotation.y = Math.atan2(mv.x, mv.z);
}
