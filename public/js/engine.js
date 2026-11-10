// Reminder engine: persistent due-checking, missed handling, outcomes (yes / no / snooze / reschedule).
// The tick compares persisted `nextDue` / `snoozedUntil` epochs to Date.now(); it never counts down with timers,
// so refreshes, sleep/resume and throttled background tabs all converge to the correct state.
import { getState, update, uid } from './store.js';
import {
  effectiveDue, consume, nextOccurrence, recompute, isRecurring, isQuiet, quietEnd, zonedToEpoch, MIN, DEFAULT_TZ,
} from './scheduler.js';

export let graceMs = 5 * MIN;
export const setGrace = (ms) => { graceMs = ms; };
export const GRACE = 5 * MIN; // how late a reminder may be and still be shown live; later = "missed"

const rem = (id) => getState().reminders.find((r) => r.id === id);

function log(s, r, due, outcome) {
  s.history.unshift({ id: uid('h'), rid: r.id, title: r.title, heroId: r.heroId, category: r.category, due, at: Date.now(), outcome });
  if (s.history.length > 1000) s.history.length = 1000;
}

/** Status shown to the user for a reminder. */
export function statusOf(r) {
  if (r.status === 'ringing') return 'ringing';
  if (!r.enabled) return 'disabled';
  const due = effectiveDue(r);
  if (due != null) return r.snoozedUntil != null && r.snoozedUntil === due ? 'snoozed' : 'scheduled';
  return r.finalStatus || 'completed'; // terminal: completed | missed | skipped
}

function settle(r, terminal) {
  // after consuming, decide resting status
  const due = effectiveDue(r);
  if (due != null) { r.status = r.snoozedUntil === due ? 'snoozed' : 'scheduled'; r.finalStatus = null; }
  else { r.status = 'done'; r.finalStatus = terminal; }
}

export function createReminder(data, now = Date.now()) {
  const r = {
    id: uid('r'), title: '', description: '', date: '', time: '', repeat: 'none', customDays: [], heroId: '', costumeMode: 'saved',
    category: 'Personal Tasks', customCategory: '', priority: 'medium', message: '', enabled: true, snooze: 10, tz: DEFAULT_TZ,
    status: 'scheduled', finalStatus: null, nextDue: null, snoozedUntil: null, lastFiredDue: null, completedCount: 0, createdAt: now, ...data,
  };
  recompute(r, now);
  r.status = r.nextDue ? 'scheduled' : 'done';
  update((s) => { s.reminders.push(r); });
  return r;
}

export function editReminder(id, data, now = Date.now()) {
  update((s) => {
    const r = s.reminders.find((x) => x.id === id);
    if (!r) return;
    Object.assign(r, data);
    r.snoozedUntil = null; r.lastFiredDue = null;
    recompute(r, now);
    if (r.enabled) settle(r, 'missed'); else r.status = 'scheduled';
  });
}

export function deleteReminder(id) { update((s) => { s.reminders = s.reminders.filter((r) => r.id !== id); }); }

export function setEnabled(id, on, now = Date.now()) {
  update((s) => {
    const r = s.reminders.find((x) => x.id === id);
    if (!r) return;
    r.enabled = on;
    if (on) {
      // Resume from the next occurrence; occurrences that passed while disabled are skipped silently.
      r.snoozedUntil = r.snoozedUntil && r.snoozedUntil > now ? r.snoozedUntil : null;
      r.nextDue = nextOccurrence(r, now);
      r.status = 'scheduled';
      if (effectiveDue(r) == null) { r.status = 'done'; r.finalStatus = r.finalStatus || 'missed'; }
      else r.finalStatus = null;
    }
  });
}

export function setMaster(on, now = Date.now()) {
  update((s) => { s.settings.masterOn = on; });
  if (on) tick(now); // anything long overdue becomes "missed" right away, recurring ones move forward
}

/** Move the effective upcoming occurrence (not-yet-fired) to a new time. */
export function postpone(id, epoch, now = Date.now()) {
  update((s) => {
    const r = s.reminders.find((x) => x.id === id);
    if (!r) return;
    const d = effectiveDue(r);
    if (d != null) consume(r, d, now);
    r.snoozedUntil = epoch;
    r.status = 'snoozed'; r.finalStatus = null; r.enabled = true;
    log(s, r, d ?? epoch, 'rescheduled');
  });
}

/** Reschedule from the manager. One-time reminders get a new date/time; recurring ones move just this occurrence. */
export function reschedule(id, dateStr, timeStr) {
  const r = rem(id);
  if (!r) return false;
  const epoch = zonedToEpoch(dateStr, timeStr, r.tz);
  if (epoch <= Date.now()) return false;
  if (!isRecurring(r)) { editReminder(id, { date: dateStr, time: timeStr, enabled: true }); update((s) => log(s, s.reminders.find((x) => x.id === id), epoch, 'rescheduled')); }
  else postpone(id, epoch);
  return true;
}

export function snooze(id, minutes, now = Date.now()) { postpone(id, now + minutes * MIN, now); }

// ---------------------------------------------------------------- tick
/**
 * Evaluate all reminders against `now`.
 * @returns {{fire: object[], missed: object[]}} reminders to present now, and ones newly detected as missed.
 */
export function tick(now = Date.now()) {
  const out = { fire: [], missed: [] };
  const s0 = getState();
  if (!s0.settings.masterOn) return out;
  let dirty = false;
  const quiet = s0.settings.quiet, tz = s0.settings.timezone;

  // A recurring reminder missed for many days logs each missed occurrence (up to MAX_MISSED_LOGGED), then jumps to the future.
  const MAX_MISSED_LOGGED = 10;
  const work = (s) => {
    for (const r of s.reminders) {
      if (!r.enabled) continue;
      let loggedMissed = 0;
      for (let guard = 0; guard < 60; guard++) {
        const d = effectiveDue(r);
        if (d == null || d > now) break;

        if (r.status === 'ringing' && r.lastFiredDue === d) {
          // Unresolved ring (e.g. page was refreshed). Still fresh -> present again, else it was missed.
          if (now - d <= graceMs) { out.fire.push({ id: r.id, due: d, resumed: true }); break; }
          consume(r, d, now); log(s, r, d, 'missed'); out.missed.push({ id: r.id, due: d });
          settle(r, 'missed'); dirty = true; continue;
        }
        if (r.lastFiredDue === d && r.status !== 'ringing') { consume(r, d, now); settle(r, r.finalStatus || 'completed'); dirty = true; continue; } // dedupe safety net

        if (now - d > graceMs) { // app was closed / asleep through it
          consume(r, d, ++loggedMissed >= MAX_MISSED_LOGGED ? now : d); log(s, r, d, 'missed'); out.missed.push({ id: r.id, due: d });
          settle(r, 'missed'); dirty = true; continue;
        }
        if (isQuiet(now, quiet, tz) && r.priority !== 'high') { // hold until quiet hours end (high priority bypasses)
          const until = quietEnd(now, quiet, tz);
          consume(r, d, now); r.snoozedUntil = until; r.status = 'snoozed'; log(s, r, d, 'held-quiet-hours'); dirty = true; continue;
        }
        r.lastFiredDue = d; r.status = 'ringing'; dirty = true;
        out.fire.push({ id: r.id, due: d });
        break;
      }
    }
  };

  // Work on a scratch copy first so we only persist (and notify) when something actually changed.
  const probe = structuredClone({ reminders: s0.reminders, history: [] });
  const before = JSON.stringify(probe.reminders);
  work(probe);
  if (JSON.stringify(probe.reminders) === before) {
    out.fire = out.fire.filter((f) => f.resumed); out.missed = []; // nothing changed except resumed re-presentations
    return out;
  }
  out.fire = []; out.missed = []; dirty = false;
  update(work, { source: 'tick' });
  void dirty;
  return out;
}

// ---------------------------------------------------------------- outcomes
/** User clicked YES. Marks completed immediately (persisted before any exit animation plays). */
export function answerYes(id, due, { preview = false } = {}) {
  if (preview) return;
  update((s) => {
    const r = s.reminders.find((x) => x.id === id);
    if (!r) return;
    consume(r, due, Date.now());
    r.completedCount = (r.completedCount || 0) + 1;
    r.lastOutcome = 'completed';
    log(s, r, due, 'completed');
    settle(r, 'completed');
  });
}

/** User clicked NO. NOT completed. Default = remind again after the snooze duration; follow-up panel may override. */
export function answerNo(id, due, { preview = false } = {}) {
  if (preview) return;
  update((s) => {
    const r = s.reminders.find((x) => x.id === id);
    if (!r) return;
    const mins = r.snooze || s.settings.defaultSnooze;
    consume(r, due, Date.now());
    r.snoozedUntil = Date.now() + mins * MIN;
    r.lastOutcome = 'declined';
    log(s, r, due, 'declined');
    settle(r, 'skipped');
  });
}

export function followUp(id, due, action, { preview = false } = {}) {
  if (preview) return;
  if (action.type === 'snooze') snooze(id, action.minutes);
  else if (action.type === 'reschedule') postpone(id, action.epoch);
  else if (action.type === 'skip') {
    update((s) => {
      const r = s.reminders.find((x) => x.id === id);
      if (!r) return;
      r.snoozedUntil = null; // drop the default "remind again"
      r.lastOutcome = 'skipped';
      log(s, r, due, 'skipped');
      settle(r, 'skipped');
    });
  }
}

// ---------------------------------------------------------------- derived data for the UI
export function nextUpcoming(now = Date.now()) {
  let best = null;
  const s = getState();
  if (!s.settings.masterOn) return null;
  for (const r of s.reminders) {
    if (!r.enabled) continue;
    const d = effectiveDue(r);
    if (d != null && d > now - GRACE && (!best || d < best.due)) best = { r, due: d };
  }
  return best;
}

export function describeRepeat(r) {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  switch (r.repeat) {
    case 'daily': return 'Every day';
    case 'weekdays': return 'Weekdays';
    case 'weekends': return 'Weekends';
    case 'weekly': return 'Weekly';
    case 'monthly': return 'Monthly';
    case 'custom': return (r.customDays || []).map((d) => names[d]).join(', ') || 'Custom days';
    default: return 'Once';
  }
}

/** Re-interpret every reminder's wall-clock time in a new timezone (an alarm at 10:30 stays 10:30 where you are). */
export function applyTimezone(newTz, now = Date.now()) {
  update((s) => {
    s.settings.timezone = newTz;
    for (const r of s.reminders) {
      r.tz = newTz; r.lastFiredDue = null;
      if (r.status === 'ringing') r.status = 'scheduled';
      if (!r.enabled) continue;
      r.nextDue = nextOccurrence(r, now);
      settle(r, r.finalStatus || 'missed');
    }
  });
}
