// The ground: the network drawn into the paper, not onto a panel.
//
// Plain 2D canvas. It used to be three.js, which cost 229 KB over the wire to
// draw fifty-two dots and eight lines — the whole scene is points and
// straight segments, so the projection is six lines of arithmetic and the
// dependency bought nothing. three stays where it earns its weight, on the
// constellation page.
//
// The canvas is transparent: the page's own background is the only one, and
// this only adds marks to it. Painting the paper twice is what produced a
// visible seam down the page.
//
// It is deliberately not interactive. The roster drives it (setFocus); it
// never steals a scroll or a tap.

const GRAPHITE = '43,48,54';
const ACCENT = '0,151,163';
const FOV_F = 1.302; // (h/2) / tan(21deg), the same 42-degree lens the rooms had

// Fibonacci-sphere spacing: isotropic, so it reads the same from any angle as
// the view drifts. Team as a tight inner ball, everyone else on a wider shell
// at a decorrelated phase so the two do not stripe together.
function mixLayoutIndex(nodes) {
  const team = nodes.filter((n) => n.team);
  const rest = nodes.filter((n) => !n.team);
  const golden = Math.PI * (3 - Math.sqrt(5));
  function sphere(list, R, angleScale, yScale) {
    list.forEach((n, i) => {
      const y = list.length > 1 ? 1 - (i / (list.length - 1)) * 2 : 0;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i * angleScale;
      n.pos = [Math.cos(theta) * r * R, y * R * yScale, Math.sin(theta) * r * R];
    });
  }
  sphere(team, 0.85, 1, 1);
  sphere(rest, 2.0, 1.6, 0.92);
}

function mixLayoutRoom(nodes, focusSlug) {
  const focus = nodes.find((n) => n.slug === focusSlug) || nodes[0];
  focus.pos = [0, 0.1, 0];
  const others = nodes.filter((n) => n !== focus);
  others.forEach((n, i) => {
    const a = (i / Math.max(1, others.length)) * Math.PI * 2;
    const r = 1.5 + (i % 3) * 0.42;
    n.pos = [Math.sin(a) * r, Math.cos(i * 1.3) * 0.85, Math.cos(a) * r * 0.75];
  });
}

// nodes: [{slug,name,team,section}], mode: 'index' | 'room', focusSlug: string|null
function createField(canvas, nodes, mode, focusSlug, edges) {
  edges = edges || [];
  const ctx = canvas.getContext('2d');
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (mode === 'index') mixLayoutIndex(nodes);
  else mixLayoutRoom(nodes, focusSlug);

  const DIST = mode === 'index' ? 6.6 : 5.9;
  const SPREAD = mode === 'index' ? 2.1 : 2.0; // half-depth of the cloud, for the near/far ramp
  let W = 0, H = 0, dpr = 1;
  let focusIndex = focusSlug ? nodes.findIndex((n) => n.slug === focusSlug) : -1;
  const target = [0, 0, 0];
  const cur = [0, 0, 0];
  const seen = nodes.map(() => ({ x: 0, y: 0, s: 0, a: 0 }));

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth || canvas.parentElement.clientWidth || 1;
    H = canvas.clientHeight || canvas.parentElement.clientHeight || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // one stamp per colour, drawn scaled — building a radial gradient per point
  // per frame is the only thing here that would cost anything.
  function stamp(rgb, softness) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const cc = c.getContext('2d');
    const g = cc.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(' + rgb + ',1)');
    g.addColorStop(softness, 'rgba(' + rgb + ',.5)');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    cc.fillStyle = g; cc.fillRect(0, 0, 128, 128);
    return c;
  }
  const dotHalo = stamp(GRAPHITE, 0.28);
  const dotMark = stamp(ACCENT, 0.3);

  // the core is a hard little disc, not a gradient: a soft point at this size
  // reads as a smudge on the paper, and the whole page is meant to look drawn.
  function disc(x, y, r, rgb, alpha) {
    if (alpha <= 0.01) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgb(' + rgb + ')';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  function blob(img, x, y, r, alpha) {
    if (alpha <= 0.004 || r <= 0.2) return;
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
  }

  function draw(t) {
    const a = reduced ? 0.6 : t * 0.2;
    const pol = 0.2 + (reduced ? 0 : Math.sin(t * 0.5) * 0.12);
    for (let i = 0; i < 3; i++) cur[i] += (target[i] - cur[i]) * (reduced ? 1 : 0.05);

    const ca = Math.cos(a), sa = Math.sin(a);
    const cp = Math.cos(pol), sp = Math.sin(pol);
    const f = FOV_F * H;
    // The mask hides the left half of the canvas, so a cloud centred on the
    // viewport centres itself in the part nobody sees — in a room that hid
    // the focused person entirely. Compose into the margin instead. On a
    // phone there is no mask and no margin, so it re-centres.
    const cx = W > 620 ? W * 0.74 : W / 2;
    const cy = H / 2;

    for (let i = 0; i < nodes.length; i++) {
      const p = nodes[i].pos;
      // into view space: yaw, then pitch, then push away by DIST
      const dx = p[0] - cur[0], dy = p[1] - cur[1], dz = p[2] - cur[2];
      const x = dx * ca - dz * sa;
      const z = dx * sa + dz * ca;
      const y2 = dy * cp - z * sp;
      const z2 = dy * sp + z * cp;
      const d = DIST - z2;
      const s = seen[i];
      if (d < 0.35) { s.a = 0; continue; }
      s.x = cx + (x * f) / d;
      s.y = cy - (y2 * f) / d;
      s.s = f / d;
      // depth reads as distance the way fog did: nearer is darker. The ramp
      // is fitted to the cloud's actual depth — a curve keyed off DIST alone
      // put every point at the flat end of it and the whole drawing vanished.
      s.a = Math.max(0.22, Math.min(1, 1 - ((d - (DIST - SPREAD)) / (2 * SPREAD)) * 0.72));
    }

    ctx.clearRect(0, 0, W, H);

    // A phone has no margin to draw a diagram in, so the lines would cross
    // the names rather than sit beside them. There, only the dust of the
    // points remains.
    if (edges.length && W > 620) {
      ctx.lineWidth = 1;
      for (const pair of edges) {
        const A = seen[pair[0]], B = seen[pair[1]];
        if (!A.a || !B.a) continue;
        const lit = focusIndex === pair[0] || focusIndex === pair[1];
        const al = Math.min(A.a, B.a) * (lit ? 0.95 : 0.5);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(' + (lit ? ACCENT : GRAPHITE) + ',' + al.toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      }
    }

    const coreR = mode === 'index' ? 0.016 : 0.019;
    const haloR = mode === 'index' ? 0.16 : 0.2;
    for (let i = 0; i < nodes.length; i++) {
      const s = seen[i];
      if (!s.a) continue;
      const heavy = nodes[i].team ? 1 : 0.7;
      blob(dotHalo, s.x, s.y, s.s * haloR, s.a * 0.14 * heavy);
      disc(s.x, s.y, Math.max(1.3, s.s * coreR), GRAPHITE, s.a * 0.9 * heavy);
    }

    if (focusIndex >= 0) {
      const s = seen[focusIndex];
      if (s.a) {
        blob(dotMark, s.x, s.y, s.s * (mode === 'index' ? 0.16 : 0.2), 0.42);
        disc(s.x, s.y, Math.max(2, s.s * (mode === 'index' ? 0.018 : 0.022)), ACCENT, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  const t0 = performance.now();
  function frame() {
    draw((performance.now() - t0) * 0.00006);
    if (!reduced) requestAnimationFrame(frame);
  }

  function aim() {
    if (focusIndex >= 0) {
      const p = nodes[focusIndex].pos;
      target[0] = p[0] * 0.45; target[1] = p[1] * 0.45; target[2] = p[2] * 0.45;
    } else {
      target[0] = target[1] = target[2] = 0;
    }
  }
  aim();
  cur[0] = target[0]; cur[1] = target[1]; cur[2] = target[2];
  frame();

  return {
    resize,
    setFocus(slug) {
      const next = slug ? nodes.findIndex((n) => n.slug === slug) : -1;
      if (next === focusIndex) return;
      focusIndex = next;
      aim();
      if (reduced) draw(0);
    },
  };
}
