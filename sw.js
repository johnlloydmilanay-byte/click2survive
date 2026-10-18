'use strict';
// Minimal service worker: it exists so browsers offer "Install app" / launch the game
// full screen from the home screen. It deliberately caches nothing — every page and
// script still comes fresh from the network, so teachers' updates reach students
// immediately. Only same-origin page loads are handled; Firebase/CDN traffic is left
// untouched.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.mode !== 'navigate' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).catch(() => new Response(
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#000510;color:#fff;font-family:system-ui;text-align:center;padding:1rem">'
    + '<div><h2>No internet connection</h2><p>Click to Survive needs internet to load your session. Connect and try again.</p></div>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
