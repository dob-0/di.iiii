// Pure string-building, no DOM/fs — imported by room-template.mjs in Node
// AND inlined verbatim (source text) into room.html's browser bundle by
// build.mjs, so the "doors / bio / elsewhere / empty room" markup is defined
// exactly once for both the static per-person page and the ?person= demo.
export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function roomContentHTML(person, neighbors) {
  const hasWorks = person.works && person.works.length > 0;
  const hasBio = !!person.bio;

  const bioHTML = hasBio ? '<p class="bio">' + esc(person.bio) + '</p>' : '';

  let doorsHTML;
  if (hasWorks) {
    doorsHTML = '<div class="doors">' + person.works.map((w) => {
      if (w.url) {
        return '<a class="door" href="' + esc(w.url) + '" target="_top"><span class="t">' + esc(w.title) + '</span><span class="l">' + esc(w.line) + '</span></a>';
      }
      return '<div class="door door--unlinked"><span class="t">' + esc(w.title) + '</span><span class="l">' + esc(w.line) + ' · no link yet</span></div>';
    }).join('') + '</div>';
  } else {
    // A person with no works and no bio still gets a dignified room.
    const invite = hasBio
      ? 'No rooms wired yet — this door is theirs to open.'
      : 'Nothing stands here yet — this room is theirs to fill.';
    doorsHTML = '<p class="empty-note">' + invite + '</p>';
  }

  const hasElsewhere = person.elsewhere && person.elsewhere.length > 0;
  const elsewhereHTML = hasElsewhere
    ? '<div class="elsewhere">' + person.elsewhere.map((e) =>
        '<a class="plate" href="' + esc(e.href) + '" target="_blank" rel="noopener">' + esc(e.label) + '</a>').join('') + '</div>'
    : '';

  return { bioHTML, doorsHTML, elsewhereHTML, hasElsewhere };
}

// The journey: a person's CV, cut into segments instead of handed over as a
// flat file. `<details>` gives the years fold — one open, the rest a click
// away — with no script at all, matching the room's "a document, not an
// application" rule. `resume` is optional; a room with none renders nothing.
export function resumeHTML(person) {
  const r = person.resume;
  if (!r) return '';

  const focusHTML = r.focus && r.focus.length
    ? '<div class="focus-chips">' + r.focus.map((f) => '<span class="chip">' + esc(f) + '</span>').join('') + '</div>'
    : '';

  const timelineHTML = r.timeline && r.timeline.length
    ? '<div class="timeline">' + r.timeline.map((y, i) => {
        const n = y.items.length;
        const itemsHTML = y.items.map((it) =>
          '<div class="ti"><span class="ti-t">' + esc(it.title) + '</span>' +
          (it.role ? ' <span class="ti-r">' + esc(it.role) + '</span>' : '') +
          (it.place ? '<span class="ti-p">' + esc(it.place) + '</span>' : '') +
          '</div>').join('');
        return '<details' + (i === 0 ? ' open' : '') + '><summary><span class="yr">' + esc(y.year) +
          '</span><span class="ct">' + n + (n === 1 ? ' credit' : ' credits') + '</span></summary>' +
          '<div class="yr-items">' + itemsHTML + '</div></details>';
      }).join('') + '</div>'
    : '';

  const cvHTML = r.cvUrl
    ? '<p class="cv-link"><a class="plate" href="' + esc(r.cvUrl) + '" target="_blank" rel="noopener">' + esc(r.cvLabel || 'the full CV — PDF') + '</a></p>'
    : '';

  return focusHTML + timelineHTML + cvHTML;
}
