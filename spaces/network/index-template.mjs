// The index: one page listing everyone who makes di.iiii, each name a door
// into their room.
//
// Generated from people.json for the same reason the rooms are — the counts
// in the opening sentence used to be typed by hand and had already drifted
// from the roster. Nothing here states a number the data does not hold.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSS, esc } from './lib/css.mjs';
import { workKey } from './lib/neighbors.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIELD_JS_PATH = path.join(HERE, 'lib/field.client.js');

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

export function words(n) {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  return n % 10 ? `${t}-${ONES[n % 10]}` : t;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Groups in roster order, team first; inside a group, alphabetical.
// Deliberately unnumbered: a numbered list of named artists reads as a
// ranking of them, and alphabetical order says plainly that it is not one.
function grouped(people) {
  const out = [];
  for (const p of people) {
    let g = out.find((x) => x.section === p.section);
    if (!g) { g = { section: p.section, label: p.sectionLabel, people: [] }; out.push(g); }
    g.people.push(p);
  }
  for (const g of out) {
    if (g.section !== 'team') g.people.sort((a, b) => a.name.localeCompare(b.name));
  }
  return out;
}

// Every work more than one person made, with the people who made it. Two so
// far; this stays right if a third appears.
export function sharedWorks(people) {
  const byWork = new Map();
  for (const p of people) {
    for (const w of p.works || []) {
      const k = workKey(w);
      if (!byWork.has(k)) byWork.set(k, { title: w.title, slugs: [] });
      const t = byWork.get(k);
      if (!t.slugs.includes(p.slug)) t.slugs.push(p.slug);
    }
  }
  return [...byWork.values()].filter((t) => t.slugs.length > 1);
}

function rowHTML(p) {
  // one title per work, not per credit: a person can hold two credits on
  // the same piece and it should still read once in the list.
  const titles = [...new Set((p.works || []).map((w) => w.title))];
  const made = titles.length
    ? `<span class="made"><span class="arrow">→ </span>${esc(titles.join(' · '))}</span>`
    : '';
  return `<li><a class="row" href="/network/${esc(p.slug)}" target="_top" data-slug="${esc(p.slug)}">`
    + `<span class="name">${esc(p.name)}</span>`
    + `<span class="role">${esc(p.role)}${made}</span></a></li>`;
}

export function renderIndex(people) {
  const groups = grouped(people);
  const team = people.filter((p) => p.team).length;
  const rest = people.length - team;
  const withWork = people.filter((p) => (p.works || []).length).length;

  const fieldJs = fs.readFileSync(FIELD_JS_PATH, 'utf8');
  const ties = sharedWorks(people);
  const shared = ties.map((t) => t.title);

  const dek = `${cap(words(people.length))} people make di.iiii — ${words(team)} run it, `
    + `${words(rest)} make with it. Every name here has a room of its own. `
    + `${cap(words(withWork))} of those rooms have work standing in them already; the rest are theirs to fill.`;

  const sharedLine = shared.length === 1
    ? `so far that is ${esc(shared[0])}`
    : `so far that is ${shared.slice(0, -1).map(esc).join(', ')} and ${esc(shared[shared.length - 1])}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>network — di.iiii</title>
<style>${CSS}</style>
</head>
<body>
<div class="sheet">
<div class="spread">
<div class="paperTop">
<header class="pagehead">
  <a class="back" href="/" target="_top"><span aria-hidden="true">←</span> di.iiii</a>
  <div class="eyebrow">the network</div>
</header>
<header class="indexPane">
  <div class="masthead">
    <h1>who makes di<span class="dot">.</span>iiii</h1>
    <p class="dek">${dek}</p>
  </div>
</header>
</div>

<main class="roster">
  <p class="howto">tap a name to open their room<span class="wide-only"> · drag the field to turn it</span></p>
${groups.map((g) => `  <h2 class="group"><span class="g-name">${esc(g.label)}</span><span class="g-rule"></span><span class="g-count">${g.people.length}</span></h2>
  <ul class="catalogue">
${g.people.map((p) => '    ' + rowHTML(p)).join('\n')}
  </ul>`).join('\n')}
</main>

<footer class="indexFoot">
  <p>The field beside this page is the same ${words(people.length)}, held apart in depth — the ${words(team)} who run it in the middle, everyone else around them. Turn it with a drag. A line between two of them means they made the same thing — ${sharedLine}.</p>
  <p>You can see the whole of it — all ${words(people.length)} on one ring — in the <a href="/network/constellation" target="_top">constellation</a>.</p>
</footer>

<aside class="fieldCol" aria-hidden="true">
  <canvas class="field"></canvas>
  <div class="fieldCard" hidden>
    <div class="fc-name"></div>
    <div class="fc-role"></div>
    <div class="fc-works"></div>
    <a href="/" target="_top" tabindex="-1">→ room</a>
  </div>
  <p class="fieldNote">${words(people.length)} people · drag to turn</p>
</aside>
</div>
</div>

<script>
${fieldJs}
const roster = document.querySelector('main.roster');
const rows = new Map();
for (const row of roster.querySelectorAll('a.row')) rows.set(row.dataset.slug, row);
let active = null;
function mark(slug) {
  const row = slug ? rows.get(slug) : null;
  if (active === row) return;
  if (active) active.classList.remove('is-active');
  active = row || null;
  if (active) active.classList.add('is-active');
}
const field = createField(
  document.querySelector('.fieldCol'),
  ${JSON.stringify(people.map((p) => ({
    slug: p.slug,
    name: p.name,
    role: p.role,
    team: !!p.team,
    works: [...new Set((p.works || []).map((w) => w.title))],
  })))},
  ${JSON.stringify(ties)},
  // the point lights the row it is about, and clicking it opens the same
  // door the row already is — the roster link, so the top-level navigation
  // a published page is allowed comes from a real link click.
  { onLight: mark, onOpen: (slug) => { const r = rows.get(slug); if (r) r.click(); } },
);
for (const [slug, row] of rows) {
  row.addEventListener('pointerenter', () => { mark(slug); field.light(slug); });
  row.addEventListener('focus', () => { mark(slug); field.light(slug); });
}
roster.addEventListener('pointerleave', () => { mark(null); field.light(null); });
</script>
</body>
</html>
`;
}
