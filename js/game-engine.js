'use strict';
// ═══════════════════════════════════════════════
//  ULTRA ENGINE — cinematic renderer + physics scenes
// ═══════════════════════════════════════════════
let renderer, scene, camera, clock;
let waterUniforms = [], rain = null;
let humanGroup = null, boatGroup = null, bridgeGroup = null;
let gatewayGroup = null, gatewayActive = false, gatewayPassed = false;
let animCallbacks = [];
let cam = { base: new THREE.Vector3(0,6,-15), target: new THREE.Vector3(0,6,-15), look: new THREE.Vector3(0,1,0), yaw:0, pitch:0 };
let joy = { x:0, y:0, active:false };
let zoomLevel = 1, G10Wind = 0;
let texCache = {};
// ── Quality tiers: auto-detected, manually overridable ──
const REDUCED = matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
let PARTICLE_K = 1;
const TIERS = ['low','medium','high'];
let qTier = (()=>{ // heuristic: cores + pixel ratio
  const c = navigator.hardwareConcurrency||2;
  if(c>=8 && devicePixelRatio>1.3) return 'high';
  if(c>=4) return 'medium';
  return 'low';
})();
function applyTier(){
  if(!renderer) return;
  const t = qTier;
  PARTICLE_K = t==='high'?1 : t==='medium'?.6 : .3;
  // Never render below the display's own density by more than a little: pinning the
  // medium/low tiers to 1.0 on a 2x/3x screen meant the whole frame was upscaled, which
  // is the single biggest reason everything looked soft and "pixelated" on phones.
  renderer.setPixelRatio(Math.min(devicePixelRatio, t==='high'?2 : t==='medium'?1.75 : 1.35));
  const sh = t!=='low';
  if(renderer.shadowMap.enabled !== sh){
    renderer.shadowMap.enabled = sh;
    scene && scene.traverse(o=>{ if(o.material){ (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.needsUpdate=true); } });
  }
  const qb = document.getElementById('q-btn');
  if(qb) qb.textContent = t==='high'?'HD':t==='medium'?'MD':'LO';
}
let ctrl = { on:false, done:false, subject:null, scen:null, grade:0, proceed:true, camOff:new THREE.Vector3() };
let boatDyn = { tilt:.04, off:0, shift:false, sink:.05 };

// Surfaces a plain-language message over the (otherwise silently black) canvas when
// WebGL can't render — e.g. a lost/denied GPU context — instead of leaving students
// staring at a blank screen with no clue what happened.
function showRendererError(msg){
  let el = document.getElementById('renderer-error');
  if(!el){
    el = document.createElement('div');
    el.id = 'renderer-error';
    el.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;flex-direction:column;'
      +'align-items:center;justify-content:center;text-align:center;padding:2rem;background:#000510;'
      +'color:#fff;font-family:inherit;pointer-events:all';
    document.body.appendChild(el);
  }
  el.innerHTML = '<div style="font-size:2rem;margin-bottom:1rem">⚠️</div>'
    + '<div style="font-size:1rem;font-weight:700;margin-bottom:.6rem">3D rendering isn\'t available</div>'
    + '<div style="font-size:.82rem;color:rgba(255,255,255,.6);max-width:360px;line-height:1.5">'
    + msg + ' Try reloading the page, enabling hardware acceleration in your browser\'s settings, '
    + 'or switching browsers.</div>';
  el.style.display = 'flex';
}
function hideRendererError(){
  const el = document.getElementById('renderer-error');
  if(el) el.style.display = 'none';
}

function initThree(){
  const canvas = document.getElementById('c');
  // powerPreference:'default' (rather than 'high-performance') avoids a known class of
  // GPU-switching context instability on hybrid-graphics laptops that otherwise renders
  // a persistently black canvas with no thrown error.
  try{
    renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'default'});
  }catch(e){
    showRendererError('Your browser could not create a WebGL context.');
    throw e;
  }
  // A lost context (driver crash/reset, GPU switch, tab backgrounding under memory
  // pressure) doesn't throw — it just stops drawing, silently, forever. Without these
  // listeners that reads as "the game is just black" with no error in sight.
  canvas.addEventListener('webglcontextlost', e=>{
    e.preventDefault();
    showRendererError('The 3D graphics context was lost.');
  });
  canvas.addEventListener('webglcontextrestored', ()=>{ hideRendererError(); });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputEncoding = THREE.sRGBEncoding;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, .1, 3000); // far plane raised for the distant ranges
  clock = new THREE.Clock();
  addEventListener('resize', ()=>{
    camera.aspect = innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  requestAnimationFrame(animate);
}

let animateErrorLogged = false; // one console.error is enough; don't spam every frame
function animate(){
  requestAnimationFrame(animate);
  // Per-frame updates run inside their own try/catch so a single bad frame (e.g. a
  // transient bad camera-math input) can't silently skip renderer.render() forever —
  // without this, one persistently-throwing callback would leave the canvas stuck
  // black with no visible sign anything was wrong.
  try{
    const dt = Math.min(clock.getDelta(), .1);
    const t = clock.getElapsedTime();
    waterUniforms.forEach(u => u.time.value = t);
    SCATTER_T.value = t;
    if(rain && rain.visible) updateRain(rain, dt);
    for(let i=0;i<animCallbacks.length;i++) animCallbacks[i](t, dt);

    if(ctrl.on && !ctrl.done){
      // ── CONTROL PHASE: joystick drives the subject; camera chases ──
      updateControl(dt, t);
      cam.yaw *= .9; cam.pitch *= .9;
      const wp = new THREE.Vector3();
      if(ctrl.subject){
        ctrl.subject.getWorldPosition(wp);
        cam.look.lerp(new THREE.Vector3(wp.x, wp.y+1.2, wp.z), .1);
        cam.target.copy(wp).add(ctrl.camOff);
      }
      camera.position.lerp(cam.target, .06);
      camera.lookAt(cam.look);
    } else {
      // ── OBSERVE PHASE: joystick orbits camera around look-target ──
      if(joy.active){
        cam.yaw += joy.x * dt * 1.4;
        cam.pitch += joy.y * dt * 0.9;
        cam.pitch = Math.max(-.5, Math.min(.9, cam.pitch));
      }
      const dist = cam.base.distanceTo(cam.look);
      const baseDir = new THREE.Vector3().subVectors(cam.base, cam.look).normalize();
      const baseYaw = Math.atan2(baseDir.x, baseDir.z);
      const yaw = baseYaw + cam.yaw;
      const elev = Math.asin(Math.max(-1, Math.min(1, baseDir.y))) + cam.pitch;
      cam.target.set(
        cam.look.x + Math.sin(yaw)*Math.cos(elev)*dist,
        cam.look.y + Math.sin(elev)*dist,
        cam.look.z + Math.cos(yaw)*Math.cos(elev)*dist
      );
      camera.position.lerp(cam.target, .07);
      camera.lookAt(cam.look);
    }
    camera.fov += ((55/zoomLevel) - camera.fov) * .08;
    camera.updateProjectionMatrix();
  }catch(e){
    if(!animateErrorLogged){ animateErrorLogged = true; console.error('animate() frame update failed, rendering last-known camera/scene state:', e); }
  }
  try{
    renderer.render(scene, camera);
  }catch(e){
    if(!animateErrorLogged){ animateErrorLogged = true; console.error('renderer.render() failed:', e); showRendererError('Something went wrong while drawing the 3D scene.'); }
  }
}

function clearScene(){
  while(scene.children.length) { const o = scene.children[0]; scene.remove(o); dispose(o); }
  animCallbacks = []; waterUniforms = []; rain = null;
  humanGroup = boatGroup = bridgeGroup = gatewayGroup = null;
  gatewayActive = gatewayPassed = false;
  ctrl.on = false; ctrl.done = false; ctrl.subject = null; ctrl.deckOff = 0;
  cam.yaw = 0; cam.pitch = 0; zoomLevel = 1;
  RIM_SCALE.value = 1;
}
function dispose(o){
  if(o.geometry) o.geometry.dispose();
  if(o.material){ Array.isArray(o.material) ? o.material.forEach(m=>m.dispose()) : o.material.dispose(); }
  if(o.children) [...o.children].forEach(dispose);
}
// Fresnel rim light injected into the standard material — the signature stylised-mobile
// -game read: a cool bright edge where a surface turns away from the camera, which lifts
// every object off the background and rounds out its silhouette instead of letting it sit
// flat. Done as a shader patch rather than extra lights so it costs nothing per object.
const RIM_COLOR = new THREE.Color(0xbcdcff);
// Scene-wide multiplier on every rim light (shared uniform, so it applies live without
// recompiling). Grade 7 lowers it for a more natural, less plasticky read; clearScene()
// restores 1 for everything else.
const RIM_SCALE = { value: 1 };
function rimLight(mat, strength){
  const s = strength==null ? .3 : strength;
  mat.onBeforeCompile = (shader)=>{
    shader.uniforms.rimColor = { value: RIM_COLOR };
    shader.uniforms.rimStrength = { value: s };
    shader.uniforms.rimScale = RIM_SCALE;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>',
        '#include <common>\nuniform vec3 rimColor;\nuniform float rimStrength;\nuniform float rimScale;')
      .replace('#include <dithering_fragment>',
        '#include <dithering_fragment>\n'
        + '#ifdef USE_UV\n#endif\n'
        + 'float _rim = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), 2.6);\n'
        + 'gl_FragColor.rgb += rimColor * _rim * rimStrength * rimScale;');
  };
  // Distinct cache key per strength, otherwise three reuses one compiled program for all
  mat.customProgramCacheKey = ()=> 'rim'+s;
  return mat;
}
function pbr(o){
  const strength = (o && o.rim !== undefined) ? o.rim : .3;
  if(o) delete o.rim;
  return rimLight(new THREE.MeshStandardMaterial(Object.assign({roughness:.85, metalness:0}, o)), strength);
}

// ─── LIGHTING MOODS ───
function setupLighting(mood){
  const M = {
    // Fog densities are much thinner than they were (e.g. sunny .011 → .0032). The old
    // values swallowed anything past ~90 units, which is what made every scenario feel
    // like a small walled diorama; now the distant ranges added by addHorizon() stay
    // visible and just haze out with aerial perspective.
    sunny:{amb:0x88aacc,ai:.55,hs:0xaaccff,hg:0x556644,hi:.6,sc:0xfff5e0,si:1.8,sp:[-50,70,30],bg:0x7aadcc,fc:0x9eb8c8,fd:.0032},
    overcast:{amb:0x99aac0,ai:.65,hs:0xa0b0c0,hg:0x556644,hi:.55,sc:0xe8eaf0,si:.9,sp:[-30,60,20],bg:0x8a99ac,fc:0x9aa8bc,fd:.0052},
    storm:{amb:0x556677,ai:.45,hs:0x445566,hg:0x2a2a33,hi:.4,sc:0x99aabc,si:.65,sp:[-30,50,10],bg:0x3a4555,fc:0x3a4555,fd:.0082},
    twilight:{amb:0x6677aa,ai:.5,hs:0x7788aa,hg:0x4a3a22,hi:.55,sc:0xffaa66,si:1.2,sp:[-60,25,30],bg:0x6a5588,fc:0x7a6688,fd:.0048}
  }[mood] || {};
  scene.add(new THREE.AmbientLight(M.amb, M.ai));
  scene.add(new THREE.HemisphereLight(M.hs, M.hg, M.hi));
  const sun = new THREE.DirectionalLight(M.sc, M.si);
  sun.position.set(...M.sp); sun.castShadow = true;
  sun.shadow.mapSize.set(2048,2048);
  sun.shadow.camera.near=.5; sun.shadow.camera.far=250;
  sun.shadow.camera.left=-50; sun.shadow.camera.right=50;
  sun.shadow.camera.top=50; sun.shadow.camera.bottom=-50;
  sun.shadow.bias=-.0004; sun.shadow.normalBias=.02;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x6699bb, .35);
  fill.position.set(30,25,-20); scene.add(fill);
  scene.background = new THREE.Color(M.bg);
  scene.fog = new THREE.FogExp2(M.fc, M.fd);
  addHorizon(mood, M);
  addTreeline(mood, 62, 140, 130);
  addSunShafts(M.sp, M.sc, mood);
  addBirds(mood, 7);
  addSunGlow(M.sp, M.sc);
  addClouds(mood);
  addDustMotes(mood);
  // Cinematic color grading per lighting mood — a plain CSS filter on the canvas
  // itself (see body[data-mood] rules in game.css), so a stormy scene actually reads
  // as cold/desaturated and a sunny one as warm/punchy, instead of every mood sharing
  // one flat color response.
  document.body.dataset.mood = mood;
  return M;
}

// ─── ATMOSPHERE — sun glow, drifting clouds, floating dust motes. Purely additive
// dressing layered on top of the existing lighting/fog/water/shadow system; every
// scene calls clearScene() before rebuilding, so these are re-added fresh each time. ───
function glowTex(key, inner, outer){
  if(texCache[key]) return texCache[key];
  const size = 128;
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(size/2,size/2,0, size/2,size/2,size/2);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  ctx.fillStyle = g; ctx.fillRect(0,0,size,size);
  const tx = new THREE.CanvasTexture(cv);
  texCache[key] = tx;
  return tx;
}
// ─── HORIZON / DISTANT LANDSCAPE ───
// Each scenario used to be a ~80-unit square of terrain floating in fog: look past the
// edge and the world simply stopped. This lays a very large ground disc under
// everything plus three receding rings of ridgelines, each tinted further toward the
// fog colour, so the view carries all the way to a hazy horizon in every direction.
// Bikol is ringed by volcanoes and forested hills, so distant ranges are also correct
// for the setting, not just a way to hide the edge.
function addHorizon(mood, M){
  const fog = new THREE.Color(M.fc || 0x9eb8c8);
  const lowland = new THREE.Color(mood==='storm'?0x3f5142 : mood==='twilight'?0x40483a : 0x54703f);

  // Ground disc far bigger than any scene, so no terrain edge is ever on screen.
  const disc = new THREE.Mesh(new THREE.CircleGeometry(900, 64),
    pbr({color:lowland.clone().lerp(fog,.30), roughness:1, rim:0}));
  disc.rotation.x = -Math.PI/2; disc.position.y = -.55; disc.receiveShadow = false;
  scene.add(disc);

  // Receding ridgelines. Further rings are hazier and lower-contrast — aerial
  // perspective is most of what sells distance.
  const rings = [
    {r:170, n:26, h:[14,30], haze:.50, w:34},
    {r:300, n:22, h:[30,62], haze:.68, w:62},
    {r:470, n:18, h:[46,96], haze:.82, w:96}
  ];
  rings.forEach((ring, ri)=>{
    const col = lowland.clone().lerp(fog, ring.haze);
    const mat = pbr({color:col, roughness:1, rim:0, flatShading:false});
    for(let i=0;i<ring.n;i++){
      const a = (i/ring.n)*Math.PI*2 + (ri*.4) + (vnoise(i/ring.n, ri*.37, 8, 71)-.5)*.22;
      const rr = ring.r * (.85 + vnoise(i/ring.n, ri*.11, 8, 83)*.3);
      const hh = ring.h[0] + vnoise(i/ring.n, ri*.21, 8, 91)*(ring.h[1]-ring.h[0]);
      const peak = new THREE.Mesh(new THREE.ConeGeometry(ring.w*(.6+Math.random()*.6), hh, 5+Math.floor(Math.random()*3)), mat);
      peak.position.set(Math.cos(a)*rr, hh/2 - 6, Math.sin(a)*rr);
      peak.rotation.y = Math.random()*6.28;
      peak.scale.z = .6+Math.random()*.5;   // ridges, not perfect cones
      scene.add(peak);
    }
  });
}

// ─── INSTANCED GROUND COVER ───
// The terrain was bare coloured geometry, which is the last thing that read as "empty
// game level" rather than a real place. All of the scatter below goes through
// InstancedMesh, so hundreds of tufts cost a single draw call, and the sway happens in
// the vertex shader so animating them costs nothing on the CPU either.
const SCATTER_T = { value: 0 };
// A tuft is a fan of real blades: each one tapers to a point and arcs outward, with a
// dark root fading to a lighter tip (vertex colour). The old version used untapered
// rectangular cards, which read as pale boxes standing in the grass rather than grass.
// Normals are bent toward +Y so blades are lit like the ground they grow from instead
// of flashing bright/dark as their flat faces turn toward or away from the sun.
function tuftGeo(h, w, blades){
  const n = Math.max(5, (blades||3)*3);
  const SEG = 4, gs = [];
  for(let k=0;k<n;k++){
    const a = (k/n)*Math.PI*2 + (_hash2(k,h*10,3)-.5)*.9;
    const bh = h*(.62 + _hash2(k,w*10,5)*.5);
    const bw = w*.32*(.75 + _hash2(k,7,9)*.5);
    const lean = .18 + _hash2(k,11,13)*.5;              // outward arc, stronger toward the tip
    const pos = [], nor = [], col = [], uv = [], idx = [];
    for(let s=0;s<=SEG;s++){
      const f = s/SEG, half = bw*(1-f)*.5 + bw*.02;
      const out = lean*f*f*bh, y = bh*f*(1-.12*f*f);
      const shade = .42 + .58*Math.pow(f,.8);
      [-1,1].forEach(sd=>{
        pos.push(sd*half, y, out);
        nor.push(0, .85, .5);
        col.push(shade, shade, shade);
        uv.push(sd<0?0:1, f);
      });
      if(s<SEG){ const b = s*2; idx.push(b,b+1,b+2, b+1,b+3,b+2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor,3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col,3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
    g.setIndex(idx);
    g.rotateY(a);
    g.translate(Math.cos(a)*w*.12, 0, Math.sin(a)*w*.12);
    gs.push(g);
  }
  return mergeGeos(gs);
}
// Bend the tips only — grass pivots at the root, so displacement scales with height.
function makeSwayMaterial(colorHex, bendK){
  const mat = pbr({color:colorHex, roughness:.92, side:THREE.DoubleSide, vertexColors:true, rim:.05});
  const prev = mat.onBeforeCompile;           // keep the rim-light patch from pbr()
  const k = bendK==null ? .16 : bendK;
  mat.onBeforeCompile = (sh)=>{
    prev(sh);
    sh.uniforms.sTime = SCATTER_T;
    sh.uniforms.sBend = { value:k };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float sTime;\nuniform float sBend;')
      .replace('#include <begin_vertex>',
        '#include <begin_vertex>\n'
        + '#ifdef USE_INSTANCING\n'
        + '  vec3 iw = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);\n'
        + '  float amp = transformed.y * sBend;\n'
        + '  transformed.x += sin(sTime*1.7 + iw.x*0.55 + iw.z*0.4) * amp;\n'
        + '  transformed.z += cos(sTime*1.3 + iw.x*0.45) * amp * 0.6;\n'
        + '#endif\n');
  };
  mat.customProgramCacheKey = ()=> 'sway'+k;
  return mat;
}
// place(i) returns {x,z,s} or null to skip that instance (roads, water, footpaths).
function addScatter(geo, mat, count, place){
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3();
  let n = 0;
  for(let i=0;i<count*3 && n<count;i++){
    const p = place(i);
    if(!p) continue;
    e.set(0, Math.random()*6.28, (Math.random()-.5)*.14);
    q.setFromEuler(e);
    v.set(p.s*(.85+Math.random()*.3), p.s*(.8+Math.random()*.5), p.s);
    m.compose(new THREE.Vector3(p.x, p.y||0, p.z), q, v);
    inst.setMatrixAt(n++, m);
  }
  inst.count = n;                       // trim unused slots
  inst.instanceMatrix.needsUpdate = true;
  inst.castShadow = false;              // hundreds of tiny shadow casters isn't worth it
  inst.receiveShadow = true;
  inst.frustumCulled = false;
  scene.add(inst);
  return inst;
}
// Convenience: grass + weeds + pebbles over a region, with an exclusion test.
function addGroundCover(cfg){
  const ok = cfg.ok || (()=>true);
  const rand = ()=>({ x:(Math.random()-.5)*cfg.w, z:(Math.random()-.5)*cfg.d });
  const grassM = makeSwayMaterial(cfg.grass||0x59873a, .18);
  addScatter(tuftGeo(.55,.30,3), grassM, Math.floor((cfg.n||520)*Math.max(.35,PARTICLE_K)), ()=>{
    const p = rand(); if(!ok(p.x,p.z)) return null;
    return {x:p.x, z:p.z, y:cfg.y||0, s:.7+Math.random()*.8};
  });
  const weedM = makeSwayMaterial(cfg.weed||0x6d9a46, .22);
  addScatter(tuftGeo(1.05,.20,2), weedM, Math.floor((cfg.n||520)*.28*Math.max(.35,PARTICLE_K)), ()=>{
    const p = rand(); if(!ok(p.x,p.z)) return null;
    return {x:p.x, z:p.z, y:cfg.y||0, s:.6+Math.random()*.8};
  });
  if(cfg.pebbles !== false){
    const pm = pbr({color:0x8e8779, roughness:.95, rim:.1});
    addScatter(blobGeo(.11,10,.5,3), pm, Math.floor(90*Math.max(.35,PARTICLE_K)), ()=>{
      const p = rand(); if(!ok(p.x,p.z)) return null;
      return {x:p.x, z:p.z, y:(cfg.y||0)+.02, s:.5+Math.random()*1.1};
    });
  }
}
// Mid-distance treeline: fills the gap between the village and the far ranges so the
// eye never crosses an empty band. One draw call for the whole belt.
function addTreeline(mood, inner, outer, count){
  const trunkM = pbr({color:0x4d3f2c, roughness:1, rim:.1});
  const canopyM = pbr({color: mood==='storm'?0x2c4430 : mood==='twilight'?0x2f4230 : 0x3c6b34, roughness:1, rim:.12});
  const trunkG = new THREE.CylinderGeometry(.22,.32,3.2,7); trunkG.translate(0,1.6,0);
  const canG = mergeGeos([
    (()=>{ const g=new THREE.ConeGeometry(1.9,4.2,8); g.translate(0,4.4,0); return g; })(),
    (()=>{ const g=new THREE.ConeGeometry(1.4,3.0,8); g.translate(0,6.2,0); return g; })()
  ]);
  const pick = ()=>{
    const a = Math.random()*6.28, r = inner + Math.random()*(outer-inner);
    return {x:Math.cos(a)*r, z:Math.sin(a)*r, y:-.3, s:.9+Math.random()*1.5};
  };
  const spots = [];
  for(let i=0;i<count;i++) spots.push(pick());
  let i1=0, i2=0;
  addScatter(trunkG, trunkM, count, ()=> spots[i1++] || null);
  addScatter(canG, canopyM, count, ()=> spots[i2++] || null);
}
// Volumetric-looking sun shafts: a few long additive cones aimed down the sun vector.
// Cheap stand-in for real god rays (which would need a post-processing pass).
function addSunShafts(sunPos, sunColor, mood){
  if(mood==='storm' || mood==='overcast') return;   // no shafts through heavy cloud
  const dir = new THREE.Vector3(...sunPos).normalize();
  // Wide and very faint: narrow bright cones read as solid geometric wedges rather
  // than light, so these are broadened and dropped to a level you notice only as a
  // warm gradient across the upper frame.
  const mat = new THREE.MeshBasicMaterial({ color:sunColor||0xfff2d0, transparent:true, opacity:.02,
    blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide });
  const shafts = [];
  for(let i=0;i<3;i++){
    const g = new THREE.ConeGeometry(16+Math.random()*14, 130, 12, 1, true);
    const c = new THREE.Mesh(g, mat.clone());
    c.position.copy(dir).multiplyScalar(60).add(new THREE.Vector3((Math.random()-.5)*40,0,(Math.random()-.5)*40));
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir);
    c.renderOrder = 2;
    scene.add(c); shafts.push({c, ph:Math.random()*6.28});
  }
  animCallbacks.push((t)=>{ shafts.forEach(o=>{ o.c.material.opacity = .016 + Math.sin(t*.25+o.ph)*.008; }); });
}

// ─── AMBIENT LIFE ───
// Distant birds wheeling on a slow circuit. Tiny two-triangle silhouettes with a
// flap cycle — at range that's all the eye needs, and a still sky is the fastest way
// to make an outdoor scene feel like a diorama.
function addBirds(mood, count){
  if(mood==='storm') return; // nothing is flying in a typhoon, and that reads as a cue
  const n = Math.max(3, Math.floor((count||7)*PARTICLE_K));
  const mat = pbr({color:0x2c3440, roughness:1, side:THREE.DoubleSide, rim:0});
  const flock = [];
  for(let i=0;i<n;i++){
    const b = new THREE.Group();
    const wings = [];
    [-1,1].forEach(sd=>{
      const w = new THREE.Mesh(new THREE.PlaneGeometry(.9,.34), mat);
      w.position.x = sd*.45; w.rotation.y = Math.PI/2;
      b.add(w); wings.push({w, sd});
    });
    const R = 55+Math.random()*70, H = 26+Math.random()*26;
    const spd = .05+Math.random()*.05, ph = Math.random()*6.28;
    scene.add(b);
    flock.push({b, wings, R, H, spd, ph, flap:.9+Math.random()*.7});
  }
  animCallbacks.push((t)=>{
    flock.forEach(o=>{
      const a = t*o.spd + o.ph;
      o.b.position.set(Math.cos(a)*o.R, o.H + Math.sin(t*.35+o.ph)*2.2, Math.sin(a)*o.R);
      o.b.rotation.y = -a + Math.PI/2;
      const f = Math.sin(t*o.flap*6+o.ph)*.6;
      o.wings.forEach(({w,sd})=>{ w.rotation.x = sd*f; });
    });
  });
}

// Leaves and light debris torn loose and carried on the wind. Scales with G10Wind, so
// a 110 km/h scenario is visibly full of flying material and a 30 km/h one is calm.
function addWindDebris(strength){
  if(strength <= 0) return;
  const n = Math.max(8, Math.floor(strength*.55*PARTICLE_K));
  const cols = [0x4f7a2e, 0x6d8a3a, 0x8a7038, 0xa89a5a];
  const bits = [];
  for(let i=0;i<n;i++){
    const m = new THREE.Mesh(new THREE.PlaneGeometry(.16+Math.random()*.16, .1+Math.random()*.12),
      pbr({color:cols[i%cols.length], roughness:.9, side:THREE.DoubleSide, rim:.15}));
    m.position.set((Math.random()-.5)*44, Math.random()*9, (Math.random()-.5)*34);
    scene.add(m);
    bits.push({m, sp:.7+Math.random()*1.5, ph:Math.random()*6.28, spin:(Math.random()-.5)*4});
  }
  animCallbacks.push((t,dt)=>{
    const drive = strength*.010;
    bits.forEach(o=>{
      o.m.position.x += drive*o.sp*dt;
      o.m.position.y += Math.sin(t*1.6+o.ph)*.012;
      o.m.position.z += Math.cos(t*1.1+o.ph)*.010;
      o.m.rotation.x += o.spin*dt; o.m.rotation.z += o.spin*.7*dt;
      if(o.m.position.x > 24){ o.m.position.x = -24; o.m.position.y = Math.random()*9; }
      if(o.m.position.y < .1) o.m.position.y = .1;
    });
  });
}

function addSunGlow(sunPos, sunColor){
  if(!sunPos) return;
  const tex = glowTex('sunglow', 'rgba(255,255,255,.95)', 'rgba(255,255,255,0)');
  const mat = new THREE.SpriteMaterial({map:tex, color:sunColor||0xffffff, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false});
  const spr = new THREE.Sprite(mat);
  const dir = new THREE.Vector3(...sunPos).normalize();
  spr.position.copy(dir.multiplyScalar(1150));
  spr.scale.set(260,260,1);
  scene.add(spr);
}
function addClouds(mood){
  if(mood==='storm') return; // rain already carries the storm atmosphere; clouds would just clutter it
  const tex = glowTex('cloudpuff', 'rgba(255,255,255,.9)', 'rgba(255,255,255,0)');
  const count = mood==='overcast' ? 9 : 5;
  const opacity = mood==='overcast' ? .5 : .32;
  for(let i=0;i<count;i++){
    const mat = new THREE.SpriteMaterial({map:tex, transparent:true, opacity, depthWrite:false});
    const spr = new THREE.Sprite(mat);
    const ang = Math.random()*Math.PI*2, dist = 260+Math.random()*420;
    spr.position.set(Math.cos(ang)*dist, 120+Math.random()*110, Math.sin(ang)*dist);
    const s = 130+Math.random()*180;
    spr.scale.set(s, s*.5, 1);
    scene.add(spr);
    const driftSeed = Math.random()*10;
    animCallbacks.push((t)=>{ spr.position.x += Math.sin(t*.015+driftSeed)*.004; });
  }
}
function addDustMotes(mood){
  if(mood==='storm') return; // rain particles fill this role in stormy scenes
  const count = Math.max(16, Math.floor(36*PARTICLE_K));
  const p = new Float32Array(count*3);
  for(let i=0;i<count;i++){ p[i*3]=(Math.random()-.5)*36; p[i*3+1]=Math.random()*7; p[i*3+2]=(Math.random()-.5)*36; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p,3));
  // Round soft sprite, not the default square GL point.
  const m = new THREE.PointsMaterial({color:0xfff6e0, size:.07, map:glowTex('mote','rgba(255,255,255,1)','rgba(255,255,255,0)'), transparent:true, opacity:.35, depthWrite:false});
  const pts = new THREE.Points(g, m);
  scene.add(pts);
  animCallbacks.push((t,dt)=>{ pts.rotation.y += dt*.02; });
}

function skyDome(top, bot){
  const geo = new THREE.SphereGeometry(1500, 64, 32); // must enclose the horizon rings + ground disc
  const mat = new THREE.ShaderMaterial({ side:THREE.BackSide,
    uniforms:{ tc:{value:new THREE.Color(top)}, bc:{value:new THREE.Color(bot)} },
    vertexShader:`varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader:`uniform vec3 tc,bc; varying vec3 vP; void main(){ float h=normalize(vP).y; gl_FragColor=vec4(mix(bc,tc,max(0.,h)),1.); }`
  });
  scene.add(new THREE.Mesh(geo, mat));
}

// ─── PROCEDURAL TEXTURES (cached) ───
// Smooth, seamlessly-tiling value noise. Every texture below used to call
// Math.random() per pixel, which is white noise — that is what made the surfaces read
// as gritty/pixelated no matter how high the render resolution went. This is a
// bilinear-interpolated lattice with smoothstep easing, so grain becomes soft mottling.
function _hash2(x,y,s){ const n = Math.sin(x*127.1 + y*311.7 + s*74.7)*43758.5453; return n-Math.floor(n); }
function vnoise(u,v,freq,seed){
  seed = seed||0;
  const x = u*freq, y = v*freq;
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x-xi, yf = y-yi;
  const sx = xf*xf*(3-2*xf), sy = yf*yf*(3-2*yf);
  const w = (n)=>((n%freq)+freq)%freq;              // wrap the lattice so tiles seam-match
  const x0=w(xi), x1=w(xi+1), y0=w(yi), y1=w(yi+1);
  const n00=_hash2(x0,y0,seed), n10=_hash2(x1,y0,seed);
  const n01=_hash2(x0,y1,seed), n11=_hash2(x1,y1,seed);
  return (n00*(1-sx)+n10*sx)*(1-sy) + (n01*(1-sx)+n11*sx)*sy;
}
// Fractal sum — a couple of octaves reads as natural material variation.
function fbm(u,v,freq,seed){
  return vnoise(u,v,freq,seed)*.62 + vnoise(u,v,freq*2,(seed||0)+11)*.26 + vnoise(u,v,freq*4,(seed||0)+23)*.12;
}
// Smooth rolling terrain jitter in world units (replaces per-vertex Math.random(),
// which produced spiky, speckled ground).
function tnoise(x,z){ return fbm(x*.035+.5, z*.035+.5, 8, 31); }
function noiseTex(key, size, fn){
  if(texCache[key]) return texCache[key];
  size = Math.max(size, 512); // 256 was visibly soft/blocky once stretched over a wall
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d'); const img = ctx.createImageData(size, size);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++){
    const i=(y*size+x)*4; const [r,g,b]=fn(x/size,y/size);
    img.data[i]=r; img.data[i+1]=g; img.data[i+2]=b; img.data[i+3]=255;
  }
  ctx.putImageData(img,0,0);
  const tx = new THREE.CanvasTexture(cv);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  // Trilinear mipmapping + max anisotropy: without these, a tiled texture viewed at a
  // grazing angle (every ground plane and wall in this game) aliases into shimmer.
  tx.generateMipmaps = true;
  tx.minFilter = THREE.LinearMipmapLinearFilter;
  tx.magFilter = THREE.LinearFilter;
  if(renderer && renderer.capabilities) tx.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tx.needsUpdate = true;
  texCache[key] = tx;
  return tx;
}
// Smooth, evenly-tessellated blob with true spherical normals — the rounded organic
// silhouette this art direction wants, instead of a visibly faceted low-poly lump.
function blobGeo(r, seg, wob, seed){
  const g = new THREE.SphereGeometry(r, seg||24, Math.round((seg||24)*.7));
  if(wob){
    const p = g.attributes.position;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i), y=p.getY(i), z=p.getZ(i);
      const l=Math.hypot(x,y,z)||1;
      const k = 1 + (vnoise((Math.atan2(z,x)/6.283)+.5, (y/l)*.5+.5, 4, seed||0)-.5)*wob;
      p.setXYZ(i, x*k, y*k, z*k);
    }
    g.computeVertexNormals(); // indexed sphere → averaged, i.e. smooth-shaded
  }
  return g;
}
function stoneTex(){ return noiseTex('stone',256,(u,v)=>{
  const c=(Math.sin(u*80)*Math.cos(v*60)+Math.sin(v*100+u*40))*.5, g=(fbm(u,v,16,3)-.5)*.35;
  return [180+c*30+g*40, 175+c*28+g*38, 165+c*25+g*35];
});}
function woodTex(){ return noiseTex('wood',256,(u,v)=>{
  const gr=Math.sin(v*60+Math.sin(u*4)*8+fbm(u,v,8,7)*3)*.5+.5, kn=Math.max(0,Math.sin(u*8)*Math.sin(v*6))*.3;
  return [110+gr*50+kn*20, 75+gr*35+kn*15, 45+gr*20+kn*10];
});}
function terraTex(){ return noiseTex('terra',256,(u,v)=>{
  const tf=Math.abs((u*16)%1-.5)*2, tv=Math.abs((v*8)%1-.5)*2;
  const e=tf>.85||tv>.85, va=(fbm(u,v,12,5)-.5)*.5;
  return e?[120+va*30,65+va*20,40+va*15]:[175+va*40,90+va*25,55+va*20];
});}
// ─── PHILIPPINE PROVINCIAL MATERIALS ───
// Corrugated galvanised-iron ("yero") sheet — the near-universal roof in a Philippine
// barangay: vertical ribs, rust blooming along the laps and fixings.
function giTex(){ return noiseTex('gi',256,(u,v)=>{
  const rib = Math.sin(u*150)*.5+.5;
  const lap = Math.abs((v*4)%1-.5)*2 > .93 ? .75 : 1;      // sheet overlap lines
  const rust = Math.max(0, Math.sin(u*6.3+1.7)*Math.sin(v*4.1)) * (fbm(u,v,8,13)*.7+.45);
  const base = (138 + rib*46) * lap;
  return [base*(1-rust*.28)+rust*118, base*(1-rust*.55)+rust*58, base*(1-rust*.72)+rust*30];
});}
// Nipa / cogon thatch — overlapping rows of dried palm leaf, offset row to row.
function nipaTex(){ return noiseTex('nipa',256,(u,v)=>{
  const row = Math.floor(v*24), off = (row%2)*.5;
  const blade = Math.abs(((u*36+off)%1)-.5)*2;
  const shade = .68 + (1-blade)*.32 - (v*24-row)*.16;
  const va = (fbm(u,v,16,17)-.5)*.45;
  return [(128+va*40)*shade, (96+va*30)*shade, (52+va*20)*shade];
});}
// Sawali — woven split-bamboo panelling used for bahay-kubo walls.
function sawaliTex(){ return noiseTex('sawali',256,(u,v)=>{
  const cu = Math.floor(u*22)%2, cv = Math.floor(v*22)%2;
  const over = cu===cv, va = (fbm(u,v,20,19)-.5)*.4;
  const s = over?1:.82;
  return [(196+va*40)*s, (166+va*34)*s, (112+va*24)*s];
});}
// Unpainted concrete hollow block, with the mortar courses showing.
function blockTex(){ return noiseTex('block',256,(u,v)=>{
  const rowF = v*10, row = Math.floor(rowF), off = (row%2)*.5;
  const colF = (u*6+off)%1;
  const mortar = (rowF-row) > .9 || colF > .94;
  const va = (fbm(u,v,14,23)-.5)*.5;
  const b = mortar ? 186 : 164+va*26;
  return [b, b*0.985, b*0.94];
});}
function grassTexF(key, a, b){ return noiseTex(key,256,(u,v)=>{
  const A=new THREE.Color(a), B=new THREE.Color(b);
  const n=Math.sin(u*30)*Math.sin(v*30)*.28+(Math.sin(u*90+v*45)+Math.sin(v*70-u*35))*.12+fbm(u,v,10,29)*.42;
  const t=Math.max(0,Math.min(1,.4+n)); const c=A.clone().lerp(B,t);
  return [c.r*255,c.g*255,c.b*255];
});}

// ─── TERRAIN ───
function makeTerrain(w,d,segs,hFn,colA,colB){
  const geo = new THREE.PlaneGeometry(w,d,segs,segs);
  geo.rotateX(-Math.PI/2);
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count*3);
  const A=new THREE.Color(colA), B=new THREE.Color(colB||colA);
  for(let i=0;i<pos.count;i++){
    const px = pos.getX(i), pz = pos.getZ(i);
    const h = hFn(px, pz);
    pos.setY(i,h);
    const t=Math.max(0,Math.min(1,(h+.3)/2));
    const c=A.clone().lerp(B, t+(fbm(px*.06+.5, pz*.06+.5, 8, 41)-.5)*.4);
    cols[i*3]=c.r; cols[i*3+1]=c.g; cols[i*3+2]=c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols,3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, pbr({vertexColors:true, roughness:.95}));
  m.receiveShadow = true;
  return m;
}

// ─── WATER (Gerstner-ish swells + procedural ripple normals, fresnel, soft edges) ───
// opts (all optional): refl: sky-reflection strength (lower in a shaded gorge),
// flow:[x,z] current direction × speed in units/s, muddy:true for
// floodwater (low gloss, suspended-silt mottling, no glitter), edge: soft-fade width in
// world units so the sheet melts into the ground instead of ending in a hard rectangle,
// amp: swell amplitude multiplier. The fragment shader uses smooth value noise only —
// the previous version quantised foam and sparkle with floor(vUv*90.), which is
// literally a grid of square pixels laid over the water.
function makeWater(w,d,depth,cShallow,cDeep,segs,opts){
  segs = segs || 90;
  opts = opts || {};
  const fl = opts.flow || [.12,.08];
  const uni = {
    time:{value:0}, depth:{value:depth},
    cs:{value:new THREE.Color(cShallow)}, cd:{value:new THREE.Color(cDeep)},
    sunDir:{value:new THREE.Vector3(-1,.6,.3).normalize()},
    sky:{value:(scene && scene.background) ? scene.background.clone() : new THREE.Color(0x6a9ac0)},
    flow:{value:new THREE.Vector2(fl[0], fl[1])},
    size:{value:new THREE.Vector2(w, d)},
    edge:{value: opts.edge==null ? .35 : opts.edge},
    muddy:{value: opts.muddy ? 1 : 0},
    amp:{value: opts.amp==null ? 1 : opts.amp},
    refl:{value: opts.refl==null ? 1 : opts.refl},
    fogColor:{value:new THREE.Color()}, fogDensity:{value:0}
  };
  const mat = new THREE.ShaderMaterial({ uniforms:uni, transparent:true, side:THREE.DoubleSide, depthWrite:false, fog:true,
    vertexShader:`uniform float time; uniform float amp; uniform vec2 flow; varying vec2 vUv; varying float vH; varying vec3 vN; varying vec3 vW; varying float vFogDepth;
    void main(){ vUv=uv; vec3 p=position;
      vec2 q=p.xz - flow*time*.6;
      float w1=sin(q.x*1.4+time*1.4)*.07, w2=sin(q.y*1.8+time*1.1)*.055;
      float w3=sin((q.x+q.y*.7)*.9+time*1.7)*.04, w4=sin((q.x*2.3-q.y*1.5)+time*2.2)*.025;
      float wv=(w1+w2+w3+w4)*amp; p.y+=wv; vH=wv;
      float dx=(cos(q.x*1.4+time*1.4)*.098+cos((q.x+q.y*.7)*.9+time*1.7)*.036+cos((q.x*2.3-q.y*1.5)+time*2.2)*.0575)*amp;
      float dz=(cos(q.y*1.8+time*1.1)*.099+cos((q.x+q.y*.7)*.9+time*1.7)*.028-cos((q.x*2.3-q.y*1.5)+time*2.2)*.0375)*amp;
      vN=normalize(vec3(-dx,1.,-dz));
      vec4 wp=modelMatrix*vec4(p,1.); vW=wp.xyz;
      vec4 mv=viewMatrix*wp; vFogDepth=-mv.z;
      gl_Position=projectionMatrix*mv; }`,
    fragmentShader:`uniform float time; uniform float depth; uniform vec3 cs,cd,sunDir,sky; uniform vec2 flow,size;
    uniform float edge, muddy, refl; uniform vec3 fogColor; uniform float fogDensity;
    varying vec2 vUv; varying float vH; varying vec3 vN; varying vec3 vW; varying float vFogDepth;
    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
    float fbm(vec2 p){ return vn(p)*.55 + vn(p*2.03+3.1)*.3 + vn(p*4.01+7.7)*.15; }
    // Ripple height field drifting with the current; its gradient perturbs the normal.
    float rip(vec2 p){ return fbm(p*1.6 - flow*time*1.6) * .6 + vn(p*5.2 - flow*time*2.6 + 11.) * .4; }
    void main(){
      vec2 p=vW.xz;
      float e=.06, h0=rip(p), hx=rip(p+vec2(e,0.)), hz=rip(p+vec2(0.,e));
      vec3 n=normalize(vN + vec3(h0-hx, 0., h0-hz) * mix(2.2, 1.9, muddy));
      float dm=clamp(depth*1.2,0.,1.);
      float silt=fbm(p*.22 - flow*time*.25);
      vec3 col=mix(cs,cd,clamp(dm + (silt-.5)*mix(.25,.55,muddy),0.,1.));
      vec3 vd=normalize(cameraPosition-vW);
      // Reflection of a sky gradient (bright at the horizon, deeper overhead) along the
      // rippled reflection vector — the ripples show up as moving bands of reflected
      // light, which is what makes a surface read as water rather than wet ground.
      float fr=.06 + .94*pow(1.-max(dot(vd,n),0.),3.);
      vec3 rv=reflect(-vd,n);
      vec3 skyC=mix(mix(sky,vec3(.92,.94,.97),.25)*1.05, sky*.8, clamp(rv.y*1.6,0.,1.));
      col=mix(col, skyC, clamp((fr*mix(.9,.85,muddy) + muddy*.12)*refl,0.,1.));
      vec3 rd=reflect(-sunDir,n);
      float sp=max(dot(vd,rd),0.);
      col+=vec3(1.,.98,.92)*(pow(sp,mix(140.,60.,muddy))*mix(1.1,.7,muddy) + pow(sp,10.)*mix(.08,.07,muddy));
      // Soft foam streaks stretched along the current, plus a little froth on wave crests.
      vec2 fd=normalize(flow+vec2(1e-4)); vec2 fp=vec2(dot(p,fd), dot(p,vec2(-fd.y,fd.x)));
      float streak=smoothstep(.62,.86, fbm(vec2(fp.x*.35, fp.y*2.2) - vec2(length(flow)*time*.9,0.)));
      float crest=smoothstep(.05,.11,vH);
      float foam=clamp(streak*min(1.,length(flow)*.9)*.55 + crest*.25, 0., 1.);
      col=mix(col, mix(vec3(.93,.95,.97), vec3(.78,.72,.6), muddy), foam*.6);
      // Soft edge: fade out over the last few tenths of a unit and add shoreline froth.
      vec2 dE=min(vUv,1.-vUv)*size; float de=min(dE.x,dE.y);
      float ea = edge>0. ? smoothstep(0., edge, de) : 1.;
      float shore = edge>0. ? (1.-smoothstep(0., edge*2.2, de))*smoothstep(.35,.7,vn(p*3.+time*.4)) : 0.;
      col=mix(col, mix(vec3(.9,.92,.94), vec3(.72,.66,.54), muddy), shore*.45);
      float a=mix(.8,.93,dm) + muddy*.06 + foam*.1;
      float fogF=1.-exp(-fogDensity*fogDensity*vFogDepth*vFogDepth);
      col=mix(col, fogColor, clamp(fogF,0.,1.));
      gl_FragColor=vec4(col, clamp(a,0.,1.)*ea); }`
  });
  // fog:true + fogColor/fogDensity uniforms → three refreshes them from scene.fog each frame.
  waterUniforms.push(uni);
  const geo = new THREE.PlaneGeometry(w,d,segs,segs);
  geo.rotateX(-Math.PI/2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  return mesh;
}

// ─── RAIN ───
// Each drop is a short motion-blur streak (a line segment), the way rain actually
// reads to the eye and on camera. It used to be a cloud of square GL points, which up
// close show as hard little boxes — one of the main "pixelated" artefacts.
function makeRain(count,aw,ah,ad,intensity){
  count = Math.max(200, Math.floor(count*PARTICLE_K*.7));
  const p = new Float32Array(count*6), v = new Float32Array(count);
  const c = new Float32Array(count*6);
  for(let i=0;i<count;i++){
    const x=(Math.random()-.5)*aw, y=Math.random()*ah, z=(Math.random()-.5)*ad;
    p[i*6]=x; p[i*6+1]=y; p[i*6+2]=z; p[i*6+3]=x; p[i*6+4]=y+.3; p[i*6+5]=z;
    v[i]=8+Math.random()*5;
    const b = .75+Math.random()*.25;
    c[i*6]=c[i*6+1]=c[i*6+2]=b;              // head of the streak
    c[i*6+3]=c[i*6+4]=c[i*6+5]=b*.45;         // tail fades toward the background
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p,3));
  g.setAttribute('color', new THREE.BufferAttribute(c,3));
  g.userData = {vel:v, h:ah, w:aw, d:ad, k:intensity};
  const ls = new THREE.LineSegments(g, new THREE.LineBasicMaterial({color:0xc4d0dc, vertexColors:true, transparent:true, opacity:.32, depthWrite:false}));
  ls.frustumCulled = false;
  return ls;
}
function updateRain(pts, dt){
  const p = pts.geometry.attributes.position.array;
  const {vel,h,w,d,k} = pts.geometry.userData;
  const drift = G10Wind*.05;                      // sideways speed, units/s
  for(let i=0;i<vel.length;i++){
    const o = i*6, vy = vel[i]*k;
    p[o+1] -= vy*dt; p[o] += drift*dt;
    if(p[o+1] < -.5){ p[o+1]=h; p[o]=(Math.random()-.5)*w; p[o+2]=(Math.random()-.5)*d; }
    if(p[o] > w*.5) p[o] -= w;
    // Tail trails the head along the velocity, so streaks lean with the wind.
    const L = .045;
    p[o+3] = p[o] - drift*L; p[o+4] = p[o+1] + vy*L; p[o+5] = p[o+2];
  }
  pts.geometry.attributes.position.needsUpdate = true;
}
// Horizontal wind streaks (gust lines) — same idea as rain streaks, travelling with
// the wind instead of falling. Replaces square GL points.
function makeWindStreaks(n, aw, ah, ad, wind){
  const p = new Float32Array(n*6), sp = new Float32Array(n);
  for(let i=0;i<n;i++){
    const x=(Math.random()-.5)*aw, y=.3+Math.random()*ah, z=(Math.random()-.5)*ad, L=.4+Math.random()*1.1;
    p[i*6]=x; p[i*6+1]=y; p[i*6+2]=z; p[i*6+3]=x-L; p[i*6+4]=y; p[i*6+5]=z;
    sp[i]=.7+Math.random()*.6;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p,3));
  const ls = new THREE.LineSegments(g, new THREE.LineBasicMaterial({color:0xdfe8f0, transparent:true, opacity:.22, depthWrite:false}));
  ls.frustumCulled = false;
  scene.add(ls);
  animCallbacks.push((t,dt)=>{
    const a = ls.geometry.attributes.position.array, v = G10Wind*.11;
    for(let i=0;i<n;i++){
      const dx = v*sp[i]*dt; a[i*6]+=dx; a[i*6+3]+=dx;
      if(a[i*6+3] > aw*.5){ a[i*6]-=aw; a[i*6+3]-=aw; }
    }
    ls.geometry.attributes.position.needsUpdate = true;
  });
  return ls;
}

// ─── VEGETATION ───
// Coconut palm bark: stacked leaf-scar rings left behind as old fronds drop, which is
// what actually gives a coconut trunk its banded look.
function palmBarkTex(){ return noiseTex('palmbark',512,(u,v)=>{
  const ring = Math.abs(((v*40)%1)-.5)*2;
  const band = ring>.58 ? .74 : 1;
  const n = fbm(u,v,14,61);
  const b = (116 + n*52) * band;
  return [b, b*.84, b*.66];
});}

// A single frond: a drooping rachis carrying leaflets down both sides, longest at the
// middle and tapering to the tip — a palm frond is a feather, not a flat paddle.
// Merge a list of transformed geometries into one buffer. three's BufferGeometryUtils
// lives in examples/ and isn't loaded here, so this does the concatenation directly.
// Without it a single palm is ~900 separate meshes — dense fronds are cheap in
// triangles but ruinous in draw calls, which is what actually costs frame time.
function mergeGeos(list){
  let n = 0;
  const parts = list.map(g=>{ const ng = g.index ? g.toNonIndexed() : g; n += ng.attributes.position.count; return ng; });
  const hasCol = parts.every(g=>g.attributes.color);   // carried through when every part has one (grass blades)
  const pos = new Float32Array(n*3), nor = new Float32Array(n*3), uv = new Float32Array(n*2);
  const col = hasCol ? new Float32Array(n*3) : null;
  let po = 0, uo = 0;
  parts.forEach(g=>{
    pos.set(g.attributes.position.array, po);
    if(g.attributes.normal) nor.set(g.attributes.normal.array, po);
    if(g.attributes.uv) uv.set(g.attributes.uv.array, uo);
    if(col) col.set(g.attributes.color.array, po);
    po += g.attributes.position.count*3;
    uo += g.attributes.position.count*2;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos,3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor,3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv,2));
  if(col) out.setAttribute('color', new THREE.BufferAttribute(col,3));
  out.computeBoundingSphere();
  return out;
}

function makeFrond(L, s, leafMat, ribMat, dead){
  const fr = new THREE.Group();
  const RIB = 12, N = 26;      // 26 leaflet pairs: sparser spacing read as a comb
  const yAt = (t)=> Math.sin(t*1.9)*L*.16 - Math.pow(t,2.5)*L*(dead?1.15:.62);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0,1,0);
  const one = new THREE.Vector3(1,1,1);

  // rachis (midrib), built from short segments so it curves — merged into one mesh
  const ribGeos = [];
  for(let j=0;j<RIB;j++){
    const t0=j/RIB, t1=(j+1)/RIB;
    const a=new THREE.Vector3(t0*L, yAt(t0), 0), b=new THREE.Vector3(t1*L, yAt(t1), 0);
    const g = new THREE.CylinderGeometry(.030*s*(1-t0*.7),.030*s*(1-t1*.7),a.distanceTo(b),8);
    q.setFromUnitVectors(up, b.clone().sub(a).normalize());
    m.compose(a.clone().add(b).multiplyScalar(.5), q, one);
    g.applyMatrix4(m); ribGeos.push(g);
  }
  const rib = new THREE.Mesh(mergeGeos(ribGeos), ribMat);
  rib.castShadow = true; fr.add(rib);

  // Leaflets: densely packed and overlapping, each swept back toward the tip and
  // jittered, so the frond reads as continuous foliage rather than a comb.
  const leafGeos = [];
  for(let j=1;j<=N;j++){
    const t=j/(N+1), px=t*L, py=yAt(t);
    const span = Math.sin(Math.pow(t,.85)*Math.PI)*.9+.14;
    const len = .58*L*span*(dead?.8:1) * (.9+Math.random()*.2);
    [-1,1].forEach(sd=>{
      const g = new THREE.PlaneGeometry(.075*s+.055*s*span, len);
      const d = new THREE.Vector3(
        -.34 - t*.30 + (Math.random()-.5)*.06,      // swept back toward the tip
        -(dead?.90:.62) + (Math.random()-.5)*.10,
        sd*(.72 - t*.26) + (Math.random()-.5)*.05
      ).normalize();
      q.setFromUnitVectors(up, d);
      q.multiply(new THREE.Quaternion().setFromAxisAngle(up, sd*.18)); // twist so leaflets catch light separately
      m.compose(new THREE.Vector3(px+d.x*len*.5, py+d.y*len*.5, d.z*len*.5), q, one);
      g.applyMatrix4(m); leafGeos.push(g);
    });
  }
  const leaves = new THREE.Mesh(mergeGeos(leafGeos), leafMat);
  leaves.castShadow = true; fr.add(leaves);
  return fr;
}

function makePalm(x,z,s){
  s = s||1;
  const g = new THREE.Group();
  const H = (7+Math.random()*2.6)*s;
  // Real coconut palms lean and curve toward the light rather than standing plumb.
  const dir = Math.random()*6.28, bend = (.9+Math.random()*1.1)*s;
  const pts = [];
  for(let i=0;i<=10;i++){
    const t=i/10, off = Math.pow(t,1.85)*bend;
    pts.push(new THREE.Vector3(Math.cos(dir)*off, H*t, Math.sin(dir)*off));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  // Unit-radius tube, then each ring is scaled to taper the trunk — gives a perfectly
  // smooth, continuously-curved trunk instead of a stack of visible cylinders.
  const TUB = 30, RAD = 16;
  const geo = new THREE.TubeGeometry(curve, TUB, 1, RAD, false);
  const pos = geo.attributes.position;
  for(let i=0;i<=TUB;i++){
    const t=i/TUB, c=curve.getPointAt(Math.min(1,t));
    const r = (.235 - .105*t) * s * (1 + Math.sin(t*26)*.035) * (t<.06 ? 1.5-t*8 : 1); // slim coconut trunk, flared base
    for(let j=0;j<=RAD;j++){
      const k=i*(RAD+1)+j;
      pos.setXYZ(k, c.x+(pos.getX(k)-c.x)*r, c.y+(pos.getY(k)-c.y)*r, c.z+(pos.getZ(k)-c.z)*r);
    }
  }
  geo.computeVertexNormals();
  const bt = palmBarkTex(); bt.repeat.set(2,1);
  const trunk = new THREE.Mesh(geo, pbr({color:0x8a6f4c, map:bt, roughness:.94}));
  trunk.castShadow = true; g.add(trunk);

  const top = curve.getPointAt(1);
  const leafM = pbr({color:0x3f7a2a, roughness:.72, side:THREE.DoubleSide, rim:.5});
  const deadM = pbr({color:0x8a7038, roughness:.9, side:THREE.DoubleSide});
  const ribM  = pbr({color:0x6d5a2e, roughness:.9});

  // Crown: living fronds fanned around the top, plus a couple of spent brown ones
  // hanging down under them.
  const crown = new THREE.Group();
  crown.position.copy(top);
  const fronds = [];
  const NF = 11;
  for(let i=0;i<NF;i++){
    const L = (2.5+Math.random()*.9)*s;
    const fr = makeFrond(L, s, leafM, ribM, false);
    fr.rotation.y = (i/NF)*Math.PI*2 + Math.random()*.16;
    fr.rotation.z = -.10 - Math.random()*.26;
    crown.add(fr); fronds.push({fr, base:fr.rotation.z, ph:Math.random()*6.28});
  }
  for(let i=0;i<3;i++){
    const fr = makeFrond((1.9+Math.random()*.5)*s, s, deadM, ribM, true);
    fr.rotation.y = Math.random()*6.28; fr.rotation.z = -.95;
    crown.add(fr); fronds.push({fr, base:-.95, ph:Math.random()*6.28});
  }
  // Coconut cluster tucked under the crown
  const nutM = pbr({color:0x6b5230, roughness:.85});
  const nuts = 4+Math.floor(Math.random()*4);
  for(let i=0;i<nuts;i++){
    const a=(i/nuts)*6.28, r=.26*s;
    const n = new THREE.Mesh(blobGeo(.15*s, 16, .12, i), nutM);
    n.position.set(Math.cos(a)*r, -.22*s, Math.sin(a)*r);
    n.scale.y = .85; n.castShadow = true; crown.add(n);
  }
  g.add(crown);

  // Fronds flex in the wind; the whole crown leans as gusts load the trunk.
  const ph = Math.random()*6.28;
  animCallbacks.push((t)=>{
    const gust = Math.sin(t*.9+ph);
    fronds.forEach((o,i)=>{ o.fr.rotation.z = o.base + Math.sin(t*1.35+o.ph+i)*.075 + G10Wind*.0016; });
    crown.rotation.z = gust*.022 + G10Wind*.0007;
    trunk.rotation.z = gust*.010 + G10Wind*.0004;
  });

  g.position.set(x,0,z);
  g.rotation.y = Math.random()*6.28;
  return g;
}
// Leaf-clump texture for broadleaf canopies and bushes: clusters of light and shadowed
// leaves, so a canopy reads as foliage rather than a smooth plastic ball.
function leafTex(){ return noiseTex('leafclump',512,(u,v)=>{
  const big = fbm(u,v,6,301), mid = vnoise(u,v,28,307), fine = vnoise(u,v,72,311);
  const clump = Math.pow(Math.min(1, Math.max(0, mid*1.25 - .1)), 1.4);
  const b = 120 + big*50 + clump*70 + (fine-.5)*40;
  return [b*.96, b, b*.86];
});}
function makeTree(x,z,s,type){
  if(type==='palm') return makePalm(x,z,s);
  s = s||1;
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.18*s,.25*s,1.8*s,18), pbr({color:0x5a4030,roughness:.92,map:woodTex()}));
  trunk.position.y = .9*s; trunk.castShadow = true; g.add(trunk);
  // Icosahedron foliage instead of low-segment spheres — a faceted "gem-like" canopy
  // reads as noticeably smoother/more deliberate than a blobby low-poly sphere while
  // staying in the same stylized-low-poly art direction as the rest of the scene.
  // Low rim strength: the cool fresnel edge on every round blob is what made canopies
  // look pale mint and plasticky instead of leafy green.
  const lt = leafTex();
  const mats = [pbr({color:0x2d5a1e,roughness:.85,map:lt,rim:.07}),pbr({color:0x3a6e24,roughness:.85,map:lt,rim:.07}),pbr({color:0x4a8030,roughness:.85,map:lt,rim:.07})];
  const blobs = [];
  for(let i=0;i<6;i++){
    const b = new THREE.Mesh(blobGeo(.68*s+Math.random()*.3,22,.30,i*7+1), mats[i%3]);
    b.position.set((Math.random()-.5)*.6*s,(1.8+Math.random()*1.2)*s,(Math.random()-.5)*.6*s);
    b.scale.y = .9+Math.random()*.3; b.rotation.set(Math.random()*6.28,Math.random()*6.28,Math.random()*6.28);
    b.castShadow = true; g.add(b); blobs.push({m:b, ph:Math.random()*6.28});
  }
  g.position.set(x,0,z);
  const ph = Math.random()*6.28;
  animCallbacks.push((t)=>{
    g.rotation.z = Math.sin(t*.6+ph)*.015 + G10Wind*.0003;
    // Each foliage cluster rustles slightly out of phase with the others and the
    // trunk sway, rather than the whole canopy moving as one rigid block.
    blobs.forEach(({m,ph:bp})=>{ m.rotation.y += Math.sin(t*1.1+bp)*.0009 + G10Wind*.00006; });
  });
  return g;
}
function makeBush(x,z,s){
  s = s||1;
  const g = new THREE.Group();
  const cs = [0x4a7a2e,0x3a6a26,0x5a8a3a];
  for(let i=0;i<5;i++){
    const b = new THREE.Mesh(blobGeo(.28*s+Math.random()*.14,18,.34,i*5+2), pbr({color:cs[i%3],roughness:.85,map:leafTex(),rim:.07}));
    b.position.set((Math.random()-.5)*.5*s,.22*s+Math.random()*.14,(Math.random()-.5)*.5*s);
    b.rotation.set(Math.random()*6.28,Math.random()*6.28,Math.random()*6.28);
    b.castShadow = true; g.add(b);
  }
  g.position.set(x,0,z);
  const ph = Math.random()*6.28;
  animCallbacks.push((t)=>{ g.rotation.y = Math.sin(t*.5+ph)*.02 + G10Wind*.0002; });
  return g;
}

// ─── PHILIPPINE PROVINCIAL DWELLINGS ───
// The scenes are set in a Bikol barangay, so the housing stock is the real thing rather
// than the Mediterranean villas that used to stand here: bahay kubo raised on stilts
// (the vernacular flood adaptation — the silong underneath is meant to take the water)
// and concrete hollow-block houses under corrugated GI roofs weighted down with old
// tyres against typhoons.

// Bahay kubo — bamboo posts, sawali walls, steep nipa roof, hagdan up to the doorway.
function makeNipaHut(x,z,s){
  s = s||1;
  const g = new THREE.Group();
  const bam = pbr({color:0xb99a5e,map:woodTex(),roughness:.85});
  const saw = pbr({color:0xc8a874,map:sawaliTex(),roughness:.9});
  const nip = pbr({color:0x8a6636,map:nipaTex(),roughness:.95});
  const W = 3.1*s, D = 2.7*s, FL = 1.25*s, WH = 1.75*s; // floor height, wall height

  // Stilts (haligi) — sunk below grade so the hut is founded, not perched.
  [[-1,-1],[1,-1],[-1,1],[1,1],[0,-1],[0,1]].forEach(([sx,sz])=>{
    const p = new THREE.Mesh(new THREE.CylinderGeometry(.075*s,.09*s,FL+.5,16), bam);
    p.position.set(sx*W*.42, FL/2-.25, sz*D*.42); p.castShadow = true; g.add(p);
  });
  // Floor platform + joists
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W,.12*s,D), bam);
  floor.position.y = FL; floor.castShadow = floor.receiveShadow = true; g.add(floor);

  // Sawali walls, left open at the front for the doorway
  const wallY = FL+.06+WH/2;
  const back = new THREE.Mesh(new THREE.BoxGeometry(W,WH,.07*s), saw);
  back.position.set(0,wallY,-D/2); back.castShadow = true; g.add(back);
  [-1,1].forEach(sd=>{
    const side = new THREE.Mesh(new THREE.BoxGeometry(.07*s,WH,D), saw);
    side.position.set(sd*W/2,wallY,0); side.castShadow = true; g.add(side);
  });
  [-1,1].forEach(sd=>{ // front panels flanking the door
    const fr = new THREE.Mesh(new THREE.BoxGeometry(W*.34,WH,.07*s), saw);
    fr.position.set(sd*W*.33,wallY,D/2); fr.castShadow = true; g.add(fr);
  });
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(W*.34,WH*.3,.07*s), saw);
  lintel.position.set(0,FL+.06+WH-WH*.15,D/2); g.add(lintel);
  // Dark interior so the doorway/windows read as openings, not painted-on panels
  const dark = pbr({color:0x201810,roughness:1});
  const inner = new THREE.Mesh(new THREE.BoxGeometry(W-.16*s,WH-.05,D-.16*s), dark);
  inner.position.y = wallY; g.add(inner);

  // Side window with the classic propped-open awning shutter (tukod)
  [-1,1].forEach(sd=>{
    const shut = new THREE.Mesh(new THREE.BoxGeometry(.05*s,.62*s,.9*s), saw);
    shut.position.set(sd*(W/2+.3*s), wallY+.42*s, 0);
    shut.rotation.z = sd*.62; shut.castShadow = true; g.add(shut);
    const prop = new THREE.Mesh(new THREE.CylinderGeometry(.022*s,.022*s,.78*s,12), bam);
    prop.position.set(sd*(W/2+.34*s), wallY+.05*s, .3*s);
    prop.rotation.z = sd*.5; g.add(prop);
  });

  // Steep four-sided nipa roof with a deep overhang, plus a ridge cap
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(W,D)*.82,1.5*s,4), nip);
  roof.position.y = FL+.06+WH+.72*s; roof.rotation.y = Math.PI/4;
  roof.scale.z = D/W; roof.castShadow = true; g.add(roof);
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(.16*s,.14*s,D*.5), nip);
  ridge.position.y = FL+.06+WH+1.44*s; ridge.castShadow = true; g.add(ridge);

  // Hagdan — bamboo ladder up to the doorway
  const lad = new THREE.Group();
  [-1,1].forEach(sd=>{
    const r = new THREE.Mesh(new THREE.CylinderGeometry(.045*s,.045*s,FL*1.35,12), bam);
    r.position.set(sd*.22*s, FL/2, 0); r.rotation.x = .42; r.castShadow = true; lad.add(r);
  });
  for(let i=0;i<4;i++){
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(.03*s,.03*s,.46*s,12), bam);
    rung.rotation.z = Math.PI/2;
    rung.position.set(0, .2*s+i*.3*s, .16*s-(i*.13*s));
    lad.add(rung);
  }
  lad.position.set(0,0,D/2+.34*s); g.add(lad);

  // Water drum by the steps — a fixture of provincial households
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(.26*s,.26*s,.62*s,26), pbr({color:0x2a5a8a,roughness:.7}));
  drum.position.set(W*.62, .31*s, D*.3); drum.castShadow = true; g.add(drum);

  g.position.set(x,0,z);
  g.rotation.y = (Math.random()-.5)*.5;
  return g;
}

// Concrete hollow-block house with a corrugated GI roof, window grilles, and old tyres
// holding the sheets down — the standard "semi-concrete" barangay build.
function makeConcreteHouse(x,z,w,h,d){
  const g = new THREE.Group();
  const bt = blockTex(); bt.repeat.set(Math.max(1,w/2.2), Math.max(1,h/2.2));
  const paints = [0xdfe4e0,0xe6ddc4,0xcfe0e6,0xe8d8d0,0xd6e2cc];
  const wall = pbr({color:paints[Math.floor(Math.random()*paints.length)], map:bt, roughness:.92});
  const body = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), wall);
  body.position.y = h/2; body.castShadow = body.receiveShadow = true; g.add(body);
  // Plinth — houses here sit on a raised slab against floodwater
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(w+.3,.42,d+.3), pbr({color:0xa8a49c,roughness:.95}));
  plinth.position.y = .1; plinth.castShadow = plinth.receiveShadow = true; g.add(plinth);

  // Corrugated GI gable roof: two sheets running ridge (y=h+RISE, z=0) down to the
  // eaves (y=h, z=±RUN), so the overhang throws a real shadow line on the wall.
  const RISE = .62, RUN = d/2+.34;
  const slopeL = Math.hypot(RISE, RUN), theta = Math.atan2(RISE, RUN);
  const gt = giTex(); gt.repeat.set(Math.max(1,w/1.3),1);
  const giMat = pbr({color:0xb9bcb8, map:gt, roughness:.62, metalness:.28, side:THREE.DoubleSide});
  [-1,1].forEach(sd=>{
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w+.5, slopeL), giMat);
    pane.rotation.x = -Math.PI/2 + sd*theta;
    pane.position.set(0, h+RISE/2, sd*RUN/2);
    pane.castShadow = true; g.add(pane);
  });
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(w+.55,.1,.22), giMat);
  ridge.position.y = h+RISE+.03; ridge.castShadow = true; g.add(ridge);
  // Gable in-fill following the roofline, so the roof void isn't see-through
  [-1,1].forEach(sd=>{
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      0,0,-RUN,  0,0,RUN,  0,RISE,0
    ]),3));
    geo.computeVertexNormals();
    const tri = new THREE.Mesh(geo, pbr({color:0xcfcabf, roughness:.92, side:THREE.DoubleSide}));
    tri.position.set(sd*w/2, h, 0); g.add(tri);
  });
  // Old tyres weighting the sheets — typhoon habit, and a strong period detail
  const tyre = pbr({color:0x22201f,roughness:.95});
  const tn = 1+Math.floor(Math.random()*3);
  for(let i=0;i<tn;i++){
    const tz = (Math.random()-.5)*(d*.55);
    const ty = new THREE.Mesh(new THREE.TorusGeometry(.2,.075,12,24), tyre);
    ty.rotation.x = Math.PI/2;
    // Seat each tyre on the actual roof slope at its own z, not at one flat height.
    ty.position.set((Math.random()-.5)*w*.7, h + RISE*(1-Math.abs(tz)/RUN) + .06, tz);
    ty.rotation.x = Math.PI/2 + Math.sign(tz)*theta; // lie along the slope, not flat
    ty.castShadow = true; g.add(ty);
  }

  // Windows with security grilles
  const dark = pbr({color:0x1b2228,roughness:.5,metalness:.2});
  const grille = pbr({color:0x6e737a,roughness:.6,metalness:.5});
  const wc = Math.max(1, Math.floor(w/1.7));
  for(let i=0;i<wc;i++){
    const px = -w/2+(i+.5)*(w/wc);
    if(Math.abs(px) < .62) continue; // keep the doorway clear
    const pane = new THREE.Mesh(new THREE.BoxGeometry(.72,.8,.06), dark);
    pane.position.set(px,h*.58,d/2+.02); g.add(pane);
    for(let b=0;b<3;b++){
      const bar = new THREE.Mesh(new THREE.BoxGeometry(.035,.8,.035), grille);
      bar.position.set(px-.24+b*.24,h*.58,d/2+.06); g.add(bar);
    }
    const hood = new THREE.Mesh(new THREE.BoxGeometry(.86,.06,.2), pbr({color:0xb0aca4,roughness:.9}));
    hood.position.set(px,h*.58+.45,d/2+.1); g.add(hood);
  }
  // Door + concrete step
  const door = new THREE.Mesh(new THREE.BoxGeometry(.86,1.9,.07), pbr({color:0x5d4a33,map:woodTex(),roughness:.88}));
  door.position.set(0,1.16,d/2+.04); door.castShadow = true; g.add(door);
  const step = new THREE.Mesh(new THREE.BoxGeometry(1.3,.2,.55), pbr({color:0xa8a49c,roughness:.95}));
  step.position.set(0,.31,d/2+.34); g.add(step);

  g.position.set(x,0,z);
  g.rotation.y = (Math.random()-.5)*.3;
  return g;
}

// Scene helper: a barangay is a mix of both, leaning to bahay kubo further out.
function makeHouse(x,z,w,h,d,forceKubo){
  return (forceKubo || Math.random() < .45)
    ? makeNipaHut(x,z,.9+Math.random()*.35)
    : makeConcreteHouse(x,z,w,h,d);
}

// ─── TROPICAL PLANTING ───
// Banana clump (saging) — thick pseudostem, big drooping blades that catch the wind.
function makeBanana(x,z,s){
  s = s||1;
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(.1*s,.15*s,1.5*s,16), pbr({color:0x5f7a35,roughness:.9}));
  stem.position.y = .75*s; stem.castShadow = true; g.add(stem);
  const lm = pbr({color:0x3f7a26,roughness:.82,side:THREE.DoubleSide});
  const leaves = [];
  for(let i=0;i<7;i++){
    const lf = new THREE.Mesh(new THREE.PlaneGeometry(.5*s,1.9*s,1,4), lm);
    lf.position.set(0,1.45*s,0);
    lf.rotation.y = (i/7)*Math.PI*2 + Math.random()*.3;
    lf.rotation.z = -.95 - Math.random()*.35;   // droop
    lf.castShadow = true; g.add(lf); leaves.push(lf);
  }
  const ph = Math.random()*6.28;
  animCallbacks.push((t)=>{
    leaves.forEach((l,i)=>{ l.rotation.z = -.95 - .18 + Math.sin(t*1.1+ph+i*.7)*.09 + G10Wind*.0009; });
  });
  g.position.set(x,0,z);
  return g;
}
// Bamboo clump (kawayan) — tall jointed culms leaning out of a common base.
function makeBambooClump(x,z,s){
  s = s||1;
  const g = new THREE.Group();
  const cm = pbr({color:0x9fae52,roughness:.75});
  const lm = pbr({color:0x4f8a2e,roughness:.85,side:THREE.DoubleSide});
  const culms = [];
  const n = 5+Math.floor(Math.random()*4);
  const m = new THREE.Matrix4(), one = new THREE.Vector3(1,1,1), eul = new THREE.Euler();
  for(let i=0;i<n;i++){
    const c = new THREE.Group();
    const hgt = (3.4+Math.random()*2.2)*s;
    // Culm + its nodes merge into one mesh; so do the leaves. Each clump goes from ~9
    // meshes to 2, which matters because scenes carry several clumps.
    const stalk = [];
    const pg = new THREE.CylinderGeometry(.05*s,.07*s,hgt,14);
    pg.translate(0,hgt/2,0); stalk.push(pg);
    for(let k=1;k<4;k++){
      const nd = new THREE.CylinderGeometry(.062*s,.062*s,.05*s,14);
      nd.translate(0,hgt*(k/4),0); stalk.push(nd);
    }
    const pole = new THREE.Mesh(mergeGeos(stalk), cm);
    pole.castShadow = true; c.add(pole);
    const leafG = [];
    for(let k=0;k<7;k++){
      const lf = new THREE.PlaneGeometry(.16*s,.62*s);
      eul.set(0, Math.random()*6.28, -.5-Math.random()*.5);
      m.compose(new THREE.Vector3(0, hgt*(.55+k*.07), 0), new THREE.Quaternion().setFromEuler(eul), one);
      lf.applyMatrix4(m); leafG.push(lf);
    }
    const leaves = new THREE.Mesh(mergeGeos(leafG), lm);
    leaves.castShadow = true; c.add(leaves);
    const lean = .09+Math.random()*.17, dir = Math.random()*6.28;
    c.position.set(Math.cos(dir)*.3*s, 0, Math.sin(dir)*.3*s);
    c.rotation.z = Math.cos(dir)*lean; c.rotation.x = Math.sin(dir)*lean;
    g.add(c); culms.push({c, bz:c.rotation.z, bx:c.rotation.x, ph:Math.random()*6.28});
  }
  animCallbacks.push((t)=>{
    culms.forEach(o=>{
      const sw = Math.sin(t*.9+o.ph)*.035 + G10Wind*.0011;
      o.c.rotation.z = o.bz + sw; o.c.rotation.x = o.bx + sw*.5;
    });
  });
  g.position.set(x,0,z);
  return g;
}
// Barangay electric post: concrete pole, crossarm, insulators, sagging service drops.
function makeUtilityPole(x,z,dropTo){
  const g = new THREE.Group();
  const cm = pbr({color:0xa8a49c,roughness:.95});
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.1,.15,7,16), cm);
  pole.position.y = 3.5; pole.castShadow = true; g.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5,.1,.1), pbr({color:0x6a5335,map:woodTex(),roughness:.9}));
  arm.position.y = 6.3; arm.castShadow = true; g.add(arm);
  [-.6,0,.6].forEach(ox=>{
    const ins = new THREE.Mesh(new THREE.CylinderGeometry(.05,.06,.14,14), pbr({color:0x4a5a66,roughness:.4}));
    ins.position.set(ox,6.44,0); g.add(ins);
  });
  if(dropTo){ // catenary service drop toward the next pole
    const wireM = new THREE.LineBasicMaterial({color:0x1a1a1a, transparent:true, opacity:.75});
    [-.6,0,.6].forEach(ox=>{
      const pts = [];
      for(let i=0;i<=12;i++){
        const t = i/12;
        pts.push(new THREE.Vector3(ox + (dropTo.x-x-ox)*t, 6.44 - Math.sin(t*Math.PI)*.85, (dropTo.z-z)*t));
      }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireM));
    });
  }
  g.position.set(x,0,z);
  return g;
}

// ─── HUMAN (articulated: head, hair, neck, torso, shoulders, arms, hands, hips, legs, shoes; breathing anim) ───
// ─── REALISTIC LEARNER FIGURE ───
// Built to real proportions (~7.5 heads tall, 1.7 m at s=1): a lathe-shaped torso with
// chest and waist, short-sleeved school shirt, bare forearms, hands with thumbs, a
// head with jaw, ears, nose, eyes, brows and a short haircut, and articulated hips,
// knees, shoulders and elbows so the walk cycle bends the joints like a person instead
// of swinging stiff cylinders. Parts that move together are merged per material, so the
// extra detail costs ~20 draw calls per figure. Faces +z (the walking direction).
function _hg(g, x,y,z, rx,ry,rz, sx,sy,sz){
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x||0,y||0,z||0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx||0,ry||0,rz||0)),
    new THREE.Vector3(sx||1, sy==null?(sx||1):sy, sz==null?(sx||1):sz));
  return g.applyMatrix4(m);
}
function _limb(r0, r1, len, seg){ const g = new THREE.CylinderGeometry(r1, r0, len, seg||20, 3); g.translate(0,-len/2,0); return g; } // hangs down from its joint
function fabricTex(){ return noiseTex('fabric',256,(u,v)=>{
  const weave = (Math.sin(u*420)*.5+.5)*.5 + (Math.sin(v*420)*.5+.5)*.5;
  const b = 210 + (weave-.5)*26 + (fbm(u,v,12,515)-.5)*30;
  return [b,b,b];
});}
function makeHuman(x,y,z,shirtC,pantC,s){
  s = s||1;
  const g = new THREE.Group();
  const ft = fabricTex();
  const skinC = 0xad7550;   // warm morena tone; reads naturally under the scene lighting
  const skin  = pbr({color:skinC, roughness:.58, rim:.12});
  const shirt = pbr({color:shirtC, map:ft, roughness:.86, rim:.12});
  const pant  = pbr({color:pantC||0x1f2937, map:ft, roughness:.88, rim:.1});
  const shoeM = pbr({color:0x1c1917, roughness:.45, rim:.1});
  const soleM = pbr({color:0xe7e5e4, roughness:.8, rim:0});
  const hairM = pbr({color:0x15100d, roughness:.75, rim:.18});
  const eyeW  = pbr({color:0xf5f5f4, roughness:.3, rim:0});
  const eyeD  = pbr({color:0x1c120c, roughness:.2, rim:0});
  const mesh = (geo, mat, shadow)=>{ const m = new THREE.Mesh(geo, mat); if(shadow!==false) m.castShadow = true; return m; };
  const S = (v)=> v*s;

  // ── torso: shaped shirt (chest/waist/shoulder line), flattened front-to-back ──
  const tp = [[.0,0],[.155,.0],[.165,.06],[.152,.2],[.162,.32],[.19,.44],[.205,.52],[.19,.57],[.13,.6],[.06,.615],[0,.62]]
    .map(([r,h])=>new THREE.Vector2(S(r), S(h)));
  const torso = mergeGeos([
    _hg(new THREE.LatheGeometry(tp, 28), 0,S(.9),0, 0,0,0, 1,1,.68),
    _hg(new THREE.SphereGeometry(S(.072),18,14), S(-.19),S(1.42),0),       // shoulder caps
    _hg(new THREE.SphereGeometry(S(.072),18,14), S(.19),S(1.42),0),
    _hg(new THREE.CylinderGeometry(S(.07),S(.075),S(.035),24), 0,S(1.5),S(.018), .25,0,0, 1,1,.8) // collar
  ]);
  g.add(mesh(torso, shirt));
  // pelvis / shorts top
  const pelvis = _hg(new THREE.SphereGeometry(S(.165),24,16,0,Math.PI*2,0,Math.PI*.62), 0,S(.92),0, Math.PI,0,0, 1,.75,.7);
  g.add(mesh(pelvis, pant));
  // neck
  g.add(mesh(new THREE.CylinderGeometry(S(.048),S(.056),S(.12),18).translate(0,S(1.56),0), skin));

  // ── head (rotates as a unit) ──
  const head = new THREE.Group(); head.position.set(0,S(1.62),0);
  const skull = _hg(new THREE.SphereGeometry(S(.108),32,24), 0,S(.075),0, 0,0,0, .9,1.08,1);
  const jaw   = _hg(new THREE.SphereGeometry(S(.082),28,18), 0,S(.018),S(.022), 0,0,0, .95,.8,1);
  const nose  = _hg(new THREE.SphereGeometry(S(.018),12,10), 0,S(.06),S(.104), 0,0,0, .8,1.1,1);
  const earL  = _hg(new THREE.SphereGeometry(S(.024),12,10), S(-.097),S(.07),0, 0,0,0, .45,1,.75);
  const earR  = _hg(new THREE.SphereGeometry(S(.024),12,10), S(.097),S(.07),0, 0,0,0, .45,1,.75);
  head.add(mesh(mergeGeos([skull,jaw,nose,earL,earR]), skin));
  const eyes = []; const pup = []; const brows = [];
  [-1,1].forEach(sd=>{
    eyes.push(_hg(new THREE.SphereGeometry(S(.016),12,10), sd*S(.035),S(.088),S(.088), 0,0,0, 1,.75,.5));
    pup.push(_hg(new THREE.SphereGeometry(S(.0095),10,8), sd*S(.035),S(.088),S(.096)));
    brows.push(_hg(new THREE.BoxGeometry(S(.036),S(.007),S(.01)), sd*S(.036),S(.112),S(.094), 0,0,-sd*.12));
  });
  head.add(mesh(mergeGeos(eyes), eyeW, false));
  head.add(mesh(mergeGeos(pup), eyeD, false));
  // short haircut: a cap over the crown and back of the head, a fringe, and sideburns
  const hair = mergeGeos([
    _hg(new THREE.SphereGeometry(S(.116),30,20,0,Math.PI*2,0,Math.PI*.52), 0,S(.085),S(-.006), -.18,0,0, .93,1.05,1.02),
    _hg(new THREE.SphereGeometry(S(.113),26,16,Math.PI*.15,Math.PI*1.7,Math.PI*.35,Math.PI*.3), 0,S(.07),S(-.01), 0,Math.PI,0, .95,1.05,1.0),
    _hg(new THREE.BoxGeometry(S(.12),S(.026),S(.03)), 0,S(.152),S(.085), -.35,0,0),
    ...brows
  ]);
  head.add(mesh(hair, hairM));
  g.add(head);

  // ── arms: shoulder → (sleeve + upper arm) → elbow → (forearm + hand) ──
  const arms = [], elbows = [];
  [-1,1].forEach(sd=>{
    const arm = new THREE.Group(); arm.position.set(sd*S(.205),S(1.42),0);
    arm.add(mesh(_limb(S(.06),S(.064),S(.16)), shirt));                        // short sleeve
    arm.add(mesh(_limb(S(.044),S(.05),S(.3)).translate(0,S(-.0),0), skin));     // upper arm under the sleeve
    const elbow = new THREE.Group(); elbow.position.y = S(-.29);
    const fore = mergeGeos([
      _limb(S(.036),S(.045),S(.25)),
      _hg(new THREE.SphereGeometry(S(.044),14,10), 0,0,0),                      // elbow joint
      _hg(new THREE.SphereGeometry(S(.042),16,12), 0,S(-.3),S(.005), 0,0,0, .62,1.15,.42),   // palm
      _hg(new THREE.SphereGeometry(S(.016),10,8), -sd*S(.02),S(-.29),S(.022), 0,0,0, .8,1.6,.8) // thumb
    ]);
    elbow.add(mesh(fore, skin));
    arm.add(elbow);
    arm.rotation.z = sd*.07;
    g.add(arm); arms.push(arm); elbows.push(elbow);
  });

  // ── legs: hip → thigh → knee → (shin + shoe) ──
  const legs = [], knees = [];
  [-1,1].forEach(sd=>{
    const leg = new THREE.Group(); leg.position.set(sd*S(.088),S(.9),0);
    leg.add(mesh(_limb(S(.064),S(.085),S(.44)), pant));
    const knee = new THREE.Group(); knee.position.y = S(-.43);
    knee.add(mesh(mergeGeos([_limb(S(.05),S(.064),S(.42)), _hg(new THREE.SphereGeometry(S(.062),16,12),0,0,0)]), pant));
    const shoe = mergeGeos([
      _hg(new THREE.SphereGeometry(S(.06),20,14), 0,S(-.43),S(.045), 0,0,0, .9,.62,1.85),
      _hg(new THREE.CylinderGeometry(S(.05),S(.05),S(.07),16), 0,S(-.43),S(-.02))
    ]);
    knee.add(mesh(shoe, shoeM));
    knee.add(mesh(_hg(new THREE.BoxGeometry(S(.1),S(.022),S(.25)), 0,S(-.462),S(.035)), soleM));
    leg.add(knee);
    g.add(leg); legs.push(leg); knees.push(knee);
  });

  g.position.set(x,y,z);
  const ph = Math.random()*6.28;
  g.userData = { legs, arms, knees, elbows, moving:false, human:true };
  animCallbacks.push((t)=>{
    const ud = g.userData;
    head.rotation.y = Math.sin(t*.3+ph)*.15;
    if(ud.moving){
      // ── WALK CYCLE: hips swing, knees bend on the forward swing, arms counter-swing
      // with relaxed elbows, small vertical bob ──
      const w = t*8.5;
      const sw = Math.sin(w);
      legs[0].rotation.x = sw*.5;  legs[1].rotation.x = -sw*.5;
      knees[0].rotation.x = Math.max(0, -Math.cos(w))*.75 + .05;
      knees[1].rotation.x = Math.max(0,  Math.cos(w))*.75 + .05;
      arms[0].rotation.x = -sw*.42; arms[1].rotation.x = sw*.42;
      elbows[0].rotation.x = -.25 - Math.max(0, sw)*.35;
      elbows[1].rotation.x = -.25 - Math.max(0,-sw)*.35;
      g.position.y = ud.baseY!==undefined ? ud.baseY + Math.abs(Math.cos(w))*.035*s : g.position.y;
    } else {
      // idle: settle the joints, gentle breathing sway in the arms
      legs.forEach(l=> l.rotation.x *= .82);
      knees.forEach(k=> k.rotation.x *= .82);
      arms[0].rotation.x = Math.sin(t*.8+ph)*.04;
      arms[1].rotation.x = -Math.sin(t*.8+ph)*.04;
      elbows.forEach(e=> e.rotation.x += (-.12 - e.rotation.x)*.1);
    }
  });
  return g;
}

// ─── HOLOGRAPHIC LEVEL GATEWAY (portal) ───
function makeGateway(x,y,z,color){
  const g = new THREE.Group();
  const mkRingMat = ()=> new THREE.ShaderMaterial({
    uniforms:{time:{value:0},col:{value:new THREE.Color(color)},op:{value:.3}},
    transparent:true, side:THREE.DoubleSide,
    vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader:`uniform float time; uniform vec3 col; uniform float op; varying vec2 vUv;
    void main(){ float p=sin(time*2.5+vUv.x*12.)*.5+.5;
      vec3 c=col*(.7+p*.6)+vec3(.4,.6,1.)*p*.25;
      gl_FragColor=vec4(c,op*(.6+p*.4)); }`
  });
  const rm1 = mkRingMat(), rm2 = mkRingMat();
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(2.2,.16,12,48), rm1);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.85,.11,12,48), rm2);
  ring2.rotation.z = Math.PI/4;
  g.add(ring1, ring2);

  const discMat = new THREE.ShaderMaterial({
    uniforms:{time:{value:0},col:{value:new THREE.Color(color)},op:{value:.3}},
    transparent:true, side:THREE.DoubleSide, depthWrite:false,
    vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader:`uniform float time; uniform vec3 col; uniform float op; varying vec2 vUv;
    void main(){ vec2 p=vUv-.5; float d=length(p);
      float sw=sin(d*22.-time*3.5+atan(p.y,p.x)*4.)*.5+.5;
      float rg=smoothstep(.5,.45,d), co=smoothstep(.4,0.,d)*.5;
      gl_FragColor=vec4(col*(sw*.7+co), op*(sw*.4+co)*rg); }`
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(2,32), discMat);
  g.add(disc);

  const parts = [];
  for(let i=0;i<20;i++){
    const p = new THREE.Mesh(new THREE.SphereGeometry(.04,12,10),
      new THREE.MeshBasicMaterial({color:color,transparent:true,opacity:.7}));
    g.add(p); parts.push(p);
  }
  const base = new THREE.Mesh(new THREE.TorusGeometry(2.3,.05,14,48),
    new THREE.MeshStandardMaterial({color:color,roughness:.3,metalness:.7,emissive:color,emissiveIntensity:.5}));
  base.rotation.x = Math.PI/2; base.position.y = -2.1; g.add(base);

  g.position.set(x,y,z);
  animCallbacks.push((t)=>{
    if(!gatewayGroup) return;
    ring1.rotation.z = t*.3; ring2.rotation.z = Math.PI/4 - t*.4;
    rm1.uniforms.time.value = rm2.uniforms.time.value = discMat.uniforms.time.value = t;
    parts.forEach((p,i)=>{
      const a = (i/parts.length)*6.28+t*.7;
      const r = 2.2+Math.sin(t*2+i)*.15;
      p.position.set(Math.cos(a)*r, Math.sin(t*1.5+i)*.3, Math.sin(a)*r*.15);
      p.material.opacity = .4+Math.sin(t*3+i)*.3;
    });
    let op;
    if(gatewayPassed){
      g.scale.multiplyScalar(.985);
      op = Math.max(0, rm1.uniforms.op.value - .02);
    } else op = gatewayActive ? 1 : .28;
    rm1.uniforms.op.value = rm2.uniforms.op.value = discMat.uniforms.op.value = op;
    if(!gatewayPassed) g.scale.setScalar(1+Math.sin(t*(gatewayActive?2.5:1.5))*(gatewayActive?.05:.02));
  });
  return g;
}

function flowArrow(color, k){
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({color:color,transparent:true,opacity:.6});
  const sh = new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.55,12), m);
  sh.rotation.z = Math.PI/2; sh.position.x = .27;
  const tp = new THREE.Mesh(new THREE.ConeGeometry(.08,.18,8), m);
  tp.rotation.z = -Math.PI/2; tp.position.x = .63;
  g.add(sh,tp);
  animCallbacks.push((t)=>{ m.opacity = .4+Math.sin(t*2)*.2*k; });
  return g;
}
function lamppost(x,z,glow){
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05,.07,3.5,16), pbr({color:0x1a1a1a,roughness:.5,metalness:.6}));
  pole.position.y = 1.75; pole.castShadow = true;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.17,26,20),
    new THREE.MeshStandardMaterial({color:0xffdda0,emissive:0xffcc66,emissiveIntensity:glow}));
  lamp.position.y = 3.55;
  g.add(pole,lamp); g.position.set(x,0,z);
  return g;
}

// ═══ SCENES ═══
function buildFloodScene(scen, grade){
  clearScene();
  const depth = scen.depth||0, vel = scen.vel||0, rmm = scen.rain||0;
  let mood = 'sunny';
  if(rmm>30) mood='storm'; else if(rmm>15||depth>.5) mood='overcast';
  else if(grade===8 && rmm>0) mood='overcast';
  setupLighting(mood);
  skyDome(mood==='storm'?0x1a2535:mood==='overcast'?0x6a7888:0x4a85bb,
          mood==='storm'?0x3a4555:mood==='overcast'?0xa8b0bc:0xc8d8e8);

  // Barangay road: worn concrete over reddish-brown provincial soil, not grey cobble.
  const gt = grassTexF('barangay-road',0x7d6a52,0x9c8a6e); gt.repeat.set(20,20);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80,80), pbr({color:0x8a7862,map:gt,roughness:.96}));
  ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);

  const grT = grassTexF('grass',0x3a6a28,0x4a7a38); grT.repeat.set(12,12);
  const gm = pbr({color:0x4a7a30,map:grT,roughness:.95});
  const gl2 = makeTerrain(22,80,30,(x,z)=> x<0 ? tnoise(x,z)*.28+Math.abs(x)*.04 : .15, 0x4a7a30,0x3a6a28);
  gl2.material = gm; gl2.position.set(-18,.05,0); scene.add(gl2);
  const gr2 = makeTerrain(22,80,30,(x,z)=> x>0 ? tnoise(x,z)*.28+Math.abs(x)*.04 : .15, 0x4a7a30,0x3a6a28);
  gr2.material = gm; gr2.position.set(18,.05,0); scene.add(gr2);

  const river = makeWater(40,90,Math.max(.4,depth),0x4a9ec0,0x1a4565);
  river.position.set(28,depth*.4,0); scene.add(river);
  if(depth>.05){
    const flood = makeWater(14,80,depth,depth>.5?0x3a7a9a:0x6abcd6,0x1a4a6a,50);
    flood.position.set(0,depth*.35,0); scene.add(flood);
  }

  // The grass verges either side of the street sit at y≈0.2, so anything placed on them
  // has to be lifted to match or it sinks into the slope.
  const VERGE = .2;
  const seat = (obj)=>{ obj.position.y = VERGE; scene.add(obj); return obj; };
  // A barangay street: mixed bahay-kubo and semi-concrete houses down both sides.
  for(let i=0;i<5;i++) seat(makeHouse(-13+(Math.random()-.5)*1.5,-15+i*7.5,3.5+Math.random()*1.5,3.2+Math.random()*1.2,3.5+Math.random()*1.5));
  for(let i=0;i<5;i++){
    const v = makeHouse(13+(Math.random()-.5)*1.5,-15+i*7.5,3.5+Math.random()*1.5,3.2+Math.random()*1.2,3.5+Math.random()*1.5);
    v.rotation.y += Math.PI; seat(v);
  }
  // Coconut, banana and bamboo — the planting you actually see lining a rural road here.
  [[-7,-10],[-8,-2],[-7,6],[-8,14]].forEach(([x,z],i)=>seat(makeTree(x,z,1+Math.random()*.5,i%2===0?'palm':'')));
  [[7,-10],[8,-2],[7,6],[8,14]].forEach(([x,z],i)=>seat(makeTree(x,z,1+Math.random()*.5,i%2===0?'palm':'')));
  [[-9.5,-13],[-10,3],[9.5,-6],[10,11]].forEach(([x,z])=>seat(makeBanana(x,z,.95+Math.random()*.3)));
  [[-10.5,-6],[10.5,1]].forEach(([x,z])=>seat(makeBambooClump(x,z,1)));
  for(let i=0;i<6;i++){ seat(makeBush(-9+Math.random()*1.5,-14+i*5,1)); seat(makeBush(9-Math.random()*1.5,-13+i*5,1)); }
  // Electric posts with sagging service drops running down the street
  const poleZ = [-12,-2,8,16];
  poleZ.forEach((z,i)=>{
    const nxt = poleZ[i+1];
    seat(makeUtilityPole(-8.6, z, nxt!==undefined ? {x:-8.6, z:nxt} : null));
  });
  [[-5.5,-10],[5.5,-10],[-5.5,4],[5.5,4]].forEach(([x,z])=>scene.add(lamppost(x,z,mood==='sunny'?.2:.85)));

  // Verge planting: everything outside the roadway, so the street itself stays clear.
  addGroundCover({ w:56, d:74, y:VERGE, n:620,
    grass:0x55853a, weed:0x6d9a46,
    ok:(x,z)=> Math.abs(x) > 6.6 && Math.abs(x) < 27 });

  const cy = Math.max(0, depth*.6-.1);
  humanGroup = makeHuman(0,cy,-3, grade===7?0x1e3a8a:0x7c2d12);
  humanGroup.userData.baseY = cy;
  scene.add(humanGroup);
  animCallbacks.push((t)=>{
    if(humanGroup && !ctrl.on){
      humanGroup.position.y = cy + Math.sin(t*1.3)*.025*(depth>.4?2:1);
      humanGroup.rotation.y = Math.sin(t*.4)*.12;
    }
  });

  if(depth>.3) for(let i=0;i<9;i++){
    const wd = Math.random()>.5;
    const deb = wd
      ? new THREE.Mesh(new THREE.BoxGeometry(.5,.06,.18), pbr({color:0x8b6914,map:woodTex(),roughness:.95}))
      : new THREE.Mesh(new THREE.PlaneGeometry(.3,.3), new THREE.MeshStandardMaterial({color:0x3a5a24,transparent:true,opacity:.8,side:THREE.DoubleSide}));
    deb.position.set((Math.random()-.5)*8, depth*.5+.02, (Math.random()-.5)*12);
    const ph = Math.random()*6.28;
    animCallbacks.push((t)=>{
      deb.position.x += Math.sin(t*.6+ph)*.003*Math.max(.3,vel);
      if(deb.position.x>6) deb.position.x = -6;
      deb.position.y = depth*.5+Math.sin(t+ph)*.02;
      deb.rotation.y = t*.2+ph;
    });
    scene.add(deb);
  }

  if(rmm>0 || depth>.4){
    rain = makeRain(Math.min(9000,3000+rmm*150),60,30,60,Math.max(.5,rmm/15));
    scene.add(rain);
  }
  if(grade===8 && vel>.4) for(let z=-6;z<=6;z+=3){
    const a = flowArrow(0xa8d8ff, vel);
    a.position.set(-1+vel*.3, depth*.5+.1, z);
    a.rotation.y = Math.PI/2; scene.add(a);
  }

  gatewayGroup = makeGateway(0,2.3,13,0x38bdf8);
  scene.add(gatewayGroup);

  cam.base.set(6,5,-13); cam.look.set(0,1.4,2);
  cam.target.copy(cam.base); camera.position.copy(cam.base);
}

function buildBoatScene(scen){
  clearScene();
  const lab = !!scen.lab;
  const {cap,load,dist} = lab ? {cap:9,load:0,dist:'even'} : scen;
  const over = load>cap, uneven = dist==='uneven', standing = dist==='standing', shifting = dist==='shifting';
  setupLighting('sunny');
  skyDome(0x3a78b8,0xc0d8e8);

  const river = makeWater(100,100,.7,0x4abbdc,0x0a4a7a,80);
  scene.add(river);
  const uw = new THREE.Mesh(new THREE.PlaneGeometry(80,80,15,15), pbr({color:0x2a5a7a,roughness:.95}));
  uw.rotation.x = -Math.PI/2; uw.position.y = -2; scene.add(uw);

  // Banks now slope DOWN to the waterline and rise inland, instead of forming a ridge
  // right at the river with a submerged flat behind it. bankY() gives the ground height
  // at any world x so every prop below can be seated on the terrain rather than at y=0,
  // which is what made the houses and trees look like they were floating in the river.
  const SHORE = 9;
  const bankY = (wx)=>{ const e = Math.min(11, Math.abs(wx)-SHORE); return (e>0 ? Math.pow(e,.6)*.55 : -.1) + .02; };
  const grT = grassTexF('bank',0x4a7a2e,0x6a9a3e); grT.repeat.set(8,8);
  const gm = pbr({color:0x4a7a2e,map:grT,roughness:.95});
  const bl = makeTerrain(22,90,32,(x,z)=>{ const e=Math.min(11,11-x); return e>0?Math.pow(e,.6)*.55+tnoise(x,z)*.26:-.1; },0x5a8a3a,0x3a6a2a);
  bl.material = gm; bl.position.set(-20,.02,0); scene.add(bl);
  const br = makeTerrain(22,90,32,(x,z)=>{ const e=Math.min(11,11+x); return e>0?Math.pow(e,.6)*.55+tnoise(x,z)*.26:-.1; },0x5a8a3a,0x3a6a2a);
  br.material = gm; br.position.set(20,.02,0); scene.add(br);

  const dm = pbr({color:0x6b4f30,map:woodTex(),roughness:.9});
  const dock = new THREE.Mesh(new THREE.BoxGeometry(3.5,.18,5.5), dm);
  dock.position.set(-8.5,.1,0); dock.castShadow = dock.receiveShadow = true; scene.add(dock);
  for(let i=0;i<11;i++){
    const pl = new THREE.Mesh(new THREE.BoxGeometry(3.4,.04,.45), dm);
    pl.position.set(-8.5,.21,-2.5+i*.5); scene.add(pl);
  }
  [[-9.9,-2.2],[-9.9,2.2],[-7.1,-2.2],[-7.1,2.2]].forEach(([xs,zs])=>{
    const p = new THREE.Mesh(new THREE.CylinderGeometry(.07,.09,2,16), pbr({color:0x4a3520,map:woodTex(),roughness:.95}));
    p.position.set(xs,-.5,zs); p.castShadow = true; scene.add(p);
  });

  const seat = (obj,x)=>{ obj.position.y = bankY(x); scene.add(obj); return obj; };
  // Riverside barangay — the houses nearest the water are bahay kubo on stilts, which is
  // exactly why the vernacular puts the living floor above the expected flood line.
  for(let i=0;i<3;i++){ const x=-14.5-Math.random()*2; seat(makeHouse(x,-12+i*12,4+Math.random(),3.4+Math.random()*1.2,4+Math.random(), i===0), x); }
  for(let i=0;i<3;i++){ const x=14.5+Math.random()*2; seat(makeHouse(x,-12+i*12,4+Math.random(),3.4+Math.random()*1.2,4+Math.random(), i===1), x); }
  [[-11.5,-6],[-12,7],[11.5,-2],[12,12]].forEach(([x,z])=>seat(makeBanana(x,z,1+Math.random()*.3), x));
  [[-13,2],[13,5]].forEach(([x,z])=>seat(makeBambooClump(x,z,1.15), x));

  // Riverbank planting: only above the shoreline, thinning out as the bank drops.
  addGroundCover({ w:64, d:84, n:560, grass:0x4f8a34, weed:0x6d9a46,
    ok:(x,z)=> Math.abs(x) > SHORE+.6 && Math.abs(x) < 30 });

  boatGroup = makeBanca(over);
  scene.add(boatGroup);
  const pcount = Math.min(load,8);
  const pos = getPassengerPos(pcount, uneven);
  const pcols = [0x1e3a8a,0x7c2d12,0x065f46,0x5b21b6,0x92400e,0x1e40af,0x831843,0x064e3b];
  pos.forEach((p,i)=>{
    const h = makeHuman(p.x, p.y+(standing?.35:0), p.z, pcols[i%8], 0x2a1a3a, .78);
    boatGroup.add(h);
  });
  boatDyn = { tilt: over?.22:(uneven?.16:.04), off: uneven?.12:0, shift: shifting, sink: over?-.18:.05 };
  animCallbacks.push((t)=>{
    if(boatGroup){
      boatGroup.rotation.z = Math.sin(t*.7)*boatDyn.tilt + boatDyn.off + (boatDyn.shift?Math.sin(t*3)*.08:0);
      boatGroup.rotation.x = Math.sin(t*.5+.5)*.04;
      boatGroup.position.y = Math.sin(t*.8)*.06 + boatDyn.sink;
    }
  });

  [[-16,-10],[-17,-2],[-16,8],[-15,14]].forEach(([x,z])=>seat(makeTree(x,z,1.2,Math.random()>.5?'palm':''), x));
  [[16,-10],[17,-2],[16,8],[15,14]].forEach(([x,z])=>seat(makeTree(x,z,1.2,Math.random()>.5?'palm':''), x));
  for(let i=0;i<8;i++){
    const lx=-12-Math.random()*4, rx=12+Math.random()*4;
    seat(makeBush(lx,-14+i*4,1), lx); seat(makeBush(rx,-14+i*4,1), rx);
  }

  if(!over) [-1.4,0,1.4].forEach(bx=>{
    const g2 = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({color:0x44ff88,transparent:true,opacity:.7});
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,.6,14), m); sh.position.y = -1.2;
    const tp = new THREE.Mesh(new THREE.ConeGeometry(.1,.25,8), m); tp.position.y = -.8;
    g2.add(sh,tp); g2.position.set(bx,0,0);
    animCallbacks.push((t)=>{ g2.position.y = Math.sin(t*1.2)*.08; m.opacity = .5+Math.sin(t*1.5)*.2; });
    scene.add(g2);
  });

  gatewayGroup = makeGateway(9,2.3,0,0xa78bfa);
  gatewayGroup.rotation.y = Math.PI/2;
  scene.add(gatewayGroup);

  cam.base.set(-7,4.5,-12); cam.look.set(0,.5,0);
  cam.target.copy(cam.base); camera.position.copy(cam.base);
}

function makeBanca(over){
  const g = new THREE.Group();
  const hm = pbr({color:0x6a4520,map:woodTex(),roughness:.9});
  const im = pbr({color:0x5a3a18,roughness:.95});
  const sm = pbr({color:0x9a7a4a,map:woodTex(),roughness:.85});

  const shape = new THREE.Shape();
  shape.moveTo(-2.8,0); shape.lineTo(-2.4,.7); shape.lineTo(2.4,.7);
  shape.lineTo(2.8,0); shape.lineTo(2.4,-.7); shape.lineTo(-2.4,-.7); shape.lineTo(-2.8,0);
  const hg = new THREE.ExtrudeGeometry(shape,{depth:.45,bevelEnabled:true,bevelSegments:3,bevelSize:.05,bevelThickness:.04});
  hg.rotateX(Math.PI/2); hg.translate(0,-.45,0);
  const hull = new THREE.Mesh(hg, hm);
  hull.castShadow = hull.receiveShadow = true; g.add(hull);

  const interior = new THREE.Mesh(new THREE.BoxGeometry(4.4,.3,1.05), im);
  interior.position.y = -.1; g.add(interior);
  [-1.6,0,1.6].forEach(sx=>{
    const st = new THREE.Mesh(new THREE.BoxGeometry(.85,.08,1.1), sm);
    st.position.set(sx,.18,0); st.castShadow = true; g.add(st);
  });
  const bow = new THREE.Mesh(new THREE.ConeGeometry(.45,.9,4), hm);
  bow.rotation.z = -Math.PI/2; bow.rotation.y = Math.PI/4;
  bow.position.set(2.9,0,0); bow.castShadow = true; g.add(bow);
  const stern = bow.clone(); stern.rotation.z = Math.PI/2; stern.position.x = -2.9; g.add(stern);

  const om = pbr({color:0x5a3a18,map:woodTex(),roughness:.9});
  [-1.7,1.7].forEach(oz=>{
    const o = new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,4.5,16), om);
    o.rotation.x = Math.PI/2; o.position.set(0,-.1,oz); o.castShadow = true; g.add(o);
    [-1.3,1.3].forEach(ox=>{
      const a = new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,Math.abs(oz),12), om);
      a.rotation.x = Math.PI/2; a.position.set(ox,-.05,oz/2); g.add(a);
    });
  });
  const wl = new THREE.Mesh(new THREE.PlaneGeometry(5.8,1.6),
    new THREE.MeshBasicMaterial({color:over?0xff4444:0x44ff88,transparent:true,opacity:.3,side:THREE.DoubleSide}));
  wl.rotation.x = -Math.PI/2; wl.position.y = over?-.05:.12; g.add(wl);
  g.position.y = over?-.08:.1;
  return g;
}
function getPassengerPos(count, uneven){
  const base = [{x:-1.7,y:.32,z:-.3},{x:-1.7,y:.32,z:.3},{x:0,y:.32,z:-.3},{x:0,y:.32,z:.3},
    {x:1.7,y:.32,z:-.3},{x:1.7,y:.32,z:.3},{x:-.85,y:.32,z:0},{x:.85,y:.32,z:0}];
  let p = base.slice(0,count);
  if(uneven) p = p.map(q=>({...q, z:Math.abs(q.z)+.25}));
  return p;
}

function buildBridgeScene(scen){
  clearScene();
  const {wind} = scen;
  G10Wind = wind;
  const mood = wind>80?'storm':wind>50?'overcast':'sunny';
  setupLighting(mood);
  skyDome(wind>80?0x2a3545:wind>50?0x5a6878:0x4a85bb, wind>80?0x4a5566:wind>50?0x8898a8:0xc0d8e8);

  // Banks sit flush at y=0 (they used to rest at −0.3, which left every prop on them —
  // towers included — hovering above the ground) and now stop at ±5.5, so the deck
  // genuinely spans an 11-unit ravine instead of hanging over solid earth.
  const rockT = grassTexF('rock',0x6a6258,0x4a4540); rockT.repeat.set(10,10);
  // Grade 7 passes a grassy bank material (scen.bankMat) so its village pathway scenes
  // don't sit on bare grey rock.
  const rm = scen.bankMat || pbr({color:0x6a6258,map:rockT,roughness:.95});
  const BANK = 5.5;
  const gl2 = makeTerrain(22,80,32,(x,z)=>{ const e=-x-4; return e>0?Math.pow(e,.7)*1.8+Math.sin(z*.5)*.2+tnoise(x,z)*.5:0; },0x6a6258,0x4a4540);
  gl2.material = rm; gl2.position.set(-(BANK+11),0,0); scene.add(gl2);
  const gr2 = makeTerrain(22,80,32,(x,z)=>{ const e=x-4; return e>0?Math.pow(e,.7)*1.8+Math.sin(z*.5)*.2+tnoise(x,z)*.5:0; },0x6a6258,0x4a4540);
  gr2.material = rm; gr2.position.set(BANK+11,0,0); scene.add(gr2);

  // Ravine walls — the bank planes are infinitely thin, so without these you could see
  // straight through the cliff edge and the gorge read as a painted stripe, not a drop.
  [-1,1].forEach(sd=>{
    const wall = new THREE.Mesh(new THREE.BoxGeometry(.7,4.4,80), pbr({color:0x5a554e,map:rockT,roughness:.95}));
    wall.position.set(sd*(BANK+.3),-2.2,0); wall.receiveShadow = wall.castShadow = true; scene.add(wall);
  });

  const rb = makeWater(14,80,1,0x2a7aa8,0x0a3a5a,90,{refl:.4, flow:[0,.6]});   // shaded gorge: reflects far less sky
  rb.position.set(0,-2.6,0); scene.add(rb); // sits well down inside the ravine
  for(let i=0;i<6;i++){
    const rk = new THREE.Mesh(new THREE.IcosahedronGeometry(.3+Math.random()*.4,1), pbr({color:0x4a4440,map:rockT,roughness:.95}));
    rk.position.set((Math.random()-.5)*8,-2.2+Math.random()*.3,(Math.random()-.5)*30);
    rk.scale.y = .5+Math.random()*.3; rk.castShadow = true; scene.add(rk);
  }

  // Scrub on the plateaus, kept back from the ravine lip.
  addGroundCover({ w:56, d:76, n:520, grass:0x6a7a44, weed:0x7d8a4c, pebbles:true,
    ok:(x,z)=> Math.abs(x) > BANK+.8 && Math.abs(x) < 27 });

  bridgeGroup = makeBridge(wind);
  scene.add(bridgeGroup);
  const HT = (-3.5+BR.half)/BR.W;              // where the idle figure stands along the span
  const humanRestY = brDeckY(HT)+.06;
  // Grade 7 reuses this scene with its own learner standing on the bank (noRider).
  const rider = scen.noRider ? null : makeHuman(-3.5,humanRestY,0,0x065f46);
  if(rider){ humanGroup = rider; bridgeGroup.add(rider); }

  // ── WIND FLEX ──
  // Pinned at both towers and maximal at midspan (the fundamental mode of a suspended
  // cable), driven by a slow gust envelope, plus a torsional component that reverses
  // sign either side of centre — the Tacoma-Narrows twisting mode the physics note for
  // this grade already refers to. Amplitude is capped so the deck never slides out from
  // under the player during the walk-across phase.
  const swayAmp = .02 + wind/450;
  const twistAmp = wind/2200;
  const spd = .5 + wind/150;
  const humanEnv = Math.sin(HT*Math.PI);
  bridgeGroup.userData.swayAmp = swayAmp;
  animCallbacks.push((t)=>{
    const gust = .72 + .28*Math.sin(t*.41);
    // windK (0–1) lets a scene ramp the wind live, e.g. Grade 7's rising wind updates.
    const wk = bridgeGroup.userData.windK==null ? 1 : bridgeGroup.userData.windK;
    const phase = Math.sin(t*spd)*gust*wk;
    const span = bridgeGroup.userData.span;
    for(let i=0;i<span.length;i++){
      const p = span[i];
      p.mesh.position.z = p.bz + phase*swayAmp*p.env;
      // Swinging sideways lengthens the cable path slightly, so the deck dips as it goes.
      p.mesh.position.y = p.by - Math.abs(phase)*swayAmp*p.env*.22;
      if(p.twist) p.mesh.rotation.x = phase*twistAmp*p.env*Math.sin(p.t*Math.PI*2)*3;
    }
    bridgeGroup.userData.swayZ = phase*swayAmp;
    // Idle figure rides the deck and counter-leans to keep balance. Skipped once the
    // student takes control, where updateControl() owns the figure's position.
    if(rider && !ctrl.on){
      rider.position.z = phase*swayAmp*humanEnv;
      rider.position.y = humanRestY - Math.abs(phase)*swayAmp*humanEnv*.22;
      rider.rotation.x = -phase*swayAmp*humanEnv*.8;
    }
  });

  [[-10,-10],[-11,-3],[-10,5],[-12,12]].forEach(([x,z])=>scene.add(makeTree(x,z,1.2,Math.random()>.5?'palm':'')));
  [[10,-10],[11,-3],[10,5],[12,12]].forEach(([x,z])=>scene.add(makeTree(x,z,1.2,Math.random()>.5?'palm':'')));
  // Bamboo thickets cling to ravine edges here, and they visibly thrash in a typhoon —
  // a second read on wind strength beyond the bridge itself.
  [[-7.2,-14],[-7.6,-4],[-7.2,9],[7.2,-11],[7.6,0],[7.2,13]].forEach(([x,z])=>scene.add(makeBambooClump(x,z,1.15)));
  [[-9,-7],[9,4]].forEach(([x,z])=>scene.add(makeBanana(x,z,1)));
  // A couple of houses set back from the crossing, so the bridge reads as the route
  // between two inhabited sitios rather than a structure in empty terrain.
  scene.add(makeNipaHut(-13.5,-8,1));
  scene.add(makeConcreteHouse(13.5,6,3.6,3.2,3.6));
  for(let i=0;i<6;i++){ scene.add(makeBush(-8-Math.random()*3,-12+i*4,1)); scene.add(makeBush(8+Math.random()*3,-12+i*4,1)); }

  if(wind>60){ rain = makeRain(wind>80?7000:4500,50,30,60,wind>80?1.5:1.1); scene.add(rain); }
  addWindDebris(wind);
  if(wind>30) makeWindStreaks(Math.floor(Math.min(900, wind*10)*Math.max(.4,PARTICLE_K)), 44, 9, 26, wind);

  gatewayGroup = makeGateway(9,2.5,0,0x34d399);
  gatewayGroup.rotation.y = Math.PI/2;
  scene.add(gatewayGroup);

  cam.base.set(-12,5,-13); cam.look.set(0,.5,0);
  cam.target.copy(cam.base); camera.position.copy(cam.base);
}

// ─── HANGING FOOTBRIDGE ───
// The towers are structurally separate from the span: they're masonry piers with
// footings sunk below the terrain, cable anchor blocks and back-stays, and they never
// move. Only the deck, main cables, handrails and hangers flex in the wind. (Before,
// the entire assembly — towers included — was rotated and bobbed vertically as one
// rigid object, which read as the whole bridge floating free of the banks.)
// Geometry constants are exported on userData so updateControl() can put the walking
// player on the exact same deck curve rather than duplicating the numbers.
const BR = { half:7, W:14, deckY:1, deckSag:1.15, cableY:2, cableSag:1.35 };
function brDeckY(t){ return BR.deckY - Math.sin(t*Math.PI)*BR.deckSag; }
function brCableY(t){ return BR.cableY - Math.sin(t*Math.PI)*BR.cableSag; }

function makeBridge(wind){
  const g = new THREE.Group();
  const wm = pbr({color:0x8b6f4a,map:woodTex(),roughness:.9});
  const rm = pbr({color:0x6a5530,roughness:.95});
  const pm = pbr({color:0x7a7060,map:stoneTex(),roughness:.95});
  const half = BR.half, W = BR.W;

  // Every flexing part is registered here with its normalised position along the span
  // (t) and its rest pose, so the wind animation can displace each one by the correct
  // amount for where it sits between the two fixed towers.
  const span = [];
  const flex = (mesh, t, twist)=>{ span.push({mesh, t, env:Math.sin(t*Math.PI), bz:mesh.position.z, by:mesh.position.y, twist:!!twist}); return mesh; };
  g.userData.span = span;

  // ── TOWERS + ANCHORAGE (static, bolted to the ground) ──
  [-1,1].forEach(sd=>{
    const tx = sd*(half+.4);
    // Footing pad buried below y=0 — the tower reads as founded in the rock rather
    // than as a post standing on the surface.
    const footing = new THREE.Mesh(new THREE.BoxGeometry(2,1.3,2.5), pm);
    footing.position.set(tx,-.5,0); footing.receiveShadow = true; g.add(footing);
    [-0.7,0.7].forEach(zo=>{
      const post = new THREE.Mesh(new THREE.BoxGeometry(.5,3.4,.5), pm);
      post.position.set(tx,1.5,zo); post.castShadow = true; g.add(post); // -0.2 → 3.2
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(.15,.18,.16,16), pbr({color:0x4a4a4a,metalness:.5,roughness:.6}));
      cap.position.set(tx,3.28,zo); g.add(cap);
      // Saddle the main cable actually passes over at the tower top
      const saddle = new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.34,16), pbr({color:0x3a3a3a,metalness:.6,roughness:.5}));
      saddle.rotation.x = Math.PI/2; saddle.position.set(tx,brCableY(0)+.02,zo); g.add(saddle);
      // Cable anchor block + back-stay running from the tower top down into it
      const anch = new THREE.Mesh(new THREE.BoxGeometry(.6,.6,.45), pm);
      anch.position.set(sd*(half+1.5),.2,zo); anch.castShadow = true; g.add(anch);
      const a = new THREE.Vector3(tx,3.1,zo), b = new THREE.Vector3(sd*(half+1.5),.42,zo);
      const stay = new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,a.distanceTo(b),12), rm);
      stay.position.copy(a).add(b).multiplyScalar(.5);
      stay.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), b.clone().sub(a).normalize());
      stay.castShadow = true; g.add(stay);
    });
    // Cross-brace tying the pair of posts together
    const brace = new THREE.Mesh(new THREE.BoxGeometry(.38,.24,1.9), pm);
    brace.position.set(tx,2.8,0); brace.castShadow = true; g.add(brace);
    // Abutment landing: carries the deck ends down onto solid ground, so the walkway
    // starts on masonry instead of beginning in mid-air.
    const land = new THREE.Mesh(new THREE.BoxGeometry(1.6,1.2,2), pm);
    land.position.set(sd*(half-.4),.4,0); land.castShadow = land.receiveShadow = true; g.add(land);
  });

  // ── MAIN CABLES + HANDRAILS (flexing) ──
  // Built as a chain of short segments rather than one TubeGeometry so each piece can
  // be displaced independently; adjacent segments share nearly the same sway value, so
  // the chain still reads as one continuous cable.
  const CS = 16;
  const cableSeg = (t0,t1,zo,yFn,radius)=>{
    const a = new THREE.Vector3(-half+t0*W, yFn(t0), zo);
    const b = new THREE.Vector3(-half+t1*W, yFn(t1), zo);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,a.distanceTo(b),12), rm);
    m.position.copy(a).add(b).multiplyScalar(.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), b.clone().sub(a).normalize());
    m.castShadow = true; g.add(m);
    flex(m, (t0+t1)/2);
  };
  [-0.7,0.7].forEach(zo=>{
    for(let s=0;s<CS;s++){
      cableSeg(s/CS,(s+1)/CS,zo,brCableY,.055); // main suspension cable
      cableSeg(s/CS,(s+1)/CS,zo,brDeckY_rail,.035); // hand rope, riding a little above the deck
    }
  });

  // ── DECK PLANKS, HANGERS, SIDE NETTING (flexing) ──
  const pc = 30;
  for(let i=0;i<pc;i++){
    const t = i/(pc-1), x = -half+t*W, y = brDeckY(t);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(.45,.07,1.5), wm);
    plank.position.set(x,y,0); plank.castShadow = plank.receiveShadow = true; g.add(plank);
    flex(plank, t, true); // planks also carry the torsional twist
    if(i%2===0) [-0.7,0.7].forEach(zo=>{
      const len = brCableY(t)-y;
      if(len>0){
        const h = new THREE.Mesh(new THREE.CylinderGeometry(.02,.02,len,10), rm);
        h.position.set(x,y+len/2,zo); g.add(h);
        flex(h, t);
      }
    });
    if(i%3===0) [-0.7,0.7].forEach(zo=>{
      const sr = new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,Math.max(.01,brDeckY_rail(t)-y),10), rm);
      sr.position.set(x,(y+brDeckY_rail(t))/2,zo); g.add(sr);
      flex(sr, t);
    });
  }

  if(wind>60) for(let i=0;i<8;i++){
    const t = i/7, x = -half+t*W;
    const st = new THREE.Mesh(new THREE.TorusGeometry(.1,.025,12,20),
      new THREE.MeshStandardMaterial({color:0xff4444,emissive:0xff2222,emissiveIntensity:.6,transparent:true,opacity:.8}));
    st.position.set(x, brCableY(t), -0.7);
    g.add(st); flex(st, t);
    animCallbacks.push((tt)=>{ st.material.opacity = .5+Math.sin(tt*3+i)*.4; });
  }
  return g;
}
// Hand rope sits a fixed height above the walking surface, so it sags with the deck.
function brDeckY_rail(t){ return brDeckY(t)+.85; }

function buildMenuBackground(){
  clearScene();
  setupLighting('twilight');
  skyDome(0x1a2855, 0xee8866);
  const grT = grassTexF('menu',0x3a5a28,0x2a4a18); grT.repeat.set(18,18);
  const ground = makeTerrain(120,120,44,(x,z)=>Math.sin(x*.1)*.4+Math.sin(z*.12)*.35+tnoise(x,z)*.35,0x3a5a28,0x2a4a18);
  ground.material = pbr({color:0x3a5a28,map:grT,roughness:.95,vertexColors:true});
  ground.position.y = -.5; scene.add(ground);
  const water = makeWater(120,120,.4,0x2a6a98,0x0a3a5a);
  water.position.y = -.15; scene.add(water);
  addGroundCover({ w:96, d:96, y:-.4, n:700, grass:0x3f6a30, weed:0x51803a,
    ok:(x,z)=> Math.hypot(x,z) > 7 && Math.hypot(x,z) < 46 });
  for(let i=0;i<10;i++){
    const a = (i/10)*6.28, r = 20+Math.random()*14;
    scene.add(makeHouse(Math.cos(a)*r, Math.sin(a)*r, 3+Math.random(), 3.2+Math.random()*1.2, 3+Math.random()));
  }
  for(let i=0;i<7;i++){
    const a = (i/7)*6.28+.4, r = 13+Math.random()*16;
    scene.add(makeBanana(Math.cos(a)*r, Math.sin(a)*r, 1+Math.random()*.4));
  }
  for(let i=0;i<5;i++){
    const a = (i/5)*6.28+1.1, r = 16+Math.random()*14;
    scene.add(makeBambooClump(Math.cos(a)*r, Math.sin(a)*r, 1.1));
  }
  for(let i=0;i<16;i++){
    const a = (i/16)*6.28+Math.random()*.3, r = 10+Math.random()*24;
    scene.add(makeTree(Math.cos(a)*r, Math.sin(a)*r, 1+Math.random()*.8, Math.random()>.5?'palm':''));
  }
  rain = makeRain(2200,80,30,80,.5);
  scene.add(rain);
  cam.base.set(0,8,-25); cam.look.set(0,0,0);
  cam.target.copy(cam.base); camera.position.copy(cam.base);
  animCallbacks.push((t)=>{
    cam.base.set(Math.sin(t*.08)*8, 6+Math.sin(t*.05)*2, -25+Math.cos(t*.08)*4);
  });
}

// ═══════════════════════════════════════════════
//  CONTROL PHASE — student pilots the simulation
// ═══════════════════════════════════════════════
function missionText(proceed, grade){
  if(isSceneGrade(grade)) return (ctrl.scen && ctrl.scen.mission) || 'Carry out the safe decision — reach the gateway';
  if(grade===9) return proceed ? 'Steer the bancá across the river to the gateway' : 'Return the bancá safely to the dock gateway';
  if(grade===10) return proceed ? 'Walk across the hanging bridge to the gateway' : 'Retreat carefully off the bridge to the safe-zone gateway';
  return proceed ? 'Wade across the floodwater to the gateway' : 'Retreat to the high-ground gateway behind you';
}

// ═══════════════════════════════════════════════
//  BUOYANCY LABORATORY — Predict → Observe → Explain
//  resolve() is computed physics, not an answer lookup.
// ═══════════════════════════════════════════════
let LAB = null;

function labMaxSafe(w){ return Math.floor((w.rho*w.hullV - w.hullM)/w.pM); }
function labResolve(w, n){
  const W = (w.hullM + n*w.pM) * w.g;                    // total weight (N)
  const V_needed = W / (w.rho * w.g);                    // volume that must be displaced (m³)
  const floats = V_needed <= w.hullV;
  const F_b_max = w.rho * w.g * w.hullV;                 // max buoyant force (N)
  return { floats, W, F_b_max, V_needed, freeboard: Math.max(0, 1 - V_needed/w.hullV) };
}

function labInit(scen){
  LAB = { scen, w:scen.world, pred:null, locked:false, loaded:0, humans:[], busy:false };
  const ce = document.getElementById('choices');
  ce.innerHTML = `
  <div class="lab-panel" role="group" aria-label="Buoyancy laboratory controls">
    <div class="lab-attempt" id="lab-att">Attempt 1</div>
    <div id="lab-predict">
      <div class="lab-prompt">🔒 PREDICT first — how many people can this boat safely carry?</div>
      <div class="lab-step">
        <button onclick="labPred(-1)" aria-label="Decrease prediction">−</button>
        <span class="lab-num" id="lab-pn">0</span>
        <button onclick="labPred(1)" aria-label="Increase prediction">+</button>
      </div>
      <button class="lab-go" onclick="labLock()" aria-label="Lock in prediction">Lock My Prediction</button>
      <div class="lab-note" style="font-size:.66rem;color:var(--txd);margin-top:.5rem">Your prediction is recorded before you can touch the boat. That's the point.</div>
    </div>
    <div id="lab-run" style="display:none">
      <div class="lab-prompt" id="lab-run-p">Now load the boat. Watch the waterline.</div>
      <div class="lab-step">
        <button onclick="labBoard(-1)" aria-label="Remove one passenger">−</button>
        <span class="lab-num" id="lab-ln">0</span>
        <button onclick="labBoard(1)" aria-label="Board one passenger">+</button>
      </div>
      <div class="gauge" aria-label="Buoyancy gauge">
        <div class="gauge-row"><span class="gauge-lbl">Weight W</span><div class="gauge-bw"><div class="gauge-b" id="gW" style="background:linear-gradient(90deg,#f59e0b,#ef4444)"></div></div><span class="gauge-val" id="gWv">–</span></div>
        <div class="gauge-row"><span class="gauge-lbl">Max buoyancy F_b</span><div class="gauge-bw"><div class="gauge-b" id="gF" style="background:linear-gradient(90deg,#22c55e,#4ade80);width:100%"></div></div><span class="gauge-val" id="gFv">–</span></div>
        <div class="gauge-row"><span class="gauge-lbl">Freeboard</span><div class="gauge-bw"><div class="gauge-b" id="gB" style="background:#38bdf8"></div></div><span class="gauge-val" id="gBv">–</span></div>
      </div>
      <button class="lab-go" id="lab-launch" onclick="labLaunch()" aria-label="Launch the boat">🚤 LAUNCH</button>
      <div class="lab-hint" id="lab-hint"></div>
    </div>
  </div>`;
}
function labPred(d){
  if(!LAB || LAB.locked) return;
  LAB.pred = Math.max(0, Math.min(LAB.w.avail, (LAB.pred||0)+d));
  document.getElementById('lab-pn').textContent = LAB.pred;
  AudioSysSafe('click');
}
function labLock(){
  if(!LAB || LAB.pred===null){ LAB.pred = 0; }
  LAB.locked = true;
  GS.pred = LAB.pred;
  // Misconception screen at commit time (Section 3.1)
  let mis = '';
  const max = labMaxSafe(LAB.w);
  if(LAB.pred<=1 && LAB.w.hullM>=100) mis = 'weight_determines_sinking';
  else if(LAB.pred>=LAB.w.avail && LAB.w.avail>max) mis = 'capacity_ignored';
  if(mis) logRow('prediction_flag', mis);
  document.getElementById('lab-predict').style.display = 'none';
  document.getElementById('lab-run').style.display = '';
  document.getElementById('lab-run-p').textContent = `You predicted ${LAB.pred}. Now load the boat and watch the waterline.`;
  labGauge();
}
function labBoard(d){
  if(!LAB || !LAB.locked || LAB.busy) return;
  LAB.loaded = Math.max(0, Math.min(LAB.w.avail, LAB.loaded+d));
  document.getElementById('lab-ln').textContent = LAB.loaded;
  labVisual();
  labGauge();
  AudioSysSafe('click');
}
function labVisual(){
  if(!boatGroup) return;
  // Remove & re-place passengers (max 8 visible)
  LAB.humans.forEach(h=>boatGroup.remove(h));
  LAB.humans = [];
  const n = Math.min(LAB.loaded, 8);
  const pos = getPassengerPos(n, false);
  const cols = [0x1e3a8a,0x7c2d12,0x065f46,0x5b21b6,0x92400e,0x1e40af,0x831843,0x064e3b];
  pos.forEach((p,i)=>{
    const h = makeHuman(p.x, p.y, p.z, cols[i%8], 0x2a1a3a, .78);
    boatGroup.add(h); LAB.humans.push(h);
  });
  // The waterline responds to REAL displaced volume
  const r = labResolve(LAB.w, LAB.loaded);
  const ratio = Math.min(1.15, r.V_needed / LAB.w.hullV);
  boatDyn.sink = .12 - ratio*.34;
  boatDyn.tilt = .04 + Math.max(0, ratio-.85)*.45;
}
function labGauge(){
  const r = labResolve(LAB.w, LAB.loaded);
  const wPct = Math.min(100, (r.W/r.F_b_max)*100);
  document.getElementById('gW').style.width = wPct+'%';
  document.getElementById('gWv').textContent = Math.round(r.W)+' N';
  document.getElementById('gFv').textContent = Math.round(r.F_b_max)+' N';
  document.getElementById('gB').style.width = (r.freeboard*100)+'%';
  document.getElementById('gBv').textContent = (r.freeboard*100).toFixed(0)+'%';
  const lb = document.getElementById('lab-launch');
  lb.style.background = r.floats
    ? (r.freeboard<.08 ? 'linear-gradient(135deg,#d97706,#f59e0b)' : 'linear-gradient(135deg,#16a34a,#22c55e)')
    : 'linear-gradient(135deg,#dc2626,#ef4444)';
  // Escalating scaffold (Section 3.3): attempt 3+ unlocks the working
  if(GS.attempts>=2){
    const h = document.getElementById('lab-hint');
    h.style.display = 'block';
    h.textContent = `Hint: the boat floats while W ≤ ρ·g·V_hull. Here that means (${LAB.w.hullM} + n×${LAB.w.pM}) ≤ ${LAB.w.rho}×${LAB.w.hullV} = ${Math.round(LAB.w.rho*LAB.w.hullV)} kg of displaced water. Solve for n.`;
  }
}
function labLaunch(){
  if(!LAB || LAB.busy) return;
  LAB.busy = true;
  GS.attempts++;
  document.getElementById('lab-att').textContent = 'Attempt '+GS.attempts;
  const r = labResolve(LAB.w, LAB.loaded);
  const max = labMaxSafe(LAB.w);
  if(r.floats){
    // Cruise forward briefly, then explain
    AudioSysSafe('correct');
    let steps = 0;
    const iv = setInterval(()=>{
      if(boatGroup) boatGroup.position.x += .045;
      if(++steps>26){ clearInterval(iv); labExplain(true, r, max); }
    }, 33);
  } else {
    // SWAMP — the water sim does the teaching. Framed around agency, not casualties (Section 10).
    logRow('swamped', LAB.loaded>max ? 'overload_freeboard' : '');
    AudioSysSafe('wrong');
    if(navigator.vibrate) navigator.vibrate([80,50,120]);
    let k = 0;
    const iv = setInterval(()=>{
      k += .04;
      boatDyn.sink = .12 - Math.min(1.15,(r.V_needed/LAB.w.hullV))*.34 - k*.5;
      boatDyn.tilt = .04 + k*.5;
      if(k>=.7){ clearInterval(iv); labExplain(false, r, max); }
    }, 40);
  }
}
function labExplain(floated, r, max){
  document.getElementById('fb-wrap').classList.add('on');
  const w = LAB.w;
  const predTxt = `You predicted ${LAB.pred}. `;
  document.getElementById('fb-ico').textContent = floated ? '✓' : '↺';
  document.getElementById('fb-ico').className = 'fbv-ico ' + (floated?'ok':'no');
  const oe = document.getElementById('fb-outcome');
  let diag = '';
  const nb = document.getElementById('next-btn');
  const C = (l,v)=>`<div class="chip"><div class="chip-l">${l}</div><div class="chip-v">${v}</div></div>`;
  document.getElementById('fb-chips').innerHTML =
    C('Loaded', LAB.loaded+' persons') + C('W total', Math.round(r.W)+' N') +
    C('F_b max', Math.round(r.F_b_max)+' N') + C('V needed', r.V_needed.toFixed(3)+' m³') +
    C('Freeboard', (r.freeboard*100).toFixed(0)+'%');

  if(floated){
    const full = LAB.loaded===max, near = LAB.loaded===max-1;
    document.getElementById('fb-verdict').textContent =
      LAB.pred===LAB.loaded && full ? 'Your prediction matched the physics.' : 'It floats.';
    oe.className = 'fb-out ' + (full?'fo-safe':near?'fo-risky':'fo-risky');
    oe.textContent = full ? `✓ FLOATED — ${LAB.loaded} aboard, freeboard held`
      : `FLOATED — but capacity is ${max}`;
    if(full){
      diag = predTxt + `${LAB.loaded} people, and the freeboard held. The displaced water (${r.V_needed.toFixed(2)} m³) weighs more than boat + passengers — exactly Archimedes' principle at work.`;
      if(LAB.scen.salt) diag += ' Notice: in seawater (ρ=1025), this same hull carries one MORE person than in fresh water. Denser fluid → more buoyant force per m³ displaced.';
    } else if(LAB.loaded < max){
      diag = predTxt + `It floats — but you left ${max-LAB.loaded} ${max-LAB.loaded===1?'person':'people'} at the dock. The physics says this hull can displace enough water for ${max}. In an evacuation, under-loading has a cost too. Want full marks? Find the true maximum.`;
    }
    // Score & log on first successful launch
    if(!GS.answered){
      GS.answered = true;
      const base = LAB.loaded===max ? 1 : LAB.loaded===max-1 ? .7 : .4;
      GS.scores.push(attemptScore(base));
      recordResult({ outcome: LAB.loaded===max ? 'correct' : 'incorrect', chosenOption: LAB.loaded, correctOption: max, score: attemptScore(base) });
      updateScore();
      gatewayActive = true;
    }
    nb.textContent = LAB.loaded<max ? '↺ Reload and try for the true maximum' : '🎮 Take Control — Ferry Them Across';
    nb.onclick = LAB.loaded<max ? labRetry : startControl;
  } else if(GS.attempts >= LAB_MAX_ATTEMPTS){
    // Retry cap reached: reveal the answer and let the student move on, same as a missed quiz question.
    document.getElementById('fb-verdict').textContent = 'The bancá swamped — the correct capacity is revealed below';
    oe.className = 'fb-out fo-unsafe';
    oe.textContent = '✗ MAX ATTEMPTS REACHED';
    diag = `${predTxt}After ${GS.attempts} attempts, here's the answer: this hull can safely carry exactly ${max} people. `
      + `floats ⟺ ρ·g·V_hull ≥ (m_hull + n·m_person)·g — solving for n with these numbers gives n = ${max}.`;
    if(!GS.answered){
      GS.answered = true;
      GS.scores.push(0);
      recordResult({ outcome:'incorrect', chosenOption: LAB.loaded, correctOption: max, score: 0 });
      updateScore();
      gatewayActive = true;
    }
    const last = GS.idx === GS.gd.scenarios.length-1;
    nb.textContent = last ? 'See Results →' : 'Next Scenario →';
    nb.onclick = nextScenario;
  } else {
    document.getElementById('fb-verdict').textContent = 'The bancá swamped — attempt '+GS.attempts+' of '+LAB_MAX_ATTEMPTS;
    oe.className = 'fb-out fo-unsafe';
    oe.textContent = '✗ SWAMPED AT '+LAB.loaded+' PEOPLE';
    // Misconception-mapped response, in the Section 3.2 order:
    // observed → concede → correct → experiment → formalism
    if(LAB.pred >= LAB.loaded){
      diag = `${predTxt}It swamped at ${LAB.loaded} — your model over-estimated. What's right in your thinking: a bigger boat CAN carry more, and this hull did lift ${Math.round(r.F_b_max/w.g - w.hullM)} kg of passengers before the rail went under. What's missing: the hull can only displace ${w.hullV} m³ of water — that displaced water weighs ${Math.round(w.rho*w.hullV*w.g)} N, and that is the CEILING on total weight. `
        + `Experiment: reload from zero and add people ONE at a time, watching the freeboard bar. Stop just before it empties. That number is the answer — measured, not guessed. `
        + `Formally: floats ⟺ ρ·g·V_hull ≥ (m_hull + n·m_person)·g.`;
    } else {
      diag = `${predTxt}You loaded ${LAB.loaded} — more than your own prediction — and the water settled it. Everyone waded back to the dock safely, but the crossing failed and the supplies got soaked. `
        + `Trust your reasoning: work out n from ρ·g·V_hull ≥ W, then load exactly that.`;
    }
    nb.textContent = '↺ Unload and Try Again';
    nb.onclick = labRetry;
  }
  document.getElementById('fb-text').textContent = diag;
  document.getElementById('fb-physics').textContent =
    `F_b = ρ·g·V = ${w.rho}×9.81×${w.hullV} = ${Math.round(r.F_b_max)} N max · W = (${w.hullM}+${LAB.loaded}×${w.pM})×9.81 = ${Math.round(r.W)} N · floats ⟺ W ≤ F_b`;
  // Animated diagram: people added one at a time until the weight passes the maximum buoyant force.
  if(typeof setExplainView === 'function') setExplainView('visual');
  if(typeof renderExplainVisual === 'function') renderExplainVisual(LAB.scen, { grade: 9, lab: { w, loaded: LAB.loaded } });
  if(typeof fitFeedback === 'function') fitFeedback();
}
function labRetry(){
  document.getElementById('fb-wrap').classList.remove('on');
  LAB.busy = false;
  LAB.loaded = 0;
  document.getElementById('lab-ln').textContent = '0';
  if(boatGroup) boatGroup.position.x = 0;
  boatDyn.sink = .12; boatDyn.tilt = .04;
  labVisual(); labGauge();
}
function AudioSysSafe(m){ try{ if(typeof AudioSys!=='undefined' && AudioSys[m]) AudioSys[m](); }catch(e){} }

function startControl(){
  document.getElementById('fb-wrap').classList.remove('on');
  const scen = GS.gd.scenarios[GS.idx];
  const opt = scen.opts[scen.ci].toLowerCase();
  let proceed;
  if(GS.grade===9 || isSceneGrade(GS.grade)) proceed = true; // item scenes place their gateway at the safe destination
  else proceed = /cross/.test(opt) && !/do not|not cross/.test(opt);

  ctrl.on = true; ctrl.done = false;
  ctrl.scen = scen; ctrl.grade = GS.grade; ctrl.proceed = proceed;

  // Hide question UI — the world becomes the interface. params-panel/pagasa-alert go
  // too: the decision's already made by this point, and on narrow layouts they'd
  // otherwise sit right where the centered mission banner appears.
  ['scen-card','choices','dots','params-panel','pagasa-alert','observe-btn'].forEach(id=>{ document.getElementById(id).style.display = 'none'; });
  document.getElementById('gate-prompt').style.display = 'none';

  // Mission banner
  const mb = document.getElementById('mission');
  mb.style.display = 'block';
  mb.classList.remove('passed','warn');
  missionExpand(5000);   // full instruction first, then it shrinks to the slim chip
  if(typeof AudioSys!=='undefined' && AudioSys.musicPhase && !GS.tutorial) AudioSys.musicPhase('control');   // full-energy music for the walk
  document.getElementById('m-text').textContent = missionText(proceed, GS.grade);
  document.querySelector('.joy-label').textContent = '⟁ Move';

  // Reposition gateway for retreat missions (execute the correct decision)
  if(gatewayGroup && !proceed && !isSceneGrade(GS.grade)){
    if(GS.grade===10){ gatewayGroup.position.set(-11, 2.0, 0); }
    else { gatewayGroup.position.set(0, 2.3, -14); gatewayGroup.rotation.y = 0; }
  }
  gatewayActive = true;

  // Grade 9: apply the corrected boat configuration before crossing
  // The old Grade 9 buoyancy lab steers the boat; every per-item scene walks the learner.
  const boatMode = GS.grade===9 && !isSceneGrade(GS.grade);
  ctrl.boat = boatMode;
  if(boatMode) applyBoatCorrection(scen);

  ctrl.subject = boatMode ? boatGroup : humanGroup;

  // Chase camera offsets per mode
  if(isSceneGrade(GS.grade) && G7 && G7.camOff) ctrl.camOff.set(...G7.camOff);
  else if(GS.grade===9) ctrl.camOff.set(-6, 4.5, -7);
  else if(GS.grade===10) ctrl.camOff.set(proceed?-6:6, 4, -7);
  else ctrl.camOff.set(0, 4.2, proceed?-9:9);

  if(navigator.vibrate) navigator.vibrate([30,30,30]);
  if(typeof tutEvent==='function') tutEvent('control');
}

function applyBoatCorrection(scen){
  if(!boatGroup) return;
  if(scen.lab) return; // lab: the student's own loading is the corrected configuration
  // Remove passengers beyond capacity (decision executed: extras stay ashore)
  const humans = boatGroup.children.filter(c=>c.userData && c.userData.human);
  const excess = humans.length - scen.cap;
  for(let i=0;i<excess;i++){ boatGroup.remove(humans[humans.length-1-i]); }
  // Re-seat evenly + everyone sits: stable dynamics
  const remaining = boatGroup.children.filter(c=>c.userData && c.userData.human);
  const pos = getPassengerPos(remaining.length, false);
  remaining.forEach((h,i)=>{ if(pos[i]) h.position.set(pos[i].x, pos[i].y, pos[i].z); });
  boatDyn.tilt = .04; boatDyn.off = 0; boatDyn.shift = false; boatDyn.sink = .05;
}

// The mission banner sits in the student's line of sight, so it only shows in full for
// a few seconds (start, on tap) and otherwise stays a slim "🎯 distance" chip at the top.
let missionTimer = null;
function missionExpand(ms){
  const mb = document.getElementById('mission');
  if(!mb) return;
  mb.classList.add('expanded');
  clearTimeout(missionTimer);
  missionTimer = setTimeout(()=>mb.classList.remove('expanded'), ms||5000);
}
let footT = 0;
function updateControl(dt, t){
  const s = ctrl.subject;
  if(!s || !gatewayGroup) return;
  const scen = ctrl.scen;

  // Gateway-relative basis: joystick UP always pushes toward the gateway
  const gw = new THREE.Vector3(); gatewayGroup.getWorldPosition(gw);
  const wp = new THREE.Vector3(); s.getWorldPosition(wp);
  const fwd = new THREE.Vector3(gw.x-wp.x, 0, gw.z-wp.z);
  const gdist = fwd.length();
  if(gdist > .001) fwd.normalize();
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const mv = new THREE.Vector3().addScaledVector(fwd, joy.y).addScaledVector(right, joy.x);
  const mag = mv.length();
  const moving = mag > .12;
  if(humanGroup && humanGroup.userData) humanGroup.userData.moving = !ctrl.boat && moving;
  // footsteps in time with the walk cycle
  if(moving && !ctrl.boat){ footT += dt; if(footT > .37){ footT = 0; AudioSysSafe('footstep'); } } else footT = .3;

  if(isSceneGrade(ctrl.grade)){
    // ── Grades 7, 11, 12: walk to the safe destination; hazard areas refuse entry with a warning ──
    g7UpdateControl(dt, s, mv, moving);
  }
  else if(ctrl.grade===8){
    // ── WADING: water depth slows you, current drags you downstream ──
    const depth = scen.depth||0, vel = scen.vel||0;
    const inFlood = ctrl.proceed && Math.abs(s.position.x) < 7 && s.position.z > -6 && s.position.z < 8;
    const speed = 3 * (inFlood ? Math.max(.4, 1 - depth*.9) : 1);
    s.position.x += mv.x * speed * dt;
    s.position.z += mv.z * speed * dt;
    if(inFlood) s.position.x += vel * .35 * dt; // current pushes sideways
    s.position.x = THREE.MathUtils.clamp(s.position.x, -6, 6);
    s.position.z = THREE.MathUtils.clamp(s.position.z, -15.5, 15);
    if(moving) s.rotation.y = Math.atan2(mv.x, mv.z);
  }
  else if(ctrl.grade===9){
    // ── BOAT: momentum steering, gentle heading turn ──
    const speed = 3.2;
    s.position.x += mv.x * speed * dt;
    s.position.z += mv.z * speed * dt;
    s.position.x = THREE.MathUtils.clamp(s.position.x, -6.5, 10);
    s.position.z = THREE.MathUtils.clamp(s.position.z, -6, 6);
    if(moving){
      const target = Math.atan2(mv.z, mv.x) * -1;
      s.rotation.y += (target - s.rotation.y) * .04;
    }
  }
  else {
    // ── BRIDGE: follow the deck sag, wind gusts shove you sideways, and ride the
    // deck's own lateral sway. Last frame's deck offset is removed first so that the
    // sway isn't integrated into the player's intended position and slowly carried away.
    const wind = scen.wind||0;
    const speed = 2.3 * (wind>60 ? .65 : 1);
    const prevOff = ctrl.deckOff || 0;
    s.position.z -= prevOff;
    s.position.x += mv.x * speed * dt;
    s.position.z += mv.z * speed * dt;
    const onBridge = Math.abs(s.position.x) <= 7.2;
    let off = 0;
    if(onBridge){
      // Wind push: rhythmic gusts + steady lean the player must fight
      s.position.z += (Math.sin(t*2.3)*.6 + .4) * wind * .0006;
      s.position.z = THREE.MathUtils.clamp(s.position.z, -.42, .42);
      const tt = THREE.MathUtils.clamp((s.position.x+BR.half)/BR.W, 0, 1);
      const env = Math.sin(tt*Math.PI);
      off = (bridgeGroup ? (bridgeGroup.userData.swayZ||0) : 0) * env;
      s.position.y = brDeckY(tt) + .06 - Math.abs(off)*.22;
      s.rotation.x = -off*.8; // lean into the deck's roll to stay balanced
    } else {
      s.position.y += (0.04 - s.position.y) * .1; // step off onto the bank (ground is y=0)
      s.position.z = THREE.MathUtils.clamp(s.position.z, -3, 3);
      s.rotation.x *= .85;
    }
    s.position.z += off;
    ctrl.deckOff = off;
    s.position.x = THREE.MathUtils.clamp(s.position.x, -12, 10);
    if(moving) s.rotation.y = Math.atan2(mv.x, mv.z);
  }

  // Distance HUD + gateway collision
  document.getElementById('m-dist').textContent = gdist.toFixed(1) + ' m';
  if(gdist < 2.2) controlSuccess();
}

function controlSuccess(){
  if(ctrl.done) return;
  ctrl.done = true;
  gatewayPassed = true;
  if(humanGroup && humanGroup.userData) humanGroup.userData.moving = false;
  const mb = document.getElementById('mission');
  mb.classList.remove('warn');
  mb.classList.add('passed');
  document.getElementById('m-text').textContent = '✓ GATEWAY PASSED — Level Complete';
  document.getElementById('m-dist').textContent = 'advancing...';
  if(navigator.vibrate) navigator.vibrate([50,40,50,40,90]);
  AudioSysSafe('fanfare');
  const stick = document.getElementById('joy-stick');
  stick.style.boxShadow = '0 0 28px rgba(34,197,94,.9), 0 4px 15px rgba(0,0,0,.6)';
  setTimeout(()=>{ stick.style.boxShadow = ''; }, 900);
  setTimeout(()=>{
    if(GS.tutorial){ if(typeof tutEvent==='function') tutEvent('gateway'); return; }   // practice round: the tutorial takes it from here
    const n = GS.idx+1;
    if(n >= GS.gd.scenarios.length) transitionTo(showResults);
    else {
      const nx = GS.gd.scenarios[n];
      const obj = (nx.lab && nx.objective) ? nx.objective : (GS.gd.topic + (GS.gd.prime ? ' — ' + GS.gd.prime : ''));
      transitionTo(()=>loadScenario(n), obj);
    }
  }, 1100);
}

