#!/usr/bin/env node
// render-loops.mjs - seamless generative video loops from fragment shaders, frame by frame.
// Usage: node render-loops.mjs <spec.json> [--only name[,name]] [--stills N]
// --stills N: N evenly spaced phases of every loop as PNG into OUT/stills/NAME-K.png (K = 1..N, phase (K-1)/N); no ffmpeg, no mp4.
// Method: Playwright's own headless Chromium (software GL), time = loop phase i/N, PNG frames piped to ffmpeg.
// Licence: repo licence (our own work). No production names here: they live in the spec only.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, '../../../package.json'));
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const specPath = args.find((a, i) => !a.startsWith('--') && !(i > 0 && ['--only', '--stills'].includes(args[i - 1])));
if (!specPath) { console.error('usage: render-loops.mjs spec.json [--only a,b]'); process.exit(2); }
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const stills = args.includes('--stills') ? parseInt(args[args.indexOf('--stills') + 1], 10) : 0;
if (args.includes('--stills') && !(stills >= 1)) { console.error('--stills needs a whole number >= 1'); process.exit(2); }
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const { width: W, height: H } = spec.size, FPS = spec.fps, BPM = spec.bpm;
const outDir = path.resolve(path.dirname(specPath), spec.out || 'out');
mkdirSync(outDir, { recursive: true });

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const prelude = readFileSync(path.join(here, 'shaders/_prelude.glsl'), 'utf8');
export const frameCount = (bars) => Math.round(bars * 4 * 60 / BPM * FPS);

const browser = await chromium.launch({ headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(`<body style="margin:0"><canvas id=c width=${W} height=${H}></canvas></body>`);
let failed = 0;
try {
  for (const L of spec.loops) {
    if (only && !only.includes(L.name)) continue;
    const t0 = Date.now();
    const frag = prelude + '\n' + readFileSync(path.join(here, 'shaders', L.shader + '.frag'), 'utf8');
    const pal = L.palette || {};
    const ok = await page.evaluate(({ frag, W, H, c0, c1, c2, p }) => {
      const cv = document.getElementById('c');
      const gl = cv.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
      if (!gl) return 'no webgl2';
      const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
      const pr = gl.createProgram();
      gl.attachShader(pr, mk(gl.VERTEX_SHADER, '#version 300 es\nin vec2 a;void main(){gl_Position=vec4(a,0,1);}'));
      gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, frag));
      gl.linkProgram(pr); gl.useProgram(pr);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
      const a = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      const u = (n) => gl.getUniformLocation(pr, n);
      gl.uniform2f(u('uRes'), W, H); gl.uniform3f(u('uC0'), ...c0); gl.uniform3f(u('uC1'), ...c1);
      gl.uniform3f(u('uC2'), ...c2); gl.uniform4f(u('uP'), ...p);
      window.__draw = (ph) => { gl.uniform1f(u('uPhase'), ph); gl.drawArrays(gl.TRIANGLES, 0, 3); return cv.toDataURL('image/png').slice(22); };
      return 'ok';
    }, { frag, W, H, c0: hex(pal.c0 || '#0b0420'), c1: hex(pal.c1 || '#db01a8'), c2: hex(pal.c2 || '#a020c8'),
         p: [...(L.params || []), 0, 0, 0, 0].slice(0, 4) }).catch((e) => String(e.message).slice(0, 600));
    if (ok !== 'ok') { console.error(`FAIL ${L.name}: ${ok}`); failed++; continue; }
    if (stills) {
      const sd = path.join(outDir, 'stills'); mkdirSync(sd, { recursive: true });
      for (let k = 0; k < stills; k++) {
        const b64 = await page.evaluate((ph) => window.__draw(ph), k / stills);
        writeFileSync(path.join(sd, `${L.name}-${k + 1}.png`), Buffer.from(b64, 'base64'));
      }
      console.log(`${L.name}: ${stills} stills, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      continue;
    }
    const N = frameCount(L.bars);
    const file = path.join(outDir, L.name + '.mp4');
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-g', '15', '-r', String(FPS), '-an', '-movflags', '+faststart', file],
      { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((res) => ff.on('close', res));
    for (let i = 0; i < N; i++) {
      const b64 = await page.evaluate((ph) => window.__draw(ph), i / N);
      if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
    const rc = await done;
    if (rc !== 0) failed++;
    console.log(`${L.name}: ${N} frames, ${((Date.now() - t0) / 1000).toFixed(1)} s, ffmpeg rc=${rc}, ${existsSync(file) ? (statSync(file).size / 1e6).toFixed(2) : '?'} MB`);
  }
} finally { await browser.close(); }
process.exit(failed ? 1 : 0);
