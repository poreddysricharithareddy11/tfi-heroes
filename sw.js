// Service worker: offline shell, Web Push display, notification actions.
const CACHE = 'tfi-heroes-v2';
const SHELL = ['./', './index.html', './css/styles.css', './js/app.js', './js/store.js', './js/engine.js', './js/scheduler.js', './js/heroes.js', './js/avatar.js', './js/stage.js', './js/sound.js', './js/notify.js', './js/ui.js', '/manifest.webmanifest', './icons/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/api/')) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Reminder', body: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    wins.forEach((w) => w.postMessage({ type: 'push-due', rid: d.rid, due: d.due })); // wake any open page so it runs its due-check now
    if (wins.some((w) => w.visibilityState === 'visible' && w.focused)) return;          // the avatar is already walking in on screen
    await self.registration.showNotification(d.title || 'Reminder', {
      body: d.body || '', tag: d.tag || `r-${d.rid}-${d.due}`, requireInteraction: true, icon: './icons/icon.svg', badge: './icons/icon.svg',
      data: { rid: d.rid, due: d.due }, actions: [{ action: 'done', title: '✓ Done' }, { action: 'snooze', title: '⏰ Snooze' }],
    });
  })());
});

self.addEventListener('notificationclick', (e) => {
  const { rid, due } = e.notification.data || {};
  const action = e.action || 'open';
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.length) {
      const w = wins[0];
      w.postMessage({ type: 'notif-action', action, rid, due });
      if (action === 'open') await w.focus();
      return;
    }
    await self.clients.openWindow(`./?n=${action}&rid=${encodeURIComponent(rid || '')}&due=${due || ''}#/home`);
  })());
});
