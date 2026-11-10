import test from 'node:test';
import assert from 'node:assert/strict';
import {
  zonedToEpoch, dateStrOf, timeStrOf, nextOccurrence, effectiveDue, consume, recompute,
  isQuiet, quietEnd, MIN,
} from '../public/js/scheduler.js';

const IST = 'Asia/Kolkata';
const base = (o) => ({ date: '2026-11-10', time: '10:30', repeat: 'none', tz: IST, customDays: [], ...o });

test('IST wall time converts to correct UTC epoch', () => {
  // 10:30 IST == 05:00 UTC
  assert.equal(zonedToEpoch('2026-11-10', '10:30', IST), Date.UTC(2026, 10, 10, 5, 0));
  assert.equal(dateStrOf(Date.UTC(2026, 10, 10, 20, 0), IST), '2026-11-11'); // 01:30 next day IST
  assert.equal(timeStrOf(Date.UTC(2026, 10, 10, 5, 0), IST), '10:30');
});

test('timezone handling differs per zone (incl. DST zone)', () => {
  assert.equal(zonedToEpoch('2026-07-01', '09:00', 'America/New_York'), Date.UTC(2026, 6, 1, 13, 0));
  assert.equal(zonedToEpoch('2026-01-01', '09:00', 'America/New_York'), Date.UTC(2026, 0, 1, 14, 0));
  assert.equal(zonedToEpoch('2026-11-10', '10:30', 'UTC'), Date.UTC(2026, 10, 10, 10, 30));
});

test('one-time reminder fires once, never in the past', () => {
  const r = base();
  const t = zonedToEpoch('2026-11-10', '10:30', IST);
  assert.equal(nextOccurrence(r, t - 1), t);
  assert.equal(nextOccurrence(r, t), null);
});

test('daily repeats and advances after consume', () => {
  const r = base({ repeat: 'daily' });
  const t0 = zonedToEpoch('2026-11-10', '10:30', IST);
  recompute(r, t0 - 5 * MIN);
  assert.equal(r.nextDue, t0);
  consume(r, t0, t0 + 1000);
  assert.equal(r.nextDue, zonedToEpoch('2026-11-11', '10:30', IST));
});

test('weekdays skip the weekend', () => {
  const r = base({ repeat: 'weekdays', date: '2026-11-06' }); // Fri
  const fri = zonedToEpoch('2026-11-06', '10:30', IST);
  assert.equal(nextOccurrence(r, fri), zonedToEpoch('2026-11-09', '10:30', IST)); // Mon
});

test('weekends only fire Sat/Sun', () => {
  const r = base({ repeat: 'weekends', date: '2026-11-09' }); // Mon
  assert.equal(nextOccurrence(r, zonedToEpoch('2026-11-09', '00:00', IST)), zonedToEpoch('2026-11-14', '10:30', IST));
});

test('weekly keeps weekday of start date', () => {
  const r = base({ repeat: 'weekly', date: '2026-11-10' }); // Tue
  assert.equal(nextOccurrence(r, zonedToEpoch('2026-11-10', '10:30', IST)), zonedToEpoch('2026-11-17', '10:30', IST));
});

test('monthly clamps to month length', () => {
  const r = base({ repeat: 'monthly', date: '2026-01-31' });
  assert.equal(nextOccurrence(r, zonedToEpoch('2026-01-31', '10:30', IST)), zonedToEpoch('2026-02-28', '10:30', IST));
});

test('custom days', () => {
  const r = base({ repeat: 'custom', customDays: [1, 3], date: '2026-11-10' }); // Mon, Wed
  assert.equal(nextOccurrence(r, zonedToEpoch('2026-11-10', '10:30', IST)), zonedToEpoch('2026-11-11', '10:30', IST));
  assert.equal(nextOccurrence(base({ repeat: 'custom', customDays: [] }), 0), null);
});

test('start date in the future is respected for recurring', () => {
  const r = base({ repeat: 'daily', date: '2026-12-01' });
  assert.equal(nextOccurrence(r, zonedToEpoch('2026-11-10', '00:00', IST)), zonedToEpoch('2026-12-01', '10:30', IST));
});

test('snooze + schedule: earliest wins and each is consumed independently', () => {
  const r = base({ repeat: 'daily' });
  const t0 = zonedToEpoch('2026-11-10', '10:30', IST);
  r.nextDue = t0;
  consume(r, t0, t0);
  r.snoozedUntil = t0 + 10 * MIN;
  assert.equal(effectiveDue(r), t0 + 10 * MIN);
  consume(r, t0 + 10 * MIN, t0 + 10 * MIN);
  assert.equal(r.snoozedUntil, null);
  assert.equal(effectiveDue(r), zonedToEpoch('2026-11-11', '10:30', IST));
});

test('quiet hours wrap past midnight', () => {
  const q = { on: true, start: '22:00', end: '07:00' };
  assert.ok(isQuiet(zonedToEpoch('2026-11-10', '23:30', IST), q, IST));
  assert.ok(isQuiet(zonedToEpoch('2026-11-10', '03:00', IST), q, IST));
  assert.ok(!isQuiet(zonedToEpoch('2026-11-10', '12:00', IST), q, IST));
  assert.ok(!isQuiet(zonedToEpoch('2026-11-10', '12:00', IST), { ...q, on: false }, IST));
  assert.equal(quietEnd(zonedToEpoch('2026-11-10', '23:30', IST), q, IST), zonedToEpoch('2026-11-11', '07:00', IST));
  assert.equal(quietEnd(zonedToEpoch('2026-11-10', '03:00', IST), q, IST), zonedToEpoch('2026-11-10', '07:00', IST));
});
