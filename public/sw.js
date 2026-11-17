// No private pages, session responses, or CRM data are cached.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>iRRELEVANT OS — Offline</title><body style="background:#101110;color:#eeeee7;font-family:Arial;padding:10vw"><p style="color:#d6f55b">iRRELEVANT OS</p><h1>You’re offline.</h1><p>Reconnect to open your secure workspace. Client data is never stored for offline use.</p><a style="color:#d6f55b" href="/dashboard">Try again</a></body></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })));
  }
});
