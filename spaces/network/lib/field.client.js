// The living field. Pooled geometry (two Points draw calls + one LineSegments
// draw call, regardless of node count), no post-processing bloom — glow comes
// from a soft radial-gradient point-sprite texture, same technique as both
// parent mocks. Shared by index.html (52 nodes) and every room page (person +
// neighbors, typically 1-11 nodes). Requires THREE in scope (module import).

function mixGlowTexture(hex) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, hex + 'ff');
  g.addColorStop(0.35, hex + 'a0');
  g.addColorStop(1, hex + '00');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

// Layout: a compact, roughly-spherical cloud (Fibonacci-sphere spacing) —
// isotropic, so it fills the margin's frame from any camera angle instead of
// spreading into a wide horizontal arc that leaves the panel's sides empty.
// Team sits as a tight inner ball; network as a slightly larger outer shell.
// Room mode packs the focus node near center-front with neighbors around it.
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
  sphere(team, 0.78, 1, 1);
  sphere(rest, 1.85, 1.6, 0.92); // 1.6x angle decorrelates network ring phase from team's
}

function mixLayoutRoom(nodes, focusSlug) {
  const focus = nodes.find((n) => n.slug === focusSlug) || nodes[0];
  focus.pos = [0, 0.3, -3.2];
  const others = nodes.filter((n) => n !== focus);
  others.forEach((n, i) => {
    const a = (i / Math.max(1, others.length)) * Math.PI * 2;
    const r = 2.3 + (i % 3) * 0.5;
    n.pos = [Math.sin(a) * r, 0.1 + Math.cos(i * 1.3) * 0.9, -3.2 + Math.cos(a) * r * 0.6];
  });
}

// nodes: [{slug,name,team,section}], mode: 'index' | 'room', focusSlug: string|null
function createField(canvas, nodes, mode, focusSlug, edges) {
  edges = edges || [];
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (mode === 'index') mixLayoutIndex(nodes);
  else mixLayoutRoom(nodes, focusSlug);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04060a);
  if (mode !== 'index') scene.fog = new THREE.FogExp2(0x04060a, 0.09);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  resize();

  // room mode only: grid floor + starfield, the full scene A's rooms use.
  // index/rail mode is an instrument in the margin, not a scene — no floor,
  // no stars, nothing to compete with the catalogue or the focus dot.
  if (mode !== 'index') {
    const grid = new THREE.GridHelper(50, 50, 0x123044, 0x0a1826);
    grid.position.y = -2.6;
    grid.material.transparent = true; grid.material.opacity = 0.45;
    scene.add(grid);

    const SN = 220;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(SN * 3);
    for (let i = 0; i < SN; i++) {
      const r = 16 + Math.random() * 36;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 2 - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = Math.abs(r * Math.cos(ph)) * 0.5 - 3.5;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: 0x33445c, size: 0.04, transparent: true, opacity: 0.5 });
    scene.add(new THREE.Points(g, m));
  }

  // core points, one draw call, pooled
  const N = nodes.length;
  const posArr = new Float32Array(N * 3);
  const colArr = new Float32Array(N * 3);
  const baseColorTeam = new THREE.Color(0xf1f5fb);
  const baseColorNet = new THREE.Color(0x8fa2ba);
  const activeColor = new THREE.Color(0x9ff4ff);
  nodes.forEach((n, i) => {
    posArr[i * 3] = n.pos[0]; posArr[i * 3 + 1] = n.pos[1]; posArr[i * 3 + 2] = n.pos[2];
    const c = n.team ? baseColorTeam : baseColorNet;
    colArr[i * 3] = c.r; colArr[i * 3 + 1] = c.g; colArr[i * 3 + 2] = c.b;
  });
  const coreGeo = new THREE.BufferGeometry();
  coreGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  coreGeo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  const coreMat = new THREE.PointsMaterial({
    size: mode === 'index' ? 0.12 : 0.22, vertexColors: true, sizeAttenuation: true,
    map: mixGlowTexture('#dfe8f5'), transparent: true, depthWrite: false, opacity: mode === 'index' ? 0.75 : 0.95,
  });
  const core = new THREE.Points(coreGeo, coreMat);
  scene.add(core);

  // glow halo, second pooled draw call, larger + dimmer
  const haloGeo = coreGeo.clone();
  const haloMat = new THREE.PointsMaterial({
    size: mode === 'index' ? 0.5 : 1.1, vertexColors: true, sizeAttenuation: true,
    map: mixGlowTexture('#dfe8f5'), transparent: true, depthWrite: false, opacity: mode === 'index' ? 0.14 : 0.28, blending: THREE.AdditiveBlending,
  });
  const halo = new THREE.Points(haloGeo, haloMat);
  scene.add(halo);

  // shared-work edges — the ONLY thing this field draws that the catalogue
  // can't say: two names that made something together. Per-vertex color so
  // an edge can light up (still not cyan — that stays the focus dot's alone)
  // when the focused node is one of its two ends, and stay quiet otherwise.
  let edgeGeo = null, edgeColArr = null;
  const edgeDim = new THREE.Color(mode === 'index' ? 0x24313e : 0x2c5568);
  const edgeLit = new THREE.Color(0xcfe3ee);
  if (edges.length) {
    const ePos = new Float32Array(edges.length * 6);
    edgeColArr = new Float32Array(edges.length * 6);
    edges.forEach(([ai, bi], i) => {
      ePos[i * 6] = nodes[ai].pos[0]; ePos[i * 6 + 1] = nodes[ai].pos[1]; ePos[i * 6 + 2] = nodes[ai].pos[2];
      ePos[i * 6 + 3] = nodes[bi].pos[0]; ePos[i * 6 + 4] = nodes[bi].pos[1]; ePos[i * 6 + 5] = nodes[bi].pos[2];
      for (let k = 0; k < 2; k++) { edgeColArr[i * 6 + k * 3] = edgeDim.r; edgeColArr[i * 6 + k * 3 + 1] = edgeDim.g; edgeColArr[i * 6 + k * 3 + 2] = edgeDim.b; }
    });
    edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
    edgeGeo.setAttribute('color', new THREE.BufferAttribute(edgeColArr, 3));
    const eMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: mode === 'index' ? 0.55 : 0.45 });
    const edgeLines = new THREE.LineSegments(edgeGeo, eMat);
    scene.add(edgeLines);
  }

  // ---- camera behaviour ----
  let az = 0, pol = 0.24, curAz = 0, curPol = 0.24;
  let dragging = false, lastX = 0, lastY = 0, dragged = false;
  const camTarget = new THREE.Vector3(0, 0, 0);
  const curTarget = new THREE.Vector3(0, 0, 0);
  // Room mode always opens on its person already lit — nothing calls
  // setFocus() for that first frame, so the initial index has to be resolved
  // here, not left at -1 waiting for a hover event that will never come.
  let focusIndex = focusSlug ? nodes.findIndex((n) => n.slug === focusSlug) : -1;

  if (mode === 'index') {
    camera.position.set(0, 0.3, 6.4);
  } else {
    camera.position.set(0, 1.6, 3.4);
  }

  canvas.addEventListener('pointerdown', (e) => { dragging = true; dragged = false; lastX = e.clientX; lastY = e.clientY; });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 3) dragged = true;
    lastX = e.clientX; lastY = e.clientY;
    az -= dx * 0.003;
    pol = Math.max(-0.45, Math.min(0.6, pol - dy * 0.002));
  });

  const raycaster = new THREE.Raycaster();
  raycaster.params.Points = { threshold: mode === 'index' ? 0.35 : 0.45 };
  const pointerNDC = new THREE.Vector2(-9, -9);
  let hoverCb = null, clickCb = null;
  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  });
  canvas.addEventListener('pointerleave', () => { pointerNDC.set(-9, -9); if (hoverCb) hoverCb(null); });
  canvas.addEventListener('click', () => {
    if (dragged) return;
    raycaster.setFromCamera(pointerNDC, camera);
    const hit = raycaster.intersectObject(core);
    if (hit.length && clickCb) clickCb(nodes[hit[0].index].slug);
  });

  function resize() {
    const w = canvas.clientWidth || canvas.parentElement.clientWidth || 1;
    const h = canvas.clientHeight || canvas.parentElement.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  function applyFocusState() {
    for (let i = 0; i < N; i++) {
      const isFocus = i === focusIndex;
      const c = isFocus ? activeColor : (nodes[i].team ? baseColorTeam : baseColorNet);
      colArr[i * 3] = c.r; colArr[i * 3 + 1] = c.g; colArr[i * 3 + 2] = c.b;
    }
    coreGeo.attributes.color.needsUpdate = true;
    haloGeo.attributes.color.needsUpdate = true;

    if (edgeGeo) {
      edges.forEach(([ai, bi], i) => {
        const lit = focusIndex >= 0 && (ai === focusIndex || bi === focusIndex);
        const c = lit ? edgeLit : edgeDim;
        for (let k = 0; k < 2; k++) { edgeColArr[i * 6 + k * 3] = c.r; edgeColArr[i * 6 + k * 3 + 1] = c.g; edgeColArr[i * 6 + k * 3 + 2] = c.b; }
      });
      edgeGeo.attributes.color.needsUpdate = true;
    }
  }

  let lastHoverIdx = -2;
  function raycastHover() {
    if (dragging || !hoverCb) return;
    raycaster.setFromCamera(pointerNDC, camera);
    const hit = raycaster.intersectObject(core);
    const idx = hit.length ? hit[0].index : -1;
    if (idx !== lastHoverIdx) {
      lastHoverIdx = idx;
      hoverCb(idx >= 0 ? nodes[idx].slug : null);
    }
  }

  let t0 = performance.now();
  function render() {
    const t = (performance.now() - t0) * 0.00006;

    if (!reduced) {
      curAz += (az - curAz) * 0.07;
      curPol += (pol - curPol) * 0.07;
      curTarget.lerp(camTarget, 0.06);
    } else {
      curAz = az; curPol = pol; curTarget.copy(camTarget);
    }

    if (mode === 'index') {
      // Slow, small idle drift — an instrument, not a scene: it should
      // never be the thing drawing the eye. Easing toward a focused node
      // pulls the camera slightly forward, not into a dramatic dolly.
      const autorot = reduced ? 0 : t * 0.22;
      const r = 6.4 - (focusIndex >= 0 ? 1.1 : 0);
      const a = curAz + autorot;
      camera.position.set(
        curTarget.x + Math.sin(a) * r * Math.cos(curPol),
        0.3 + Math.sin(curPol) * 1.6,
        curTarget.z + Math.cos(a) * r * Math.cos(curPol),
      );
      camera.lookAt(curTarget);
    } else {
      const sway = reduced ? 0 : Math.sin(t * 1.4) * 0.35;
      camera.position.x = sway;
      camera.lookAt(0, 0.25, -3.2);
    }

    raycastHover();
    renderer.render(scene, camera);
    if (!reduced || mode === 'room') requestAnimationFrame(render);
  }
  if (focusIndex >= 0) {
    applyFocusState();
    if (mode === 'index') camTarget.set(nodes[focusIndex].pos[0], nodes[focusIndex].pos[1], nodes[focusIndex].pos[2]);
    curTarget.copy(camTarget);
  }
  render();
  if (reduced) { renderer.render(scene, camera); }

  return {
    resize,
    onHover(cb) { hoverCb = cb; },
    onClick(cb) { clickCb = cb; },
    setFocus(slug) {
      focusIndex = slug ? nodes.findIndex((n) => n.slug === slug) : -1;
      if (mode === 'index' && focusIndex >= 0) camTarget.set(nodes[focusIndex].pos[0], nodes[focusIndex].pos[1], nodes[focusIndex].pos[2]);
      else if (mode === 'index') camTarget.set(0, 0, 0);
      applyFocusState();
      if (reduced) renderer.render(scene, camera);
    },
    project(slug) {
      const n = nodes.find((nn) => nn.slug === slug);
      if (!n) return null;
      const v = new THREE.Vector3(n.pos[0], n.pos[1], n.pos[2]).project(camera);
      return { x: (v.x * 0.5 + 0.5), y: (-v.y * 0.5 + 0.5) };
    },
  };
}
