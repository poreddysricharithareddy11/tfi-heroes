// TFI Heroes — Windows desktop companion (Electron main process).
// - overlay window: transparent, frameless, always-on-top, no taskbar entry, never takes keyboard focus
// - dashboard window: the normal app; closing it only hides it (background service keeps running)
// - tray icon + native menu, auto-start, power (sleep/wake/lock) handling, multi-monitor, remembered position
const { app, BrowserWindow, Tray, Menu, screen, ipcMain, powerMonitor, Notification, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const PORT = Number(process.env.TFI_PORT) || 47615;           // fixed so the origin (and its localStorage) never changes
const BASE = `http://127.0.0.1:${PORT}`;
const TEST = !!process.env.TFI_TEST;
const hiddenStart = process.argv.includes('--startup') || process.argv.includes('--hidden');
const IDLE = { w: 210, h: 360 };   // medium avatar

if (process.env.TFI_USERDATA) app.setPath('userData', process.env.TFI_USERDATA);
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

// ------------------------------------------------------------------ prefs
const prefsFile = () => path.join(app.getPath('userData'), 'desktop-prefs.json');
let prefs = { visible: true, clickThrough: false, pos: null };
const loadPrefs = () => { try { prefs = { ...prefs, ...JSON.parse(fs.readFileSync(prefsFile(), 'utf8')) }; } catch { /* first run */ } };
const savePrefs = () => { try { fs.writeFileSync(prefsFile(), JSON.stringify(prefs)); } catch (e) { console.error('prefs', e); } };
const autoStartOn = () => { try { return app.getLoginItemSettings(loginOpts()).openAtLogin; } catch { return false; } };
const loginOpts = () => ({ path: process.execPath, args: app.isPackaged ? ['--startup'] : [app.getAppPath(), '--startup'] });
const setAutoStart = (on) => { if (!TEST || process.env.TFI_REAL_AUTOSTART) app.setLoginItemSettings({ openAtLogin: !!on, ...loginOpts() }); prefs.autoStart = !!on; savePrefs(); };

// ------------------------------------------------------------------ state
let overlay = null, dash = null, tray = null, quitting = false;
let status = { masterOn: true, paused: false, hero: '' };
let inStage = false, kbd = false, stageShown = false, stageTimer = null;
let drag = null;
const log = (...a) => { if (TEST) console.log('[main]', ...a); };

const icon = () => nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
const tell = (win, cmd) => { if (win && !win.isDestroyed()) win.webContents.send('command', cmd); };

// ------------------------------------------------------------------ geometry
function allowedPos(x, y, w, h) {
  // keep the avatar on a connected display (monitors can be unplugged / resolution changed)
  const disp = screen.getDisplayMatching({ x, y, width: w, height: h });
  const a = disp.workArea;
  return { x: Math.min(Math.max(x, a.x - 20), a.x + a.width - w + 20), y: Math.min(Math.max(y, a.y), a.y + a.height - h + 10) };
}
function defaultPos() {
  const a = screen.getPrimaryDisplay().workArea;
  return { x: a.x + a.width - IDLE.w - 16, y: a.y + a.height - IDLE.h + 4 };   // bottom-right corner
}
function idleBounds() {
  const p = prefs.pos ? allowedPos(prefs.pos.x, prefs.pos.y, IDLE.w, IDLE.h) : defaultPos();
  return { x: Math.round(p.x), y: Math.round(p.y), width: IDLE.w, height: IDLE.h };
}
function stageBounds() {
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()), a = d.workArea;   // the monitor you are working on
  const h = Math.min(460, a.height);
  return { x: a.x, y: a.y + a.height - h, width: a.width, height: h };
}

// ------------------------------------------------------------------ windows
function createOverlay() {
  overlay = new BrowserWindow({
    ...idleBounds(), transparent: true, frame: false, hasShadow: false, resizable: false, movable: false, skipTaskbar: true,
    alwaysOnTop: true, focusable: false, show: false, fullscreenable: false, minimizable: false, maximizable: false, backgroundColor: '#00000000', icon: icon(), title: 'TFI Heroes Companion',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, additionalArguments: ['--role=overlay'] },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');           // above normal windows, taskbar and most full-screen windows
  overlay.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
  overlay.loadURL(`${BASE}/overlay.html`);
  overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  overlay.on('closed', () => { overlay = null; });
  // Windows can drop topmost status (e.g. after another topmost app); re-assert periodically while visible.
  setInterval(() => { if (overlay && overlay.isVisible()) overlay.setAlwaysOnTop(true, 'screen-saver'); }, 5000);
}
function showIdle() {
  if (!overlay) return;
  inStage = false;
  overlay.setBounds(idleBounds());
  if (prefs.visible) overlay.showInactive(); else overlay.hide();
  overlay.setIgnoreMouseEvents(!!prefs.clickThrough);
}
function createDashboard(show = true) {
  if (dash && !dash.isDestroyed()) { if (show) { dash.show(); dash.focus(); } return; }
  dash = new BrowserWindow({
    width: 1280, height: 820, minWidth: 380, show: false, icon: icon(), title: 'TFI Heroes', backgroundColor: '#0b1020', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, additionalArguments: ['--role=dashboard'] },
  });
  dash.loadURL(`${BASE}/?desktop=1#/home`);
  dash.once('ready-to-show', () => { if (show) dash.show(); });
  dash.on('close', (e) => { if (!quitting) { e.preventDefault(); dash.hide(); } });   // closing the dashboard ≠ exiting the app
  dash.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
}
const openDash = (hash, cmd) => {
  createDashboard(true);
  const go = () => tell(dash, cmd || { cmd: 'go', hash });
  dash.webContents.isLoading() ? dash.webContents.once('did-finish-load', go) : go();
};

// ------------------------------------------------------------------ menu / tray (same actions in both)
function buildMenu() {
  return Menu.buildFromTemplate([
    { label: 'Open Reminder Dashboard', click: () => openDash('#/home') },
    { label: 'Create Reminder', click: () => openDash('#/reminders', { cmd: 'new-reminder' }) },
    { label: 'Change Hero', click: () => openDash('#/gallery') },
    { label: 'Change Costume', click: () => openDash('#/studio') },
    { type: 'separator' },
    { label: 'Show Avatar', visible: !prefs.visible, click: () => setVisible(true) },
    { label: 'Hide Avatar', visible: prefs.visible, click: () => setVisible(false) },
    { label: 'Pause Animations', visible: !status.paused, click: () => tell(overlay, { cmd: 'pause', value: true }) },
    { label: 'Resume Animations', visible: status.paused, click: () => tell(overlay, { cmd: 'pause', value: false }) },
    { label: 'Enable Reminders', visible: !status.masterOn, click: () => tell(overlay, { cmd: 'master', value: true }) },
    { label: 'Disable Reminders', visible: status.masterOn, click: () => tell(overlay, { cmd: 'master', value: false }) },
    { type: 'separator' },
    { label: 'Preview a reminder', click: () => tell(overlay, { cmd: 'test' }) },
    { label: 'Click-through when idle', type: 'checkbox', checked: !!prefs.clickThrough, click: (i) => { prefs.clickThrough = i.checked; savePrefs(); } },
    { label: 'Start with Windows', type: 'checkbox', checked: autoStartOn() || !!prefs.autoStart, click: (i) => setAutoStart(i.checked) },
    { type: 'separator' },
    { label: 'Exit Application', click: () => quit() },
  ]);
}
function setVisible(v) {
  prefs.visible = v; savePrefs();
  if (!overlay || inStage) return;
  if (v) overlay.showInactive(); else overlay.hide();
}
function quit() { quitting = true; app.quit(); }

// ------------------------------------------------------------------ IPC
const fromOverlay = (e) => overlay && e.sender === overlay.webContents;
ipcMain.on('status', (e, s) => { status = { ...status, ...s }; tray?.setContextMenu(buildMenu()); tray?.setToolTip(`TFI Heroes — ${status.hero || ''}${status.masterOn ? '' : ' (reminders paused)'}`); });
ipcMain.on('shape', (e, rects) => { if (fromOverlay(e) && Array.isArray(rects) && rects.length) overlay.setShape(rects); });
ipcMain.on('keyboard', (e, on) => {
  if (!fromOverlay(e)) return;
  kbd = !!on;
  overlay.setFocusable(kbd);               // only while a date/text input in a follow-up panel needs typing
  if (kbd) overlay.focus(); else overlay.blur();
});
ipcMain.on('drag-start', (e) => { if (!fromOverlay(e) || inStage) return; const b = overlay.getBounds(), c = screen.getCursorScreenPoint(); drag = { dx: c.x - b.x, dy: c.y - b.y }; });
ipcMain.on('drag-move', (e) => { if (!fromOverlay(e) || !drag) return; const c = screen.getCursorScreenPoint(); overlay.setPosition(Math.round(c.x - drag.dx), Math.round(c.y - drag.dy)); });
ipcMain.on('drag-end', (e, p) => {
  if (!fromOverlay(e)) return;
  if (drag && p?.moved) { const [x, y] = overlay.getPosition(); prefs.pos = { x, y }; savePrefs(); }
  drag = null;
});
ipcMain.on('menu', (e) => { if (fromOverlay(e) && !inStage) buildMenu().popup({ window: overlay }); });

ipcMain.handle('stage-open', (e, info) => {
  if (!fromOverlay(e)) return;
  inStage = true; stageShown = false; drag = null;
  overlay.setIgnoreMouseEvents(false);
  overlay.setBounds(stageBounds());
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.showInactive();                  // appear without taking keyboard focus from the app you are typing in
  // Fallback: if the overlay cannot be shown (no confirmation of a rendered frame), raise a Windows notification instead.
  clearTimeout(stageTimer);
  stageTimer = setTimeout(() => { if (!stageShown || !overlay?.isVisible()) toast(info.title || 'Reminder', info.message || 'The hero could not be shown on top of the current app.'); }, 4000);
});
ipcMain.on('stage-shown', (e) => { if (fromOverlay(e)) stageShown = true; });
ipcMain.handle('stage-close', (e) => { if (!fromOverlay(e)) return; clearTimeout(stageTimer); showIdle(); });
ipcMain.on('notify', (e, n) => { if (fromOverlay(e)) toast(n.title, n.body); });
ipcMain.on('log', (e, m) => log('renderer:', m));
ipcMain.on('ready', () => { log('overlay ready'); if (prefs.visible) overlay?.showInactive(); });
ipcMain.on('cmd-overlay', (e, c) => tell(overlay, c));
ipcMain.on('quit', () => quit());
ipcMain.handle('prefs-get', () => ({ visible: prefs.visible, clickThrough: !!prefs.clickThrough, autoStart: autoStartOn() || !!prefs.autoStart }));
ipcMain.handle('prefs-set', (e, p) => {
  if ('visible' in p) setVisible(!!p.visible);
  if ('clickThrough' in p) { prefs.clickThrough = !!p.clickThrough; savePrefs(); }
  if ('autoStart' in p) setAutoStart(!!p.autoStart);
  return true;
});

function toast(title, body) {
  try { const n = new Notification({ title, body, icon: icon() }); n.on('click', () => openDash('#/home')); n.show(); } catch (e) { console.error('toast', e); }
}

// ------------------------------------------------------------------ power: sleep / wake / lock
function wirePower() {
  powerMonitor.on('suspend', () => log('suspend'));
  powerMonitor.on('resume', () => { log('resume'); setTimeout(() => { overlay?.setAlwaysOnTop(true, 'screen-saver'); tell(overlay, { cmd: 'catchup', reason: 'resume' }); }, 1500); });
  powerMonitor.on('unlock-screen', () => { log('unlock'); tell(overlay, { cmd: 'catchup', reason: 'unlock' }); });
  powerMonitor.on('lock-screen', () => log('lock'));
  screen.on('display-metrics-changed', () => { if (overlay && !inStage) overlay.setBounds(idleBounds()); });
  screen.on('display-removed', () => { if (overlay && !inStage) overlay.setBounds(idleBounds()); });
  screen.on('display-added', () => { if (overlay && !inStage) overlay.setBounds(idleBounds()); });
}

// ------------------------------------------------------------------ boot
async function startServer() {
  process.env.PORT = String(PORT);
  process.env.DATA_DIR = path.join(app.getPath('userData'), 'server-data');
  await import(require('url').pathToFileURL(path.join(__dirname, '..', 'server', 'server.js')).href);
}

app.on('second-instance', () => openDash('#/home'));
app.on('window-all-closed', (e) => e.preventDefault?.());      // tray app: stay alive with no windows
app.on('before-quit', () => { quitting = true; });

app.whenReady().then(async () => {
  loadPrefs();
  if (process.argv.includes('--enable-autostart')) setAutoStart(true);
  app.setAppUserModelId('com.tfiheroes.companion');
  await startServer();
  tray = new Tray(icon().resize({ width: 16, height: 16 }));
  tray.setToolTip('TFI Heroes');
  tray.setContextMenu(buildMenu());
  tray.on('click', () => openDash('#/home'));
  createOverlay();
  createDashboard(!hiddenStart);
  wirePower();
  if (TEST) { global.__tfi = { get prefs() { return prefs; }, get overlay() { return overlay; }, get dash() { return dash; }, get inStage() { return inStage; } }; }
});
