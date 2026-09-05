// The index's drawing, anchored to the list.
//
// It used to be a projected cloud on a fixed canvas while the roster scrolled
// past it. That looks like a drawing and is not one: the same eight lines hang
// in the same place while entirely different names pass behind them, so a line
// that means "these two made the same thing" can never be traced to the two
// names it belongs to — which two you see depends on where you stopped
// scrolling. A mark whose meaning changes with the scroll position is
// decoration, and on paper decoration reads as smudge.
//
// So every mark is now fixed to the row it is about. A person's dot sits at
// the right edge of that person's own row and scrolls with it. A bracket
// gathers everyone who made one work and carries that work's name, so it is
// one mark per fact — the first version drew one arc per PAIR, which turned
// two works into thirteen crossing lines and said no more than two brackets do.
//
// Below the width where there is a margin to draw in, it draws nothing at all.

// works: [{ title, slugs: [...] }] — one entry per work more than one person made
function createRosterField(svg, roster, works) {
  const NS = 'http://www.w3.org/2000/svg';
  const GAP = 20;      // from a row's right edge to its dot
  const FIRST = 34;    // from the dots to the first bracket's spine
  const STEP = 40;     // between spines
  let rows = [];
  let nodes = new Map();   // slug -> circle
  let ties = [];           // {slugs:Set, parts:[element]}

  const el = (name, attrs) => {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };

  function build() {
    svg.replaceChildren();
    nodes = new Map();
    ties = [];
    rows = [...roster.querySelectorAll('a.row')];
    if (!rows.length) return;

    const box = roster.getBoundingClientRect();
    let rowRight = 0;
    for (const row of rows) rowRight = Math.max(rowRight, row.getBoundingClientRect().right);
    // A coarse gate first, so a phone does not build fifty-two nodes to throw
    // them away; the exact check is at the end, once the marks can be measured.
    if (window.innerWidth - rowRight < GAP + FIRST + 40) { svg.style.display = 'none'; return; }
    svg.style.display = '';
    svg.setAttribute('width', box.width);
    svg.setAttribute('height', box.height);
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);

    const at = new Map();
    const x = rowRight - box.left + GAP;
    for (const row of rows) {
      const r = row.getBoundingClientRect();
      at.set(row.dataset.slug, r.top - box.top + r.height / 2);
    }

    // brackets under the dots, so a dot always reads as the end of its own tie
    const gTie = el('g', {});
    const gDot = el('g', {});
    svg.append(gTie, gDot);

    works.forEach((work, i) => {
      const ys = work.slugs.map((s2) => at.get(s2)).filter((v) => v != null).sort((a, b) => a - b);
      if (ys.length < 2) return;
      const out = x + FIRST + i * STEP;
      const top = ys[0]; const bot = ys[ys.length - 1];
      const r = 10;
      const parts = [el('path', {
        class: 'tie-arc',
        d: `M ${x} ${top} H ${out - r} Q ${out} ${top} ${out} ${top + r}`
         + ` V ${bot - r} Q ${out} ${bot} ${out - r} ${bot} H ${x}`,
      })];
      for (const y of ys.slice(1, -1)) parts.push(el('path', { class: 'tie-arc', d: `M ${x} ${y} H ${out}` }));
      // every label in one column, clear of every spine — a label tucked
      // beside its own bracket sat on top of the next bracket's spine
      const labelX = x + FIRST + Math.max(0, works.length - 1) * STEP + 14;
      let labelY = (top + bot) / 2 + 4;
      for (const seenTie of ties) if (Math.abs(seenTie.labelY - labelY) < 18) labelY = seenTie.labelY + 18;
      parts.push(el('text', { class: 'tie-label', x: labelX, y: labelY }));
      parts[parts.length - 1].textContent = work.title;
      for (const p2 of parts) gTie.append(p2);
      ties.push({ slugs: new Set(work.slugs), parts, labelY });
    });

    for (const row of rows) {
      const c = el('circle', { cx: x, cy: at.get(row.dataset.slug), r: 3, class: 'tie-dot' });
      gDot.append(c);
      nodes.set(row.dataset.slug, c);
    }

    // No margin, no drawing — measured, not estimated. A bracket or a label
    // clipped by the window edge is a mark that stops meaning anything, and
    // the width a label needs depends on the work's name, not on a constant.
    let right = 0;
    for (const el of svg.querySelectorAll('path,circle,text')) {
      right = Math.max(right, el.getBoundingClientRect().right);
    }
    if (right > window.innerWidth - 8) { svg.style.display = 'none'; }
  }

  function light(slug) {
    for (const [s, c] of nodes) c.classList.toggle('is-lit', s === slug);
    for (const tie of ties) {
      const lit = slug != null && tie.slugs.has(slug);
      for (const p2 of tie.parts) p2.classList.toggle('is-lit', lit);
    }
  }

  build();
  // rows change height when the roster reflows, and reflow is what moves a dot
  // off the row it belongs to — the one failure this drawing cannot survive.
  if (window.ResizeObserver) new ResizeObserver(build).observe(roster);
  else window.addEventListener('resize', build);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);

  return { light, rebuild: build };
}
