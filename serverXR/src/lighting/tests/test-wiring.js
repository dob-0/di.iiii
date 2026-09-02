'use strict';
// Does the interface actually reach the things it thinks it does?
//
// Every user-visible bug this project has shipped was the same shape: the code was right
// and the person could not tell. A rename field lost in a refactor, a control rendered but
// wired to nothing. `$('#gone')` returns null, the next property access throws inside a
// render function, and one dead id takes out a whole page with no error anybody sees.
//
// node --check cannot see this and neither can the HTTP suite: both files parse perfectly.
// This is cheap, needs no browser, and would have caught the rename bug.
//
// Run with: node test-wiring.js   (or npm test, which runs it alongside the others)

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const js = fs.readFileSync(path.join(ROOT, '../ui/app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, '../ui/index.html'), 'utf8');
const server = fs.readFileSync(path.join(ROOT, '../desk.js'), 'utf8');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok   ' + name); }
  catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
// Ids the app builds into markup itself. Template literals are included with their
// `${...}` holes turned into a wildcard, because the fader page addresses channel strips
// as `#mf` + a number — a literal-only comparison would report every one of them dead.
const builtPatterns = [...js.matchAll(/id="([^"]*)"/g)].map((m) => m[1]).map((raw) =>
  new RegExp('^' + raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\$\\\{[^}]*\\\}/g, '.*') + '$'));
const isBuilt = (id) => builtPatterns.some((re) => re.test(id));

check('every id app.js reaches for exists in the markup', () => {
  const dead = [];
  js.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/\$\(\s*'#([A-Za-z0-9_-]+)'/g)) {
      const id = m[1];
      // `$('#mf' + ch)` is a prefix, not an id — it is built, so it matches a pattern.
      if (!htmlIds.has(id) && !isBuilt(id)) dead.push(`#${id} (app.js:${i + 1})`);
    }
  });
  if (dead.length) throw new Error('dead references:\n       ' + dead.join('\n       '));
});

check('every control in the markup is read by the interface', () => {
  // A control that renders and does nothing is worse than a missing one: it looks broken
  // rather than absent. Ids used only as CSS or scroll targets are the exception.
  // phoneBox is the labelled wrapper around #phoneList/#phoneQr, which are both read.
  const DECORATIVE = new Set(['statusStrip', 'phoneBox']);
  const orphans = [...htmlIds].filter((id) =>
    !DECORATIVE.has(id) && !js.includes(`'#${id}'`) && !js.includes(`"#${id}"`)
    && !js.includes(`'${id}'`) && !js.includes(`getElementById('${id}')`));
  if (orphans.length) throw new Error('rendered but never read: ' + orphans.join(', '));
});

check('every class a button in the markup carries is known to the code or the styles', () => {
  // The id checks above cannot see class-driven controls: a one-item tab bar shipped for
  // days as pure decoration — a <button> whose class no JavaScript ever queried — and
  // looked exactly like a working control. A button whose every class is unknown to both
  // app.js and the stylesheet is either dead or about to be.
  const css = fs.readFileSync(path.join(ROOT, '../ui/style.css'), 'utf8');
  const dead = [];
  for (const m of html.matchAll(/<button[^>]*class="([^"]+)"[^>]*>/g)) {
    const classes = m[1].split(/\s+/);
    const known = classes.some((c) => js.includes(c) || css.includes('.' + c));
    if (!known) dead.push(m[1]);
  }
  if (dead.length) throw new Error('buttons nothing references: ' + dead.join('; '));
});

check('every /api call the interface makes has a route on the server', () => {
  const routes = new Set([...server.matchAll(/'(?:GET|POST) (\/api\/[^']+)'/g)].map((m) => m[1]));
  const called = new Set([...js.matchAll(/(?:post|fetch)\(\s*'\/?(api\/[^'?]+)'/g)].map((m) => '/' + m[1]));
  const missing = [...called].filter((r) => !routes.has(r));
  if (missing.length) throw new Error('no such route: ' + missing.join(', '));
});

check('every state field the interface renders is one the server sends', () => {
  // Catches the other half of a refactor: the server stops publishing something and the
  // page quietly renders `undefined` into a status line nobody reads closely.
  const publishes = server.slice(server.indexOf('function publicState'));
  for (const field of ['driver', 'serial', 'serialPorts', 'fxModes', 'roleKinds', 'packetsSent']) {
    if (!publishes.includes(field)) throw new Error(`publicState no longer sends "${field}"`);
  }
});

console.log(failures ? '\n' + failures + ' failing\n' : '\nall passing\n');
process.exit(failures ? 1 : 0);
