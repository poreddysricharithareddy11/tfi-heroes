// Browser notifications, service worker and Web Push registration.
//
// Honest limits:
//  * In-page reminders only fire while a tab of this app is open (a background tab may be throttled to ~1 check/minute).
//  * When every browser window is closed, only Web Push delivered by the Node server (server/server.js) can wake the
//    service worker - and only if the browser process itself is still running (Chrome/Edge background mode, Android).
//  * If the browser is fully quit or the device is off, nothing can run; missed reminders are recorded on next open.
import { server, scheduleSync } from './store.js';

let swReg = null;

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  try { swReg = await navigator.serviceWorker.register('sw.js'); } catch (e) { console.warn('SW registration failed', e); }
  return swReg;
}

export const notifSupported = () => 'Notification' in window;
export const permission = () => (notifSupported() ? Notification.permission : 'unsupported');

export async function requestPermission() {
  if (!notifSupported()) return 'unsupported';
  try { return await Notification.requestPermission(); } catch { return Notification.permission; }
}

export async function showNotification(title, body, { tag, data, requireInteraction = true } = {}) {
  if (permission() !== 'granted') return false;
  const opts = { body, tag, data, requireInteraction, icon: 'icons/icon.svg', badge: 'icons/icon.svg', actions: [{ action: 'done', title: '✓ Done' }, { action: 'snooze', title: '⏰ Snooze' }] };
  try {
    const reg = swReg || (await navigator.serviceWorker?.ready);
    if (reg) { await reg.showNotification(title, opts); return true; }
  } catch { /* fall through */ }
  try { delete opts.actions; new Notification(title, opts); return true; } catch { return false; }
}

export async function closeNotificationsFor(rid) {
  try {
    const reg = swReg || (await navigator.serviceWorker?.ready);
    const list = await reg.getNotifications();
    list.filter((n) => n.data && n.data.rid === rid).forEach((n) => n.close());
  } catch { /* ignore */ }
}

const b64 = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map((c) => c.charCodeAt(0))); };

export async function pushState() {
  if (!('PushManager' in window) || !server.available || !server.push) return 'unavailable';
  try { const reg = swReg || (await navigator.serviceWorker.ready); const sub = await reg.pushManager.getSubscription(); server.subscription = sub ? sub.toJSON() : null; return sub ? 'on' : 'off'; } catch { return 'unavailable'; }
}

export async function enablePush() {
  if (!server.available || !server.push) throw new Error('Push server is not running (start it with "npm start").');
  if ((await requestPermission()) !== 'granted') throw new Error('Notification permission was not granted.');
  const reg = swReg || (await navigator.serviceWorker.ready);
  const { key } = await (await fetch('api/vapid-public-key')).json();
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
  server.subscription = sub.toJSON();
  scheduleSync();
  return true;
}

export async function disablePush() {
  try { const reg = swReg || (await navigator.serviceWorker.ready); const sub = await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch { /* ignore */ }
  server.subscription = null;
  scheduleSync();
}

/** Messages from the service worker (notification action buttons / clicks). */
export function onSWMessage(handler) {
  navigator.serviceWorker?.addEventListener('message', (e) => handler(e.data));
}
