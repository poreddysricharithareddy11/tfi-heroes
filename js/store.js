// Persistent app state (localStorage) + change events + best-effort server sync for background push.
import { DEFAULT_TZ } from './scheduler.js';

const KEY = 'tfi-heroes-v1';

export const defaultSettings = () => ({
  masterOn: true,
  sound: true,
  volume: 0.7,
  notifications: true,
  animations: !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),
  theme: 'auto',
  timezone: DEFAULT_TZ,
  defaultHero: 'allu-arjun',
  defaultCostume: 'saved',
  defaultSnooze: 10,
  quiet: { on: false, start: '22:00', end: '07:00' },
  userName: '',
  overlayPaused: false,   // desktop: pause the idle companion animation
  missedPolicy: 'log',    // desktop wake/start: 'log' = record as missed, 'show' = still present them
  alsoToast: false,       // desktop: also raise a Windows notification for every reminder
});

const fresh = () => ({
  version: 1,
  clientId: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()),
  settings: defaultSettings(),
  costumes: {},      // heroId -> saved costume
  photos: {},        // heroId -> data URL
  customHeroes: [],
  reminders: [],
  history: [],       // {id, rid, title, heroId, due, at, outcome}
  seenMissedAt: 0,
});

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const f = fresh();
      return { ...f, ...s, settings: { ...f.settings, ...(s.settings || {}), quiet: { ...f.settings.quiet, ...((s.settings || {}).quiet || {}) } } };
    }
  } catch (e) { console.warn('state load failed', e); }
  const f = fresh();
  try { localStorage.setItem(KEY, JSON.stringify(f)); } catch { /* storage unavailable: app still works for this session */ }
  return f; // persisted right away so clientId stays stable across reloads
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { console.error('persist failed', e); listeners.forEach((f) => f({ type: 'error', message: 'Could not save (storage full?)' })); }
}

export const getState = () => state;
export const getSettings = () => state.settings;

/** Mutate state inside fn, then persist and notify. */
export function update(fn, meta = {}) {
  fn(state);
  persist();
  listeners.forEach((f) => f({ type: 'change', ...meta }));
  scheduleSync();
}

export const onChange = (f) => { listeners.add(f); return () => listeners.delete(f); };

// Pick up changes from other tabs (so reminders stay consistent and aren't double-fired from stale data).
window.addEventListener('storage', (e) => {
  if (e.key !== KEY || !e.newValue) return;
  try { state = load(); listeners.forEach((f) => f({ type: 'change', external: true })); } catch { /* ignore */ }
});

export function replaceAll(newState) {
  const f = fresh();
  state = { ...f, ...newState, settings: { ...f.settings, ...(newState.settings || {}) } };
  persist();
  listeners.forEach((fn) => fn({ type: 'change' }));
  scheduleSync();
}

export function uid(prefix = 'id') { return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`; }

// ---------------------------------------------------------------- server sync (optional)
let syncTimer = null;
export const server = { available: false, push: false, subscription: null, publicKey: null };

export async function probeServer() {
  try {
    const r = await fetch('api/health', { cache: 'no-store' });
    if (r.ok) { const j = await r.json(); server.available = !!j.ok; server.push = !!j.push; }
  } catch { server.available = false; }
  if (server.available) scheduleSync();
  return server.available;
}

export function scheduleSync() {
  if (!server.available) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 600);
}

export async function syncNow() {
  if (!server.available) return;
  const { reminders, settings, clientId } = state;
  try {
    await fetch('api/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        subscription: server.subscription,
        settings: { masterOn: settings.masterOn, notifications: settings.notifications, quiet: settings.quiet, timezone: settings.timezone },
        reminders: reminders.map((r) => ({ id: r.id, title: r.title, message: r.message, heroId: r.heroId, heroName: heroNameFor(r.heroId), enabled: r.enabled, priority: r.priority,
          date: r.date, time: r.time, repeat: r.repeat, customDays: r.customDays, tz: r.tz, nextDue: r.nextDue, snoozedUntil: r.snoozedUntil })),
      }),
    });
  } catch { /* offline: next change retries */ }
}

function heroNameFor(id) {
  const c = state.customHeroes.find((h) => h.id === id);
  return c ? c.name : id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}
