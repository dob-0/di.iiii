'use strict';
// The desk bundle (tools/desk-bundle.js): what a node build consumes from di.
// Run with: node serverXR/src/lighting/tests/test-bundle.js

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { writeBundle, hashDir, gz9, NODE_PROFILES } = require('../tools/desk-bundle');
const { PROFILES } = require('../engine');

let failures = 0;
const tests = [];
const check = (name, fn) => tests.push({ name, fn });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-bundle-'));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const a = path.join(tmp, 'a');
const b = path.join(tmp, 'b');
const made = writeBundle(a, { commit: COMMIT });
writeBundle(b, { commit: COMMIT });
const uiDir = path.join(__dirname, '..', 'ui');

check('two runs give byte-identical output (whole directory hashed)', () => {
  assert.strictEqual(hashDir(a), hashDir(b));
});

check('the manifest has its shape, and its numbers are the files', () => {
  const m = JSON.parse(fs.readFileSync(path.join(a, 'manifest.json'), 'utf8'));
  assert.deepStrictEqual(Object.keys(m), ['di_commit', 'contract_version', 'gz_producer', 'files']);
  assert.strictEqual(m.di_commit, COMMIT);
  assert.strictEqual(m.contract_version, JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'api-contract.json'), 'utf8')).contract_version);
  assert.ok(!('built_at' in m));
  assert.deepStrictEqual(m.files.map((f) => f.path), fs.readdirSync(uiDir).sort(), 'every ui file, sorted');
  for (const f of m.files) {
    assert.deepStrictEqual(Object.keys(f), ['path', 'bytes', 'sha256', 'gz_bytes', 'gz_sha256']);
    const raw = fs.readFileSync(path.join(a, 'ui', f.path));
    assert.ok(raw.equals(fs.readFileSync(path.join(uiDir, f.path))), f.path + ' is served bytes');
    assert.strictEqual(f.bytes, raw.length);
    assert.strictEqual(f.sha256, sha(raw));
    const gz = gz9(raw);
    assert.strictEqual(f.gz_bytes, gz.length);
    assert.strictEqual(f.gz_sha256, sha(gz));
  }
});

check('the gzip is level 9, mtime 0, no name, os 255, and inflates back', () => {
  const raw = fs.readFileSync(path.join(uiDir, 'app.js'));
  const gz = gz9(raw);
  assert.strictEqual(gz.subarray(0, 10).toString('hex'), '1f8b0800000000000' + '2ff');
  assert.ok(zlib.gunzipSync(gz).equals(raw));
});

check('every profile in profiles-node.json equals di PROFILES, name, category and channel order', () => {
  const p = JSON.parse(fs.readFileSync(path.join(a, 'profiles-node.json'), 'utf8'));
  assert.strictEqual(p.source.file, 'serverXR/src/lighting/engine.js');
  assert.strictEqual(p.source.di_commit, COMMIT);
  assert.deepStrictEqual(p.profiles.map((x) => x.name), NODE_PROFILES);
  assert.strictEqual(p.profiles.length, 13);
  for (const x of p.profiles) {
    const e = PROFILES[x.name];
    assert.ok(e && e.builtin, x.name + ' is a built-in of engine.js');
    assert.deepStrictEqual(x.channels, e.channels, x.name);
    assert.strictEqual(x.cat, e.cat);
    assert.strictEqual(x.label, e.label);
  }
});

check('the output holds nothing but ui/, manifest.json, profiles-node.json', () => {
  assert.deepStrictEqual(fs.readdirSync(a).sort(), ['manifest.json', 'profiles-node.json', 'ui']);
  assert.ok(made.manifest.files.length >= 7);
});

(async () => {
  for (const t of tests) {
    try { await t.fn(); console.log('  ok  ' + t.name); } catch (e) { failures++; console.log('  FAIL ' + t.name + '\n       ' + (e.message || e)); }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('');
  console.log(failures ? '  ' + failures + ' failing' : '  all passing');
  process.exit(failures ? 1 : 0);
})();
