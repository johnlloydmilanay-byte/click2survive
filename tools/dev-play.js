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
// Walk with the joystick held straight "forward" (toward the marker) through every step;
// reports where the learner got stuck, if anywhere.
window.walkAll = async (maxMs = 60000) => {
  const log = [], t0 = Date.now();
  let last = null, still = 0;
  while(!ctrl.done && Date.now() - t0 < maxMs){
    if(G7.busy || G7.noWalk){ joy.y = 0; await W(200); continue; }
    joy.y = 1; await W(250);
    const p = humanGroup.position, k = `${p.x.toFixed(1)},${p.z.toFixed(1)}`;
    still = k === last ? still + 1 : 0; last = k;
    if(still > 8){ joy.y = 0; log.push('STUCK at ' + k + ' · ' + st().text); return log; }
    if(log[log.length-1] !== st().text) log.push(st().text);
  }
  joy.y = 0; log.push(ctrl.done ? 'DONE' : 'TIMEOUT'); return log;
};
window.__errs = []; window.addEventListener('error', e => window.__errs.push(e.message));
