// The room template: one self-contained page per person. No script at all —
// a room is a document.
//
// It used to carry a drifting constellation of the person and their
// neighbours. Every dot in it was unlabelled, so no dot could be traced to
// the names printed underneath, and the lines said only "four people", which
// the list of four names already said. An illustration of a fact is not a
// fact. The drawing lives where it is earned: anchored to the rows on the
// index, and as its own subject at /network/constellation.
import { CSS } from './lib/css.mjs';
import { esc, roomContentHTML, resumeHTML } from './lib/room-content.mjs';
import { neighborsOf, workKey } from './lib/neighbors.mjs';

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

  const focusKeys = new Set((person.works || []).map(workKey));
  const sharedWith = neighbors.filter((n) => (n.works || []).some((w) => focusKeys.has(workKey(w))));

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
<div class="sheet">
<header class="pagehead pagehead--room">
  <a class="back" href="/network" target="_top"><span aria-hidden="true">←</span> the network</a>
  <div class="eyebrow">di<span class="dot">.</span>iiii · network · ${esc(tierLabel)}</div>
</header>
<main class="room-stage">
  <h1>${esc(person.name)}</h1>
  <p class="role">${esc(person.role)}</p>
  ${person.city ? `<p class="city">${esc(person.city)}</p>` : ''}
  ${content.bioHTML}
  ${person.resume ? `<div class="section-label">the journey</div>${resumeHTML(person)}` : ''}
  <div class="section-label">on di.iiii</div>
  ${content.doorsHTML}
  ${content.hasElsewhere ? `<div class="section-label">elsewhere</div>${content.elsewhereHTML}` : ''}
  ${nearHTML}
</main>
<footer class="room-foot">
  <p>A room in the <a href="/network" target="_top">network</a> — one for each person who makes di.iiii. It is theirs to fill.</p>
</footer>
</div>
</body>
</html>
`;
}
