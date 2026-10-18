'use strict';
// App-shell helpers shared by the student pages (login + game):
//  · registers the service worker so the site can be installed to the home screen,
//    where it launches full screen in landscape like a mobile game;
//  · on Android/other browsers that allow it, goes full screen on the first tap
//    (browsers only permit this from a real tap, never automatically on page load)
//    and re-arms if the student leaves full screen;
//  · on iPhone/iPad Safari, which has no full-screen mode for web pages, shows a
//    one-time tip explaining "Add to Home Screen" — the only way to hide the URL bar.
(function(){
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{}));
  }
  const standalone = (window.matchMedia && (matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches))
    || window.navigator.standalone === true;
  const touch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0;
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const canFS = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  document.documentElement.classList.toggle('app-standalone', !!standalone);

  function isFS(){ return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function goFullscreen(){
    if (standalone || !touch || !canFS || isFS()) return;
    // Don't fight a text field: entering full screen while typing a Student ID would
    // dismiss the keyboard.
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
    const el = document.documentElement;
    try {
      const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen();
      const lock = () => { try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(()=>{}); } catch(e){} };
      if (p && p.then) p.then(lock).catch(()=>{}); else lock();
    } catch(e) {}
  }
  if (!iOS || canFS) {
    ['touchend', 'click'].forEach(ev => document.addEventListener(ev, goFullscreen, { passive: true, capture: true }));
  }
  window.appGoFullscreen = goFullscreen;

  // iPhone tip — once per device (until they add it to the home screen).
  if (iOS && !standalone && !canFS) {
    let seen = false;
    try { seen = localStorage.getItem('c2s_ios_tip') === '1'; } catch(e) {}
    if (!seen) window.addEventListener('load', () => setTimeout(showTip, 1200));
  }
  function showTip(){
    const d = document.createElement('div');
    d.id = 'ios-tip';
    d.setAttribute('role', 'dialog');
    d.style.cssText = 'position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:9999;'
      + 'width:min(560px,calc(100vw - 24px));background:rgba(10,18,34,.97);color:#fff;border:1.5px solid rgba(56,189,248,.55);border-radius:18px;'
      + 'padding:14px 16px;font:500 15px/1.4 system-ui,-apple-system,sans-serif;box-shadow:0 14px 40px rgba(0,0,0,.6);display:flex;gap:12px;align-items:center';
    d.innerHTML = '<div style="font-size:28px">📲</div><div style="flex:1"><b style="color:#7dd3fc">Play in full screen</b><br>'
      + 'Tap <b>Share</b> <span style="display:inline-block;border:1.5px solid #fff;border-radius:4px;padding:0 4px;font-size:12px">⬆</span> '
      + 'then <b>“Add to Home Screen”</b>, and open Click to Survive from your home screen.</div>'
      + '<button style="background:#0ea5e9;color:#fff;border:0;border-radius:999px;padding:10px 16px;font:700 14px system-ui;min-height:44px">Got it</button>';
    d.querySelector('button').onclick = () => { try { localStorage.setItem('c2s_ios_tip', '1'); } catch(e) {} d.remove(); };
    document.body.appendChild(d);
  }
})();
