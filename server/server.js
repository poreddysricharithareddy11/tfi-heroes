// Zero-framework Node server: serves the app and (optionally) delivers Web Push so reminders can reach a device
// while no browser tab is open. Client state remains authoritative; the server only holds a copy of the schedule.
//
//   npm install && npm start      -> http://localhost:3000
//
// Web Push needs HTTPS (localhost is exempt). To expose it to your phone, put this behind HTTPS (reverse proxy / tunnel).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { effectiveDue, consume, isQuiet, MIN } from '../public/js/scheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');
const DATA = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const PORT = Number(process.env.PORT) || 3000;
const PUSH_WINDOW = 10 * MIN; // don't push reminders that are already this stale

fs.mkdirSync(DATA, { recursive: true });

let webpush = null;
try { webpush = (await import('web-push')).default; } catch { console.warn('web-push not installed: push disabled (run npm install).'); }

const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch { return d; } };
const writeJSON = (f, v) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(v, null, 1));

let vapid = readJSON('vapid.json', null);
if (webpush) {
  if (!vapid) { vapid = webpush.generateVAPIDKeys(); writeJSON('vapid.json', vapid); }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:reminders@localhost.invalid', vapid.publicKey, vapid.privateKey);
}
const clients = readJSON('clients.json', {});
const save = () => writeJSON('clients.json', clients);

// ------------------------------------------------------------------ push loop
async function pushLoop() {
  const now = Date.now();
  let changed = false;
  for (const [cid, c] of Object.entries(clients)) {
    if (!c.subscription || !c.settings?.masterOn || c.settings.notifications === false) continue;
    c.pushed ||= {};
    for (const r of c.reminders || []) {
      if (!r.enabled) continue;
      for (let g = 0; g < 20; g++) {
        const d = effectiveDue(r);
        if (d == null || d > now) break;
        const key = `${r.id}:${d}`;
        const stale = now - d > PUSH_WINDOW;
        const quiet = isQuiet(now, c.settings.quiet, c.settings.timezone) && r.priority !== 'high';
        if (!stale && !quiet && !c.pushed[key]) {
          c.pushed[key] = now;
          try {
            await webpush.sendNotification(c.subscription, JSON.stringify({
              title: `${r.heroName || 'Your hero'}: ${r.title}`, body: r.message || `Time for: ${r.title}`, rid: r.id, due: d, tag: `r-${r.id}-${d}`,
            }), { TTL: 600, urgency: 'high' });
            console.log(`[push] ${r.title} -> ${cid.slice(0, 8)}`);
          } catch (e) {
            if (e.statusCode === 404 || e.statusCode === 410) { console.log('[push] subscription expired, removing'); delete c.subscription; }
            else console.warn('[push] failed', e.statusCode || e.message);
          }
        }
        consume(r, d, now); changed = true;     // advance our copy so recurring reminders keep going while the app is closed
        if (!c.subscription) break;
      }
    }
    for (const k of Object.keys(c.pushed)) if (now - c.pushed[k] > 2 * 864e5) delete c.pushed[k];
  }
  if (changed) save();
}
if (webpush) setInterval(() => pushLoop().catch((e) => console.error('pushLoop', e)), 10000);

// ------------------------------------------------------------------ http
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon' };
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-cache' }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };

function readBody(req, limit = 2e6) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', (c) => { n += c.length; if (n > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/api/health') return send(res, 200, { ok: true, push: !!webpush, time: Date.now() });
    if (url.pathname === '/api/vapid-public-key') return webpush ? send(res, 200, { key: vapid.publicKey }) : send(res, 503, { error: 'push disabled' });
    if (url.pathname === '/api/sync' && req.method === 'POST') {
      const b = JSON.parse(await readBody(req));
      if (!b.clientId || typeof b.clientId !== 'string' || !Array.isArray(b.reminders)) return send(res, 400, { error: 'bad request' });
      const prev = clients[b.clientId] || {};
      clients[b.clientId] = { subscription: b.subscription || prev.subscription || null, settings: b.settings || {}, reminders: b.reminders, pushed: prev.pushed || {}, updated: Date.now() };
      if (b.subscription === null) clients[b.clientId].subscription = null;
      save();
      return send(res, 200, { ok: true });
    }
    // static
    let p = decodeURIComponent(url.pathname);
    if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(PUBLIC, p));
    if (!file.startsWith(PUBLIC)) return send(res, 403, 'Forbidden', 'text/plain');
    fs.readFile(file, (err, buf) => {
      if (err) return send(res, 404, 'Not found', 'text/plain');
      send(res, 200, buf, MIME[path.extname(file)] || 'application/octet-stream');
    });
  } catch (e) { send(res, 500, { error: String(e.message || e) }); }
});

server.listen(PORT, () => console.log(`TFI Heroes reminders running at http://localhost:${PORT}  (push ${webpush ? 'enabled' : 'disabled'})`));
