// The room template: one self-contained page per person — inline CSS, three
// loaded from the vendored copy at /vendor/three.module.min.js (root-relative,
// which resolves fine from a code page's srcdoc frame), and only that
// person's own corner of the field embedded, not all fifty-two.
//
// Same sheet of paper as the index, same ground behind it. The earlier
// version put a black field beside a white column; the seam ran down the
// middle of every room.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSS } from './lib/css.mjs';
import { esc, roomContentHTML } from './lib/room-content.mjs';
import { neighborsOf, workKey } from './lib/neighbors.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIELD_JS_PATH = path.join(HERE, 'lib/field.client.js');

/**
 * renderRoom(person, people) -> html string
 *
 * @param {object} person - one entry from people.json's `people` array:
 *   { slug, name, role, discipline, team, section, sectionLabel, city,
 *     bio, works:[{url,title,line,space,project}], elsewhere:[{label,href}] }
 * @param {object[]} people - the full roster, used to find this person's
 *   neighbours (shared work first, then same section, capped at 10).
 * @returns {string} a complete, self-contained <!doctype html> document.
 */
export function renderRoom(person, people) {
  const neighbors = neighborsOf(person, people, 10);
  const nodes = [person, ...neighbors].map((p) => ({ slug: p.slug, name: p.name, team: p.team, section: p.section }));

  const focusKeys = new Set((person.works || []).map(workKey));
  const edges = [];
  const sharedWith = [];
  neighbors.forEach((n, i) => {
    if ((n.works || []).some((w) => focusKeys.has(workKey(w)))) { edges.push([0, i + 1]); sharedWith.push(n); }
  });

  const fieldJs = fs.readFileSync(FIELD_JS_PATH, 'utf8');
  const content = roomContentHTML(person, neighbors);
  const tierLabel = person.team ? 'team' : person.sectionLabel;

  // Whoever they actually made something with, if anyone; otherwise the
  // people they sit beside on the index. Either way the room has company.
  const near = sharedWith.length ? sharedWith : neighbors;
  const nearLabel = sharedWith.length ? 'made things with' : `also in ${esc(person.sectionLabel)}`;
  const nearHTML = near.length
    ? `<div class="section-label">${nearLabel}</div>
    <nav class="neighbours">${near.map((n) =>
      `<a href="/network/${esc(n.slug)}" target="_top">${esc(n.name)}</a>`).join('')}</nav>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(person.name)} — di.iiii network</title>
<style>${CSS}</style>
</head>
<body>
<div class="ground"><canvas id="field" aria-hidden="true"></canvas></div>
<div class="sheet">
<header class="room-header">
  <a class="back" href="/network" target="_top"><span aria-hidden="true">←</span> the index</a>
  <div class="eyebrow">di<span class="dot">.</span>iiii · network · ${esc(tierLabel)}</div>
</header>
<main class="room-stage">
  <h1>${esc(person.name)}</h1>
  <p class="role">${esc(person.role)}</p>
  ${person.city ? `<p class="city">${esc(person.city)}</p>` : ''}
  ${content.bioHTML}
  <div class="section-label">on di.iiii</div>
  ${content.doorsHTML}
  ${content.hasElsewhere ? `<div class="section-label">elsewhere</div>${content.elsewhereHTML}` : ''}
  ${nearHTML}
</main>
<footer class="room-foot">
  <p>A room in the <a href="/network" target="_top">network</a> — one for each person who makes di.iiii. It is theirs to fill.</p>
</footer>
</div>
<script>
${fieldJs}
createField(document.getElementById('field'), ${JSON.stringify(nodes)}, 'room', ${JSON.stringify(person.slug)}, ${JSON.stringify(edges)});
</script>
</body>
</html>
`;
}
