'use strict';
// Keeps api-contract.json and the desk UI honest with each other.
//   fails, naming the path, when a ui/*.js file calls an api path the contract does not list
//   fails, naming the path, when the contract lists a path no ui file calls
// A literal `post('api/x')` is a POST and `fetch('api/x')` a GET, so the method is checked
// there too; a path handed on through a helper (cueAct, midiSend, firePost) is matched by
// path alone. Run with: npm run lint:api-contract

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const contract = JSON.parse(fs.readFileSync(path.join(root, 'api-contract.json'), 'utf8'));
const uiDir = path.join(root, 'ui');
const problems = [];

// ---- the contract itself ----
if (!Number.isInteger(contract.contract_version) || contract.contract_version < 1) problems.push('contract_version must be an integer from 1');
const have = new Map();
for (const e of contract.entries || []) {
  const key = e.method + ' ' + e.path;
  if (have.has(key)) problems.push('duplicate entry: ' + key);
  have.set(key, e);
  if (!['GET', 'POST'].includes(e.method)) problems.push(key + ': method must be GET or POST');
  if (!['a', 'b', 'c'].includes(e.class)) problems.push(key + ': class must be a, b or c');
  if (!e.reply || typeof e.reply !== 'object') problems.push(key + ': no reply shape');
  if (e.class === 'a' && e.method === 'POST' && !(e.probe && e.probe.body)) problems.push(key + ': a class-a POST needs a probe body');
  if (e.class !== 'a' && !e.node) problems.push(key + ': a class ' + e.class + ' route must say what a node answers');
}

// ---- what the UI calls ----
const called = new Map();      // path -> Set of methods seen ('GET', 'POST', '?')
const where = new Map();       // path -> first file:line
const literal = /(post|fetch)?\(?\s*(['"`])api\/([A-Za-z0-9/_-]*)/g;
for (const f of fs.readdirSync(uiDir).filter((n) => n.endsWith('.js')).sort()) {
  fs.readFileSync(path.join(uiDir, f), 'utf8').split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;   // prose and comments are not calls
    let m;
    literal.lastIndex = 0;
    while ((m = literal.exec(line))) {
      const p = 'api/' + m[3];
      const method = m[1] === 'post' ? 'POST' : m[1] === 'fetch' ? 'GET' : '?';
      if (!called.has(p)) { called.set(p, new Set()); where.set(p, f + ':' + (i + 1)); }
      called.get(p).add(method);
    }
  });
}

for (const [p, methods] of called) {
  const listed = [...have.keys()].filter((k) => k.slice(k.indexOf(' ') + 1) === p);
  if (!listed.length) { problems.push('not in the contract: ' + p + '  (called at ' + where.get(p) + ')'); continue; }
  for (const mt of methods) {
    if (mt !== '?' && !have.has(mt + ' ' + p)) problems.push('contract has no ' + mt + ' ' + p + '  (called at ' + where.get(p) + ')');
  }
}
const calledPaths = new Set(called.keys());
for (const k of have.keys()) {
  const p = k.slice(k.indexOf(' ') + 1);
  if (!calledPaths.has(p)) problems.push('in the contract but no ui file calls it: ' + k);
}

if (problems.length) {
  console.error('api-contract: ' + problems.length + ' problem' + (problems.length === 1 ? '' : 's'));
  problems.forEach((p) => console.error('  ' + p));
  process.exit(1);
}
console.log('api-contract: ok — ' + have.size + ' routes in the contract, ' + called.size + ' distinct paths in ui/*.js, contract_version ' + contract.contract_version);
