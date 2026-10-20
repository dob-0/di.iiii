'use strict';
// Writes what a node build consumes from di: the desk UI files, a manifest that pins them,
// and the generic profiles a node carries. Reproducible: same commit, same bytes.
//   npm run desk:bundle [-- --out <dir>] [--gz node|python]     default build/desk-bundle/, node
//
//   <out>/ui/*              the files desk.js serves, byte for byte (every file in ui/)
//   <out>/manifest.json     di_commit, contract_version, files[{path,bytes,sha256,gz_bytes,gz_sha256}]
//   <out>/profiles-node.json  the node's profiles, read from engine.js PROFILES (no copy)
//
// gz is gzip level 9, mtime 0, no file name, OS byte 255: the stream python's gzip module
// writes. MEASURED: node's bundled zlib (Chromium's fork) does not deflate to the same bytes
// as python's zlib (qr.js: 3106 vs 3101), so the gz fields only match vizzz.di's
// tools/fetch_desk_ui.py when made by python's gzip: `--gz python` does that (python3 on PATH).
// The default is node's zlib; the manifest's gz_producer says which made the numbers. The raw
// sha256 is identical either way, and it is what a node build must check. No built_at: the
// manifest is a function of the commit and the producer.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const LIGHTING = path.join(__dirname, '..');
const REPO = path.join(LIGHTING, '..', '..', '..');
const UI_DIR = path.join(LIGHTING, 'ui');
const ENGINE = 'serverXR/src/lighting/engine.js';

// The 13 profiles a node carries, in the order the node lists them.
const NODE_PROFILES = ['dimmer', 'ds', 'drgb', 'drgbs', 'drgbw', 'drgbwa', 'rgb', 'rgba', 'rgbw', 'rgbaw', 'dwwcw', 'ptdrgb', 'ppttdrgbw'];

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const PY_GZ = 'import sys,gzip,io\nb=io.BytesIO()\n'
  + "with gzip.GzipFile(filename='',mode='wb',fileobj=b,compresslevel=9,mtime=0) as g: g.write(sys.stdin.buffer.read())\n"
  + 'sys.stdout.buffer.write(b.getvalue())\n';

function gz9(raw, producer = 'node') {
  if (producer === 'python') {
    return execFileSync('python3', ['-I', '-c', PY_GZ], { input: raw, maxBuffer: 64 << 20 });
  }
  const head = Buffer.from([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 2, 0xff]);   // flags 0, mtime 0, xfl 2 (best), os 255
  const body = zlib.deflateRawSync(raw, { level: 9, memLevel: 8 });
  const tail = Buffer.alloc(8);
  tail.writeUInt32LE(crc32(raw), 0);
  tail.writeUInt32LE(raw.length >>> 0, 4);
  return Buffer.concat([head, body, tail]);
}

function gitCommit() {
  const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    const sha = git('rev-parse', 'HEAD');
    // Only the files the bundle reads decide whether the commit names them.
    const dirty = git('status', '--porcelain', '--', 'serverXR/src/lighting/ui', ENGINE, 'serverXR/src/lighting/api-contract.json');
    return dirty ? sha + '-dirty' : sha;
  } catch (e) {
    return 'unknown';
  }
}

function gzProducer(producer) {
  if (producer === 'python') {
    const v = execFileSync('python3', ['-I', '-c', 'import zlib;print(zlib.ZLIB_RUNTIME_VERSION)'], { encoding: 'utf8' }).trim();
    return 'python3 zlib ' + v;
  }
  return 'node zlib ' + process.versions.zlib;
}

function build({ commit = gitCommit(), gz: producer = 'node' } = {}) {
  const contract = JSON.parse(fs.readFileSync(path.join(LIGHTING, 'api-contract.json'), 'utf8'));
  const names = fs.readdirSync(UI_DIR, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name).sort();
  const files = [];
  const blobs = {};
  for (const name of names) {
    const raw = fs.readFileSync(path.join(UI_DIR, name));
    const gz = gz9(raw, producer);
    blobs[name] = raw;
    files.push({ path: name, bytes: raw.length, sha256: sha256(raw), gz_bytes: gz.length, gz_sha256: sha256(gz) });
  }
  const manifest = { di_commit: commit, contract_version: contract.contract_version, gz_producer: gzProducer(producer), files };

  const { PROFILES } = require('../engine');
  const profiles = NODE_PROFILES.map((name) => {
    const p = PROFILES[name];
    if (!p || !p.builtin) throw new Error('engine.js has no built-in profile "' + name + '"');
    return { name, cat: p.cat, label: p.label, channels: p.channels.slice() };
  });
  const profilesNode = { source: { file: ENGINE, di_commit: commit }, profiles };
  return { manifest, profilesNode, blobs };
}

const json = (o) => JSON.stringify(o, null, 2) + '\n';

function writeBundle(out, opts) {
  const { manifest, profilesNode, blobs } = build(opts);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'ui'), { recursive: true });
  for (const [name, raw] of Object.entries(blobs)) fs.writeFileSync(path.join(out, 'ui', name), raw);
  fs.writeFileSync(path.join(out, 'manifest.json'), json(manifest));
  fs.writeFileSync(path.join(out, 'profiles-node.json'), json(profilesNode));
  return { manifest, profilesNode };
}

// sha256 over every file's relative path and bytes, in path order: one number for a directory.
function hashDir(dir) {
  const h = crypto.createHash('sha256');
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), r);
      else h.update(r + '\0').update(fs.readFileSync(path.join(d, e.name))).update('\0');
    }
  };
  walk(dir, '');
  return h.digest('hex');
}

module.exports = { build, writeBundle, hashDir, gz9, NODE_PROFILES };

if (require.main === module) {
  const i = process.argv.indexOf('--out');
  const out = path.resolve(i > 0 ? process.argv[i + 1] : path.join(REPO, 'build', 'desk-bundle'));
  const g = process.argv.indexOf('--gz');
  const { manifest, profilesNode } = writeBundle(out, g > 0 ? { gz: process.argv[g + 1] } : {});
  console.log('desk bundle at ' + out + '\n  di_commit ' + manifest.di_commit + ', contract ' + manifest.contract_version
    + '\n  ' + manifest.files.length + ' ui files: ' + manifest.files.map((f) => f.path).join(' ')
    + '\n  ' + profilesNode.profiles.length + ' profiles\n  dir sha256 ' + hashDir(out));
}
