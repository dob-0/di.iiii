// Pure, environment-agnostic (no fs/DOM) — imported by data.mjs in Node and
// inlined verbatim into room.html's browser bundle by build.mjs, so the
// "shared work first, then same section" rule is defined exactly once.
export function workKey(w) {
  return w.url || (w.space + '|' + (w.project || '') + '|' + w.title);
}

export function neighborsOf(person, people, max) {
  max = max || 10;
  const others = people.filter((p) => p.slug !== person.slug);
  const keys = new Set((person.works || []).map(workKey));
  const shared = keys.size
    ? others.filter((p) => (p.works || []).some((w) => keys.has(workKey(w))))
    : [];
  const sharedSlugs = new Set(shared.map((p) => p.slug));
  const sameSection = others.filter((p) => p.section === person.section && !sharedSlugs.has(p.slug));
  const combined = shared.concat(sameSection);
  const seen = new Set();
  const out = [];
  for (let i = 0; i < combined.length; i++) {
    const p = combined[i];
    if (seen.has(p.slug)) continue;
    seen.add(p.slug);
    out.push(p);
    if (out.length >= max) break;
  }
  return out;
}
