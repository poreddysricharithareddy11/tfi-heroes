# TFI Heroes — Animated Reminder Companion

Your favourite Telugu-film-industry hero walks in from the left at the exact reminder time, tells you what to do, and
waits for **YES** (happy, celebrates, walks off right) or **NO** (sad, turns around, walks off left, offers snooze/reschedule).

## Run

```
npm install
npm start          # http://localhost:3000
npm test           # scheduler unit tests
```

The app is plain ES modules (no build step). Open it from `http://localhost:3000` (a service worker and push need
`localhost` or HTTPS). Without the server it still works as a static site, minus background push.

## Windows desktop companion (always on top of every app and website)

```
npm install
npm run desktop     # starts the tray app + floating hero (works from a VS Code terminal too)
```

* The hero is a transparent, borderless, always-on-top window (medium size), shown without taking keyboard focus. Drag it anywhere; the position is remembered. Click it for the menu (dashboard, create reminder, change hero/costume, hide/show, pause animations, enable/disable reminders, exit). The tray icon has the same menu.
* At reminder time the hero walks in from the LEFT across the monitor you are working on, shows the message with YES / NO. YES → celebrate, exit RIGHT, marked completed. NO → sad, exit LEFT, snooze/reschedule panel, not completed. Only the hero and message box accept clicks; everything else passes through to the app below.
* Closing the dashboard only hides it. **Exit Application** (tray menu or Settings) stops everything. "Start with Windows" launches it hidden in the tray at login.
* Sleep / wake / unlock re-checks reminders. Settings → *Desktop companion* lets you choose whether overdue reminders are recorded as missed or still shown (up to 12 h late).
* Limits: Windows does not allow overlays above the lock screen, UAC/secure desktop, or some exclusive full-screen games. If the overlay cannot be shown, a Windows notification is sent instead. If the PC is off or the app is exited, nothing can fire; those are logged as missed.

## How it is built

| Concern | Approach |
|---|---|
| Avatars | Layered SVG character rig (`avatar.js`); walk / idle / happy / sad / talking / turn / celebrate are CSS + Web Animations |
| Scheduling | Each reminder stores a computed `nextDue` epoch (+ optional `snoozedUntil`). A 1 s tick, plus focus/visibility/load checks, compares them to `Date.now()`. **No countdown timers are trusted.** Logic is a pure module (`scheduler.js`) shared with the server and covered by tests |
| Time zones | Wall-clock time + IANA zone via `Intl` (default **Asia/Kolkata**). DST-safe |
| Persistence | `localStorage` (reminders, history, costumes, photos, settings). Refresh mid-reminder resumes it |
| Duplicate / disabled / completed | Per-occurrence `lastFiredDue` dedupe; disabled and master-off never fire; one-time completed reminders never refire; recurring ones roll to the next occurrence |
| Missed | Older than 5 min when detected → logged **missed** (each missed occurrence, capped at 10), banner on dashboard |
| Notifications | Notification API via the service worker (Done / Snooze actions) when the tab is hidden |
| Closed browser | `server/server.js` keeps a copy of the schedule and sends **Web Push** (VAPID, `web-push`) |

## What can and cannot work (please read)

* **Tab open (even in background):** reminders fire on time and the avatar walks in. Background tabs can be throttled to ~1 check/minute.
* **No tab open:** only server-sent Web Push can wake the service worker — and only while the browser *process* is alive
  (Chrome/Edge "continue running background apps", Android). Needs HTTPS (localhost is exempt) and the server running 24/7.
* **Browser fully quit / device off:** nothing can run. The occurrence is recorded as *missed* when you next open the app.
  For guaranteed delivery, host the server and install the PWA on a phone, or wrap it as a desktop/mobile app.

## About the hero artwork (important)

I cannot ship photographs of real actors (copyright / personality rights), and the avatars are **not photo-likenesses**.
Each hero is a stylised illustration with signature traits (hair, facial hair, skin tone, colour, outfit). For a true likeness:
open a hero → **Upload photo** (use an image you own or are licensed to use). It is mapped onto the animated body,
stays on your device, and costume changes never alter it. You can also create your own avatar (“Add my own avatar”).
All outfits are always fully and decently clothed; there is no option that removes clothing.

## Layout

```
public/index.html, css/styles.css, sw.js, manifest.webmanifest
public/js/  scheduler.js  engine.js  store.js  heroes.js  avatar.js  stage.js  sound.js  notify.js  ui.js  app.js
server/server.js     static files + /api/sync + Web Push loop
test/                scheduler.test.mjs
```
