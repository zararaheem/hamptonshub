// Generates a 512x512 themed anchor logo PNG (no external deps).
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const W = 512, H = 512;
const buf = Buffer.alloc(W * H * 4);

// palette
const tealTop = [16, 71, 77];     // #10474d
const tealBot = [9, 38, 43];      // #09262b
const cream   = [242, 231, 208];  // oyster
const coral   = [226, 101, 74];   // accent

const lerp = (a, b, t) => a + (b - a) * t;
function over(dst, src, cov) { // composite src(rgb) over dst with coverage
  return [lerp(dst[0], src[0], cov), lerp(dst[1], src[1], cov), lerp(dst[2], src[2], cov)];
}
function sdSeg(px, py, ax, ay, bx, by) {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  let h = (pax * bax + pay * bay) / (bax * bax + bay * bay);
  h = Math.max(0, Math.min(1, h));
  return Math.hypot(pax - bax * h, pay - bay * h);
}
function qbez(p0, p1, p2, t) {
  const mt = 1 - t;
  return [mt*mt*p0[0] + 2*mt*t*p1[0] + t*t*p2[0], mt*mt*p0[1] + 2*mt*t*p1[1] + t*t*p2[1]];
}
function triCov(px, py, A, B, C) {
  const d = (a, b, c) => (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]);
  const d1 = d(A, B, C), d2 = d(B, C, A), d3 = d(C, A, B);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return (neg && pos) ? 0 : 1;
}
const cov = (sd) => Math.max(0, Math.min(1, 0.5 - sd)); // ~1px AA

// arm segments (two quadratic curves forming the bottom crescent)
const armSegs = [];
function pushBez(p0, p1, p2) {
  let prev = qbez(p0, p1, p2, 0);
  for (let i = 1; i <= 48; i++) { const cur = qbez(p0, p1, p2, i / 48); armSegs.push([prev, cur]); prev = cur; }
}
pushBez([150, 298], [168, 402], [256, 396]);
pushBez([362, 298], [344, 402], [256, 396]);

// flukes (coral barbs at the arm tips)
const fluL = [[150, 308], [100, 286], [166, 246]];
const fluR = [[362, 308], [412, 286], [346, 246]];

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const px = x + 0.5, py = y + 0.5;
    // background gradient
    const t = y / H;
    let col = [lerp(tealTop[0], tealBot[0], t), lerp(tealTop[1], tealBot[1], t), lerp(tealTop[2], tealBot[2], t)];

    // faint rope ring
    const ring = Math.abs(Math.hypot(px - 256, py - 256) - 232) - 2.5;
    col = over(col, cream, cov(ring) * 0.4);

    // anchor (cream) — union of parts
    let sd = 1e9;
    sd = Math.min(sd, Math.abs(Math.hypot(px - 256, py - 118) - 34) - 11); // top ring
    sd = Math.min(sd, sdSeg(px, py, 256, 150, 256, 394) - 13);            // shank
    sd = Math.min(sd, sdSeg(px, py, 176, 198, 336, 198) - 11);           // stock
    for (const [a, b] of armSegs) sd = Math.min(sd, sdSeg(px, py, a[0], a[1], b[0], b[1]) - 13);
    col = over(col, cream, cov(sd));

    // coral flukes
    const fc = Math.max(triCov(px, py, ...fluL), triCov(px, py, ...fluR));
    col = over(col, coral, fc);

    const i = (y * W + x) * 4;
    buf[i] = Math.round(col[0]); buf[i+1] = Math.round(col[1]); buf[i+2] = Math.round(col[2]); buf[i+3] = 255;
  }
}

// ---- encode PNG ----
function crcTable() { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; }
const CRC = crcTable();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
const raw = Buffer.alloc(H * (W * 4 + 1));
for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 0; buf.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4); }
const idat = zlib.deflateSync(raw, { level: 9 });
const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
const out = path.join(__dirname, 'anchor-logo.png');
fs.writeFileSync(out, png);
console.log('wrote', out, png.length, 'bytes');
