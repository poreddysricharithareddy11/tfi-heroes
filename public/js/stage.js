// Animation layer: Actor (a controllable avatar on a stage) and ReminderStage (the full-screen reminder experience).
import { renderAvatar } from './avatar.js';
import { play } from './sound.js';
import { zonedParts } from './scheduler.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
class Cancelled extends Error {}

// ======================================================================= Actor
export class Actor {
  constructor(host) {
    this.host = host;
    this.el = document.createElement('div');
    this.el.className = 'actor';
    host.appendChild(this.el);
    this.x = 0; this.dir = 1; this.anim = null; this.instant = false; this.stepTimer = null; this.sfx = false;
  }
  setLook(look) {
    this.el.innerHTML = renderAvatar(look);
    this.av = this.el.querySelector('.av');
    this.applyDir(this.dir);
  }
  get width() { return this.el.offsetWidth; }
  applyDir(d) { this.dir = d; if (this.av) { this.av.style.setProperty('--dir', d); this.av.dataset.dir = d; } }
  setExpr(e) { if (!this.av) return; this.av.classList.remove('expr-neutral', 'expr-happy', 'expr-sad'); this.av.classList.add('expr-' + e); }
  setMode(m) { if (!this.av) return; this.av.classList.toggle('walking', m === 'walking'); this.av.classList.toggle('idle', m !== 'walking'); this.footsteps(m === 'walking'); }
  talk(on) { this.av?.classList.toggle('talking', !!on); }
  celebrate(on) { this.av?.classList.toggle('celebrate', !!on); }
  footsteps(on) {
    clearInterval(this.stepTimer);
    if (on && this.sfx) this.stepTimer = setInterval(() => play('step'), 350);
  }
  place(x) { this.x = x; this.el.style.transform = `translate3d(${x}px,0,0)`; }

  async turn(dir) {
    if (dir === this.dir) return;
    if (!this.instant && this.av) {
      const flip = this.av.querySelector('.av-flip');
      const a = flip.animate([{ transform: `scaleX(${this.dir})` }, { transform: 'scaleX(0.04)' }, { transform: `scaleX(${dir})` }], { duration: 420, easing: 'ease-in-out' });
      this.av.classList.add('turning');
      try { await a.finished; } catch { /* cancelled */ }
      this.applyDir(dir);
      a.cancel();
      this.av.classList.remove('turning');
    } else this.applyDir(dir);
  }

  /** Walk to x (px, relative to host left). Resolves when arrived. */
  async walkTo(x, { speed = 230, ease = 'ease-in-out' } = {}) {
    const dx = x - this.x;
    if (Math.abs(dx) < 1) return;
    await this.turn(dx > 0 ? 1 : -1);
    if (this.instant) { this.place(x); return; }
    this.setMode('walking');
    this.anim = this.el.animate([{ transform: `translate3d(${this.x}px,0,0)` }, { transform: `translate3d(${x}px,0,0)` }], { duration: (Math.abs(dx) / speed) * 1000, easing: ease, fill: 'forwards' });
    try { await this.anim.finished; } catch { /* cancelled */ }
    try { this.anim.commitStyles?.(); this.anim.cancel(); } catch { /* ignore */ }
    this.place(x);
    this.anim = null;
    this.setMode('idle');
  }
  stop() { try { this.anim?.cancel(); } catch { /* ignore */ } this.anim = null; this.footsteps(false); }
  destroy() { this.stop(); this.el.remove(); }
}

// ======================================================================= Confetti
export function confetti(canvas, origin, ms = 2600) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr; canvas.height = canvas.clientHeight * dpr;
  const colors = ['#ffd60a', '#ff4d6d', '#4cc9f0', '#80ed99', '#f72585', '#fb8500', '#ffffff'];
  const parts = Array.from({ length: 140 }, () => ({
    x: origin.x * dpr, y: origin.y * dpr, vx: (Math.random() - 0.5) * 16 * dpr, vy: (-Math.random() * 14 - 6) * dpr,
    g: 0.34 * dpr, s: (4 + Math.random() * 6) * dpr, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: colors[(Math.random() * colors.length) | 0],
    star: Math.random() < 0.25,
  }));
  const t0 = performance.now();
  (function frame(t) {
    const k = t - t0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vx *= 0.99;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.max(0, 1 - k / ms); ctx.fillStyle = p.c;
      if (p.star) { ctx.font = `${p.s * 3}px serif`; ctx.fillText('★', 0, 0); } else ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.6);
      ctx.restore();
    }
    if (k < ms) requestAnimationFrame(frame); else ctx.clearRect(0, 0, canvas.width, canvas.height);
  })(t0);
}

// ======================================================================= Reminder stage
const YES_LINES = ['Super! Keep going!', 'Superb! That is the spirit!', 'Mass! Keep it up!'];
const NO_LINE = "Okay! I'll remind you again.";

function greeting(settings) {
  const h = zonedParts(Date.now(), settings.timezone).hour;
  const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return settings.userName ? `${g}, ${settings.userName}!` : `${g}!`;
}

export class ReminderStage {
  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'stage';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="stage-sky"></div><div class="stage-sun"></div><div class="stage-city"></div>
      <div class="stage-ground"><div class="ground-dash"></div></div>
      <div class="rain"></div>
      <div class="stage-actors"></div>
      <canvas class="confetti"></canvas>
      <div class="bubble" role="dialog" aria-live="polite" aria-label="Reminder"></div>
      <div class="followup" hidden></div>
      <div class="stage-top"><span class="preview-badge" hidden>Preview — nothing is saved</span><button class="stage-close" hidden aria-label="Close preview">✕</button></div>`;
    document.body.appendChild(this.root);
    this.$ = (s) => this.root.querySelector(s);
    this.actor = new Actor(this.$('.stage-actors'));
    this.busy = false;
    this.$('.stage-close').addEventListener('click', () => this.cancel());
  }

  cancel() { this.cancelled = true; this.pending?.({ cancel: true }); this.followPending?.({ cancel: true }); }
  async wait(ms) { await sleep(ms); if (this.cancelled) throw new Cancelled(); }
  choice(sel) { return new Promise((res) => { this.pending = res; }); }

  async typewrite(el, text) {
    el.textContent = '';
    this.actor.talk(true);
    const fast = this.actor.instant;
    for (let i = 1; i <= text.length; i++) {
      el.textContent = text.slice(0, i);
      if (!fast) await this.wait(22);
    }
    this.actor.talk(false);
  }

  /**
   * Run the whole reminder interaction.
   * hooks: onYes(), onNo(), onFollow(action)  (called the moment the user decides, before exit animations finish)
   */
  async ring({ reminder, hero, look, settings, preview = false, desk = false, hooks = {} }) {
    this.busy = true; this.cancelled = false;
    const root = this.root, bubble = this.$('.bubble'), fu = this.$('.followup');
    const instant = !settings.animations;
    this.actor.instant = instant; this.actor.sfx = settings.sound;
    root.className = 'stage' + (desk ? ' desk' : ''); root.hidden = false; fu.hidden = true;
    this.$('.preview-badge').hidden = !preview; this.$('.stage-close').hidden = !preview;
    bubble.className = 'bubble'; bubble.innerHTML = '';
    document.body.classList.add('stage-open');
    requestAnimationFrame(() => root.classList.add('show'));

    // Layout
    const W = root.clientWidth, H = root.clientHeight, narrow = !desk && (W < 780 || H > W * 1.1);
    root.classList.toggle('narrow', narrow);
    root.style.setProperty('--actor-h', desk ? Math.round(Math.min(H * 0.78, 340)) + 'px' : Math.round(narrow ? Math.min(H * 0.44, 420) : Math.min(H * 0.8, 640)) + 'px');
    this.actor.setLook({ hero, costume: look.costume, photo: look.photo });
    this.actor.applyDir(1);
    await new Promise((r) => requestAnimationFrame(r));
    const aw = this.actor.width;
    const stopX = narrow ? (W - aw) / 2 : desk ? Math.max(40, Math.min(W * 0.2, W - aw - 420)) : W * 0.3 - aw / 2;
    if (desk) { bubble.style.left = (stopX + aw + 8) + 'px'; }
    const offLeft = -aw - 80, offRight = W + 80;
    this.actor.place(instant ? stopX : offLeft);
    this.actor.setExpr('neutral'); this.actor.setMode('idle');

    const finish = async () => { root.classList.remove('show'); await sleep(instant ? 0 : 400); root.hidden = true; document.body.classList.remove('stage-open'); this.busy = false; };

    try {
      // ---- entrance
      play('arrive');
      root.classList.add('walk-right');
      if (!instant) await this.actor.walkTo(stopX, { speed: Math.max(desk ? 200 : 160, W / 6.5), ease: 'cubic-bezier(.3,.1,.45,1)' });
      root.classList.remove('walk-right');
      this.actor.setMode('idle');
      this.actor.setExpr('neutral');

      // ---- dialogue
      const msg = reminder.message || `Time for: ${reminder.title}`;
      const cat = reminder.category === 'Custom Category' ? (reminder.customCategory || 'Custom') : reminder.category;
      bubble.innerHTML = `
        <div class="b-head"><span class="b-hero">${esc(hero.name)}</span><span class="b-chip">${esc(cat)}</span><span class="b-chip pri-${esc(reminder.priority)}">${esc(reminder.priority)} priority</span></div>
        <div class="b-greet">${esc(greeting(settings))}</div>
        <h2 class="b-title">${esc(reminder.title)}</h2>
        ${reminder.description ? `<p class="b-desc">${esc(reminder.description)}</p>` : ''}
        <p class="b-msg" aria-live="polite"></p>
        <div class="b-actions" hidden>
          <button class="btn-yes" type="button"><b>YES</b><small>I did it!</small></button>
          <button class="btn-no" type="button"><b>NO</b><small>Not yet</small></button>
        </div>`;
      bubble.classList.add('in');
      await this.typewrite(bubble.querySelector('.b-msg'), msg);
      const actions = bubble.querySelector('.b-actions');
      actions.hidden = false;
      actions.classList.add('pop');
      const yesBtn = bubble.querySelector('.btn-yes'), noBtn = bubble.querySelector('.btn-no');
      yesBtn.focus({ preventScroll: true });

      const keyHandler = (e) => { if (e.key === 'y' || e.key === 'Y') yesBtn.click(); else if (e.key === 'n' || e.key === 'N') noBtn.click(); };
      window.addEventListener('keydown', keyHandler);
      const decision = await new Promise((res) => {
        this.pending = res;
        yesBtn.addEventListener('click', () => res('yes'), { once: true });
        noBtn.addEventListener('click', () => res('no'), { once: true });
      }).finally(() => window.removeEventListener('keydown', keyHandler));
      if (decision && decision.cancel) throw new Cancelled();
      actions.hidden = true;

      const head = this.actor.av.querySelector('.head');
      const hb = head.getBoundingClientRect(), rb = root.getBoundingClientRect();

      if (decision === 'yes') {
        hooks.onYes?.();                                   // persisted NOW
        root.classList.add('mood-happy');
        this.actor.setExpr('happy'); this.actor.celebrate(true); play('yes');
        bubble.querySelector('.b-greet').textContent = '🎉';
        bubble.querySelector('.b-title').textContent = YES_LINES[0];
        bubble.querySelector('.b-msg').textContent = `${reminder.title} — completed!`;
        if (!instant) confetti(this.$('.confetti'), { x: hb.left - rb.left + hb.width / 2, y: hb.top - rb.top });
        await this.wait(instant ? 600 : 2300);
        this.actor.celebrate(false);
        bubble.classList.remove('in');
        root.classList.add('walk-right');
        await this.actor.walkTo(offRight, { speed: Math.max(260, W / 3.5), ease: 'ease-in' });   // exits RIGHT
        root.classList.remove('walk-right');
        await finish();
        return { result: 'yes' };
      }

      // ---- NO
      hooks.onNo?.();                                      // persisted NOW: NOT completed, default re-remind queued
      root.classList.add('mood-sad');
      this.actor.setExpr('sad'); play('no');
      bubble.querySelector('.b-greet').textContent = '😔';
      bubble.querySelector('.b-title').textContent = NO_LINE;
      bubble.querySelector('.b-msg').textContent = `${reminder.title} is still pending.`;
      await this.wait(instant ? 600 : 2200);
      bubble.classList.remove('in');
      root.classList.add('walk-left');
      await this.actor.walkTo(offLeft, { speed: Math.max(200, W / 4.5), ease: 'ease-in' });   // turns, exits LEFT
      root.classList.remove('walk-left');

      // ---- follow-up: snooze / reschedule / skip
      const mins = reminder.snooze || settings.defaultSnooze;
      const soon = new Date(Date.now() + 3600e3);
      const pad = (n) => String(n).padStart(2, '0');
      const local = `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}T${pad(soon.getHours())}:${pad(soon.getMinutes())}`;
      fu.innerHTML = `
        <div class="fu-card">
          <h3>Want me to remind you again?</h3>
          <p>I've already queued a reminder in <b>${mins} min</b>. Change that if you like:</p>
          <div class="fu-chips">${[5, 10, 15, 30, 60].map((m) => `<button type="button" data-snooze="${m}" class="${m === mins ? 'on' : ''}">${m} min</button>`).join('')}</div>
          <div class="fu-resched"><label>Reschedule to <input type="datetime-local" value="${local}"></label><button type="button" class="btn-primary" data-resched>Reschedule</button></div>
          <div class="fu-foot"><button type="button" class="btn-ghost" data-keep>Keep ${mins} min</button><button type="button" class="btn-ghost danger" data-skip>Skip this one</button></div>
          <p class="fu-err" hidden></p>
        </div>`;
      fu.hidden = false; fu.classList.add('in');
      const action = await new Promise((res) => {
        this.followPending = res;
        const timer = setTimeout(() => res({ type: 'keep' }), 90000);
        fu.onclick = (e) => {
          const b = e.target.closest('button'); if (!b) return;
          if (b.dataset.snooze) { clearTimeout(timer); res({ type: 'snooze', minutes: +b.dataset.snooze }); }
          else if (b.hasAttribute('data-keep')) { clearTimeout(timer); res({ type: 'keep' }); }
          else if (b.hasAttribute('data-skip')) { clearTimeout(timer); res({ type: 'skip' }); }
          else if (b.hasAttribute('data-resched')) {
            const v = fu.querySelector('input').value; const t = v ? new Date(v).getTime() : NaN;
            if (!t || t <= Date.now()) { const er = fu.querySelector('.fu-err'); er.hidden = false; er.textContent = 'Pick a time in the future.'; return; }
            clearTimeout(timer); res({ type: 'reschedule', epoch: t });
          }
        };
      });
      if (action.cancel) throw new Cancelled();
      if (action.type !== 'keep') hooks.onFollow?.(action);
      play('click');
      fu.classList.remove('in');
      await finish();
      fu.hidden = true;
      return { result: 'no', follow: action };
    } catch (e) {
      this.actor.stop();
      await finish();
      fu.hidden = true;
      if (e instanceof Cancelled) return { result: 'cancelled' };
      throw e;
    }
  }
}
