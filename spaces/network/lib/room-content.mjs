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
