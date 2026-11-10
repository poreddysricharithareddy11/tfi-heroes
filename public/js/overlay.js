// Desktop companion (runs inside the transparent always-on-top Electron window).
// This page OWNS the reminder engine in desktop mode, so reminders keep working with the dashboard closed.
import { onChange, update } from './store.js';
import { tick, answerYes, answerNo, followUp, setGrace, GRACE, setMaster } from './engine.js';
import { ReminderStage, Actor } from './stage.js';
import { S, lookFor, heroOf } from './ui.js';

const api = window.tfiDesktop;            // injected by preload.cjs (undefined when opened in a plain browser)
const $ = (s) => document.querySelector(s);
const send = (ch, p) => api?.send(ch, p);
const companion = $('#companion');
const actor = new Actor($('#comp-host'));
const stage = new ReminderStage();
const queue = [], queued = new Set();
let pumping = false;

// ------------------------------------------------------------------ idle companion
function setIdleSize() {
  const h = Math.round(innerHeight * 0.93);
  companion.style.setProperty('--actor-h', h + 'px');
}
function renderCompanion() {
  const s = S().settings, l = lookFor(s.defaultHero, s.defaultCostume);
  actor.setLook({ hero: l.hero, costume: l.costume, photo: l.photo });
  actor.setExpr('neutral'); actor.setMode('idle');
  actor.place(0);
  companion.classList.toggle('paused', !!s.overlayPaused);
  reportStatus();
}
function reportStatus() {
  const s = S().settings;
  send('status', { masterOn: s.masterOn, paused: !!s.overlayPaused, hero: heroOf(s.defaultHero).name, clickThrough: undefined });
}

// ------------------------------------------------------------------ input region
// Only the avatar / message box / follow-up card accept the mouse. Everything else is cut out of the window
// (BrowserWindow.setShape), so clicks fall straight through to the app underneath. No reliance on mouse forwarding.
let dragging = false, lastShape = '';
function shapeRects() {
  const out = [];
  const add = (r, pad = 8) => { if (r && r.width > 4) out.push({ x: Math.max(0, Math.floor(r.left - pad)), y: Math.max(0, Math.floor(r.top - pad)), width: Math.ceil(r.width + pad * 2), height: Math.ceil(r.height + pad * 2) }); };
  if (!stage.busy) { out.push({ x: 0, y: 0, width: innerWidth, height: innerHeight }); return out; }   // idle: the whole (small) window
  add(stage.actor.av?.getBoundingClientRect());
  const b = stage.root.querySelector('.bubble.in'); if (b) add(b.getBoundingClientRect());
  const f = stage.root.querySelector('.followup:not([hidden]) .fu-card'); if (f) add(f.getBoundingClientRect());
  const c = stage.root.querySelector('.stage-close:not([hidden])'); if (c) add(c.getBoundingClientRect());
  return out;
}
setInterval(() => { const r = shapeRects(), k = JSON.stringify(r); if (k !== lastShape) { lastShape = k; send('shape', r); } }, 50);

// Keyboard is only requested while a text/date input needs it (the avatar never steals focus otherwise).
document.addEventListener('focusin', (e) => { if (e.target.matches('input,textarea,select')) send('keyboard', true); });
document.addEventListener('focusout', (e) => { if (e.target.matches('input,textarea,select')) send('keyboard', false); });

// ------------------------------------------------------------------ drag / click on the idle avatar
let down = null;
companion.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  down = { x: e.screenX, y: e.screenY, moved: false };
  dragging = true; send('drag-start');
});
window.addEventListener('mousemove', (e) => {
  if (!down) return;
  if (Math.abs(e.screenX - down.x) + Math.abs(e.screenY - down.y) > 4) { down.moved = true; companion.classList.add('dragging'); }
  if (down.moved) send('drag-move');
});
window.addEventListener('mouseup', (e) => {
  if (!down) return;
  const moved = down.moved; down = null; dragging = false; companion.classList.remove('dragging');
  send('drag-end', { moved });
  if (!moved && e.button === 0) send('menu');
});
companion.addEventListener('contextmenu', (e) => { e.preventDefault(); send('menu'); });

// ------------------------------------------------------------------ ringing
function enqueue(id, due) { const k = `${id}:${due}`; if (queued.has(k)) return; queued.add(k); queue.push({ id, due, k }); }

async function pump() {
  if (stage.busy || pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      const it = queue.shift();
      const r = S().reminders.find((x) => x.id === it.id);
      if (r && r.status === 'ringing' && r.lastFiredDue === it.due && r.enabled && S().settings.masterOn) {
        await runStage(r, { onYes: () => answerYes(r.id, it.due), onNo: () => answerNo(r.id, it.due), onFollow: (a) => followUp(r.id, it.due, a) }, false);
      }
      queued.delete(it.k);
    }
  } catch (e) { console.error('ring failed', e); }
  finally { pumping = false; }
}

async function runStage(reminder, hooks, preview) {
  const s = S().settings, l = lookFor(reminder.heroId || s.defaultHero, reminder.costumeMode || 'saved');
  await api?.invoke('stage-open', { title: reminder.title, message: reminder.message, preview });   // window grows to a bottom strip, shown without focus
  companion.hidden = true;
  requestAnimationFrame(() => send('stage-shown'));
  try {
    return await stage.ring({ reminder, hero: l.hero, look: l, settings: s, preview, desk: true, hooks });
  } finally {
    companion.hidden = false;
    await api?.invoke('stage-close');
    setIdleSize(); renderCompanion();
  }
}

function runTick() {
  const { fire, missed } = tick();
  if (missed.length) {
    const names = missed.map((m) => S().reminders.find((r) => r.id === m.id)?.title).filter(Boolean);
    if (names.length) send('notify', { title: 'Missed reminder', body: [...new Set(names)].slice(0, 3).join(', ') });
  }
  for (const f of fire) {
    const r = S().reminders.find((x) => x.id === f.id);
    if (!r) continue;
    enqueue(f.id, f.due);
    if (S().settings.alsoToast) send('notify', { title: `${heroOf(r.heroId).name}: ${r.title}`, body: r.message || `Time for: ${r.title}`, key: `${f.id}:${f.due}` });
  }
  if (fire.length || queue.length) pump();
}

// wake / unlock / start: honour the user's missed-reminder policy once
function catchUp(reason) {
  const show = S().settings.missedPolicy === 'show';
  if (show) setGrace(12 * 3600e3);
  try { runTick(); } finally { setGrace(GRACE); }
  send('log', `catch-up(${reason}) policy=${show ? 'show' : 'log'}`);
}

// ------------------------------------------------------------------ commands from tray / menu / main
api?.onCommand((c) => {
  if (c.cmd === 'tick') runTick();
  else if (c.cmd === 'catchup') catchUp(c.reason);
  else if (c.cmd === 'master') { setMaster(c.value); reportStatus(); }
  else if (c.cmd === 'pause') { update((s) => { s.settings.overlayPaused = c.value; }); renderCompanion(); }
  else if (c.cmd === 'test') {
    if (stage.busy) return;
    const s = S().settings;
    runStage({ title: 'Complete Python Practice', description: 'Solve 3 problems on lists and dictionaries.', message: 'Time to complete your Python practice!', category: 'Coding Practice', priority: 'medium', snooze: s.defaultSnooze, heroId: s.defaultHero, costumeMode: s.defaultCostume }, {}, true);
  }
  else if (c.cmd === 'resize') { setIdleSize(); }
});

onChange(() => { if (!stage.busy) renderCompanion(); else reportStatus(); });
window.addEventListener('resize', () => { if (!stage.busy) setIdleSize(); });

setIdleSize(); renderCompanion();
setInterval(runTick, 1000);                       // compares persisted due-times to the real clock; never a countdown
document.addEventListener('visibilitychange', runTick);
catchUp('start');
send('ready');
window.__tfi = { tick: runTick, state: S, stage, catchUp, engine: { answerYes, answerNo, setMaster }, GRACE };
