// Pure scheduling logic. No DOM, no storage. Shared by the browser app and the Node push server.
// All wall-clock reasoning is done in an explicit IANA timezone (default Asia/Kolkata).

export const DEFAULT_TZ = 'Asia/Kolkata';
export const MIN = 60000;

const dtfCache = new Map();
function dtf(tz) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

export function zonedParts(epoch, tz = DEFAULT_TZ) {
  const o = {};
  for (const p of dtf(tz).formatToParts(new Date(epoch))) if (p.type !== 'literal') o[p.type] = +p.value;
  if (o.hour === 24) o.hour = 0;
  return o;
}

export function tzOffset(epoch, tz = DEFAULT_TZ) {
  const p = zonedParts(epoch, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(epoch / 1000) * 1000;
}

const pad = (n) => String(n).padStart(2, '0');

/** Wall-clock date ("YYYY-MM-DD") + time ("HH:MM") in `tz` -> epoch ms. */
export function zonedToEpoch(dateStr, timeStr, tz = DEFAULT_TZ) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const first = guess - tzOffset(guess, tz);
  return guess - tzOffset(first, tz);
}

export function dateStrOf(epoch, tz = DEFAULT_TZ) {
  const p = zonedParts(epoch, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}
export function timeStrOf(epoch, tz = DEFAULT_TZ) {
  const p = zonedParts(epoch, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}
export function addDaysStr(ds, n) {
  const [y, m, d] = ds.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
export function dowOf(ds) {
  const [y, m, d] = ds.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
}

function matchesRule(r, ds) {
  const dow = dowOf(ds);
  switch (r.repeat) {
    case 'daily': return true;
    case 'weekdays': return dow >= 1 && dow <= 5;
    case 'weekends': return dow === 0 || dow === 6;
    case 'weekly': return dow === dowOf(r.date);
    case 'monthly': {
      const [y, m, d] = ds.split('-').map(Number);
      const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return d === Math.min(Number(r.date.slice(8, 10)), dim);
    }
    case 'custom': return (r.customDays || []).includes(dow);
    default: return ds === r.date;
  }
}

export const isRecurring = (r) => !!r.repeat && r.repeat !== 'none';

/** First scheduled occurrence strictly after `after` (epoch ms), or null. */
export function nextOccurrence(r, after) {
  const tz = r.tz || DEFAULT_TZ;
  if (!isRecurring(r)) {
    const t = zonedToEpoch(r.date, r.time, tz);
    return t > after ? t : null;
  }
  if (r.repeat === 'custom' && !(r.customDays || []).length) return null;
  let ds = dateStrOf(after, tz);
  if (ds < r.date) ds = r.date;
  for (let i = 0; i < 800; i++, ds = addDaysStr(ds, 1)) {
    if (!matchesRule(r, ds)) continue;
    const t = zonedToEpoch(ds, r.time, tz);
    if (t > after) return t;
  }
  return null;
}

/** The next moment this reminder wants attention (scheduled or snoozed). */
export function effectiveDue(r) {
  const a = r.nextDue ?? null, b = r.snoozedUntil ?? null;
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}

/**
 * Mark the occurrence due at `d` as handled. Clears the snooze if it was the snooze,
 * advances the schedule if it was the scheduled occurrence. Mutates `r`.
 */
export function consume(r, d, now = d) {
  if (r.snoozedUntil != null && r.snoozedUntil === d) r.snoozedUntil = null;
  if (r.nextDue != null && r.nextDue === d) r.nextDue = nextOccurrence(r, Math.max(d, now));
  return r;
}

/** Recompute the schedule from scratch (after create / edit / re-enable). */
export function recompute(r, now) {
  r.snoozedUntil = r.snoozedUntil && r.snoozedUntil > now ? r.snoozedUntil : null;
  r.nextDue = nextOccurrence(r, now);
  return r;
}

// ---- Quiet hours ----------------------------------------------------------
const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

export function isQuiet(now, quiet, tz = DEFAULT_TZ) {
  if (!quiet || !quiet.on) return false;
  const p = zonedParts(now, tz);
  const cur = p.hour * 60 + p.minute, s = toMin(quiet.start), e = toMin(quiet.end);
  if (s === e) return false;
  return s < e ? cur >= s && cur < e : cur >= s || cur < e;
}

/** Epoch when the current quiet period ends. */
export function quietEnd(now, quiet, tz = DEFAULT_TZ) {
  const today = dateStrOf(now, tz);
  let t = zonedToEpoch(today, quiet.end, tz);
  if (t <= now) t = zonedToEpoch(addDaysStr(today, 1), quiet.end, tz);
  return t;
}
