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
  // midiSend() is the MIDI page's own coalescing queue — it reaches the same routes as
  // post()/fetch() and has to be checked the same way, or a renamed route goes dead only
  // for the hardware controller, which is the surface nobody is watching while it breaks.
  const called = new Set([...js.matchAll(/(?:post|fetch|midiSend)\(\s*'\/?(api\/[^'?]+)'/g)].map((m) => '/' + m[1]));
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

// Regression guard (docs/ai/known-fixes.md, "lights ignore a small rig's DMX"): every frame
// the desk sends is a full 512-slot universe. Trimming to the highest used channel sent a
// 25-channel studio rig 26-slot frames, and its lights ignored them while the UI looked right.
check('every DMX frame leaves full length — 512 slots, never trimmed to the patch', () => {
  if (!/const FULL_FRAME = 512;/.test(server)) throw new Error('desk.js no longer defines FULL_FRAME = 512');
  const trims = [...server.matchAll(/\|\|\s*24\b|Buffer\.alloc\(\s*24\s*\)|Math\.max\(\s*24\s*,/g)].map((m) => m[0]);
  if (trims.length) throw new Error('short-frame fallbacks are back in desk.js: ' + trims.join(', '));
  const fp = server.slice(server.indexOf('function footprints()'), server.indexOf('function pushFrame()'));
  if (!/out\.set\(u, FULL_FRAME\)/.test(fp)) throw new Error('footprints() no longer sets every universe to FULL_FRAME');
});

// Regression guard (docs/ai/known-fixes.md, "the desk's title squeezed to 32px at 1440"):
// the title keeps room to name the show, clips from its end rather than both sides, and the
// bar's Blackout does not take a full line on a screen wider than a phone.
check('the top bar keeps the show title readable and Blackout in the row', () => {
  const css = fs.readFileSync(path.join(ROOT, '../ui/style.css'), 'utf8');
  const title = [...css.matchAll(/\.title\s*\{([^}]*)\}/g)].map((m) => m[1]).join(';');
  if (!/min-width:\s*min\(20em,\s*100%\)/.test(title)) throw new Error('.title lost its minimum width — it shrinks to nothing when the bar is full');
  if (!/justify-content:\s*safe center/.test(title)) throw new Error('.title centres without `safe` — an overflowing title spills out of both sides');
  if (!/@media \(min-width: 701px\) \{ \.topbo \{ width: auto; \} \}/.test(css)) throw new Error('the bar Blackout takes .blackout\'s full width on wide screens again');
});

// Regression guard: under a finger the desk's ways out are a finger tall (they were 25px).
check('the desk top links are 44px under a coarse pointer', () => {
  const css = fs.readFileSync(path.join(ROOT, '../ui/style.css'), 'utf8');
  const coarse = css.slice(css.indexOf('@media (pointer: coarse)'));
  if (!/\.homelink \{ min-height: 44px;/.test(coarse)) throw new Error('.homelink lost its 44px touch height in the (pointer: coarse) block');
});

// Regression guard (2026-09-28): the desk had a tested Fan route and no way to reach it.
// The page offers exactly the server's styles and sends the selection in its ORDER.
check('the desk reaches Fan, with the server\'s own styles, in selection order', () => {
  const { STYLES } = require('../fan.js');
  const m = js.match(/const FAN_STYLES = \[([^\]]*)\]/);
  if (!m) throw new Error('app.js has no FAN_STYLES list');
  const ui = m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
  if (JSON.stringify(ui) !== JSON.stringify(STYLES)) throw new Error(`fan styles differ: ui ${ui.join(',')} vs server ${STYLES.join(',')}`);
  if (!/post\('api\/fan'/.test(js)) throw new Error('app.js never posts api/fan');
  if (!/fixtures:\s*\[\.\.\.sel\]/.test(js)) throw new Error('the fan does not send the selection in its order ([...sel])');
});

// Regression guard (2026-10-01, MOXIR): the Touch page showed only desk scenes, so a show of
// looks and cues (0 scenes) offered a tablet "Save some scenes" and nothing to tap. The page
// now fires looks and drives the cue list; every hook it needs is in the markup, wired, and
// the empty-state hint is gated on there being nothing else to play.
check('the Touch page fires looks and drives the cue list (hooks, routes, empty-state gate)', () => {
  const touch = html.slice(html.indexOf('data-page="touch"'), html.indexOf('id="liveStrip"'));
  for (const id of ['touchLooks', 'tLooks', 'tCueBar', 'tCueNow', 'tCueNext', 'tCueGo', 'tCueBack', 'tCueStop', 'tCueLoop']) {
    if (!touch.includes(`id="${id}"`)) throw new Error(`#${id} is not on the Touch page`);
    if (!js.includes(`'#${id}'`)) throw new Error(`app.js never reaches #${id}`);
  }
  for (const route of ['api/looks/fire', 'api/cues/go', 'api/cues/back', 'api/cues/stop', 'api/cues/loop']) {
    if (!js.includes(`'${route}'`)) throw new Error(`app.js never posts ${route}`);
    if (!server.includes(`'POST /${route}'`)) throw new Error(`desk.js has no POST /${route}`);
  }
  if (!/function buildTouchLooks\(/.test(js) || !/buildTouchLooks\(\);\s*paintTouchCues\(\);/.test(js)) {
    throw new Error('buildTouch no longer builds the looks and paints the cue bar');
  }
  if (!/hasLooks \|\| hasCues \? '' : '<p class="muted">Save some scenes/.test(js)) {
    throw new Error('the "save some scenes" hint is shown even when the desk has looks or cues');
  }
  // CUES is read by buildTouch, which showPage() can run before the poller at the foot of
  // the file: its declaration has to come first or the Touch page throws on a fresh load.
  const decl = js.indexOf('\nlet CUES = null;');
  if (decl < 0 || decl > js.indexOf('\nshowPage(location.hash.slice(1));')) throw new Error('`let CUES` is declared after the first showPage() call');
});

// Regression guard (2026-10-01, MOXIR UI audit, P0): framed as the visualiser's desk half,
// the desk kept its ways out (di.iiii, ← project, Studio / Nodes / Projection). On a phone
// the pane is ~240 px and those rows took all of it: not one look tile was on screen.
check("a framed desk (the visualiser's half) hides its ways out, from the first paint", () => {
  const css = fs.readFileSync(path.join(ROOT, '../ui/style.css'), 'utf8');
  const head = js.slice(0, 4000);
  if (!/window\.self !== window\.top/.test(head) || !/classList\.add\('is-framed'\)/.test(head)) {
    throw new Error("app.js does not mark <html> 'is-framed' near its top (before the first render)");
  }
  const rule = css.match(/\.is-framed[^{]*\{[^}]*\}/g) || [];
  const hides = rule.join('\n');
  for (const sel of ['.homelink', '#fromTools']) {
    if (!hides.includes(sel) || !/display:\s*none/.test(hides)) throw new Error(`style.css does not hide ${sel} under .is-framed`);
  }
});

// Regression guard (2026-10-01, MOXIR UI audit, P0): a rig look whose fixtures are not on
// the desk, or are all held dark, fired into a black room with no word — and two looks of
// one name ("White cathedral", the set's hung-rig look and the ground one) sat side by side.
check('Touch look tiles say when a look lights nothing here, and keep the hung-rig looks apart', () => {
  const build = js.slice(js.indexOf('function buildTouchLooks'), js.indexOf("$('#touchLooks').addEventListener"));
  if (!/function lookHealth\(/.test(js)) throw new Error('no lookHealth() in app.js');
  if (!/lookHealth\(/.test(build)) throw new Error('buildTouchLooks does not ask lookHealth');
  if (!/class="tbtn lookbtn\$\{[^}]*dead/.test(build)) throw new Error('a dead look tile is not marked .dead');
  if (!/hung rig/.test(build) || !/bankhead/.test(build)) throw new Error('the hung-rig looks have no group header of their own');
  if (!/lookHealth\(l\)\.dead/.test(build.slice(build.indexOf('const sig')))) throw new Error('the tile signature ignores health — a patch change would not repaint the tiles');
});

console.log(failures ? '\n' + failures + ' failing\n' : '\nall passing\n');
process.exit(failures ? 1 : 0);
