// The room template: this is the part that scales to everyone. build.mjs
// imports renderRoom and calls it once per person to produce a fully
// self-contained static page — inline CSS, three.js loaded from the vendored
// copy at /vendor/three.module.min.js (root-relative — resolves fine from a
// code page's srcdoc frame, no inlining, no blob/import-map indirection),
// only that person's own field of neighbors embedded (not all 52).
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
 * @param {object[]} people - the full roster (all 52), used only to find
 *   this person's neighbors (shared work, then same section, capped at 10).
 * @returns {string} a complete, self-contained <!doctype html> document —
 *   safe to write straight to a static file or hand to a code-page publisher.
 */
export function renderRoom(person, people) {
  const neighbors = neighborsOf(person, people, 10);
  const nodes = [person, ...neighbors].map((p) => ({ slug: p.slug, name: p.name, team: p.team, section: p.section }));

  const focusKeys = new Set((person.works || []).map(workKey));
  const edges = [];
  neighbors.forEach((n, i) => {
    const shares = (n.works || []).some((w) => focusKeys.has(workKey(w)));
    if (shares) edges.push([0, i + 1]);
  });

  const fieldJs = fs.readFileSync(FIELD_JS_PATH, 'utf8');
  const content = roomContentHTML(person, neighbors);
  const tierLabel = person.team ? 'team' : person.sectionLabel;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(person.name)} — di.iiii network</title>
<style>${CSS}</style>
</head>
<body>
<header class="room-header">
  <a class="back" href="/network" target="_top"><span aria-hidden="true">←</span> the index</a>
  <div class="eyebrow">di<span class="dot">.</span>iiii · network · ${esc(tierLabel)}</div>
</header>
<div class="room-body">
  <main class="room-stage">
    <h1>${esc(person.name)}</h1>
    <p class="role">${esc(person.role)}</p>
    ${person.city ? `<p class="city">${esc(person.city)}</p>` : ''}
    ${content.bioHTML}
    <div class="section-label">on di.iiii</div>
    ${content.doorsHTML}
    ${content.hasElsewhere ? `<div class="section-label">elsewhere</div>${content.elsewhereHTML}` : ''}
  </main>
  <div class="room-field"><canvas id="field" aria-hidden="true"></canvas></div>
</div>
<p class="room-foot">A room in the <a href="/network" target="_top">network</a> — one per person who makes di.iiii. It is theirs to fill.</p>
<script type="module">
import * as THREE from "/vendor/three.module.min.js";
${fieldJs}
createField(document.getElementById('field'), ${JSON.stringify(nodes)}, 'room', ${JSON.stringify(person.slug)}, ${JSON.stringify(edges)});
</script>
</body>
</html>
`;
}
