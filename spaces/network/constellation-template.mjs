// The constellation: the same fifty-two the roster lists, given the whole
// sheet instead of the margin.
//
// It used to be a black three.js star field — a second design language for
// the same roster, hand-kept, and it had already drifted: it still carried
// Gevorg's old name and role weeks after people.json was corrected. It is
// generated now, from the same data and the same stylesheet as the rooms,
// so it cannot say something the roster does not.
//
// No script. The ring is a static SVG: one dot per person at a fixed angle,
// their name radiating outward as a link into their room, and one bundle of
// curves per work more than one of them made.
import { CSS, esc } from './lib/css.mjs';
import { sharedWorks, words } from './index-template.mjs';

const CX = 500, CY = 500;
const R = 290;            // the ring the people sit on
const LABEL = R + 13;     // where their names start
// Each work gathers at its own depth. Two works whose people mostly overlap
// have nearly the same centroid angle, and at one shared radius their hubs
// and labels landed on top of each other.
const HUB_NEAR = 0.44, HUB_FAR = 0.24;
const SECTION_GAP = 5;    // degrees of silence between two sections

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pt = (a, r) => [CX + r * Math.sin(a * Math.PI / 180), CY - r * Math.cos(a * Math.PI / 180)];
const n2 = (v) => Math.round(v * 100) / 100;

// Sections in roster order, alphabetical inside — the same rule the index
// uses, so a name sits in the same neighbourhood on both pages.
function ordered(people) {
  const groups = [];
  for (const p of people) {
    let g = groups.find((x) => x.section === p.section);
    if (!g) { g = { section: p.section, label: p.sectionLabel, people: [] }; groups.push(g); }
    g.people.push(p);
  }
  for (const g of groups) {
    if (g.section !== 'team') g.people.sort((a, b) => a.name.localeCompare(b.name));
  }
  return groups;
}

// Angles for everyone, laid out clockwise from the top with the sections
// held apart. Returns a slug -> degrees map plus the groups in ring order.
function angles(groups) {
  const total = groups.reduce((n, g) => n + g.people.length, 0);
  const span = 360 - SECTION_GAP * groups.length;
  const step = span / total;
  const at = new Map();
  // zero degrees is twelve o'clock; every angle below is measured from
  // there, clockwise.
  let a = SECTION_GAP / 2 + step / 2;
  for (const g of groups) {
    g.from = a - step / 2;
    for (const p of g.people) { at.set(p.slug, a); a += step; }
    g.to = a - step / 2;
    a += SECTION_GAP;
  }
  return at;
}

function nameNode(p, a, lit) {
  const [x, y] = pt(a, LABEL);
  const right = Math.sin(a * Math.PI / 180) >= 0;
  const rot = right ? a - 90 : a + 90;
  const cls = ['c-name', p.team ? 'is-team' : '', lit ? 'is-lit' : ''].filter(Boolean).join(' ');
  return `<a href="/network/${esc(p.slug)}" target="_top">`
    + `<text class="${cls}" x="${n2(x)}" y="${n2(y)}" text-anchor="${right ? 'start' : 'end'}"`
    + ` dominant-baseline="middle" transform="rotate(${n2(rot)} ${n2(x)} ${n2(y)})">${esc(p.name)}</text></a>`;
}

// One work, one bundle: every maker's dot curves in to a shared hub rather
// than to each other. The all-pairs version of this drew thirteen crossing
// arcs for two works and read as noise.
function bundle(work, at, i, n) {
  const here = work.slugs.filter((s) => at.has(s));
  if (here.length < 2) return '';
  const mid = here.reduce((sum, s) => {
    const a = at.get(s) * Math.PI / 180;
    return [sum[0] + Math.sin(a), sum[1] + Math.cos(a)];
  }, [0, 0]);
  const ha = Math.atan2(mid[0], mid[1]) * 180 / Math.PI;
  const depth = n > 1 ? HUB_NEAR - (HUB_NEAR - HUB_FAR) * (i / (n - 1)) : HUB_NEAR;
  const [hx, hy] = pt(ha, R * depth);
  const paths = here.map((s) => {
    const [x, y] = pt(at.get(s), R - 6);
    const [qx, qy] = pt(ha, R * depth * 0.45);
    return `<path class="c-tie" d="M${n2(x)} ${n2(y)} Q${n2(qx)} ${n2(qy)} ${n2(hx)} ${n2(hy)}"/>`;
  }).join('');
  // The label sits on the hub with a paper halo rather than beside it: the
  // curves all converge there, and anything set next to them landed on one.
  return `<g class="c-work" data-work="${i}">${paths}`
    + `<circle class="c-hub" cx="${n2(hx)}" cy="${n2(hy)}" r="3.5"/>`
    + `<text class="c-worklabel" x="${n2(hx)}" y="${n2(hy - 14)}" text-anchor="middle"`
    + ` dominant-baseline="middle">${esc(work.title)}</text></g>`;
}

export function renderConstellation(people) {
  const groups = ordered(people);
  const at = angles(groups);
  const ties = sharedWorks(people);
  const lit = new Set(ties.flatMap((t) => t.slugs));

  const dots = people.map((p) => {
    const [x, y] = pt(at.get(p.slug), R);
    const cls = ['c-dot', p.team ? 'is-team' : '', lit.has(p.slug) ? 'is-lit' : ''].filter(Boolean).join(' ');
    return `<circle class="${cls}" cx="${n2(x)}" cy="${n2(y)}" r="${lit.has(p.slug) ? 4.5 : 2.8}"/>`;
  }).join('');

  // One arc per section instead of one unbroken circle: the breaks are what
  // say where a group ends, and a tick on a full ring did not read as one.
  const arcs = groups.map((g) => {
    const [x1, y1] = pt(g.from, R), [x2, y2] = pt(g.to, R);
    const big = g.to - g.from > 180 ? 1 : 0;
    return `<path class="c-arc" d="M${n2(x1)} ${n2(y1)} A${R} ${R} 0 ${big} 1 ${n2(x2)} ${n2(y2)}"/>`;
  }).join('');

  const order = groups.map((g) => `${esc(g.label)} ${g.people.length}`).join(', ');
  const sharedLine = ties.length === 1
    ? esc(ties[0].title)
    : `${ties.slice(0, -1).map((t) => esc(t.title)).join(', ')} and ${esc(ties[ties.length - 1].title)}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>the constellation — di.iiii</title>
<style>${CSS}
.constPane{max-width:var(--col);padding:30px var(--pad) 22px var(--pad);}
.constPane h1{font-size:clamp(26px,2.6vw,34px);font-weight:700;letter-spacing:-0.02em;line-height:1.05;margin:14px 0 14px 0;}
.constPane h1 .dot{color:var(--accent);}
.constPane .dek{font-size:15.5px;color:var(--ink-2);line-height:1.6;margin:0;max-width:62ch;}
.fieldWrap{overflow-x:auto;overflow-y:hidden;padding:0 var(--pad) 4px var(--pad);}
.drag{display:none;}
/* The ring is 910px of drawing and the names on it have to stay readable, so
   a narrow screen scrolls it sideways rather than shrinking the type to
   nothing. Below that width the figure goes full-bleed and says so. */
@media (max-width:1020px){
  .fieldWrap{padding-left:0;padding-right:0;}
  .drag{display:block;font-family:var(--mono);font-size:12px;color:var(--ink-3);
    letter-spacing:.1em;text-transform:uppercase;margin:0 0 10px 0;padding:0 var(--pad);}
}
.fieldWrap svg{display:block;width:910px;height:910px;margin:0 auto;overflow:visible;}
.c-arc{fill:none;stroke:var(--rule);stroke-width:1;}
.c-dot{fill:var(--ink-3);}
.c-dot.is-team{fill:var(--ink);}
.c-dot.is-lit{fill:var(--accent);}
.c-name{font-family:var(--sans);font-size:12.5px;fill:var(--ink-2);
  paint-order:stroke;stroke:var(--paper);stroke-width:3px;stroke-linejoin:round;}
.c-name.is-team{font-weight:600;fill:var(--ink);}
.c-name.is-lit{fill:var(--ink);}
.c-tie{fill:none;stroke:var(--accent-rule);stroke-width:1.2;}
.c-hub{fill:var(--accent);}
.c-worklabel{font-family:var(--mono);font-size:12px;fill:var(--accent-ink);letter-spacing:.04em;
  paint-order:stroke;stroke:var(--paper);stroke-width:4px;stroke-linejoin:round;}
.fieldWrap a:hover .c-name,.fieldWrap a:focus-visible .c-name{fill:var(--accent-ink);}
.constFoot{max-width:var(--col);padding:8px var(--pad) 64px var(--pad);}
.constFoot .order{font-family:var(--mono);font-size:12px;color:var(--ink-3);letter-spacing:.08em;
  text-transform:uppercase;margin:0 0 16px 0;line-height:1.9;}
.constFoot p{font-size:14.5px;color:var(--ink-2);line-height:1.65;margin:0 0 10px 0;max-width:62ch;}
.constFoot a{color:var(--accent-ink);}
</style>
</head>
<body>
<div class="sheet">
<header class="pagehead">
  <a class="back" href="/network" target="_top"><span aria-hidden="true">←</span> the network</a>
  <div class="eyebrow">the constellation</div>
</header>
<header class="constPane">
  <div class="masthead">
    <h1>the whole field</h1>
    <p class="dek">The same ${words(people.length)} the roster lists, laid on one ring so you can see all of them at once. They sit clockwise from the top in the order the roster keeps them, held apart where one group ends and the next starts. A curve gathers the people who made the same thing — so far ${sharedLine}. Every name is a door into that person's room.</p>
  </div>
</header>

<p class="drag">drag the ring sideways <span aria-hidden="true">→</span></p>
<div class="fieldWrap">
<svg viewBox="45 45 910 910" role="img" aria-label="Every person who makes di.iiii, on one ring, with a curve for each work more than one of them made">
  ${arcs}
  ${ties.map((t, i) => bundle(t, at, i, ties.length)).join('\n  ')}
  ${dots}
  ${people.map((p) => '  ' + nameNode(p, at.get(p.slug), lit.has(p.slug))).join('\n')}
</svg>
</div>

<footer class="constFoot">
  <p class="order">clockwise from the top — ${order}</p>
  <p>This is the whole roster and nothing else: no ranking, no size, no distance that means anything. The only line drawn between two people is a piece of work they both made.</p>
  <p>The list, with what each person does, is on <a href="/network" target="_top">the network</a>.</p>
</footer>
</div>
</body>
</html>
`;
}
