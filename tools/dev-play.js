// Dev-only helpers for play-testing item scenes from the browser console (not deployed:
// firebase.json ignores tools/). Load on game.html with:
//   const s = document.createElement('script'); s.src = 'tools/dev-play.js?' + Date.now(); document.head.appendChild(s);
// then e.g. `await go(9,0); await runAll()`.
window.W = ms => new Promise(r => setTimeout(r, ms));
window.until = async (f, ms = 8000) => { const t0 = Date.now(); while(!f() && Date.now() - t0 < ms) await W(100); return f(); };
// Start grade g, item i (0-based) and jump straight to Take Control.
window.go = async (g, i) => {
  startGrade(g, 'local', 'Local'); await W(600); loadScenario(i); await W(500);
  try{ skipNarration(); }catch(e){}
  try{ stopWatch(); }catch(e){}
  await W(400); startControl();
  return document.getElementById('m-text').textContent;
};
// Put the learner next to the current marker.
window.hop = () => { const g = gatewayGroup.position; humanGroup.position.x = g.x + .3; humanGroup.position.z = g.z + .3; };
window.st = () => ({ text: document.getElementById('m-text').textContent, step: G7 && G7.step, busy: G7 && G7.busy, done: ctrl.done, errs: window.__errs });
// Hop through every step (stopping after step `stopAt`, if given) and log the banner.
window.runAll = async (stopAt) => {
  const log = []; let n = 0;
  while(!ctrl.done && n < 8){
    await until(() => !G7.busy); if(ctrl.done) break;
    hop(); n++;
    await until(() => G7.busy || ctrl.done, 3000); log.push(st().text);
    if(stopAt === n) return log;
    await until(() => !G7.busy || ctrl.done, 15000);
  }
  log.push(st().text); return log;
};
// Play a scene like a student: steer along the guide route with screen-relative joystick
// input, and press the action button whenever it appears. Reports where it got stuck.
window.steer = () => {
  const p = humanGroup.position, r = (G7 && G7.route) || [];
  let tx = gatewayGroup.position.x, tz = gatewayGroup.position.z;
  for(let i = 1; i < r.length; i++){ if(Math.hypot(r[i][0]-p.x, r[i][1]-p.z) > .35){ [tx, tz] = r[i]; break; } }
  let dx = tx - p.x, dz = tz - p.z; const L = Math.hypot(dx, dz); if(L < .05){ joy.x = joy.y = 0; return; }
  dx /= L; dz /= L;
  let fx = p.x - camera.position.x, fz = p.z - camera.position.z; const fl = Math.hypot(fx, fz); fx /= fl; fz /= fl;
  const k = Math.min(1, L/.6 + .25);                       // ease in on the footprints
  joy.y = (dx*fx + dz*fz)*k; joy.x = (dx*-fz + dz*fx)*k;
};
window.walkAll = async (maxMs = 60000) => {
  const log = [], t0 = Date.now(); let last = null, still = 0;
  const act = document.getElementById.bind(document, 'g7-act');
  while(!ctrl.done && Date.now() - t0 < maxMs){
    const b = act();
    if(b && b.style.display === 'block'){ joy.x = joy.y = 0; await W(250); log.push('PRESS ' + b.textContent); b.click(); await W(300); continue; }
    if(G7.busy || G7.noWalk){ joy.x = joy.y = 0; await W(200); continue; }
    steer(); await W(60);
    const p = humanGroup.position, k = `${p.x.toFixed(1)},${p.z.toFixed(1)}`;
    still = k === last ? still + 1 : 0; last = k;
    if(still > 40){ joy.x = joy.y = 0; log.push('STUCK at ' + k + ' · ' + st().text); return log; }
    const tx = st().text; if(log[log.length-1] !== tx && !tx.startsWith('⚠')) log.push(tx); else if(tx.startsWith('⚠') && !log.includes(tx)) log.push(tx);
  }
  joy.x = joy.y = 0; log.push(ctrl.done ? 'DONE' : 'TIMEOUT'); return log;
};
window.__errs = []; window.addEventListener('error', e => window.__errs.push(e.message));
