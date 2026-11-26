/* global post -- app.js's POST helper, a classic-script global */
'use strict';
// The Camera page: the desk's room camera, live (desk.js: api/camera, api/camera/frame).
//
// Frames are asked for one at a time, about every 700 ms, ONLY while this page is the one
// showing and the browser tab is visible. Asking is what keeps the camera open on the desk;
// stop asking and the desk lets it go ~10 s later. "360" looks around inside an
// equirectangular picture (drag, wheel / pinch to zoom); "Flat" shows the whole frame.
(function (root) {
  const $ = (s) => document.querySelector(s);
  const GAP_MS = 700, RETRY_MS = 3000, FOV_MIN = 30, FOV_MAX = 110, FOV_DEFAULT = 90;

  let mode = '360';
  let yaw = 0, pitch = 0, fov = FOV_DEFAULT;     // degrees
  let bitmap = null;                              // newest frame, decoded
  let frameAt = 0, frameTimes = [];
  let timer = null, inflight = false, shown = false, dirty = false, raf = 0;
  let gl = null, glState = null, glFailed = false;
  let camsSig = '';

  const stage = () => $('#camStage');
  const say = (t, bad) => { const m = $('#camMsg'); if (!m) return; m.textContent = t || ''; m.classList.toggle('bad', !!bad); };

  // ---------- frames ----------
  function schedule(ms) { clearTimeout(timer); timer = shown && !document.hidden ? setTimeout(pull, ms) : null; }

  async function pull() {
    if (inflight || !shown || document.hidden) return;
    inflight = true;
    let wait = GAP_MS;
    try {
      const r = await fetch('api/camera/frame?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok && /image\/jpeg/.test(r.headers.get('content-type') || '')) {
        const bmp = await createImageBitmap(await r.blob());
        if (bitmap && bitmap.close) bitmap.close();
        bitmap = bmp; frameAt = Date.now(); glState && (glState.fresh = true);
        frameTimes.push(frameAt); frameTimes = frameTimes.filter((t) => frameAt - t < 5000);
        say('');
        draw();
      } else {
        let j = {}; try { j = await r.json(); } catch (e) { /* not json */ }
        wait = RETRY_MS;
        if (j.code === 'unconfigured') { say('Choose a camera above.'); refreshStatus(); }
        else say(j.error ? (j.error[0].toUpperCase() + j.error.slice(1) + '.') : 'No picture.', true);
      }
    } catch (e) { wait = RETRY_MS; say('The desk did not answer.', true); }
    inflight = false;
    paintInfo();
    schedule(wait);
  }

  function paintInfo() {
    const el = $('#camInfo'); if (!el) return;
    if (!bitmap) { el.textContent = ' '; return; }
    const span = frameTimes.length > 1 ? (frameTimes[frameTimes.length - 1] - frameTimes[0]) / 1000 : 0;
    const fps = span > 0 ? (frameTimes.length - 1) / span : 0;
    el.textContent = bitmap.width + '×' + bitmap.height + ' · ' + (fps ? fps.toFixed(1) : '–') + ' fps' + (mode === '360' ? ' · ' + Math.round(fov) + '°' : '');
  }

  async function refreshStatus() {
    try {
      const st = await (await fetch('api/camera', { cache: 'no-store' })).json();
      const pick = $('#camPick');
      const sig = JSON.stringify([st.cameras, st.device]);
      if (pick && sig !== camsSig) {
        camsSig = sig;
        pick.innerHTML = '';
        if (!st.device) pick.add(new Option('Choose a camera…', ''));
        (st.cameras || []).forEach((c) => pick.add(new Option((c.name || 'camera') + ' · ' + c.device, c.device)));
        if (st.device) pick.value = st.device;
        pick.disabled = !(st.cameras || []).length;
      }
      if (!(st.cameras || []).length && !bitmap) say('No camera found on this machine.', true);
    } catch (e) { /* the pull reports it */ }
  }

  // ---------- drawing ----------
  function sizeCanvas(c) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(c.clientWidth * dpr)), h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; return true; }
    return false;
  }

  function initGl() {
    if (gl || glFailed) return !!gl;
    const c = $('#camGl');
    gl = c.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) { glFailed = true; return false; }
    const vs = '#version 300 es\nout vec2 uv; void main(){ vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2); uv = p*2.0-1.0; gl_Position = vec4(uv,0.0,1.0); }';
    const fs = '#version 300 es\nprecision highp float; in vec2 uv; out vec4 o; uniform sampler2D tex; uniform float yaw, pitch, tanH, aspect;\n'
      + 'void main(){ vec3 d = normalize(vec3(uv.x*aspect*tanH, uv.y*tanH, -1.0));\n'
      + ' float cp=cos(pitch), sp=sin(pitch); d = vec3(d.x, d.y*cp - d.z*sp, d.y*sp + d.z*cp);\n'
      + ' float cy=cos(yaw), sy=sin(yaw); d = vec3(d.x*cy + d.z*sy, d.y, -d.x*sy + d.z*cy);\n'
      + ' float lon = atan(d.x, -d.z); float lat = asin(clamp(d.y,-1.0,1.0));\n'
      + ' o = texture(tex, vec2(lon/6.2831853+0.5, 0.5-lat/3.1415927)); }';
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    try {
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      glState = { p, tex, fresh: true, u: {} };
      ['yaw', 'pitch', 'tanH', 'aspect', 'tex'].forEach((n) => { glState.u[n] = gl.getUniformLocation(p, n); });
    } catch (e) { glFailed = true; gl = null; return false; }
    return true;
  }

  function draw() { dirty = true; if (!raf) raf = requestAnimationFrame(render); }

  function render() {
    raf = 0; if (!dirty || !shown) return; dirty = false;
    const flat = mode === 'flat';
    $('#camGl').hidden = flat; $('#camFlat').hidden = !flat;
    if (flat) {
      const c = $('#camFlat'); sizeCanvas(c);
      const g = c.getContext('2d'); g.fillStyle = '#0a0a0b'; g.fillRect(0, 0, c.width, c.height);
      if (!bitmap) return;
      const k = Math.min(c.width / bitmap.width, c.height / bitmap.height);
      const w = bitmap.width * k, h = bitmap.height * k;
      g.drawImage(bitmap, (c.width - w) / 2, (c.height - h) / 2, w, h);
      return;
    }
    if (!initGl()) { say('This browser cannot draw the 360 view (WebGL 2). Use Flat.', true); return; }
    const c = $('#camGl'); sizeCanvas(c);
    gl.viewport(0, 0, c.width, c.height);
    gl.clearColor(0.04, 0.04, 0.045, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    if (!bitmap) return;
    gl.useProgram(glState.p);
    gl.bindTexture(gl.TEXTURE_2D, glState.tex);
    if (glState.fresh) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap); glState.fresh = false; }
    const u = glState.u, rad = Math.PI / 180;
    gl.uniform1f(u.yaw, yaw * rad); gl.uniform1f(u.pitch, pitch * rad);
    gl.uniform1f(u.tanH, Math.tan(fov * rad / 2)); gl.uniform1f(u.aspect, c.width / c.height);
    gl.uniform1i(u.tex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // ---------- look around ----------
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pts = new Map();
  let pinch = 0;
  function look(dx, dy) {
    const h = Math.max(1, $('#camGl').clientHeight);
    const per = fov / h;                       // degrees per pixel: the picture follows the finger
    yaw = ((yaw - dx * per + 540) % 360) - 180; pitch = clamp(pitch + dy * per, -89, 89);
    draw();
  }
  function zoom(f) { fov = clamp(fov * f, FOV_MIN, FOV_MAX); paintInfo(); draw(); }
  function bind() {
    const c = $('#camGl');
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); pinch = 0; });
    c.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      if (pts.size === 2) {
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) zoom(pinch / d); pinch = d; return;
      }
      look(e.clientX - p.x, e.clientY - p.y); p.x = e.clientX; p.y = e.clientY;
    });
    const up = (e) => { pts.delete(e.pointerId); pinch = 0; };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.08 : 1 / 1.08); }, { passive: false });
    c.addEventListener('dblclick', () => { yaw = 0; pitch = 0; fov = FOV_DEFAULT; paintInfo(); draw(); });
    $('#camMode360').addEventListener('click', () => setMode('360'));
    $('#camModeFlat').addEventListener('click', () => setMode('flat'));
    $('#camReset').addEventListener('click', () => { yaw = 0; pitch = 0; fov = FOV_DEFAULT; paintInfo(); draw(); });
    $('#camPick').addEventListener('change', async (e) => {
      if (!e.target.value) return;
      const r = await post('api/camera/config', { device: e.target.value });
      if (r && r.error) say(r.error, true); else { bitmap = null; frameTimes = []; camsSig = ''; say('Opening the camera…'); schedule(0); }
    });
    new ResizeObserver(() => draw()).observe(stage());
    document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(timer); timer = null; } else schedule(0); });
  }
  function setMode(m) {
    mode = m;
    $('#camMode360').classList.toggle('on', m === '360'); $('#camModeFlat').classList.toggle('on', m === 'flat');
    if (m === 'flat') say(''); paintInfo(); draw();
  }

  // app.js calls this on every page change; only this page asks the desk for frames.
  root.cameraPageShown = function (page) {
    const now = page === 'camera';
    if (now === shown) return;
    shown = now;
    if (now) { refreshStatus(); schedule(0); draw(); }
    else { clearTimeout(timer); timer = null; }
  };
  // Test hook: the view as numbers, so a picture can be checked against what was asked.
  root.cameraView = () => ({ mode, yaw, pitch, fov, frame: bitmap ? [bitmap.width, bitmap.height] : null, gl: !!gl });

  bind();
  if (location.hash === '#camera') root.cameraPageShown('camera');   // opened straight onto this page
}(window));
