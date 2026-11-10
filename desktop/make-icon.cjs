// Generates desktop/icon.png (64x64 gradient disc with a star-ish mark) — no external assets.
const zlib = require('zlib'), fs = require('fs');
const N = 64, raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) { raw[y * (N * 4 + 1)] = 0; for (let x = 0; x < N; x++) {
  const dx = x - 31.5, dy = y - 31.5, d = Math.hypot(dx, dy), o = y * (N * 4 + 1) + 1 + x * 4;
  const a = d < 30 ? 255 : d < 31.5 ? Math.round((31.5 - d) * 255 / 1.5) : 0;
  const t = (x + y) / (2 * N), star = Math.abs(dx) + Math.abs(dy) < 14 || (Math.abs(dx) < 3 && Math.abs(dy) < 22) || (Math.abs(dy) < 3 && Math.abs(dx) < 22);
  const c = star ? [255, 214, 10] : [Math.round(124 - 124 * t), Math.round(92 + 117 * t), Math.round(255)];
  raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; raw[o + 3] = a; } }
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = ~0; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ih = Buffer.alloc(13); ih.writeUInt32BE(N, 0); ih.writeUInt32BE(N, 4); ih[8] = 8; ih[9] = 6;
fs.writeFileSync(__dirname + '/icon.png', Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
