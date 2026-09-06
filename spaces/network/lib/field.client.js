// The field: the same fifty-two, in depth, beside the list.
//
// It is a cloud, not a chart. The five who run it sit in a tight core, the
// forty-seven around them on a shell, and the whole of it turns — slowly on
// its own, faster under a finger — so the arrangement reads as a solid and
// not as scatter. A line is drawn only where work is shared, and the work's
// name sits where its lines meet.
//
// No library. A point is three multiplications and a divide; fifty-two of
// them is nothing, and the last time this drawing existed it cost 229 KB
// over 36 requests to say the same thing.
//
// The list is still the interface. Every mark here has a row it belongs to:
// lighting a row lights its point, lighting a point lights its row, and the
// card that lifts off a point carries the same door the row already is.

// people: [{slug,name,role,team,works:[title]}]  ties: [{title,slugs:[]}]
function createField(mount, people, ties, hooks) {
  const canvas = mount.querySelector('canvas');
  const card = mount.querySelector('.fieldCard');
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  const narrow = window.matchMedia('(max-width:999px)');

  const cs = getComputedStyle(document.documentElement);
  const tok = (n, fb) => (cs.getPropertyValue(n) || fb).trim();
  const PAPER = tok('--paper', '#f7f7f5');
  const INK = tok('--ink', '#111214');
  const INK2 = tok('--ink-2', '#55595e');
  const INK3 = tok('--ink-3', '#63686d');
  const RULE = tok('--rule', '#dededa');
  const ACCENT = tok('--accent', '#0097a3');
  const ACCENT_INK = tok('--accent-ink', '#00757f');
  const MONO = tok('--mono', 'monospace');
  const SANS = tok('--sans', 'sans-serif');

  // A stable per-person wobble, so the shell has thickness and no two
  // neighbours sit at the same distance — deterministic, or the cloud would
  // rearrange itself on every reload.
  function seed(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.round(h * 16777619) >>> 0; }
    return (h % 1000) / 1000;
  }
  const GOLD = Math.PI * (3 - Math.sqrt(5));
  function onSphere(i, n) {
    const y = n < 2 ? 0 : 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * GOLD;
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  }

  // team in the core, everyone else on the shell. people.json is in section
  // order, so consecutive spiral steps put a discipline in one band.
  const pts = [];
  const bySlug = new Map();
  const team = people.filter((p) => p.team);
  const rest = people.filter((p) => !p.team);
  const place = (list, base, spread) => list.forEach((p, i) => {
    const v = onSphere(i, list.length);
    const r = base * (1 - spread / 2 + spread * seed(p.slug));
    const pt = { p, x: v[0] * r, y: v[1] * r, z: v[2] * r, sx: 0, sy: 0, t: 1, lit: 0 };
    pts.push(pt); bySlug.set(p.slug, pt);
  });
  place(team, 0.42, 0.22);
  place(rest, 1.0, 0.16);

  const tieSets = ties.map((t) => ({ title: t.title, slugs: t.slugs.filter((s) => bySlug.has(s)) }))
    .filter((t) => t.slugs.length > 1);
  const kin = new Map();
  for (const t of tieSets) {
    for (const a of t.slugs) {
      if (!kin.has(a)) kin.set(a, new Set());
      for (const b of t.slugs) if (b !== a) kin.get(a).add(b);
    }
  }

  let yaw = 0.6; let pitch = -0.18; let spin = 0;
  let w = 0; let h = 0; let scale = 1; let dpr = 1;
  let lit = null; let cardFor = null; let dirty = true;
  const D = 3.05;

  function measure() {
    const r = mount.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // the cloud reads as a body only when it is given the short side; on a
    // phone strip that side is the height, and it must not be cropped.
    scale = Math.min(w * 0.36, h * 0.42);
    dirty = true;
  }

  function project() {
    const cy = Math.cos(yaw); const sy = Math.sin(yaw);
    const cp = Math.cos(pitch); const sp = Math.sin(pitch);
    const cx = w / 2; const cyc = h / 2;
    for (const q of pts) {
      const x1 = q.x * cy + q.z * sy;
      const z1 = q.z * cy - q.x * sy;
      const y1 = q.y * cp - z1 * sp;
      const z2 = q.y * sp + z1 * cp;
      const t = D / (D + z2);
      q.t = t; q.sx = cx + x1 * scale * t; q.sy = cyc + y1 * scale * t;
    }
  }

  const depth = (t) => Math.max(0, Math.min(1, (t - 0.72) / 0.82));

  // Labels are placed last and out of each other's way: a name that lands on
  // another name, or on a work's name, is two marks that cancel. There are
  // never many at once — the work titles, and whoever is lit.
  const marks = [];
  const NUDGE = [0, -16, 16, -32, 32, -48, 48, -64, 64];
  function put(text, x, y, font, colour, align) {
    ctx.font = font;
    const wd = ctx.measureText(text).width;
    let ax = align === 'right' ? x - wd : align === 'center' ? x - wd / 2 : x;
    if (ax + wd > w - 6) ax = Math.max(6, w - 6 - wd);
    if (ax < 6) ax = 6;
    const free = (ay) => !marks.some((m) => Math.abs(m.y - ay) < 16
      && ax < m.x + m.w + 7 && m.x < ax + wd + 7);
    let ay = y;
    for (const d of NUDGE) if (free(y + d)) { ay = y + d; break; }
    marks.push({ x: ax, y: ay, w: wd, text, font, colour });
  }

  function drawMarks() {
    ctx.textAlign = 'left';
    ctx.lineWidth = 3.5; ctx.lineJoin = 'round'; ctx.strokeStyle = PAPER;
    for (const m of marks) {
      ctx.font = m.font;
      ctx.strokeText(m.text, m.x, m.y);
      ctx.fillStyle = m.colour;
      ctx.fillText(m.text, m.x, m.y);
    }
    marks.length = 0;
  }

  function draw() {
    project();
    ctx.clearRect(0, 0, w, h);
    ctx.textBaseline = 'middle';
    const near = lit ? kin.get(lit) : null;

    // the ties first, under the points: a line is the ground a dot stands on
    const meets = [];
    for (const t of tieSets) {
      const members = t.slugs.map((s) => bySlug.get(s));
      let mx = 0; let my = 0;
      for (const m of members) { mx += m.sx; my += m.sy; }
      mx /= members.length; my /= members.length;
      const on = lit != null && t.slugs.indexOf(lit) >= 0;
      ctx.strokeStyle = on ? ACCENT : INK3;
      ctx.lineWidth = on ? 1.3 : 1;
      ctx.globalAlpha = on ? 0.9 : 0.3;
      for (const m of members) {
        ctx.beginPath();
        ctx.moveTo(m.sx, m.sy);
        // bowed towards the meeting point, so eight lines read as one bundle
        ctx.quadraticCurveTo((m.sx + mx) / 2 + (my - m.sy) * 0.12,
          (m.sy + my) / 2 + (m.sx - mx) * 0.12, mx, my);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      meets.push({ title: t.title, x: mx, y: my, on });
    }

    // far to near, so a nearer dot is never drawn under a farther one
    const order = pts.slice().sort((a, b) => a.t - b.t);
    for (const q of order) {
      const d = depth(q.t);
      const isLit = q.p.slug === lit;
      const isKin = !isLit && near && near.has(q.p.slug);
      const r = (1.6 + 2.0 * d) * (q.p.team ? 1.3 : 1) * (isLit ? 1.9 : isKin ? 1.35 : 1);
      ctx.globalAlpha = isLit ? 1 : isKin ? 0.95 : 0.34 + 0.56 * d;
      ctx.fillStyle = isLit || isKin ? ACCENT : q.p.team ? INK : INK2;
      ctx.beginPath(); ctx.arc(q.sx, q.sy, r, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
      q.r = r;
    }

    // whoever is lit gets their name — nearest first, so the one under the
    // pointer keeps the place it asked for and the rest give way
    const named = order.filter((q) => (q.p.slug === lit && !cardFor) || (near && near.has(q.p.slug)))
      .sort((a, b) => (a.p.slug === lit ? -1 : b.p.slug === lit ? 1 : b.t - a.t));
    for (const m of meets) put(m.title, m.x, m.y - 13, '12px ' + MONO, m.on ? ACCENT_INK : INK3, 'center');
    for (const q of named) {
      const isLit = q.p.slug === lit;
      const size = isLit ? 14 : 12.5;
      const font = (isLit ? '600 ' : '') + size + 'px ' + SANS;
      ctx.font = font;
      const wd = ctx.measureText(q.p.name).width;
      const right = q.sx + q.r + 7 + wd > w - 6;
      put(q.p.name, right ? q.sx - q.r - 7 : q.sx + q.r + 7, q.sy, font,
        isLit ? INK : ACCENT_INK, right ? 'right' : 'left');
    }
    drawMarks();
    dirty = false;
  }

  function frame() {
    if (spin) { yaw += spin; dirty = true; } else if (!reduce) { yaw += 0.0011; dirty = true; }
    if (spin) spin *= 0.92;
    if (Math.abs(spin) < 0.0002) spin = 0;
    if (dirty) { draw(); if (cardFor) placeCard(cardFor); }
    requestAnimationFrame(frame);
  }

  // ---- the card that lifts off a point ----
  function placeCard(q) {
    const cw = card.offsetWidth || 220; const ch = card.offsetHeight || 90;
    let x = q.sx + 16; let y = q.sy - ch / 2;
    if (x + cw > w - 8) x = q.sx - cw - 16;
    card.style.left = Math.max(8, Math.min(w - cw - 8, x)) + 'px';
    card.style.top = Math.max(8, Math.min(h - ch - 8, y)) + 'px';
  }

  function showCard(q) {
    cardFor = q;
    card.querySelector('.fc-name').textContent = q.p.name;
    card.querySelector('.fc-role').textContent = q.p.role;
    const n = (q.p.works || []).length;
    card.querySelector('.fc-works').textContent = n ? (n === 1 ? '1 work here' : n + ' works here') : 'room to fill';
    card.querySelector('a').setAttribute('href', '/network/' + q.p.slug);
    card.hidden = false;
    placeCard(q);
  }

  function hideCard() { cardFor = null; card.hidden = true; }

  function light(slug, withCard) {
    if (lit === slug && !withCard) return;
    lit = slug; dirty = true;
    if (withCard && slug && bySlug.has(slug)) showCard(bySlug.get(slug)); else if (!slug) hideCard();
    if (hooks && hooks.onLight) hooks.onLight(slug);
  }

  function pick(cx2, cy2) {
    let best = null; let bs = Infinity;
    for (const q of pts) {
      const dx = q.sx - cx2; const dy = q.sy - cy2;
      const d2 = dx * dx + dy * dy;
      if (d2 > 400) continue;
      // a nearer point wins a close call, as it does to the eye
      const s = d2 - q.t * 40;
      if (s < bs) { bs = s; best = q; }
    }
    return best;
  }

  // ---- turning it ----
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (narrow.matches) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    if (drag && drag.id === e.pointerId) {
      const dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      yaw += dx * 0.006;
      // the horizontal drag is the one that turns it; the vertical is kept
      // shallow so the cloud never tips onto its side and loses its shape
      pitch = Math.max(-0.7, Math.min(0.7, pitch + dy * 0.004));
      spin = dx * 0.0012;
      dirty = true;
      hideCard();
      return;
    }
    if (narrow.matches) return;
    const q = pick(e.clientX - r.left, e.clientY - r.top);
    if (q) light(q.p.slug, true); else light(null);
  });
  const end = (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const wasTap = drag.moved < 6;
    drag = null;
    if (wasTap) {
      const r = canvas.getBoundingClientRect();
      const q = pick(e.clientX - r.left, e.clientY - r.top);
      if (q && hooks && hooks.onOpen) hooks.onOpen(q.p.slug);
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('pointerleave', () => { if (!drag) light(null); });

  measure();
  if (window.ResizeObserver) new ResizeObserver(measure).observe(mount);
  else window.addEventListener('resize', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  requestAnimationFrame(frame);

  return { light: (s) => light(s, false), rebuild: measure };
}
