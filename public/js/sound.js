// Synthesised sound effects (WebAudio) - no audio files, nothing to license.
import { getSettings } from './store.js';

let ctx = null;
function ac() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
// Browsers only allow audio after a user gesture; prime on first interaction.
['pointerdown', 'keydown'].forEach((e) => window.addEventListener(e, () => ac(), { once: true, passive: true }));

function tone(c, { f, t = 0, d = 0.25, type = 'sine', v = 0.3, slide }) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, c.currentTime + t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, c.currentTime + t + d);
  g.gain.setValueAtTime(0.0001, c.currentTime + t);
  g.gain.exponentialRampToValueAtTime(v, c.currentTime + t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t + d);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + t); o.stop(c.currentTime + t + d + 0.05);
}

const SOUNDS = {
  arrive: (c, v) => [523, 659, 784, 1046].forEach((f, i) => tone(c, { f, t: i * 0.11, d: 0.4, type: 'triangle', v: 0.28 * v })),
  step: (c, v) => tone(c, { f: 140, d: 0.09, type: 'sine', v: 0.18 * v, slide: 60 }),
  yes: (c, v) => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(c, { f, t: i * 0.08, d: 0.3, type: 'triangle', v: 0.3 * v })),
  no: (c, v) => [392, 349, 311, 262].forEach((f, i) => tone(c, { f, t: i * 0.16, d: 0.4, type: 'sawtooth', v: 0.13 * v })),
  click: (c, v) => tone(c, { f: 660, d: 0.07, type: 'square', v: 0.08 * v }),
  test: (c, v) => [660, 880].forEach((f, i) => tone(c, { f, t: i * 0.12, d: 0.3, type: 'triangle', v: 0.3 * v })),
};

export function play(name, { force = false } = {}) {
  const s = getSettings();
  if (!force && !s.sound) return;
  const c = ac();
  if (!c || !SOUNDS[name]) return;
  try { SOUNDS[name](c, Math.max(0, Math.min(1, s.volume))); } catch { /* ignore */ }
}
