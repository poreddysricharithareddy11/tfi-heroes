// Small UI helpers: escaping, formatting (timezone-aware), toasts, modals, avatar helpers.
import { getState } from './store.js';
import { heroById, resolveCostume } from './heroes.js';
import { renderAvatar } from './avatar.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const S = () => getState();
export const tz = () => S().settings.timezone;
export const heroOf = (id) => heroById(id, S().customHeroes);
export const allHeroes = (list) => [...list, ...S().customHeroes];

export function lookFor(heroId, mode = 'saved') {
  const hero = heroOf(heroId);
  return { hero, costume: resolveCostume(hero, mode, S().costumes[heroId]), photo: S().photos[heroId] || null };
}
export function avatarHTML(heroId, mode = 'saved', opts = {}) {
  const { hero, costume, photo } = lookFor(heroId, mode);
  return renderAvatar({ hero, costume, photo, ...opts });
}

export function applyAvState(av, state) {
  if (!av) return;
  av.classList.remove('walking', 'celebrate', 'talking', 'idle', 'expr-neutral', 'expr-happy', 'expr-sad');
  const expr = state === 'happy' ? 'happy' : state === 'sad' ? 'sad' : 'neutral';
  av.classList.add('expr-' + expr);
  if (state === 'walking') av.classList.add('walking'); else av.classList.add('idle');
  if (state === 'happy') av.classList.add('celebrate');
  if (state === 'talking') av.classList.add('talking');
}

// ---------- formatting
export const fmtTime = (e) => new Intl.DateTimeFormat('en-IN', { timeZone: tz(), hour: 'numeric', minute: '2-digit', hour12: true }).format(e);
export const fmtDate = (e) => new Intl.DateTimeFormat('en-IN', { timeZone: tz(), weekday: 'short', day: 'numeric', month: 'short' }).format(e);
export const fmtDateTime = (e) => `${fmtDate(e)} · ${fmtTime(e)}`;
export const t12 = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
export function fmtCountdown(ms) {
  if (ms <= 0) return 'Now!';
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return d ? `${d}d ${p(h)}:${p(m)}:${p(x)}` : `${p(h)}:${p(m)}:${p(x)}`;
}
export const ago = (e) => { const m = Math.round((Date.now() - e) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : fmtDate(e); };

// ---------- toast
export function toast(msg, kind = '', ms = 3600) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`; el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.transition = '.3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, ms);
}

// ---------- modal
let modalClose = null;
export function openModal(html, { small = false, onClose } = {}) {
  closeModal();
  const host = $('#modal');
  host.innerHTML = `<div class="modal-bg" data-modal-bg><div class="modal ${small ? 'sm' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
  modalClose = onClose || null;
  const first = host.querySelector('input:not([type=hidden]),select,textarea,button.btn-primary');
  setTimeout(() => first?.focus({ preventScroll: true }), 30);
  return host.querySelector('.modal');
}
export function closeModal() {
  const host = $('#modal');
  if (!host.innerHTML) return;
  host.innerHTML = '';
  const f = modalClose; modalClose = null; f?.();
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#modal').innerHTML) closeModal(); });
document.addEventListener('mousedown', (e) => { if (e.target.matches('[data-modal-bg]')) closeModal(); });

export function confirmModal(title, text, okLabel = 'Delete') {
  return new Promise((res) => {
    const m = openModal(`<div class="modal-head"><h2>${esc(title)}</h2></div><p class="muted">${esc(text)}</p>
      <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn" data-c="0">Cancel</button><button class="btn-primary" style="background:var(--bad)" data-c="1">${esc(okLabel)}</button></div>`, { small: true, onClose: () => res(false) });
    m.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b) { const ok = b.dataset.c === '1'; closeModal(); res(ok); } });
  });
}

export async function fileToAvatarDataURL(file, w = 300, h = 386) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Not a valid image')); i.src = url; });
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const k = Math.max(w / img.width, h / img.height), dw = img.width * k, dh = img.height * k;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2 - h * 0.04, dw, dh); // slight upward bias keeps faces in frame
    return c.toDataURL('image/jpeg', 0.86);
  } finally { URL.revokeObjectURL(url); }
}
