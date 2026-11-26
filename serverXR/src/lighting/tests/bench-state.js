'use strict';
// How long GET /api/state takes on a desk holding 80 big looks, and how long the DMX loop is held while it does.
//   node tests/bench-state.js [path/to/lighting/dir]     (default: this directory; Art-Net off, own port, own temp dir)
// Prints the median of 20 plain GETs (after the first) and, when the desk knows looksRev, of 20 with looksRev=current.
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const dirLight = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const { createDesk } = require(path.join(dirLight, 'desk.js'));
const { makeBigLooks } = require('./bigLooks');
const median = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-state-'));
  const desk = createDesk({ dataDir: dir, offline: true, bindPort: 0, outputEnabledDefault: false, log: () => {} });
  const server = http.createServer((req, res) => desk.handle(req, res));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  for (const look of makeBigLooks(80)) { const r = await post('/api/looks/add', { look }); if (!r.ok) throw new Error('add ' + r.status); }
  const get = async (q) => { const t = process.hrtime.bigint(); const r = await fetch(base + '/api/state' + q); const t2 = await r.text(); return { ms: Number(process.hrtime.bigint() - t) / 1e6, bytes: t2.length, body: t2 }; };
  const first = await get('');
  const full = []; for (let i = 0; i < 20; i++) full.push((await get('')).ms);
  const rev = JSON.parse(first.body).looksRev;
  const skip = []; let skipBytes = null;
  if (rev != null) for (let i = 0; i < 20; i++) { const r = await get('?looksRev=' + rev); skip.push(r.ms); skipBytes = r.bytes; }
  const perLook = Math.round(JSON.stringify(makeBigLooks(1)[0]).length / 1024);
  console.log(JSON.stringify({ lighting: dirLight, looks: 80, kBPerLook: perLook, stateBytes: first.bytes, firstMs: +first.ms.toFixed(1), medianFullMs: +median(full).toFixed(1), medianSkipMs: skip.length ? +median(skip).toFixed(1) : null, skipBytes }));
  desk.close(); server.closeAllConnections && server.closeAllConnections(); server.close();
  fs.rmSync(dir, { recursive: true, force: true });
})();
