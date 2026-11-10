// TFI Heroes - app shell: router, pages, reminder run-loop.
import { getState, update, onChange, replaceAll, defaultSettings, probeServer, server, syncNow, uid } from './store.js';
import {
  HEROES, PRESETS, PRESET_LABELS, OPTIONS, LABELS, COLORS, HAIR_COLORS, QUICK_OUTFITS, presetCostume, makeCustomHero,
} from './heroes.js';
import { renderAvatar } from './avatar.js';
import { effectiveDue, dateStrOf, timeStrOf, addDaysStr, zonedToEpoch, isRecurring, MIN, DEFAULT_TZ, zonedParts } from './scheduler.js';
import {
  tick, createReminder, editReminder, deleteReminder, setEnabled, setMaster, snooze, reschedule, statusOf, describeRepeat,
  answerYes, answerNo, followUp, nextUpcoming, applyTimezone, GRACE,
} from './engine.js';
import { ReminderStage, Actor, confetti } from './stage.js';
import { play } from './sound.js';
import * as notify from './notify.js';
import {
  $, $$, esc, S, tz, heroOf, lookFor, avatarHTML, applyAvState, fmtTime, fmtDate, fmtDateTime, t12, fmtCountdown, ago, toast,
  openModal, closeModal, confirmModal, fileToAvatarDataURL,
} from './ui.js';

const CATEGORIES = ['Study', 'Coding Practice', 'Job Applications', 'Interviews', 'Exercise', 'Personal Tasks', 'Daily Activities', 'Custom Category'];
const REPEATS = [['none', 'Does not repeat'], ['daily', 'Every day'], ['weekdays', 'Weekdays'], ['weekends', 'Weekends'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['custom', 'Custom days']];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const COSTUME_MODES = [['saved', "Hero's saved costume"], ['default', 'Original look'], ['casual', 'Casual'], ['traditional', 'Traditional'], ['western', 'Western']];
const clone = (o) => structuredClone(o);

// ====================================================================== theme / chrome
function applyTheme() {
  const t = S().settings.theme;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0b1020' : '#eef1fb');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

// ====================================================================== router
const routes = { home, gallery, studio, reminders, playground, settings };
let route = 'home';
let pgActor = null;

function currentRoute() { const r = (location.hash.replace(/^#\/?/, '') || 'home').split('?')[0]; return routes[r] ? r : 'home'; }

function render() {
  route = currentRoute();
  $$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.r === route));
  if (pgActor && route !== 'playground') { pgActor.destroy(); pgActor = null; }
  const main = $('#main');
  main.innerHTML = `<div class="page" data-page="${route}">${routes[route]()}</div>`;
  const after = afterRender[route]; after?.();
  updateTicker();
}
window.addEventListener('hashchange', () => { closeModal(); render(); window.scrollTo(0, 0); });

let rerenderQueued = false;
function softRender() {
  if (rerenderQueued) return;
  rerenderQueued = true;
  requestAnimationFrame(() => {
    rerenderQueued = false;
    const a = document.activeElement;
    if (a && a.closest('#main') && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return; // never yank a field the user is using
    if (route === 'playground' || route === 'studio' || route === 'gallery') return;      // interactive canvases: refreshed explicitly
    render();
  });
}

// ====================================================================== HOME
function stats(now = Date.now()) {
  const st = S(), today = dateStrOf(now, tz());
  const hist = st.history;
  const hToday = hist.filter((h) => dateStrOf(h.at, tz()) === today);
  const completedAll = hist.filter((h) => h.outcome === 'completed').length;
  const missedAll = hist.filter((h) => h.outcome === 'missed').length;
  const declined = hist.filter((h) => h.outcome === 'declined').length;
  const pendingToday = st.reminders.filter((r) => { const d = effectiveDue(r); return r.enabled && d != null && dateStrOf(d, tz()) === today; });
  const pendingAll = st.reminders.filter((r) => r.enabled && effectiveDue(r) != null);
  const days = new Set(hist.filter((h) => h.outcome === 'completed').map((h) => dateStrOf(h.at, tz())));
  let streak = 0, d = today;
  if (!days.has(d)) d = addDaysStr(d, -1);
  while (days.has(d)) { streak++; d = addDaysStr(d, -1); }
  const denom = completedAll + missedAll + declined;
  return {
    pendingToday, pendingAll, hToday, completedAll, missedAll, declined, streak,
    completedToday: hToday.filter((h) => h.outcome === 'completed').length,
    missedToday: hToday.filter((h) => h.outcome === 'missed').length,
    rate: denom ? Math.round((completedAll / denom) * 100) : 0,
  };
}

function home() {
  const st = S(), s = st.settings, now = Date.now();
  const hero = heroOf(s.defaultHero), nx = nextUpcoming(now), x = stats(now);
  const unseenMissed = st.history.filter((h) => h.outcome === 'missed' && h.at > st.seenMissedAt);
  const items = [
    ...x.pendingToday.map((r) => ({ t: effectiveDue(r), r, kind: 'pending' })),
    ...x.hToday.map((h) => ({ t: h.due, h, kind: h.outcome })),
  ].sort((a, b) => a.t - b.t);
  return `
  <div class="page-head"><div><h1>${greet()}${s.userName ? ', ' + esc(s.userName) : ''} 👋</h1><div class="muted">${fmtDate(now)} · timezone ${esc(tz())}</div></div>
    <label class="master-pill"><span class="dot ${s.masterOn ? '' : 'off'}"></span>Reminders ${s.masterOn ? 'ON' : 'OFF'}
      <span class="switch"><input type="checkbox" data-set="masterOn" ${s.masterOn ? 'checked' : ''} aria-label="Master reminders switch"><span></span></span></label></div>
  ${unseenMissed.length ? `<div class="banner bad"><div><b>⚠ ${unseenMissed.length} reminder${unseenMissed.length > 1 ? 's' : ''} missed</b> while the app was closed: ${unseenMissed.slice(0, 3).map((h) => esc(h.title)).join(', ')}${unseenMissed.length > 3 ? '…' : ''}</div><div class="row"><a class="btn sm" href="#/reminders" data-act="open-history">View history</a><button class="btn sm" data-act="seen-missed">Dismiss</button></div></div>` : ''}
  ${!s.masterOn ? `<div class="banner"><div><b>All reminders are paused.</b> Nothing will trigger until you switch them back on.</div><button class="btn-primary sm" data-act="master-on">Turn on</button></div>` : ''}
  <section class="card hero-card">
    <div class="big-av" id="home-av">${avatarHTML(hero.id, s.defaultCostume)}</div>
    <div>
      <div class="chip">Your hero</div>
      <h2 style="font-size:1.8rem;margin:8px 0 2px">${esc(hero.name)}</h2>
      <p class="muted">${esc(hero.tag)}</p>
      <div class="sec-title" style="margin-top:6px">Next reminder</div>
      ${nx ? `<div class="countdown" data-countdown="${nx.due}">--:--:--</div>
        <p><b>${esc(nx.r.title)}</b> · ${esc(fmtDateTime(nx.due))}<br><span class="muted sm">with ${esc(heroOf(nx.r.heroId).name)}</span></p>`
      : `<p class="muted">${s.masterOn ? 'Nothing scheduled. Create a reminder and your hero will walk in on time.' : 'Paused.'}</p>`}
      <div class="row"><button class="btn-primary" data-act="new-reminder">＋ New reminder</button><a class="btn" href="#/gallery">Change hero</a><a class="btn" href="#/studio">Costume</a>
        <button class="btn" data-act="demo-hero">▶ Preview entrance</button></div>
    </div>
  </section>
  <div class="stats">
    <div class="stat info"><b>${x.pendingToday.length}</b>Pending today</div>
    <div class="stat good"><b>${x.completedToday}</b>Completed today</div>
    <div class="stat bad"><b>${x.missedToday}</b>Missed today</div>
    <div class="stat warn"><b>${x.streak}🔥</b>Day streak</div>
    <div class="stat"><b>${x.completedAll}</b>Total completed</div>
    <div class="stat"><b>${x.pendingAll.length}</b>Upcoming overall</div>
  </div>
  <div class="grid g2">
    <section class="card"><div class="row between"><h3>Today's reminders</h3><button class="btn sm" data-act="new-reminder">＋ Quick add</button></div>
      <div class="list" style="margin-top:12px">${items.length ? items.map(todayRow).join('') : '<div class="empty">No reminders today.<br>Tap "Quick add" to create one.</div>'}</div></section>
    <section class="card"><h3>Reminder statistics</h3>
      <p class="muted sm">Completion rate (completed vs missed/declined)</p>
      <div class="bar"><i style="width:${x.rate}%"></i></div><p style="margin-top:6px"><b>${x.rate}%</b> · ${x.completedAll} done · ${x.missedAll} missed · ${x.declined} declined</p>
      <div class="sec-title">Recent activity</div>
      <div class="list" style="gap:8px">${st.history.slice(0, 6).map((h) => `<div class="row between sm"><span>${esc(h.title)}</span><span><span class="chip ${chipClass(h.outcome)}">${esc(h.outcome)}</span> <span class="muted">${ago(h.at)}</span></span></div>`).join('') || '<div class="muted sm">Nothing yet.</div>'}</div>
    </section>
  </div>
  <button class="btn-primary fab" data-act="new-reminder" aria-label="Create reminder">＋ Quick reminder</button>`;
}
const chipClass = (o) => ({ completed: 'completed', missed: 'missed', declined: 'skipped', skipped: 'skipped', rescheduled: 'snoozed', 'held-quiet-hours': 'snoozed' }[o] || '');
const greet = () => { const h = zonedParts(Date.now(), tz()).hour; return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

function todayRow(it) {
  if (it.kind === 'pending') {
    const r = it.r;
    return `<div class="rem"><div class="mini">${avatarHTML(r.heroId, r.costumeMode, { bust: true })}</div><div><h3>${esc(r.title)}</h3><div class="meta"><span class="chip scheduled">⏰ ${fmtTime(it.t)}</span><span class="chip">${esc(catName(r))}</span></div></div></div>`;
  }
  const h = it.h;
  return `<div class="rem"><div class="mini">${avatarHTML(h.heroId, 'saved', { bust: true })}</div><div><h3>${esc(h.title)}</h3><div class="meta"><span class="chip ${chipClass(h.outcome)}">${esc(h.outcome)}</span><span class="muted sm">${fmtTime(h.at)}</span></div></div></div>`;
}
const catName = (r) => (r.category === 'Custom Category' ? r.customCategory || 'Custom' : r.category);

// ====================================================================== GALLERY
let heroQuery = '';
function heroTile(h) {
  const st = S(), sel = st.settings.defaultHero === h.id;
  const photo = st.photos[h.id];
  return `<div class="hero-tile ${sel ? 'sel' : ''}" data-act="hero-open" data-id="${h.id}" tabindex="0" role="button" aria-label="Preview ${esc(h.name)}" style="--c:${h.accent}">
    ${sel ? '<span class="badge">SELECTED</span>' : ''}${photo ? '<span class="badge photo">PHOTO</span>' : ''}
    <div class="bust">${avatarHTML(h.id, 'default', { bust: true })}</div><h3>${esc(h.name)}</h3><p>${esc(h.tag)}</p></div>`;
}
function heroGridHTML() {
  const q = heroQuery.trim().toLowerCase();
  const list = [...HEROES, ...S().customHeroes].filter((h) => !q || (h.name + ' ' + h.tag).toLowerCase().includes(q));
  return list.map(heroTile).join('') + `<div class="hero-tile" data-act="custom-hero" tabindex="0" role="button" style="display:grid;place-content:center;min-height:220px;border-style:dashed"><div style="font-size:2.4rem">＋</div><h3>Add my own avatar</h3><p>Name + your photo</p></div>`;
}
function gallery() {
  return `<div class="page-head"><div><h1>TFI Heroes</h1><div class="muted">Pick the hero who will walk in with your reminders.</div></div>
    <input type="search" id="hero-search" placeholder="Search heroes…" value="${esc(heroQuery)}" style="max-width:320px" aria-label="Search heroes"></div>
    <div class="note" style="margin-bottom:18px">Heroes are stylised illustrations with signature looks. For a photo-real face, open a hero and <b>attach a photo you own or are licensed to use</b> — it is mapped onto the animated body.</div>
    <div class="grid g3" id="hero-grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">${heroGridHTML()}</div>`;
}

let preview = { id: null, mode: 'saved', state: 'idle' };
function openHeroPreview(id, mode = 'saved') {
  preview = { id, mode, state: preview.id === id ? preview.state : 'idle' };
  const h = heroOf(id), st = S(), photo = st.photos[id];
  const m = openModal(`
    <div class="modal-head"><div><h2 style="margin:0">${esc(h.name)}</h2><span class="muted">${esc(h.tag)}</span></div><button class="x" data-act="close-modal" aria-label="Close">✕</button></div>
    <div class="grid" style="grid-template-columns:minmax(200px,1fr) minmax(220px,1fr);align-items:start">
      <div class="preview-box" style="--c:${h.accent}"><div class="preview-av" id="pv-av">${avatarHTML(id, mode)}</div></div>
      <div>
        <div class="sec-title" style="margin-top:0">Preview animation</div>
        <div class="pills">${['idle', 'walking', 'talking', 'happy', 'sad'].map((s) => `<button class="pill ${preview.state === s ? 'on' : ''}" data-act="pv-state" data-v="${s}">${s === 'walking' ? 'Walk' : s[0].toUpperCase() + s.slice(1)}</button>`).join('')}</div>
        <div class="sec-title">Costume preview</div>
        <div class="pills">${COSTUME_MODES.map(([k, l]) => `<button class="pill ${mode === k ? 'on' : ''}" data-act="pv-mode" data-v="${k}">${l}</button>`).join('')}</div>
        <div class="sec-title">Face photo (optional)</div>
        <p class="muted sm">${photo ? 'A photo is attached. It is stored only in this browser.' : 'Upload a photo you own or are licensed to use to get a true likeness. Stored only in this browser.'}</p>
        <div class="row"><label class="btn sm" style="cursor:pointer">📷 ${photo ? 'Replace' : 'Upload'} photo<input type="file" accept="image/*" id="pv-photo" hidden></label>${photo ? '<button class="btn sm danger" data-act="pv-photo-rm">Remove photo</button>' : ''}</div>
        <div class="row" style="margin-top:22px"><button class="btn-primary" data-act="hero-select" data-id="${id}">${st.settings.defaultHero === id ? '✓ Selected' : 'Select as my hero'}</button><button class="btn" data-act="hero-costume" data-id="${id}">👔 Costume</button>
          ${h.custom ? `<button class="btn danger" data-act="custom-del" data-id="${id}">Delete</button>` : ''}</div>
      </div></div>`);
  applyAvState($('#pv-av .av', m), preview.state);
  $('#pv-photo', m)?.addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const url = await fileToAvatarDataURL(f); update((s) => { s.photos[id] = url; }); toast('Photo attached', 'good'); openHeroPreview(id, preview.mode); refreshGallery(); }
    catch (err) { toast(err.message || 'Could not read image', 'bad'); }
  });
}
function refreshGallery() { if (route === 'gallery') { const g = $('#hero-grid'); if (g) g.innerHTML = heroGridHTML(); } }

function openCustomHero() {
  const m = openModal(`<div class="modal-head"><h2 style="margin:0">Add my own avatar</h2><button class="x" data-act="close-modal">✕</button></div>
    <p class="muted">Create a personal avatar (any name) and give it a face photo you own or are licensed to use.</p>
    <div class="form-grid"><label class="f full">Name<input type="text" id="ch-name" maxlength="40" placeholder="e.g. My Hero"></label>
    <label class="f full">Face photo<input type="file" accept="image/*" id="ch-photo"></label></div>
    <p class="form-err" id="ch-err" hidden></p>
    <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn" data-act="close-modal">Cancel</button><button class="btn-primary" id="ch-save">Create avatar</button></div>`, { small: true });
  $('#ch-save', m).onclick = async () => {
    const name = $('#ch-name', m).value.trim(), f = $('#ch-photo', m).files[0], err = $('#ch-err', m);
    if (!name) { err.hidden = false; err.textContent = 'Please enter a name.'; return; }
    let photo = null;
    if (f) { try { photo = await fileToAvatarDataURL(f); } catch (e) { err.hidden = false; err.textContent = e.message; return; } }
    const id = uid('custom'); const hero = makeCustomHero(id, name);
    update((s) => { s.customHeroes.push(hero); if (photo) s.photos[id] = photo; });
    closeModal(); toast(`${name} added`, 'good'); refreshGallery();
  };
}

// ====================================================================== STUDIO
let studioState = { hero: null, draft: null, anim: 'idle' };
function studioLoad(id) {
  const h = heroOf(id);
  studioState.hero = id; studioState.draft = clone(S().costumes[id] || presetCostume(h, 'default'));
}
const savedOrDefault = (id) => S().costumes[id] || presetCostume(heroOf(id), 'default');
function studio() {
  if (!studioState.hero || !heroOf(studioState.hero)) studioLoad(S().settings.defaultHero);
  const id = studioState.hero, h = heroOf(id), d = studioState.draft, photo = S().photos[id];
  const dirty = JSON.stringify(d) !== JSON.stringify(savedOrDefault(id));
  const sw = (key, cur) => `<div class="swatches">${COLORS.map((c) => `<button class="sw ${cur === c ? 'on' : ''}" style="background:${c}" data-act="co" data-k="${key}" data-v="${c}" aria-label="${c}"></button>`).join('')}<input type="color" value="${/^#[0-9a-f]{6}$/i.test(cur || '') ? cur : '#888888'}" data-color="${key}" aria-label="Custom colour" style="width:34px;height:30px;padding:0;border:0;background:none"></div>`;
  const pills = (key, list, cur) => `<div class="pills">${list.map((o) => `<button class="pill ${cur === o ? 'on' : ''}" data-act="co" data-k="${key}" data-v="${o}">${LABELS[o] || o}</button>`).join('')}</div>`;
  return `
  <div class="page-head"><div><h1>Costume Studio</h1><div class="muted">Dress ${esc(h.name)} — always fully and decently clothed.</div></div>
    <select id="studio-hero" style="max-width:260px" aria-label="Hero">${[...HEROES, ...S().customHeroes].map((x) => `<option value="${x.id}" ${x.id === id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
  <div class="studio">
    <section class="card"><div class="preview-box" style="--c:${h.accent}"><div class="preview-av" id="st-av">${renderAvatar({ hero: h, costume: d, photo })}</div></div>
      <div class="pills" style="margin-top:12px;justify-content:center">${['idle', 'walking', 'talking', 'happy', 'sad'].map((s) => `<button class="pill ${studioState.anim === s ? 'on' : ''}" data-act="st-anim" data-v="${s}">${s === 'walking' ? 'Walk' : s[0].toUpperCase() + s.slice(1)}</button>`).join('')}</div>
      <div class="row" style="margin-top:14px;justify-content:center"><button class="btn-primary" data-act="st-save">💾 Save costume</button><button class="btn" data-act="st-reset">↺ Reset</button></div>
      <p class="sm" style="text-align:center;margin:10px 0 0">${dirty ? '<span class="unsaved">● Unsaved changes</span>' : '<span class="muted">✓ Saved</span>'} · ${PRESET_LABELS[d.preset] || 'Custom'}</p>
      ${photo ? '<p class="muted sm" style="text-align:center">Photo avatar: head accessories &amp; hairstyle changes are hidden to keep the face unchanged.</p>' : ''}
    </section>
    <section class="card">
      <div class="sec-title" style="margin-top:0">Style presets</div>
      <div class="preset-grid">${PRESETS.map((p) => `<div class="preset ${d.preset === p ? 'on' : ''}" data-act="st-preset" data-v="${p}" tabindex="0" role="button"><div class="t">${renderAvatar({ hero: h, costume: presetCostume(h, p), photo })}</div><b class="sm">${PRESET_LABELS[p]}</b></div>`).join('')}</div>
      <div class="sec-title">Quick outfits</div>
      <div class="pills">${Object.entries(QUICK_OUTFITS).map(([k, o]) => `<button class="pill" data-act="st-quick" data-v="${k}">${o.label}</button>`).join('')}</div>
      <div class="sec-title">Top style</div>${pills('top.style', OPTIONS.top, d.top.style)}
      <div class="sec-title">Shirt / top colour</div>${sw('top.color', d.top.color)}
      <div class="sec-title">Jacket</div>${pills('jacket.style', OPTIONS.jacket, d.jacket ? d.jacket.style : 'none')}
      ${d.jacket ? `<div class="sec-title">Jacket colour</div>${sw('jacket.color', d.jacket.color)}` : ''}
      <div class="sec-title">Bottom</div>${pills('bottom.style', OPTIONS.bottom, d.bottom.style)}${sw('bottom.color', d.bottom.color)}
      <div class="sec-title">Footwear</div>${pills('shoes.style', OPTIONS.shoes, d.shoes.style)}
      <div class="sec-title">Accessories</div><div class="pills">${OPTIONS.acc.map((a) => `<button class="pill ${d.acc.includes(a) ? 'on' : ''}" data-act="co-acc" data-v="${a}">${LABELS[a]}</button>`).join('')}</div>
      <div class="sec-title">Hairstyle</div><div class="pills"><button class="pill ${!d.hair ? 'on' : ''}" data-act="co" data-k="hair" data-v="">Original</button>${OPTIONS.hair.map((o) => `<button class="pill ${d.hair === o ? 'on' : ''}" data-act="co" data-k="hair" data-v="${o}">${LABELS[o]}</button>`).join('')}</div>
      <div class="sec-title">Hair colour</div><div class="swatches"><button class="sw ${!d.hairColor ? 'on' : ''}" style="background:${h.hair}" data-act="co" data-k="hairColor" data-v="" title="Original"></button>${HAIR_COLORS.map((c) => `<button class="sw ${d.hairColor === c ? 'on' : ''}" style="background:${c}" data-act="co" data-k="hairColor" data-v="${c}"></button>`).join('')}</div>
    </section>
  </div>`;
}
function setPath(obj, path, val) {
  const ks = path.split('.'); let o = obj;
  for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
  o[ks[ks.length - 1]] = val;
}
function studioChange(k, v) {
  const d = studioState.draft;
  if (k === 'jacket.style') {
    if (v === 'none') d.jacket = null; else d.jacket = { style: v, color: d.jacket ? d.jacket.color : '#1f2a44' };
  } else if (k === 'hair' || k === 'hairColor') d[k] = v || null;
  else setPath(d, k, v);
  d.preset = 'custom';
}
function studioRefreshPreview() {
  const h = heroOf(studioState.hero);
  $('#st-av').innerHTML = renderAvatar({ hero: h, costume: studioState.draft, photo: S().photos[h.id] });
  applyAvState($('#st-av .av'), studioState.anim);
}

// ====================================================================== REMINDERS
let RF = { tab: 'list', q: '', status: 'all', cat: 'all', date: 'all', day: '' };
function remStatusLabel(r) {
  const s = statusOf(r);
  return { scheduled: 'Scheduled', snoozed: 'Snoozed', ringing: 'Ringing', completed: 'Completed', missed: 'Missed', skipped: 'Skipped', disabled: 'Disabled' }[s] || s;
}
function remCard(r) {
  const due = effectiveDue(r), st = statusOf(r), hero = heroOf(r.heroId);
  const canSnooze = r.enabled && due != null;
  return `<div class="rem ${r.enabled ? '' : 'off'}" data-id="${r.id}">
    <div class="mini">${avatarHTML(r.heroId, r.costumeMode, { bust: true })}</div>
    <div><h3>${esc(r.title)}</h3>${r.description ? `<div class="muted sm">${esc(r.description.slice(0, 90))}${r.description.length > 90 ? '…' : ''}</div>` : ''}
      <div class="meta"><span class="chip ${st}">${remStatusLabel(r)}</span><span class="chip">${esc(catName(r))}</span><span class="chip ${r.priority}">${esc(r.priority)}</span>
        <span class="chip">🔁 ${esc(describeRepeat(r))}</span><span class="chip">🎬 ${esc(hero.name)}</span></div>
      <div class="sm muted" style="margin-top:6px">${due != null ? `Next: <b>${esc(fmtDateTime(due))}</b>${r.snoozedUntil === due ? ' (snoozed)' : ''}` : `Was set for ${esc(fmtDate(zonedToEpoch(r.date, r.time, r.tz)))} · ${t12(r.time)}`}</div></div>
    <div class="acts"><label class="switch" title="Enable / disable"><input type="checkbox" data-act="rem-toggle" data-id="${r.id}" ${r.enabled ? 'checked' : ''} aria-label="Enable ${esc(r.title)}"><span></span></label>
      <button class="btn sm" data-act="rem-preview" data-id="${r.id}" title="Preview the avatar entrance (nothing is saved)">▶ Preview</button>
      ${canSnooze ? `<button class="btn sm" data-act="rem-snooze" data-id="${r.id}">⏰ Snooze ${r.snooze}m</button>` : ''}
      <button class="btn sm" data-act="rem-resched" data-id="${r.id}">📅 Reschedule</button>
      <button class="btn sm" data-act="rem-edit" data-id="${r.id}">✏️ Edit</button>
      <button class="btn sm danger" data-act="rem-del" data-id="${r.id}">🗑</button></div></div>`;
}
function filteredReminders() {
  const now = Date.now(), today = dateStrOf(now, tz());
  return S().reminders.filter((r) => {
    const q = RF.q.trim().toLowerCase();
    if (q && !(r.title + ' ' + r.description).toLowerCase().includes(q)) return false;
    if (RF.cat !== 'all' && r.category !== RF.cat) return false;
    const st = statusOf(r);
    if (RF.status === 'upcoming' && !(st === 'scheduled' || st === 'snoozed' || st === 'ringing')) return false;
    if (!['all', 'upcoming'].includes(RF.status) && st !== RF.status) return false;
    const due = effectiveDue(r), dd = due != null ? dateStrOf(due, tz()) : r.date;
    if (RF.date === 'today' && dd !== today && r.date !== today) return false;
    if (RF.date === 'week' && !(dd >= today && dd <= addDaysStr(today, 7))) return false;
    if (RF.date === 'past' && !(dd < today)) return false;
    if (RF.date === 'day' && RF.day && dd !== RF.day && r.date !== RF.day) return false;
    return true;
  }).sort((a, b) => (effectiveDue(a) ?? Infinity) - (effectiveDue(b) ?? Infinity));
}
function remListHTML() {
  const list = filteredReminders();
  return list.length ? list.map(remCard).join('') : `<div class="empty card">${S().reminders.length ? 'No reminders match these filters.' : 'No reminders yet.<br><br><button class="btn-primary" data-act="new-reminder">＋ Create your first reminder</button>'}</div>`;
}
function historyHTML() {
  const h = S().history;
  return `<div class="row between" style="margin-bottom:12px"><span class="muted">${h.length} event${h.length === 1 ? '' : 's'}</span>${h.length ? '<button class="btn sm danger" data-act="clear-history">Clear history</button>' : ''}</div>
  <div class="list">${h.length ? h.slice(0, 300).map((x) => `<div class="rem" style="grid-template-columns:54px 1fr auto"><div class="mini">${avatarHTML(x.heroId, 'saved', { bust: true })}</div><div><h3>${esc(x.title)}</h3><div class="sm muted">Due ${esc(fmtDateTime(x.due))} · logged ${esc(fmtDateTime(x.at))}</div></div><span class="chip ${chipClass(x.outcome)}">${esc(x.outcome)}</span></div>`).join('') : '<div class="empty card">No history yet.</div>'}</div>`;
}
function reminders() {
  return `<div class="page-head"><div><h1>Reminders</h1><div class="muted">Create, edit, snooze, reschedule and switch reminders on or off.</div></div>
    <div class="row"><div class="tabs"><button class="${RF.tab === 'list' ? 'on' : ''}" data-act="rtab" data-v="list">Reminders</button><button class="${RF.tab === 'history' ? 'on' : ''}" data-act="rtab" data-v="history">History</button></div>
    <button class="btn-primary" data-act="new-reminder">＋ New reminder</button></div></div>
  ${RF.tab === 'list' ? `<div class="filters">
      <input type="search" id="rf-q" placeholder="Search…" value="${esc(RF.q)}" aria-label="Search reminders">
      <select id="rf-status" aria-label="Status">${[['all', 'All statuses'], ['upcoming', 'Upcoming'], ['snoozed', 'Snoozed'], ['completed', 'Completed'], ['missed', 'Missed'], ['skipped', 'Skipped'], ['disabled', 'Disabled']].map(([v, l]) => `<option value="${v}" ${RF.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select id="rf-cat" aria-label="Category"><option value="all">All categories</option>${CATEGORIES.map((c) => `<option ${RF.cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <select id="rf-date" aria-label="Date">${[['all', 'Any date'], ['today', 'Today'], ['week', 'Next 7 days'], ['past', 'Past'], ['day', 'Specific day…']].map(([v, l]) => `<option value="${v}" ${RF.date === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <input type="date" id="rf-day" value="${RF.day}" ${RF.date === 'day' ? '' : 'hidden'} aria-label="Pick day"></div>
    <div class="list" id="rem-list">${remListHTML()}</div>` : historyHTML()}`;
}

function openReminderForm(id) {
  const st = S(), s = st.settings, ex = id ? st.reminders.find((r) => r.id === id) : null, now = Date.now();
  const soon = now + 2 * MIN;
  const r = ex || {
    title: '', description: '', date: dateStrOf(soon, tz()), time: timeStrOf(soon, tz()), repeat: 'none', customDays: [], heroId: s.defaultHero, costumeMode: s.defaultCostume,
    category: 'Personal Tasks', customCategory: '', priority: 'medium', message: '', enabled: true, snooze: s.defaultSnooze,
  };
  const m = openModal(`
    <div class="modal-head"><h2 style="margin:0">${ex ? 'Edit reminder' : 'New reminder'}</h2><button class="x" data-act="close-modal" aria-label="Close">✕</button></div>
    <form id="rf" novalidate><div class="form-grid">
      <label class="f full">Title *<input type="text" name="title" maxlength="80" value="${esc(r.title)}" placeholder="Complete Python Practice" required></label>
      <label class="f full">Detailed description<textarea name="description" maxlength="400" placeholder="Solve 3 problems on lists and dicts…">${esc(r.description)}</textarea></label>
      <label class="f">Date *<input type="date" name="date" value="${r.date}" required></label>
      <label class="f">Exact time *<input type="time" name="time" value="${r.time}" required></label>
      <label class="f">Repeat<select name="repeat">${REPEATS.map(([v, l]) => `<option value="${v}" ${r.repeat === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="f" id="custom-days" ${r.repeat === 'custom' ? '' : 'hidden'}>Days<div class="daychips">${DOW.map((d, i) => `<label class="pill ${r.customDays.includes(i) ? 'on' : ''}" style="cursor:pointer"><input type="checkbox" name="cd" value="${i}" hidden ${r.customDays.includes(i) ? 'checked' : ''}>${d}</label>`).join('')}</div></div>
      <label class="f">Category<select name="category">${CATEGORIES.map((c) => `<option ${r.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="f" id="custom-cat" ${r.category === 'Custom Category' ? '' : 'hidden'}>Custom category name<input type="text" name="customCategory" maxlength="30" value="${esc(r.customCategory)}"></label>
      <label class="f">Priority<select name="priority">${['low', 'medium', 'high'].map((p) => `<option ${r.priority === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
      <label class="f">Snooze duration<select name="snooze">${[5, 10, 15, 30, 60].map((n) => `<option value="${n}" ${+r.snooze === n ? 'selected' : ''}>${n} minutes</option>`).join('')}</select></label>
      <label class="f">Avatar (hero)<select name="heroId" id="rf-hero">${[...HEROES, ...st.customHeroes].map((h) => `<option value="${h.id}" ${r.heroId === h.id ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select></label>
      <label class="f">Costume<select name="costumeMode" id="rf-cos">${COSTUME_MODES.map(([v, l]) => `<option value="${v}" ${r.costumeMode === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="f full" style="grid-template-columns:90px 1fr;display:grid;align-items:center;gap:14px"><div id="rf-av" class="preview-box" style="padding:6px;height:120px"><div style="height:100%;aspect-ratio:128/150">${avatarHTML(r.heroId, r.costumeMode, { bust: true })}</div></div>
        <label class="f">Reminder message (what the hero says)<textarea name="message" maxlength="200" placeholder="Time to complete your Python practice!">${esc(r.message)}</textarea></label></div>
      <label class="f full" style="display:flex;align-items:center;gap:12px;flex-direction:row">Enabled <span class="switch"><input type="checkbox" name="enabled" ${r.enabled ? 'checked' : ''}><span></span></span></label>
    </div>
    <p class="form-err" id="rf-err" hidden></p>
    <div class="row" style="justify-content:flex-end;margin-top:18px"><button type="button" class="btn" data-act="close-modal">Cancel</button><button type="submit" class="btn-primary">${ex ? 'Save changes' : 'Create reminder'}</button></div></form>`);
  const f = $('#rf', m);
  const refresh = () => { $('#rf-av > div', m).innerHTML = avatarHTML(f.heroId.value, f.costumeMode.value, { bust: true }); };
  f.heroId.onchange = refresh; f.costumeMode.onchange = refresh;
  f.repeat.onchange = () => { $('#custom-days', m).hidden = f.repeat.value !== 'custom'; };
  f.category.onchange = () => { $('#custom-cat', m).hidden = f.category.value !== 'Custom Category'; };
  $$('[name=cd]', m).forEach((cb) => cb.addEventListener('change', () => cb.parentElement.classList.toggle('on', cb.checked)));
  f.onsubmit = (e) => {
    e.preventDefault();
    const err = $('#rf-err', m); const fail = (t) => { err.hidden = false; err.textContent = t; };
    const title = f.title.value.trim();
    if (!title) return fail('Please enter a title.');
    if (!f.date.value || !f.time.value) return fail('Please choose a date and time.');
    const repeat = f.repeat.value, days = $$('[name=cd]:checked', m).map((c) => +c.value);
    if (repeat === 'custom' && !days.length) return fail('Pick at least one day for a custom repeat.');
    if (f.category.value === 'Custom Category' && !f.customCategory.value.trim()) return fail('Enter a name for your custom category.');
    const epoch = zonedToEpoch(f.date.value, f.time.value, tz());
    if (repeat === 'none' && f.enabled.checked && epoch <= Date.now()) return fail(`That time (${fmtDateTime(epoch)}) has already passed. Choose a future time.`);
    const data = {
      title, description: f.description.value.trim(), date: f.date.value, time: f.time.value, repeat, customDays: repeat === 'custom' ? days : [],
      heroId: f.heroId.value, costumeMode: f.costumeMode.value, category: f.category.value, customCategory: f.customCategory.value.trim(),
      priority: f.priority.value, message: f.message.value.trim() || `Time for: ${title}`, enabled: f.enabled.checked, snooze: +f.snooze.value, tz: tz(),
    };
    let saved;
    if (ex) { editReminder(ex.id, data); saved = S().reminders.find((x) => x.id === ex.id); } else saved = createReminder(data);
    const nd = effectiveDue(saved);
    closeModal(); toast(nd ? `${ex ? 'Updated' : 'Reminder set'} — next: ${fmtDateTime(nd)}` : 'Saved', 'good');
    if (route === 'reminders') render(); else softRender();
    runTick();
  };
}

function openReschedule(id) {
  const r = S().reminders.find((x) => x.id === id); if (!r) return;
  const base = Math.max(Date.now(), effectiveDue(r) ?? 0) + 30 * MIN;
  const m = openModal(`<div class="modal-head"><h2 style="margin:0">Reschedule</h2><button class="x" data-act="close-modal">✕</button></div>
    <p><b>${esc(r.title)}</b><br><span class="muted sm">${isRecurring(r) ? 'This moves only the next occurrence; the repeat pattern stays the same.' : 'This sets a new date and time for this reminder.'}</span></p>
    <div class="form-grid"><label class="f">New date<input type="date" id="rs-d" value="${dateStrOf(base, tz())}"></label><label class="f">New time<input type="time" id="rs-t" value="${timeStrOf(base, tz())}"></label></div>
    <p class="form-err" id="rs-err" hidden></p>
    <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn" data-act="close-modal">Cancel</button><button class="btn-primary" id="rs-ok">Reschedule</button></div>`, { small: true });
  $('#rs-ok', m).onclick = () => {
    if (!reschedule(id, $('#rs-d', m).value, $('#rs-t', m).value)) { const e = $('#rs-err', m); e.hidden = false; e.textContent = 'Choose a valid time in the future.'; return; }
    closeModal(); toast('Rescheduled', 'good'); softRender();
  };
}

// ====================================================================== PLAYGROUND
let pg = { hero: null, mode: 'saved' };
function playground() {
  if (!pg.hero || !heroOf(pg.hero)) pg.hero = S().settings.defaultHero;
  const btn = (a, l) => `<button class="btn" data-act="pg" data-v="${a}">${l}</button>`;
  return `<div class="page-head"><div><h1>Animation Playground</h1><div class="muted">Test every animation without waiting for a reminder.</div></div>
    <select id="pg-hero" style="max-width:260px" aria-label="Hero">${[...HEROES, ...S().customHeroes].map((x) => `<option value="${x.id}" ${x.id === pg.hero ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
  <div class="pg-stage" id="pg-stage"><div class="ground"></div><canvas class="pg-canvas" id="pg-canvas"></canvas><div class="pg-bubble" id="pg-bubble"></div></div>
  <div class="card" style="margin-top:16px"><div class="sec-title" style="margin-top:0">Movement</div>
    <div class="row">${btn('in-left', '🚶 Walk in from left')}${btn('to-right', '➡ Walk to right')}${btn('to-left', '⬅ Turn &amp; walk left')}${btn('turn', '🔄 Turn around')}${btn('center', '⏺ Centre')}</div>
    <div class="sec-title">Expressions</div>
    <div class="row">${btn('idle', '🧍 Idle')}${btn('talk', '💬 Talking')}${btn('happy', '😄 Happy')}${btn('sad', '😢 Sad')}${btn('celebrate', '🎉 Celebrate')}</div>
    <div class="sec-title">Costume</div>
    <div class="row">${COSTUME_MODES.map(([k, l]) => `<button class="pill ${pg.mode === k ? 'on' : ''}" data-act="pg-mode" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="sec-title">Full experience</div>
    <div class="row"><button class="btn-primary" data-act="pg-demo">▶ Run full reminder demo (YES / NO flow)</button></div>
    <p class="muted sm" style="margin-top:8px">The demo runs the real full-screen reminder in preview mode: nothing is saved.</p></div>`;
}
function pgSetup() {
  const host = $('#pg-stage');
  pgActor?.destroy();
  pgActor = new Actor(host);
  pgActor.instant = !S().settings.animations; pgActor.sfx = S().settings.sound;
  const l = lookFor(pg.hero, pg.mode);
  pgActor.setLook(l);
  requestAnimationFrame(() => pgActor && pgActor.place(pgX().c));
}
const pgX = () => { const host = $('#pg-stage'), w = host.clientWidth, aw = pgActor.width; return { w, aw, c: (w - aw) / 2, l: -aw - 60, r: w + 60 }; };
function pgSay(t) { const b = $('#pg-bubble'); b.textContent = t; b.classList.add('on'); clearTimeout(pgSay.t); pgSay.t = setTimeout(() => b.classList.remove('on'), 2600); }
async function pgAction(a) {
  const A = pgActor; if (!A) return;
  const x = pgX();
  if (A.busy) A.stop();
  const resetFx = () => { A.setExpr('neutral'); A.celebrate(false); A.talk(false); };
  const hero = heroOf(pg.hero);
  switch (a) {
    case 'in-left': resetFx(); A.stop(); A.applyDir(1); A.place(x.l); await A.walkTo(x.c, { speed: Math.max(160, x.w / 5) }); pgSay(`Hi! I'm ${hero.name}`); break;
    case 'to-right': resetFx(); await A.walkTo(x.r, { speed: Math.max(220, x.w / 3) }); A.applyDir(1); A.place(x.l); await A.walkTo(x.c, { speed: Math.max(220, x.w / 3) }); break;
    case 'to-left': resetFx(); await A.walkTo(x.l, { speed: Math.max(220, x.w / 3) }); A.place(x.r); await A.walkTo(x.c, { speed: Math.max(220, x.w / 3) }); break;
    case 'turn': await A.turn(A.dir === 1 ? -1 : 1); break;
    case 'center': A.stop(); A.setMode('idle'); A.place(x.c); break;
    case 'idle': resetFx(); A.setMode('idle'); break;
    case 'talk': resetFx(); A.talk(true); pgSay('Time to complete your task!'); setTimeout(() => A.talk(false), 3000); break;
    case 'happy': resetFx(); A.setExpr('happy'); A.celebrate(true); play('yes'); pgSay('Super! Keep going!'); setTimeout(() => A.celebrate(false), 2500); break;
    case 'sad': resetFx(); A.setExpr('sad'); play('no'); pgSay("Okay! I'll remind you again."); break;
    case 'celebrate': resetFx(); A.setExpr('happy'); A.celebrate(true); play('yes');
      { const cv = $('#pg-canvas'); const hb = A.av.querySelector('.head').getBoundingClientRect(), rb = cv.getBoundingClientRect(); confetti(cv, { x: hb.left - rb.left + hb.width / 2, y: hb.top - rb.top }); }
      setTimeout(() => { A.celebrate(false); }, 2600); break;
  }
}

// ====================================================================== SETTINGS
function settings() {
  const s = S().settings, perm = notify.permission();
  const zones = (Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : []);
  if (!zones.includes(s.timezone)) zones.unshift(s.timezone);
  if (!zones.includes('Asia/Kolkata')) zones.unshift('Asia/Kolkata');
  const sw = (k, v) => `<label class="switch"><input type="checkbox" data-set="${k}" ${v ? 'checked' : ''}><span></span></label>`;
  const row = (t, d, ctl) => `<div class="setting"><div><b>${t}</b>${d ? `<small>${d}</small>` : ''}</div>${ctl}</div>`;
  return `<div class="page-head"><div><h1>Settings</h1><div class="muted">Notifications, sound, appearance, time and data.</div></div></div>
  <div class="grid g2">
  <section class="card"><h3>Reminders</h3>
    ${row('Master switch', 'Turn every reminder on or off at once.', sw('masterOn', s.masterOn))}
    ${row('Default hero', '', `<select class="ctl" data-set="defaultHero">${[...HEROES, ...S().customHeroes].map((h) => `<option value="${h.id}" ${s.defaultHero === h.id ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select>`)}
    ${row('Default costume', 'Used for new reminders.', `<select class="ctl" data-set="defaultCostume">${COSTUME_MODES.map(([v, l]) => `<option value="${v}" ${s.defaultCostume === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
    ${row('Default snooze', '', `<select class="ctl" data-set="defaultSnooze" data-num>${[5, 10, 15, 30, 60].map((n) => `<option value="${n}" ${s.defaultSnooze === n ? 'selected' : ''}>${n} minutes</option>`).join('')}</select>`)}
    ${row('Your name', 'Used in the greeting.', `<input class="ctl" type="text" data-set="userName" maxlength="24" value="${esc(s.userName)}" placeholder="optional">`)}
    ${row('Quiet hours', 'Reminders (except high priority) wait until quiet hours end.', sw('quiet.on', s.quiet.on))}
    <div class="setting"><div><small>From / until</small></div><div class="row"><input type="time" data-set="quiet.start" value="${s.quiet.start}" style="width:130px"><input type="time" data-set="quiet.end" value="${s.quiet.end}" style="width:130px"></div></div>
  </section>
  <section class="card"><h3>Sound &amp; animation</h3>
    ${row('Sound effects', 'Chimes, footsteps, cheers.', sw('sound', s.sound))}
    ${row('Volume', '', `<input class="ctl" type="range" min="0" max="1" step="0.05" data-set="volume" data-num value="${s.volume}">`)}
    ${row('Test sound', '', '<button class="btn sm" data-act="test-sound">🔊 Play</button>')}
    ${row('Avatar animations', 'Walking, expressions and confetti. Turn off for a simple static card (e.g. reduced motion).', sw('animations', s.animations))}
    ${row('Theme', '', `<select class="ctl" data-set="theme">${[['auto', 'Match device'], ['dark', 'Dark'], ['light', 'Light']].map(([v, l]) => `<option value="${v}" ${s.theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
    ${row('Timezone', 'Reminders use this clock. Changing it moves the wall-clock time of all reminders to the new zone.', `<select class="ctl" data-set="timezone">${zones.map((z) => `<option ${s.timezone === z ? 'selected' : ''}>${z}</option>`).join('')}</select>`)}
    ${row('Device timezone', `Detected: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`, '<button class="btn sm" data-act="tz-device">Use device zone</button>')}
  </section>
  <section class="card"><h3>Notifications</h3>
    ${row('Browser notifications', `Permission: <b>${perm}</b>`, sw('notifications', s.notifications))}
    <div class="row" style="margin:10px 0"><button class="btn sm" data-act="notif-perm">${perm === 'granted' ? '✓ Permission granted' : 'Allow notifications'}</button><button class="btn sm" data-act="notif-test">Send test notification</button></div>
    ${perm === 'denied' ? '<div class="note">Notifications are blocked. Click the lock icon in the address bar → Site settings → Notifications → Allow.</div>' : ''}
    <div class="sec-title">Background push (browser closed)</div>
    <div id="push-box"><span class="muted">Checking server…</span></div>
    <div class="note" style="margin-top:12px"><b>What can and cannot work</b><br>
      • While this app is open (even in a background tab) reminders fire on time, with the avatar walking in.<br>
      • With no tab open, only <b>Web Push from the server</b> can show a notification, and only if your browser process is still alive (Chrome/Edge background mode, Android). It requires HTTPS (localhost is fine).<br>
      • If the browser is completely quit or the device is off, nothing can run. Those reminders are saved as <b>missed</b> and shown when you reopen.</div>
  </section>
  <div id="desk-box"></div>
  <section class="card"><h3>Data</h3>
    <p class="muted sm">Everything is stored in this browser (localStorage). Photos never leave your device.</p>
    <div class="row"><button class="btn" data-act="export">⬇ Export backup</button><label class="btn" style="cursor:pointer">⬆ Import backup<input type="file" accept="application/json" id="import-file" hidden></label>
      <button class="btn danger" data-act="clear-history">Clear history</button><button class="btn danger" data-act="reset-all">Reset everything</button></div>
  </section></div>`;
}

async function renderDeskBox() {
  const box = $('#desk-box'); if (!box || !window.tfiDesktop) return;
  const p = await window.tfiDesktop.invoke('prefs-get'); const st = S().settings;
  const sw = (k, on) => `<label class="switch"><input type="checkbox" data-act="desk-pref" data-k="${k}" ${on ? 'checked' : ''}><span></span></label>`;
  const row2 = (t, d, c) => `<div class="setting"><div><b>${t}</b>${d ? `<small>${d}</small>` : ""}</div>${c}</div>`;
  box.innerHTML = `<section class="card"><h3>🖥 Desktop companion (Windows)</h3>
    ${row2('Show hero on desktop', 'Floating, always-on-top, drag it anywhere. Position is remembered.', sw('visible', p.visible))}
    ${row2('Start with Windows', 'Launches hidden in the tray so reminders keep working after a restart.', sw('autoStart', p.autoStart))}
    ${row2('Click-through when idle', 'Idle hero ignores the mouse (menu stays in the tray).', sw('clickThrough', p.clickThrough))}
    ${row2('Pause idle animation', 'Reminders still animate.', sw('paused', st.overlayPaused))}
    ${row2('Also send a Windows notification', 'Always raise a toast too. It is sent automatically if the overlay cannot be shown.', sw('alsoToast', st.alsoToast))}
    ${row2('After sleep / lock / start, overdue reminders', '', `<select class="ctl" data-set="missedPolicy"><option value="log" ${st.missedPolicy === 'log' ? 'selected' : ''}>Record as missed</option><option value="show" ${st.missedPolicy === 'show' ? 'selected' : ''}>Still show them (up to 12 h late)</option></select>`)}
    <div class="row" style="margin-top:10px"><button class="btn sm" data-act="desk-test">▶ Test on desktop</button><button class="btn sm danger" data-act="desk-exit">Exit application</button></div>
    <div class="note">Closing this window only hides the dashboard; the hero and scheduler keep running in the tray. It cannot appear over the lock screen, UAC prompts, or some exclusive full-screen games.</div></section>`;
}

async function renderPushBox() {
  renderDeskBox();
  const box = $('#push-box'); if (!box) return;
  if (!server.available) { box.innerHTML = '<span class="muted">Push server not detected. Run <code>npm start</code> and open the app from <code>http://localhost:3000</code> to enable background reminders.</span>'; return; }
  if (!server.push) { box.innerHTML = '<span class="muted">Server is running but web-push is not installed (<code>npm install</code>).</span>'; return; }
  const st = await notify.pushState();
  box.innerHTML = st === 'on'
    ? '<div class="row"><span class="chip completed">● Push enabled on this device</span><button class="btn sm danger" data-act="push-off">Disable</button></div>'
    : `<div class="row"><span class="chip">Push off</span><button class="btn-primary sm" data-act="push-on">Enable background push</button></div>`;
}

function setSetting(path, el) {
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (el.hasAttribute('data-num') || el.type === 'range') v = Number(v);
  if (path === 'timezone') { applyTimezone(v); toast(`Timezone set to ${v}`, 'good'); return; }
  if (path === 'masterOn') { setMaster(v); toast(v ? 'Reminders resumed' : 'All reminders paused', v ? 'good' : 'warn'); render(); return; }
  update((s) => setPath(s.settings, path, v));
  if (path === 'theme') applyTheme();
  if (path === 'defaultHero') { toast('Default hero updated', 'good'); }
}

// ====================================================================== run loop / ringing
const stage = new ReminderStage();
const queue = [], queued = new Set(), notified = new Set();

function enqueue(id, due) { const k = `${id}:${due}`; if (queued.has(k)) return; queued.add(k); queue.push({ id, due, k }); }

async function pump() {
  if (stage.busy || pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      const it = queue.shift();
      const r = S().reminders.find((x) => x.id === it.id);
      if (r && r.status === 'ringing' && r.lastFiredDue === it.due && r.enabled && S().settings.masterOn) {
        notify.closeNotificationsFor(r.id);
        const l = lookFor(r.heroId, r.costumeMode);
        await stage.ring({ reminder: r, hero: l.hero, look: l, settings: S().settings, hooks: {
          onYes: () => answerYes(r.id, it.due), onNo: () => answerNo(r.id, it.due), onFollow: (a) => followUp(r.id, it.due, a),
        } });
      }
      queued.delete(it.k);
    }
  } catch (e) { console.error('ring failed', e); toast('Something went wrong showing the reminder.', 'bad'); }
  finally { pumping = false; softRender(); }
}
let pumping = false;

const DESK = !!window.tfiDesktop;   // inside the desktop app the always-running overlay owns the engine; this window is only the dashboard
function runTick() {
  if (DESK) { updateTicker(); return; }
  const { fire, missed } = tick();
  if (missed.length) {
    const names = missed.map((m) => S().reminders.find((r) => r.id === m.id)?.title).filter(Boolean);
    toast(`⚠ Missed: ${[...new Set(names)].slice(0, 3).join(', ')}${missed.length > 3 ? '…' : ''}`, 'warn', 6000);
  }
  for (const f of fire) {
    const r = S().reminders.find((x) => x.id === f.id);
    if (!r) continue;
    enqueue(f.id, f.due);
    const nk = `${f.id}:${f.due}`;
    if (!notified.has(nk) && S().settings.notifications && (document.hidden || !document.hasFocus())) {
      notified.add(nk);
      notify.showNotification(`${heroOf(r.heroId).name}: ${r.title}`, r.message || `Time for: ${r.title}`, { tag: `r-${r.id}-${f.due}`, data: { rid: r.id, due: f.due } });
    }
  }
  if (fire.length || queue.length) pump();
  updateTicker();
}

function updateTicker() {
  const now = Date.now();
  $$('[data-countdown]').forEach((el) => { el.textContent = fmtCountdown(Number(el.dataset.countdown) - now); });
  const foot = $('#side-foot');
  if (foot) foot.innerHTML = `🕒 ${esc(fmtTime(now))} (${esc(tz().split('/').pop().replace('_', ' '))})<br>${server.available ? (server.subscription ? '🟢 Background push on' : '⚪ Server connected') : '⚪ Offline mode (local only)'}`;
}

// A notification action button was pressed (Done / Snooze)
function notifAction(action, rid, due) {
  runTick();
  const r = S().reminders.find((x) => x.id === rid);
  if (!r) return;
  const d = Number(due) || r.lastFiredDue;
  if (r.status === 'ringing' && r.lastFiredDue === d && !stage.busy) {
    queue.splice(0, queue.length); queued.clear();
    if (action === 'done') { answerYes(rid, d); toast('Marked done ✓', 'good'); }
    else if (action === 'snooze') { answerNo(rid, d); toast(`Snoozed ${r.snooze} min`, 'good'); }
    notify.closeNotificationsFor(rid);
    softRender();
  }
}

// ====================================================================== events
const ACT = {
  'close-modal': () => closeModal(),
  'new-reminder': () => openReminderForm(),
  'master-on': () => { setMaster(true); toast('Reminders resumed', 'good'); render(); },
  'seen-missed': () => { update((s) => { s.seenMissedAt = Date.now(); }); render(); },
  'open-history': () => { RF.tab = 'history'; update((s) => { s.seenMissedAt = Date.now(); }); },
  'demo-hero': () => runDemo(S().settings.defaultHero, S().settings.defaultCostume),
  'hero-open': (el) => openHeroPreview(el.dataset.id),
  'custom-hero': () => openCustomHero(),
  'custom-del': async (el) => {
    const id = el.dataset.id;
    if (!await confirmModal('Delete avatar?', 'Reminders using it will fall back to the default hero.')) return;
    update((s) => { s.customHeroes = s.customHeroes.filter((h) => h.id !== id); delete s.photos[id]; delete s.costumes[id]; s.reminders.forEach((r) => { if (r.heroId === id) r.heroId = HEROES[0].id; }); if (s.settings.defaultHero === id) s.settings.defaultHero = HEROES[0].id; });
    closeModal(); refreshGallery(); toast('Avatar deleted');
  },
  'hero-select': (el) => { update((s) => { s.settings.defaultHero = el.dataset.id; }); toast(`${heroOf(el.dataset.id).name} is now your hero`, 'good'); closeModal(); refreshGallery(); },
  'hero-costume': (el) => { studioLoad(el.dataset.id); closeModal(); location.hash = '#/studio'; },
  'pv-state': (el) => { preview.state = el.dataset.v; applyAvState($('#pv-av .av'), preview.state); $$('[data-act=pv-state]').forEach((b) => b.classList.toggle('on', b === el)); },
  'pv-mode': (el) => openHeroPreview(preview.id, el.dataset.v),
  'pv-photo-rm': () => { update((s) => { delete s.photos[preview.id]; }); openHeroPreview(preview.id, preview.mode); refreshGallery(); },
  // studio
  'st-anim': (el) => { studioState.anim = el.dataset.v; applyAvState($('#st-av .av'), studioState.anim); $$('[data-act=st-anim]').forEach((b) => b.classList.toggle('on', b === el)); },
  'st-preset': (el) => { studioState.draft = presetCostume(heroOf(studioState.hero), el.dataset.v); render(); },
  'st-quick': (el) => { studioState.draft = QUICK_OUTFITS[el.dataset.v].build(); render(); },
  co: (el) => { studioChange(el.dataset.k, el.dataset.v); render(); },
  'co-acc': (el) => { const a = studioState.draft.acc, v = el.dataset.v; const i = a.indexOf(v); if (i >= 0) a.splice(i, 1); else a.push(v); if (v === 'tie' || v === 'shawl' || v === 'scarf') { /* torso accessories may overlap; allowed */ } studioState.draft.preset = 'custom'; render(); },
  'st-save': () => { update((s) => { s.costumes[studioState.hero] = clone(studioState.draft); }); toast('Costume saved', 'good'); render(); },
  'st-reset': () => { update((s) => { delete s.costumes[studioState.hero]; }); studioLoad(studioState.hero); toast('Costume reset to original look'); render(); },
  // reminders
  rtab: (el) => { RF.tab = el.dataset.v; render(); },
  'rem-toggle': (el) => { setEnabled(el.dataset.id, el.checked); toast(el.checked ? 'Reminder enabled' : 'Reminder disabled — it will not trigger', el.checked ? 'good' : 'warn'); render(); },
  'rem-preview': (el) => { const r = S().reminders.find((x) => x.id === el.dataset.id); runDemo(r.heroId, r.costumeMode, r); },
  'rem-snooze': (el) => { const r = S().reminders.find((x) => x.id === el.dataset.id); snooze(r.id, r.snooze); toast(`Snoozed for ${r.snooze} minutes`, 'good'); render(); },
  'rem-resched': (el) => openReschedule(el.dataset.id),
  'rem-edit': (el) => openReminderForm(el.dataset.id),
  'rem-del': async (el) => { if (await confirmModal('Delete reminder?', 'This cannot be undone.')) { deleteReminder(el.dataset.id); toast('Reminder deleted'); render(); } },
  'clear-history': async () => { if (await confirmModal('Clear history?', 'Completed / missed records will be removed.', 'Clear')) { update((s) => { s.history = []; }); render(); } },
  // playground
  pg: (el) => pgAction(el.dataset.v),
  'pg-mode': (el) => { pg.mode = el.dataset.v; $$('[data-act=pg-mode]').forEach((b) => b.classList.toggle('on', b === el)); const x = pgX(); const keepX = pgActor.x; pgActor.setLook(lookFor(pg.hero, pg.mode)); pgActor.place(keepX); void x; },
  'pg-demo': () => runDemo(pg.hero, pg.mode),
  // settings
  'test-sound': () => play('test', { force: true }),
  'tz-device': () => { applyTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone); render(); toast('Using device timezone', 'good'); },
  'notif-perm': async () => { const p = await notify.requestPermission(); toast(p === 'granted' ? 'Notifications allowed' : `Permission: ${p}`, p === 'granted' ? 'good' : 'warn'); render(); renderPushBox(); },
  'notif-test': async () => {
    if (notify.permission() !== 'granted') { const p = await notify.requestPermission(); if (p !== 'granted') { toast('Notification permission not granted', 'warn'); render(); return; } }
    const ok = await notify.showNotification('TFI Heroes', 'Test notification — this is how reminders will look.', { tag: 'test', requireInteraction: false });
    toast(ok ? 'Test notification sent' : 'Could not show notification', ok ? 'good' : 'bad');
  },
  'desk-pref': (el) => {
    const k = el.dataset.k, v = el.checked;
    if (k === 'paused') window.tfiDesktop.send('cmd-overlay', { cmd: 'pause', value: v });
    else if (k === 'alsoToast') update((st) => { st.settings.alsoToast = v; });
    else window.tfiDesktop.invoke('prefs-set', { [k]: v });
    toast('Saved', 'good');
  },
  'desk-test': () => window.tfiDesktop.send('cmd-overlay', { cmd: 'test' }),
  'desk-exit': async () => { if (await confirmModal('Exit TFI Heroes?', 'This stops the hero AND the background reminder service completely.', 'Exit')) window.tfiDesktop.send('quit'); },
  'push-on': async () => { try { await notify.enablePush(); toast('Background push enabled', 'good'); } catch (e) { toast(e.message, 'bad', 6000); } renderPushBox(); updateTicker(); },
  'push-off': async () => { await notify.disablePush(); toast('Push disabled'); renderPushBox(); updateTicker(); },
  export: () => {
    const blob = new Blob([JSON.stringify(S(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `tfi-heroes-backup-${dateStrOf(Date.now(), tz())}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  'reset-all': async () => { if (await confirmModal('Reset everything?', 'All reminders, costumes, photos and settings will be erased.', 'Erase all')) { replaceAll({ settings: defaultSettings() }); studioState = { hero: null, draft: null, anim: 'idle' }; applyTheme(); render(); toast('Everything reset'); } },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  if (el.tagName === 'INPUT' && el.type === 'checkbox') return; // handled on change
  const fn = ACT[el.dataset.act]; if (fn) { if (el.tagName === 'A') { /* let hash nav proceed */ } fn(el, e); }
});
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-act][role=button]')) { e.preventDefault(); e.target.click(); }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.matches('input[type=checkbox][data-act]')) { ACT[t.dataset.act]?.(t, e); return; }
  if (t.dataset.set) { setSetting(t.dataset.set, t); return; }
  if (t.id === 'studio-hero') { studioLoad(t.value); render(); }
  else if (t.id === 'pg-hero') { pg.hero = t.value; pgSetup(); }
  else if (t.id === 'rf-status') { RF.status = t.value; refreshRemList(); }
  else if (t.id === 'rf-cat') { RF.cat = t.value; refreshRemList(); }
  else if (t.id === 'rf-date') { RF.date = t.value; $('#rf-day').hidden = t.value !== 'day'; refreshRemList(); }
  else if (t.id === 'rf-day') { RF.day = t.value; refreshRemList(); }
  else if (t.id === 'import-file') importBackup(t.files[0]);
  else if (t.matches('[data-color]')) { studioChange(t.dataset.color, t.value); studioRefreshPreview(); }
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'hero-search') { heroQuery = t.value; refreshGallery(); }
  else if (t.id === 'rf-q') { RF.q = t.value; refreshRemList(); }
  else if (t.matches('[data-color]')) { studioChange(t.dataset.color, t.value); studioRefreshPreview(); }
  else if (t.matches('input[type=range][data-set]')) { setSetting(t.dataset.set, t); }
});
const refreshRemList = () => { const l = $('#rem-list'); if (l) l.innerHTML = remListHTML(); };

async function importBackup(file) {
  if (!file) return;
  try {
    const j = JSON.parse(await file.text());
    if (!j || !Array.isArray(j.reminders) || !j.settings) throw new Error('Not a TFI Heroes backup file.');
    replaceAll(j); applyTheme(); render(); toast('Backup imported', 'good'); runTick();
  } catch (e) { toast(e.message || 'Import failed', 'bad'); }
}

// Full-screen preview of the real reminder experience (nothing persisted)
async function runDemo(heroId, mode, rem) {
  if (stage.busy) return;
  closeModal();
  const s = S().settings, l = lookFor(heroId, mode);
  const reminder = rem ? { ...rem } : { title: 'Complete Python Practice', description: 'Solve 3 problems on lists and dictionaries.', message: 'Time to complete your Python practice!', category: 'Coding Practice', priority: 'medium', snooze: s.defaultSnooze };
  const r = await stage.ring({ reminder, hero: l.hero, look: l, settings: s, preview: true, hooks: {} });
  if (r.result === 'yes') toast('Preview: marked completed (not saved)', 'good');
  else if (r.result === 'no') toast('Preview: not completed (not saved)', 'warn');
}

// ====================================================================== after-render hooks
const afterRender = {
  home() { applyAvState($('#home-av .av'), 'idle'); },
  playground() { pgSetup(); },
  studio() { applyAvState($('#st-av .av'), studioState.anim); },
  settings() { renderPushBox(); },
};

// ====================================================================== boot
async function boot() {
  applyTheme();
  await notify.registerSW();
  await probeServer();
  await notify.pushState();
  notify.onSWMessage((m) => {
    if (m?.type === 'push-due') runTick();
    else if (m?.type === 'notif-action') notifAction(m.action, m.rid, m.due);
  });
  render();
  onChange((e) => { if (e.type === 'error') toast(e.message, 'bad'); else softRender(); });

  // URL actions from a notification click when the app was closed
  const p = new URLSearchParams(location.search);
  runTick();
  if (p.get('n')) {
    const n = p.get('n'), rid = p.get('rid'), due = p.get('due');
    history.replaceState(null, '', location.pathname + location.hash);
    if (n === 'done' || n === 'snooze') notifAction(n, rid, due);
  }

  if (window.tfiDesktop) window.tfiDesktop.onCommand((c) => { if (c.cmd === 'go') location.hash = c.hash; else if (c.cmd === 'new-reminder') { location.hash = '#/reminders'; setTimeout(() => openReminderForm(), 150); } });
  setInterval(runTick, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) runTick(); });
  window.addEventListener('focus', runTick);
  window.addEventListener('online', () => syncNow());

  // Expose a tiny debug/test API (used by the automated test-suite & handy in the console)
  window.__tfi = { tick: runTick, state: S, stage, engine: { createReminder, answerYes, answerNo, snooze, setEnabled, setMaster, reschedule }, GRACE, DEFAULT_TZ };
}
boot();
