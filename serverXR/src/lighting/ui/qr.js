'use strict';
// A QR encoder for exactly one job: putting the desk's phone URL on screen so a phone
// can join over whatever network tonight happens to be, without anyone typing an IP.
//
// Deliberately fixed-shape: version 3 (29×29), error level M, mask 0. One shape means the
// whole geometry can be ASSERTED — after the function patterns are drawn, the free module
// count must be exactly the 560 data bits version 3-M carries, and the Reed-Solomon
// codeword must divide cleanly by its generator. If either fails the encoder throws
// rather than rendering a confident-looking square that no camera will read — an
// unscannable QR is invisible breakage of exactly the kind this project refuses to ship.
// Capacity is 42 bytes, which fits any `http://a.b.c.d:ppppp/#touch`; longer text returns
// null and the caller falls back to showing the URL as text.
//
// Format bits for (M, mask 0) are 0x5412 — the worked example in the ISO spec itself.

(function () {
  const SIZE = 29;              // version 3
  const DATA_CODEWORDS = 44;    // v3-M: 70 total, 26 ECC, one block
  const ECC_CODEWORDS = 26;
  const FORMAT_BITS = 0x5412;   // ECC level M, mask pattern 0

  // GF(256) with the QR polynomial 0x11D.
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1; if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const gmul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

  // Generator polynomial of degree ECC_CODEWORDS: Π (x − α^i).
  function generator() {
    let g = [1];
    for (let i = 0; i < ECC_CODEWORDS; i++) {
      const next = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) {
        next[j] ^= gmul(g[j], EXP[i]);
        next[j + 1] ^= g[j];
      }
      g = next;
    }
    return g.reverse();          // highest power first
  }

  function eccFor(data) {
    const gen = generator();
    const rem = new Uint8Array(ECC_CODEWORDS);
    for (const byte of data) {
      const factor = byte ^ rem[0];
      rem.copyWithin(0, 1); rem[ECC_CODEWORDS - 1] = 0;
      for (let i = 0; i < ECC_CODEWORDS; i++) rem[i] ^= gmul(gen[i + 1], factor);
    }
    return rem;
  }

  // The whole codeword must be divisible by the generator — this catches a table or
  // arithmetic slip in a way nothing visual can.
  function verify(codewords) {
    const gen = generator();
    const rem = new Uint8Array(ECC_CODEWORDS);
    for (const byte of codewords) {
      const factor = byte ^ rem[0];
      rem.copyWithin(0, 1); rem[ECC_CODEWORDS - 1] = 0;
      for (let i = 0; i < ECC_CODEWORDS; i++) rem[i] ^= gmul(gen[i + 1], factor);
    }
    if (rem.some((b) => b !== 0)) throw new Error('QR: Reed-Solomon self-check failed');
  }

  function makeQr(text) {
    const bytes = new TextEncoder().encode(text);
    if (bytes.length > DATA_CODEWORDS - 2) return null;   // mode+length overhead

    // ---- bit stream: mode 0100, 8-bit count, data, terminator, pad
    const bits = [];
    const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    push(0b0100, 4);
    push(bytes.length, 8);
    for (const b of bytes) push(b, 8);
    push(0, Math.min(4, DATA_CODEWORDS * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      data.push(bits.slice(i, i + 8).reduce((a, b) => a * 2 + b, 0));
    }
    for (let pad = 0xec; data.length < DATA_CODEWORDS; pad ^= 0xec ^ 0x11) data.push(pad);

    const ecc = eccFor(data);
    const codewords = [...data, ...ecc];
    verify(codewords);

    // ---- matrix with function patterns; `reserved` marks non-data modules
    const m = Array.from({ length: SIZE }, () => new Array(SIZE).fill(false));
    const reserved = Array.from({ length: SIZE }, () => new Array(SIZE).fill(false));
    const set = (r, c, v) => { m[r][c] = !!v; reserved[r][c] = true; };

    function finder(r0, c0) {
      for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
        const rr = r0 + r, cc = c0 + c;
        if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) continue;
        const inRing = r >= 0 && r <= 6 && c >= 0 && c <= 6 && (r === 0 || r === 6 || c === 0 || c === 6);
        const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        set(rr, cc, inRing || inCore);
      }
    }
    finder(0, 0); finder(0, SIZE - 7); finder(SIZE - 7, 0);

    for (let i = 8; i < SIZE - 8; i++) {          // timing
      set(6, i, i % 2 === 0);
      set(i, 6, i % 2 === 0);
    }
    for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) {  // alignment at (22,22)
      set(22 + r, 22 + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
    }
    set(SIZE - 8, 8, true);                       // the always-dark module

    // format bits, both copies (Nayuki's layout of the spec's figure)
    const fb = (i) => (FORMAT_BITS >> i) & 1;
    for (let i = 0; i <= 5; i++) set(8, i, fb(i));
    set(8, 7, fb(6)); set(8, 8, fb(7)); set(7, 8, fb(8));
    for (let i = 9; i <= 14; i++) set(14 - i, 8, fb(i));
    // Copy 2: bits 0..7 run along row 8 from the right edge, bits 8..14 down column 8 at
    // the bottom. Getting these two halves swapped collides with the dark module — the
    // geometry assertion below is what caught exactly that.
    for (let i = 0; i <= 7; i++) set(8, SIZE - 1 - i, fb(i));
    for (let i = 8; i <= 14; i++) set(SIZE - 15 + i, 8, fb(i));

    // ---- the geometry assertion: version 3 carries 560 codeword bits plus 7 remainder
    // bits, so exactly 567 modules must be free — anything else means a function pattern
    // is misplaced and no camera would read the result.
    let free = 0;
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!reserved[r][c]) free++;
    if (free !== DATA_CODEWORDS * 8 + ECC_CODEWORDS * 8 + 7) {
      throw new Error(`QR: function-pattern layout is wrong (${free} free modules, expected 567)`);
    }

    // ---- zigzag placement, mask 0 applied as we go
    let bitIdx = 0;
    const bitAt = (i) => (codewords[i >> 3] >> (7 - (i & 7))) & 1;
    for (let right = SIZE - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;                 // timing column is skipped whole
      for (let vert = 0; vert < SIZE; vert++) {
        for (let j = 0; j < 2; j++) {
          const c = right - j;
          const upward = ((right + 1) & 2) === 0;
          const r = upward ? SIZE - 1 - vert : vert;
          if (reserved[r][c]) continue;
          let v = bitIdx < codewords.length * 8 ? bitAt(bitIdx) : 0;
          bitIdx++;
          if ((r + c) % 2 === 0) v ^= 1;          // mask 0
          m[r][c] = !!v;
        }
      }
    }
    return m;
  }

  // SVG string, quiet zone included. Colours come from the caller so the panel decides
  // legibility — a QR must be dark-on-light to scan reliably, whatever the page theme.
  function qrSvg(text, px) {
    const m = makeQr(text);
    if (!m) return null;
    const q = 4, n = SIZE + q * 2;
    let rects = '';
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      if (m[r][c]) rects += `<rect x="${c + q}" y="${r + q}" width="1" height="1"/>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#ffffff"/><g fill="#000000">${rects}</g></svg>`;
  }

  window.qrSvg = qrSvg;
})();
