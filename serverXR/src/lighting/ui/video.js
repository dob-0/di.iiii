'use strict';
/* global S, $$, clamp, post, say, stageMap, viewOf, spaceHeld, tool, deskNow, ObjCore -- defined by app.js and objects.js, loaded first */
// [video] Video pixel-mapping on the stage (from the studio desk, viz.di.formal branch studio,
// 2026-09-24; ported to di.iiii's light desk 2026-11-06).
//
// Her asks: "put the video signal in the preview, and whatever fixture is on that part
// lights as pixels, how it is in Resolume" — "make NDI the default" — "the video file and
// NDI and other signals".
//
// The picture comes into THIS page (the browser owns the capture APIs; the desk stays
// dependency-free). Sources, NDI first:
//   NDI / OMT              an NDI source received by di.iiii itself (serverXR/src/ndi,
//                          docs/architecture/NDI.md): the desk lists what its own finder sees
//                          (/ndi/api/sources) and draws the picked one from /ndi/in.mjpg — the
//                          same origin, so its pixels can be read. On a machine without the NDI
//                          runtime: an NDI source through NDI Tools' "NDI Webcam", or an OMT
//                          source (Open Media Transport, the MIT-licensed open alternative)
//                          through "OMT Mini" — both show up as a camera with NDI or OMT in its
//                          name. Default; remembered; reopened.
//   Window / screen        getDisplayMedia — pick Resolume's output window. Asked every time.
//   Camera / capture card  any camera or capture card, by name.
//   File                   a video (loops, play/pause) or a still image (png, jpg, gif…).
//   URL                    an http(s) video, image or MJPEG stream from another machine —
//                          reading its pixels needs its server to allow CORS, and it says so.
//   WebRTC                 a WHEP address (the open WebRTC playback standard): MediaMTX in
//                          front of RTSP/SRT/RTMP cameras, OBS via WHIP → MediaMTX, VDO.Ninja,
//                          another machine — about 0.2–0.5 s behind, never CORS-tainted.
//                          Reconnects by itself with a growing wait, and says so.
//   Test patterns          built in, no hardware: colour bars, a moving gradient, a
//                          left/right split, a rainbow sweep — for checking the mapping.
// It is drawn on every stage under the objects and the lights (it pans and zooms with
// them), each light averages the pixels under it, and the colours go to POST /api/pixels
// about 30 times a second. The server blends them over the look and drops them the moment
// they stop coming, so closing this tab can never leave the rig stuck on a frame.
//
// Loaded after app.js and objects.js; uses app.js's globals (S, $$, clamp, post, say,
// stageMap, viewOf, spaceHeld, tool). Hooks in app.js: placeStages() calls
// VideoMap.place(); undo knows /api/video. Everything else lives here and in video.css.
(() => {
  // NDI Tools 6 lists its virtual camera as "NDI Webcam Video" (and an "NDI Webcam Audio"
  // microphone, which is not a video input and never matches here). The camera exists as
  // soon as NDI Tools is installed — whether or not the NDI Webcam app is running and has
  // a source picked — so an NDI camera with no picture gets the same guidance as none.
  // OMT's "OMT Mini" tray app shows its sources the same way, so OMT sits with NDI — NDI
  // first when both are there.
  const NDI_RE = /\b(ndi|omt)\b/i;
  const OMT_RE = /\bomt\b/i;
  const LS_SOURCE = 'videoSource';   // {kind, label?, url?, pattern?}
  const LS_AUTO = 'videoAuto';       // '1' = reopen the remembered source on load
  const LS_URL = 'videoUrl';
  const LS_WHEP = 'videoWhep';
  const SAMPLE_W = 160;              // the sampling canvas: small, it only feeds averages
  const PREVIEW_W = 320;             // what the stage draws; the lights sit on top of it
  const TICK_MS = 33;                // ~30 fps
  // POST, sent with a raw fetch (see tick): named here so the contract lint reads it as a path.
  const PIXELS_URL = 'api/pixels';
  const RETRY_MS = 3000;
  const LOAD_MS = 8000;
  const NDI_OPEN = 'open NDI Webcam (Start menu → NDI Webcam), pick a source there';
  const NDI_MISSING = 'No NDI source yet — ' + NDI_OPEN;
  const BLANK_MS = 3000;             // an NDI camera with no picture this long gets the guidance
  // Resolume also runs Spout, which a browser cannot read — say which two ways do work.
  const RESOLUME_HINT = 'Resolume: use its NDI output, or pick its output window under Window';
  const WHEP_HINT = 'WebRTC: paste a WHEP address (MediaMTX, OBS, VDO.Ninja…)';
  const WHEP_BACKOFF = [1000, 2000, 4000, 8000, 15000];   // reconnect waits, the last one repeats
  // di.iiii's own NDI receiver. The desk lives at …/light/ (or …/light/space/<id>/) and /ndi is
  // its sibling under the same prefix (/serverXR/light → /serverXR/ndi). A desk standing alone,
  // without serverXR, has no /ndi: the camera way below is all it has.
  const ndiBase = () => { const m = /^(.*?\/)light(\/|$)/.exec(location.pathname); return (m ? m[1] : '/') + 'ndi/'; };
  const NDI_W = 320;                 // the receiver scales the picture to this width; the sampler reads 160
  const NDI_NONE = 'No NDI source on the network yet — start one (Resolume: Output → NDI); it is picked up by itself';
  // Wherever a person picks NDI in the product (docs/architecture/NDI.md, the licence position).
  const NDI_LEGAL = 'NDI® is a registered trademark of Vizrt NDI AB';
  let ndiHow = null;                 // the server's own sentence when this machine cannot receive NDI
  // [anim] the box's A → B animation, the mix's breathing, picture tone, file speed/loop —
  // the same defaults as pixelmap.js on the server.
  const DEFAULT_ANIM = { on: false, bx: 0, by: 0, bscale: 1, timing: 'beats', beats: 8, secs: 4, dir: 'pingpong', ease: 'smooth', phase: 0, loop: true, paused: false, hold: 0, t0: 0 };
  const DEFAULT_LFO = { on: false, timing: 'beats', beats: 8, secs: 4, depth: 0.5 };
  const DEFAULT = {
    x: 0, y: 0, w: 0, h: 0, mix: 255, sample: 6, on: false,
    speed: 1, loopIn: 0, loopOut: 0, bright: 0, contrast: 100, anim: DEFAULT_ANIM, lfo: DEFAULT_LFO,
  };
  const KIND_LABEL = { ndi: 'NDI / OMT', whep: 'WebRTC', screen: 'Window / screen', camera: 'Camera / capture card', file: 'File', url: 'URL', test: 'Test patterns' };
  const PATTERNS = { bars: 'Colour bars', gradient: 'Moving gradient', split: 'Left / right split', rainbow: 'Rainbow sweep' };

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private window */ } },
  };
  const remembered = () => { try { return JSON.parse(ls.get(LS_SOURCE) || 'null'); } catch (e) { return null; } };

  let V = { ...DEFAULT };      // our copy of state.video, edited optimistically
  let postedAt = 0;            // server copies are ignored for a moment after our own post
  let stripOpen = false;
  let chosen = 'ndi';          // the source button lit in the strip
  let src = null;              // what is running: {kind, label, deviceId?, url?}
  let media = null;            // what is drawn: {el, type: 'stream'|'video'|'image'|'canvas'}
  let pattern = 'bars';
  let waiting = null;          // {kind, label, why} while an NDI/camera source is awaited
  let retryTimer = null;
  let flashText = null, flashBad = false, flashUntil = 0;
  let lastErr = null;          // a refusal or failure that should stay on screen
  let tainted = false;         // the picture can be shown but not read (no CORS)
  let sentLights = 0, fps = 0, lastSent = 0, inflight = false;
  let lastDims = null;         // w × h, to notice a resolution change
  let lastFrameT = -1, frameStallSince = 0;
  let lastSig = -1;            // an MJPEG picture has no clock: a cheap signature of the last frame
  let everLit = false;         // has this NDI source shown anything but black yet
  let startedAt = 0;           // when the running source started
  let whep = null;             // {pc, location, url} while a WebRTC session is up
  let whepGen = 0;             // bumped by every stop/start: a connect that finishes late gives up
  let whepTimer = null, whepTry = 0;
  let autoTried = false, autoSeenLiveAt = 0;
  let drag = null;
  let fileUrl = null;

  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.loop = true;
  // `let`: a canvas that has drawn an unreadable (no-CORS) picture stays unreadable for
  // good, so after one it is thrown away and the next source gets a fresh one.
  let sampler = document.createElement('canvas');
  let sctx = sampler.getContext('2d', { willReadFrequently: true });
  const pat = document.createElement('canvas');
  pat.width = 320; pat.height = 180;

  // ---- small helpers ------------------------------------------------------------
  const channelsOf = (f) => ((S && S.profiles && S.profiles[f.profile]) || {}).channels || [];
  const excluded = () => new Set((S && S.fx && S.fx.exclude) || []);
  const mappable = (f, ex) => {
    const ch = channelsOf(f);
    return ch.includes('r') && ch.includes('g') && ch.includes('b') && !ex.has(f.profile);
  };
  const inRect = (f, b = V) => f.x >= b.x && f.x <= b.x + b.w && f.y >= b.y && f.y <= b.y + b.h;
  const bpmNow = () => (S && S.fx && S.fx.bpm) || 120;
  const nowDesk = () => (typeof deskNow === 'function' ? deskNow() : Date.now());
  // [anim] Where the box is now. Still: the saved rectangle (A). Travelling: from A to B on
  // the stage objects' own cycle maths (objcore.js), scaled about its centre on the way.
  function curBox(now = nowDesk()) {
    const a = V.anim;
    if (!a || !a.on || !(V.w > 0 && V.h > 0) || typeof ObjCore === 'undefined') return { x: V.x, y: V.y, w: V.w, h: V.h, q: null };
    const raw = ObjCore.animRaw(a, bpmNow(), now);
    const q = raw == null ? 0 : ObjCore.shape(raw, a.dir, a.ease);
    const s = 1 + ((+a.bscale || 1) - 1) * q;
    const cx = V.x + V.w / 2 + (a.bx - V.x) * q, cy = V.y + V.h / 2 + (a.by - V.y) * q;
    const w = V.w * s, h = V.h * s;
    return { x: cx - w / 2, y: cy - h / 2, w, h, q };
  }
  // [anim] Brightness and contrast, on the sampled colour (contrast 100 + brightness 0 = as is).
  const tone = (rgb) => {
    const k = (V.contrast == null ? 100 : V.contrast) / 100, off = (V.bright || 0) * 2.55;
    return rgb.map((c) => Math.max(0, Math.min(255, Math.round((c - 128) * k + 128 + off))));
  };
  // [anim] A video file: its speed, and the loop between in and out (out 0 = the whole file).
  function loopFile() {
    if (!media || media.type !== 'video') return;
    const a = +V.loopIn || 0, b = +V.loopOut || 0;
    if (b > a + 0.05 && (video.currentTime >= b || video.currentTime < a - 0.05)) video.currentTime = a;
    const rate = +V.speed || 1;
    if (Math.abs(video.playbackRate - rate) > 0.001) video.playbackRate = rate;
  }
  const running = () => !!src && !!media;
  const mw = () => (media ? media.el.videoWidth || media.el.naturalWidth || media.el.width || 0 : 0);
  const mh = () => (media ? media.el.videoHeight || media.el.naturalHeight || media.el.height || 0 : 0);
  const ready = () => !!media && mw() > 0 && mh() > 0 && (media.type === 'image' || media.type === 'canvas' || media.el.readyState >= 2);
  const aspect = () => (mw() && mh() ? mw() / mh() : 16 / 9);
  const isVideo = () => media && (media.type === 'video');
  const srcName = () => (src ? src.label || KIND_LABEL[src.kind] : '');
  const hostOf = (u) => { try { return new URL(u).host || u; } catch (e) { return u; } };

  function flash(text, bad, ms = 4500) { flashText = text; flashBad = !!bad; flashUntil = Date.now() + ms; paintStatus(); }
  function fail(text) { lastErr = text; flash(text, true, 9000); say(text, true); paintStrip(); }

  // ---- the setting on the server --------------------------------------------------
  // A throttle, not a debounce: while a slider or the box is being dragged the lights
  // follow every 100ms, instead of waiting for the hand to stop.
  let postTimer = null, postPatch = {};
  function postVideo(patch, now = false) {
    Object.assign(V, patch);
    Object.assign(postPatch, patch);
    postedAt = Date.now();
    if (S) S.video = { ...V };
    const go = () => { postTimer = null; const p = postPatch; postPatch = {}; if (Object.keys(p).length) post('api/video', p); };
    if (now) { clearTimeout(postTimer); go(); } else if (!postTimer) postTimer = setTimeout(go, 100);
  }

  // The rectangle that covers every mappable light with a margin, in the picture's shape.
  function fitRect(asp) {
    const ex = excluded();
    const L = (S ? S.fixtures : []).filter((f) => mappable(f, ex));
    if (!L.length) return { x: 0.1, y: 0.1, w: 0.8, h: 0.8 / asp };
    const xs = L.map((f) => +f.x), ys = L.map((f) => +f.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pad = 0.08;
    const bw = x1 - x0 + 2 * pad, bh = y1 - y0 + 2 * pad;
    const w = Math.max(bw, bh * asp), h = w / asp;
    return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h };
  }

  // ---- sources ----------------------------------------------------------------------
  // Ends a WebRTC session: close the connection and DELETE it on the server (the session
  // address from the answer's Location), so the sender stops sending to nobody.
  function closeWhep() {
    whepGen++;
    if (!whep) return;
    const w = whep; whep = null;
    w.pc.onconnectionstatechange = w.pc.ontrack = null;
    try { w.pc.close(); } catch (e) { /* already closed */ }
    if (w.location) fetch(w.location, { method: 'DELETE' }).catch(() => { /* the server may be gone */ });
  }
  function stopMedia() {
    closeWhep();
    if (media && media.type === 'stream' && media.stream) media.stream.getTracks().forEach((t) => { t.onended = null; t.stop(); });
    video.pause();
    video.onerror = null;
    video.srcObject = null;
    video.removeAttribute('src');
    video.removeAttribute('crossorigin');
    video.load();
    if (fileUrl) { URL.revokeObjectURL(fileUrl); fileUrl = null; }
    // An MJPEG picture (di.iiii's NDI receiver, or a URL) holds its connection open until its
    // address is taken away — and the receiver keeps the NDI source open while it does.
    if (media && media.type === 'image') { media.el.onerror = null; media.el.removeAttribute('src'); }
    media = null;
    if (tainted) {
      sampler = document.createElement('canvas');
      sctx = sampler.getContext('2d', { willReadFrequently: true });
      tainted = false;
    }
    lastDims = null; lastFrameT = -1; frameStallSince = 0; everLit = false; lastSig = -1;
  }
  function clearWaiting() {
    waiting = null; clearInterval(retryTimer); retryTimer = null;
    clearTimeout(whepTimer); whepTimer = null;
  }
  function showControls(kind) {
    for (const strip of $$('.videostrip')) {
      strip.querySelector('.vDev').hidden = !(kind === 'ndi' || kind === 'camera');
      // One address box serves URL and WebRTC, each with its own remembered address.
      const box = strip.querySelector('.vUrlBox');
      box.hidden = !(kind === 'url' || kind === 'whep');
      if (!box.hidden && box.dataset.kind !== kind) {
        box.dataset.kind = kind;
        const input = box.querySelector('.vUrl');
        input.value = ls.get(kind === 'whep' ? LS_WHEP : LS_URL) || '';
        input.placeholder = kind === 'whep' ? 'http://192.168.…:8889/cam/whep' : 'http://192.168.… or https://…';
        box.querySelector('.vGo').textContent = kind === 'whep' ? 'Connect' : 'Open';
        box.querySelector('.vGo').title = kind === 'whep' ? 'Connect to this WHEP address' : 'Open this address';
      }
      const hint = strip.querySelector('.vHint');
      hint.hidden = !(kind === 'ndi' || kind === 'screen' || kind === 'whep');
      hint.textContent = kind === 'whep' ? WHEP_HINT : RESOLUME_HINT;
      const legal = strip.querySelector('.vLegal');
      if (legal) legal.hidden = kind !== 'ndi';
      strip.querySelector('.vPat').hidden = kind !== 'test';
    }
  }

  // Camera names are only readable after one camera permission. Asked once; Chrome keeps
  // the answer for this address, so later visits list NDI sources without opening anything.
  async function cameras() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) throw new Error('This browser cannot list cameras');
    let cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    if (cams.length && cams.every((d) => !d.label)) {
      flash('Asking for camera access once, so NDI sources can be listed by name…', false, 8000);
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      s.getTracks().forEach((t) => t.stop());
      cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    }
    return cams;
  }

  // NDI before OMT, each in the order Windows lists them.
  const netFirst = (list) => [...list.filter((c) => !OMT_RE.test(c.label)), ...list.filter((c) => OMT_RE.test(c.label))];
  // The camera list: NDI / OMT sources grouped at the top, then everything else.
  function fillDevices(cams, kind, pick) {
    const net = netFirst(cams.filter((c) => NDI_RE.test(c.label)));
    const rest = cams.filter((c) => !NDI_RE.test(c.label));
    for (const sel of $$('.vDev')) {
      sel.innerHTML = '';
      const group = (label, list) => {
        if (!list.length) return;
        const g = document.createElement('optgroup');
        g.label = label;
        for (const c of list) {
          const o = document.createElement('option');
          o.value = c.deviceId; o.textContent = c.label || 'Camera';
          g.appendChild(o);
        }
        sel.appendChild(g);
      };
      group('NDI / OMT', net);
      if (kind !== 'ndi') group('Cameras and capture cards', rest);
      if (!sel.options.length) {
        const o = document.createElement('option');
        o.value = ''; o.textContent = kind === 'ndi' ? 'No NDI or OMT source' : 'No camera';
        sel.appendChild(o);
      }
      if (pick) sel.value = pick;
      sel.dataset.kind = kind;
    }
  }

  // di.iiii's own receiver: the names its NDI finder sees, or null when this desk cannot ask
  // (a desk standing alone, without serverXR; a hosted di.iiii answers 404). A machine without
  // the NDI runtime answers available:false and the server's own sentence on how to get it.
  async function ndiSources() {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), 4000) : null;
    try {
      const r = await fetch(`${ndiBase()}api/sources`, ctl ? { signal: ctl.signal } : undefined);   // the NDI lane, not the desk's api
      if (!r.ok || !/json/.test(r.headers.get('content-type') || '')) return null;
      const j = await r.json();
      ndiHow = j.available ? null : (j.how || null);
      const names = (Array.isArray(j.sources) ? j.sources : []).map((x) => x && x.name).filter((n) => typeof n === 'string' && n);
      return { available: !!j.available, sources: names };
    } catch (e) { return null; } finally { clearTimeout(t); }
  }
  const ndiMissing = () => (ndiHow ? `NDI cannot be received here — ${ndiHow}. Or ${NDI_OPEN}` : NDI_MISSING);

  function fillNative(names, pick) {
    for (const sel of $$('.vDev')) {
      sel.innerHTML = '';
      if (names.length) {
        const g = document.createElement('optgroup');
        g.label = 'NDI on the network';
        for (const n of names) { const o = document.createElement('option'); o.value = 'ndi:' + n; o.textContent = n; g.appendChild(o); }
        sel.appendChild(g);
      } else {
        const o = document.createElement('option'); o.value = ''; o.textContent = 'No NDI source yet'; sel.appendChild(o);
      }
      if (pick) sel.value = 'ndi:' + pick;
      sel.dataset.kind = 'ndi';
    }
  }

  // One source from di.iiii's receiver, drawn as MJPEG (the lowest-bandwidth stream the sender
  // offers is plenty: the sampler reads 160 pixels across). A picture that cannot be had yet —
  // the source is starting, or the receiver is — is waited for, not reported as broken.
  async function startNative(name, opts = {}) {
    clearWaiting(); stopMedia();
    chosen = 'ndi';
    const url = ndiBase() + 'in.mjpg?name=' + encodeURIComponent(name) + '&w=' + NDI_W + '&fps=30&bw=lowest';
    let img;
    try { img = await loadImage(url, false); }
    catch (e) {
      return awaitDevice({ kind: 'ndi', native: true, label: name, why: `Waiting for a picture from ${name} — retrying` });
    }
    const source = { kind: 'ndi', native: true, label: name };
    media = { el: img, type: 'image', mjpeg: true };
    src = source;
    everLit = true;   // the receiver sends real frames only: black is the show's black
    img.onerror = () => onEnded(source);
    ls.set(LS_SOURCE, JSON.stringify({ kind: 'ndi', native: true, label: name }));
    await afterStart();
    if (opts.reconnect) say(`Reconnected to ${name}`);
  }

  // NDI: di.iiii's receiver when this machine has the runtime — the remembered source by
  // name, else the first one on the network. Without it: the remembered camera by name, else
  // the first camera named NDI or OMT. Never any other camera — with no NDI source the answer
  // is a message and a retry, not the laptop webcam.
  async function startNdi(opts = {}) {
    chosen = 'ndi'; showControls('ndi'); paintStrip();
    const r = remembered();
    const want = opts.label || (r && r.kind === 'ndi' ? r.label : null);
    const nat = await ndiSources();
    if (nat && nat.available) {
      // A remembered NDI Webcam camera name means nothing to the receiver.
      const wantN = r && r.kind === 'ndi' && r.native ? want : (opts.label && !(r && r.label === opts.label) ? opts.label : null);
      const strict = !!(opts.strict && wantN);
      const hit = (wantN && nat.sources.find((n) => n === wantN)) || (strict ? null : nat.sources[0]);
      fillNative(nat.sources, hit);
      if (!hit) {
        return awaitDevice({ kind: 'ndi', native: true, label: strict ? wantN : null,
          why: strict ? `Reconnecting to ${wantN} — waiting for it to appear` : NDI_NONE });
      }
      return startNative(hit, opts);
    }
    let cams;
    try { cams = await cameras(); } catch (e) { return fail(permissionText(e, 'NDI')); }
    const ndi = netFirst(cams.filter((c) => NDI_RE.test(c.label)));
    const hit = (want && ndi.find((c) => c.label === want)) || (opts.strict && want ? null : ndi[0]);
    fillDevices(cams, 'ndi', hit && hit.deviceId);
    if (!hit) {
      awaitDevice({ kind: 'ndi', label: opts.strict ? want : null,
        why: opts.strict && want ? `Reconnecting to ${want} — waiting for it to appear` : ndiMissing() });
      return;
    }
    return startDevice('ndi', hit);
  }

  async function startCamera(opts = {}) {
    chosen = 'camera'; showControls('camera'); paintStrip();
    let cams;
    try { cams = await cameras(); } catch (e) { return fail(permissionText(e, 'Camera')); }
    const r = remembered();
    const want = opts.label || (r && r.kind === 'camera' ? r.label : null);
    const hit = opts.deviceId ? cams.find((c) => c.deviceId === opts.deviceId) : (want && cams.find((c) => c.label === want));
    fillDevices(cams, 'camera', hit && hit.deviceId);
    if (!hit) {
      if (opts.strict && want) return awaitDevice({ kind: 'camera', label: want, why: `Reconnecting to ${want} — waiting for it to appear` });
      flash(cams.length ? 'Pick a camera or capture card from the list' : 'No camera or capture card found', !cams.length, 8000);
      return;
    }
    return startDevice('camera', hit);
  }

  function awaitDevice(w) {
    stopMedia(); src = null;
    waiting = w;
    lastErr = null;
    flashUntil = 0;   // the wait is the news now — not whatever was said a moment ago
    clearInterval(retryTimer);
    retryTimer = setInterval(retryNow, RETRY_MS);
    paintStatus(); place();
  }
  async function retryNow() {
    if (!waiting || waiting.kind === 'whep') return;
    const w = waiting;
    if (w.native) {
      const nat = await ndiSources();
      if (!nat || !nat.available || waiting !== w) return;
      const hit = w.label ? nat.sources.find((n) => n === w.label) : nat.sources[0];
      if (!hit) return;
      fillNative(nat.sources, hit);
      await startNative(hit, { reconnect: true });
      return;
    }
    let cams;
    try { cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'); } catch (e) { return; }
    const hit = w.kind === 'ndi'
      ? cams.find((c) => (w.label ? c.label === w.label : NDI_RE.test(c.label)))
      : cams.find((c) => c.label === w.label);
    if (!hit || waiting !== w) return;
    fillDevices(cams, w.kind, hit.deviceId);
    await startDevice(w.kind, hit, { reconnect: true });
  }

  async function startDevice(kind, cam, opts = {}) {
    clearWaiting();
    let s;
    try {
      s = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: cam.deviceId }, frameRate: { ideal: 30 } }, audio: false,
      });
    } catch (e) {
      if (e && e.name === 'NotReadableError') {
        // Another program holds the camera (or NDI Webcam has no source picked yet).
        return awaitDevice({ kind, label: cam.label, why: `${cam.label} is busy or has no picture — retrying` });
      }
      return fail(permissionText(e, cam.label));
    }
    await beginStream({ kind, label: cam.label, deviceId: cam.deviceId }, s);
    ls.set(LS_SOURCE, JSON.stringify({ kind, label: cam.label }));
    if (opts.reconnect) say(`Reconnected to ${cam.label}`);
  }

  async function startScreen() {
    chosen = 'screen'; showControls('screen'); paintStrip();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return fail('This browser cannot capture a window');
    let s;
    try { s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: false }); }
    catch (e) {
      return fail(e && e.name === 'NotAllowedError'
        ? 'Window capture was cancelled — press Window / screen and pick Resolume\'s output window'
        : 'Could not capture a window: ' + ((e && e.message) || e));
    }
    const t = s.getVideoTracks()[0];
    await beginStream({ kind: 'screen', label: (t && t.label) || 'Window' }, s);
    ls.set(LS_SOURCE, JSON.stringify({ kind: 'screen' }));
  }

  // Any MediaStream, through the one path every live source takes — the tests feed a
  // canvas in here, which is exactly how a camera or a window arrives.
  async function beginStream(source, s) {
    clearWaiting(); stopMedia();
    media = { el: video, type: 'stream', stream: s };
    src = source;
    for (const t of s.getVideoTracks()) t.onended = () => onEnded(source);
    video.srcObject = s;
    await afterStart();
  }

  // A video element or an image, loaded from a URL; resolves when there is a picture.
  function loadVideo(url, cors) {
    return new Promise((res, rej) => {
      const done = (ok, e) => { clearTimeout(timer); video.oncanplay = video.onerror = null; ok ? res() : rej(e || new Error('cannot play')); };
      const timer = setTimeout(() => done(false, new Error('timed out')), LOAD_MS);
      video.oncanplay = () => done(true);
      video.onerror = () => done(false, video.error);
      if (cors) video.crossOrigin = 'anonymous'; else video.removeAttribute('crossorigin');
      video.srcObject = null;
      video.src = url;
      video.play().catch(() => { /* canplay decides */ });
    });
  }
  function loadImage(url, cors) {
    return new Promise((res, rej) => {
      const img = new Image();
      if (cors) img.crossOrigin = 'anonymous';
      let settled = false;
      const done = (ok, e) => { if (settled) return; settled = true; clearTimeout(timer); clearInterval(poll); ok ? res(img) : rej(e || new Error('cannot load')); };
      const timer = setTimeout(() => done(false, new Error('timed out')), LOAD_MS);
      // An MJPEG stream never "finishes" loading: it has a picture once it has a size.
      const poll = setInterval(() => { if (img.naturalWidth > 0) done(true); }, 100);
      img.onload = () => done(true);
      img.onerror = () => done(false, new Error('cannot load'));
      img.src = url;
    });
  }
  // Does it load at all when we do NOT ask for CORS? Then CORS is the only thing missing.
  async function loadsWithoutCors(url, asImage) {
    try {
      if (asImage) { const i = await loadImage(url, false); i.src = ''; return true; }
      const v = document.createElement('video'); v.muted = true;
      await new Promise((res, rej) => { const t = setTimeout(rej, LOAD_MS); v.oncanplay = () => { clearTimeout(t); res(); }; v.onerror = () => { clearTimeout(t); rej(); }; v.src = url; });
      v.removeAttribute('src'); v.load();
      return true;
    } catch (e) { return false; }
  }

  async function startFile(file) {
    chosen = 'file'; showControls('file');
    clearWaiting(); stopMedia();
    fileUrl = URL.createObjectURL(file);
    const image = /^image\//.test(file.type) || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name);
    try {
      if (image) media = { el: await loadImage(fileUrl, false), type: 'image' };
      else { await loadVideo(fileUrl, false); media = { el: video, type: 'video' }; }
    } catch (e) {
      stopMedia();
      return fail(`Could not open ${file.name} — the browser cannot play that file`);
    }
    src = { kind: 'file', label: file.name };
    ls.set(LS_SOURCE, JSON.stringify({ kind: 'file' }));
    await afterStart();
  }

  async function startUrl(url) {
    chosen = 'url'; showControls('url');
    url = (url || '').trim();
    if (!/^https?:\/\//i.test(url)) return fail('Type an address that starts with http:// or https://');
    ls.set(LS_URL, url);
    clearWaiting(); stopMedia();
    const host = hostOf(url);
    flash(`Opening ${host}…`, false, LOAD_MS);
    const looksImage = /\.(png|jpe?g|gif|webp|bmp)(\?|#|$)/i.test(url) || /mjpe?g|video\.cgi|action=stream|snapshot/i.test(url);
    const order = looksImage ? ['image', 'video'] : ['video', 'image'];
    for (const kind of order) {
      try {
        if (kind === 'image') media = { el: await loadImage(url, true), type: 'image' };
        else { await loadVideo(url, true); media = { el: video, type: 'video' }; }
        break;
      } catch (e) { stopMedia(); }
    }
    if (!media) {
      const plays = (await loadsWithoutCors(url, looksImage)) || (await loadsWithoutCors(url, !looksImage));
      return fail(plays
        ? `${host} plays, but its server does not allow CORS — pixel mapping has to read the picture. Serve it with "Access-Control-Allow-Origin: *", or bring it in through NDI or Window / screen`
        : `Could not play ${host} — the browser cannot open that address or format (HLS plays only where the browser supports it)`);
    }
    src = { kind: 'url', label: host, url };
    ls.set(LS_SOURCE, JSON.stringify({ kind: 'url', url }));
    await afterStart();
  }

  // WHEP: POST our offer (receive-only video, and audio so servers that insist on it are
  // happy — the audio is never played), take the 201 answer, keep the Location to DELETE
  // on stop. ICE gathering is awaited before posting: on a LAN nothing needs trickling.
  const iceDone = (pc, ms) => new Promise((res) => {
    if (pc.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, ms);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });

  async function startWhep(url, opts = {}) {
    chosen = 'whep'; showControls('whep');
    url = (url || '').trim();
    if (!/^https?:\/\//i.test(url)) return fail('Type a WHEP address that starts with http:// or https://');
    ls.set(LS_WHEP, url);
    clearWaiting(); stopMedia();
    const gen = whepGen;
    const host = hostOf(url);
    if (!opts.retry) { whepTry = 0; flash(`Connecting to ${host} over WebRTC…`, false, 10000); }
    else { waiting = { kind: 'whep', label: host, why: `Reconnecting to ${host} over WebRTC…` }; paintStatus(); place(); }
    if (typeof RTCPeerConnection !== 'function') return fail('This browser cannot play WebRTC');
    let pc = null;
    const gone = () => { if (pc) { try { pc.close(); } catch (e) { /* closed */ } } };
    try {
      pc = new RTCPeerConnection();
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
      const gotVideo = new Promise((res) => { pc.ontrack = (e) => { if (e.track.kind === 'video') res(e.track); }; });
      await pc.setLocalDescription(await pc.createOffer());
      await iceDone(pc, 3000);
      if (gen !== whepGen) return gone();
      let r;
      try {
        r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/sdp' }, body: pc.localDescription.sdp });
      } catch (e) {
        throw new Error(`${host} did not answer — is the WHEP server running, and does it allow CORS?`);
      }
      if (gen !== whepGen) return gone();
      if (r.status !== 201 && r.status !== 200) {
        throw new Error(r.status === 404 ? `${host} has no stream at that address (404) — is the sender publishing?`
          : `${host} refused the WebRTC request (${r.status} ${r.statusText || ''})`.trim());
      }
      const loc = r.headers.get('location');
      const answer = await r.text();
      if (gen !== whepGen) return gone();
      await pc.setRemoteDescription({ type: 'answer', sdp: answer });
      const track = await Promise.race([gotVideo, new Promise((res) => setTimeout(() => res(null), 8000))]);
      if (gen !== whepGen) return gone();
      if (!track) throw new Error(`${host} answered but sent no video`);
      const stream = new MediaStream([track]);
      await beginStream({ kind: 'whep', label: host, url }, stream);   // bumps whepGen: set whep after
      whep = { pc, url, location: loc ? new URL(loc, url).href : null };
      const dropped = (why) => { if (whep && whep.pc === pc) whepDropped(url, why); };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') dropped('the connection failed');
        else if (pc.connectionState === 'disconnected') {
          setTimeout(() => { if (pc.connectionState === 'disconnected') dropped('the connection went quiet'); }, 3000);
        }
      };
      // A sender that hangs up closes DTLS at once — no need to wait out the ICE timeouts.
      for (const rcv of pc.getReceivers()) {
        const t = rcv.transport;
        if (t) t.addEventListener('statechange', () => { if (t.state === 'closed' || t.state === 'failed') dropped('the sender hung up'); });
      }
      ls.set(LS_SOURCE, JSON.stringify({ kind: 'whep', url }));
      if (opts.retry) { say(`Reconnected over WebRTC to ${host}`); flash(`Reconnected over WebRTC to ${host}`, false, 4000); }
      whepTry = 0;
    } catch (e) {
      gone();
      if (gen !== whepGen) return;
      const msg = (e && e.message) || String(e);
      // A first try she typed gets the reason and stops; a reconnect keeps trying — the
      // sender may simply be restarting (MediaMTX answers 404 until OBS publishes again).
      if (opts.retry) whepDropped(url, msg);
      else fail(msg.startsWith(host) ? msg : `WebRTC from ${host}: ${msg}`);
    }
  }

  // Lost (or never got back): lights back on the look, wait, try again — and say so.
  function whepDropped(url, why) {
    const host = hostOf(url);
    stopMedia(); src = null;
    const wait = WHEP_BACKOFF[Math.min(whepTry, WHEP_BACKOFF.length - 1)];
    whepTry++;
    clearWaiting();
    waiting = { kind: 'whep', label: host, why: `WebRTC from ${host} dropped (${why}) — reconnecting in ${Math.round(wait / 1000)} s…` };
    lastErr = null; flashUntil = 0;
    if (whepTry === 1) say(`WebRTC from ${host} dropped — reconnecting, lights back on the look meanwhile`, true);
    whepTimer = setTimeout(() => { whepTimer = null; startWhep(url, { retry: true }); }, wait);
    paintStatus(); place();
  }

  async function startTest(name) {
    chosen = 'test'; showControls('test');
    if (name && PATTERNS[name]) pattern = name;
    clearWaiting(); stopMedia();
    drawPattern(performance.now());
    media = { el: pat, type: 'canvas' };
    src = { kind: 'test', label: PATTERNS[pattern] };
    ls.set(LS_SOURCE, JSON.stringify({ kind: 'test', pattern }));
    await afterStart();
  }

  // Built-in pictures, drawn every frame. Bars and split are still; gradient and rainbow move.
  function drawPattern(t) {
    const g = pat.getContext('2d'), W = pat.width, H = pat.height;
    if (pattern === 'bars') {
      const bars = ['#ffffff', '#ffff00', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#0000ff', '#000000'];
      bars.forEach((c, i) => { g.fillStyle = c; g.fillRect(Math.round((i * W) / 8), 0, Math.ceil(W / 8), H); });
    } else if (pattern === 'split') {
      g.fillStyle = '#ff0000'; g.fillRect(0, 0, W / 2, H);
      g.fillStyle = '#0000ff'; g.fillRect(W / 2, 0, W / 2, H);
    } else if (pattern === 'gradient') {
      // A band of light travelling left to right, once every four seconds.
      const off = ((t / 4000) % 1) * W;
      for (const shift of [off - W, off]) {
        const gr = g.createLinearGradient(shift, 0, shift + W, 0);
        gr.addColorStop(0, '#000000'); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(1, '#000000');
        g.fillStyle = gr; g.fillRect(shift, 0, W, H);
      }
    } else {
      // Rainbow: hue across the width, turning once every six seconds.
      const turn = ((t / 6000) % 1) * 360;
      for (let x = 0; x < W; x += 2) { g.fillStyle = `hsl(${(turn + (x / W) * 360) % 360} 100% 50%)`; g.fillRect(x, 0, 2, H); }
    }
  }

  async function afterStart() {
    lastErr = null;
    startedAt = Date.now();
    if (media.type === 'stream' || media.type === 'video') {
      try { await video.play(); } catch (e) { /* muted autoplay is allowed; canplay decides */ }
      if (!video.videoWidth) await new Promise((r) => { video.onloadedmetadata = r; setTimeout(r, 3000); });
    }
    lastDims = mw() + '×' + mh();
    const patch = { on: true };
    const asp = aspect();
    if (!(V.w > 0 && V.h > 0)) Object.assign(patch, fitRect(asp));
    else if (Math.abs(V.w / V.h - asp) > 0.01) {
      // A source of another shape keeps the box's place and width; its height follows,
      // or a 16:9 window would be squeezed into the last source's 4:3 box.
      const cy = V.y + V.h / 2, h = V.w / asp;
      Object.assign(patch, { y: cy - h / 2, h });
    }
    postVideo(patch, true);
    ls.set(LS_AUTO, '1');
    startTicker();
    // An NDI camera says "on" only once it has a picture (see tick) — until then the strip
    // says it is waiting, because nothing is going to the lights yet.
    if (src.kind !== 'ndi' || src.native) announceOn();
    place(); paintStrip();
  }

  function announceOn() {
    flash(`Video on — ${srcName()}`, false, 3000);
    say(`Video on the lights — ${srcName()}`);
  }

  function onEnded(source) {
    if (src !== source) return;
    stopMedia();
    if (source.kind === 'whep') {
      whepDropped(source.url, 'the picture ended');
    } else if (source.kind === 'ndi' || source.kind === 'camera') {
      awaitDevice({ kind: source.kind, native: !!source.native, label: source.label, why: `${source.label} stopped sending — reconnecting…` });
      say(`${source.label} stopped — reconnecting, lights back on the look meanwhile`, true);
    } else {
      src = null;
      postVideo({ on: false }, true);
      fail(source.kind === 'screen'
        ? 'Window sharing ended — lights back on the look. Press Window / screen to pick it again'
        : 'The video ended — lights back on the look');
    }
    place(); paintStrip();
  }

  function stop() {
    clearWaiting(); stopMedia();
    src = null;
    ls.set(LS_AUTO, '0');
    postVideo({ on: false }, true);
    lastErr = null;
    flash('Video stopped — lights back on the look', false, 6000);
    say('Video stopped — lights back on the look');
    place(); paintStrip();
  }

  function togglePlay() {
    if (!isVideo()) return;
    if (video.paused) { video.play().catch(() => {}); flash(`Playing ${srcName()}`, false, 2500); }
    else { video.pause(); flash('Paused — the lights hold this frame', false, 4000); }
    paintStrip();
  }

  function permissionText(e, what) {
    if (e && e.name === 'NotAllowedError') return `${what}: camera access was refused — allow it with the camera icon in the address bar`;
    if (e && e.name === 'NotFoundError') return what === 'NDI' ? NDI_MISSING : `${what}: not found`;
    return `${what}: ${(e && e.message) || e}`;
  }

  // What On (or opening the strip) starts when nothing is running: the remembered NDI or
  // camera source, else NDI. Never a window or a file — those need her to pick.
  function startDefault() {
    const r = remembered();
    if (r && r.kind === 'camera' && r.label) return startCamera({ label: r.label, strict: true });
    return startNdi({ label: r && r.kind === 'ndi' ? r.label : null });
  }

  // ---- the frame loop: sample, send, paint ------------------------------------------
  // Ticks come from a tiny inline worker: timers in a background tab are cut to once a
  // second, and the desk tab is usually behind Resolume. A worker's messages are not.
  let ticker = null, fallbackTimer = null;
  function startTicker() {
    if (ticker || fallbackTimer) return;
    try {
      const code = 'let t=null;onmessage=(e)=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data);};';
      ticker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
      ticker.onmessage = tick;
      ticker.postMessage(TICK_MS);
    } catch (e) {
      fallbackTimer = setInterval(tick, TICK_MS);
    }
  }

  function tick() {
    if (!running() || !S) return;
    loopFile();                                            // [anim]
    if (V.anim && V.anim.on && !stripOpen) place();        // [anim] the box travels on screen too
    if (media.type === 'canvas') drawPattern(performance.now());
    if (!ready()) return;
    const vw = mw(), vh = mh();
    const dims = vw + '×' + vh;
    if (lastDims && dims !== lastDims) {
      const [ow, oh] = lastDims.split('×').map(Number);
      if (oh && Math.abs(ow / oh - vw / vh) > 0.01 && V.w > 0) {
        const cy = V.y + V.h / 2, h = V.w / (vw / vh);
        postVideo({ y: cy - h / 2, h });
      }
      flash(`Picture changed to ${dims} — kept going, the video box follows its shape`, false, 6000);
    }
    lastDims = dims;
    // A live source whose clock stops is a frozen picture — say so, keep the layer.
    if (media.type === 'stream') {
      const t = video.currentTime;
      if (t === lastFrameT) { if (!frameStallSince) frameStallSince = Date.now(); }
      else { frameStallSince = 0; lastFrameT = t; }
    }
    paintPreview();
    if (tainted) return;

    const ch = Math.max(1, Math.round(SAMPLE_W * vh / vw));
    if (sampler.width !== SAMPLE_W || sampler.height !== ch) { sampler.width = SAMPLE_W; sampler.height = ch; }
    let img;
    try {
      sctx.drawImage(media.el, 0, 0, SAMPLE_W, ch);
      img = sctx.getImageData(0, 0, SAMPLE_W, ch).data;
    } catch (e) {
      // Shown, but not readable: a cross-origin picture without CORS taints the canvas.
      tainted = true;
      fail(`${srcName()} can be shown but not read — its server does not allow CORS, which pixel mapping needs`);
      return;
    }
    // An MJPEG picture has no clock to watch: one that has not changed at all for 3 s is said
    // (it may be a still, so the layer keeps going).
    if (media.mjpeg) {
      let sig = 0;
      for (let i = 0; i < img.length; i += 97) sig = (sig * 31 + img[i]) >>> 0;
      if (sig === lastSig) { if (!frameStallSince) frameStallSince = Date.now(); }
      else { frameStallSince = 0; lastSig = sig; }
    }
    // An NDI camera that has never shown anything but black is NDI Webcam not running, or
    // running with no source picked. Until its first real picture nothing is sent, so the
    // rig stays on the look while she sets it up; after that, black is the show's black.
    if (src && src.kind === 'ndi' && !everLit) {
      for (let i = 0; i < img.length; i += 16) { if (img[i] > 8 || img[i + 1] > 8 || img[i + 2] > 8) { everLit = true; break; } }
      if (!everLit) { sentLights = 0; return; }
      announceOn();
    }
    const side = Math.max(1, Math.round((V.sample / 100) * SAMPLE_W));
    const colors = {};
    const ex = excluded();
    let n = 0;
    const box = curBox();   // [anim] where the box is now — it may be travelling A → B
    if (box.w > 0 && box.h > 0) {
      for (const f of S.fixtures) {
        if (!mappable(f, ex) || !inRect(f, box)) continue;
        const cx = ((f.x - box.x) / box.w) * SAMPLE_W, cy = ((f.y - box.y) / box.h) * ch;
        const x0 = clamp(Math.round(cx - side / 2), 0, SAMPLE_W - 1), x1 = clamp(Math.round(cx + side / 2), x0 + 1, SAMPLE_W);
        const y0 = clamp(Math.round(cy - side / 2), 0, ch - 1), y1 = clamp(Math.round(cy + side / 2), y0 + 1, ch);
        let r = 0, g = 0, b = 0, k = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const i = (y * SAMPLE_W + x) * 4;
          r += img[i]; g += img[i + 1]; b += img[i + 2]; k++;
        }
        colors[f.id] = tone([r / k, g / k, b / k]);   // [anim] brightness / contrast
        n++;
      }
    }
    sentLights = n;
    // One request in flight at a time: a slow reply must not pile frames up behind it.
    // Raw fetch, not post(): post() marks the desk busy (it is how a fader edit holds off
    // the poll), and thirty of those a second would freeze every other panel's refresh.
    if (inflight || !V.on) return;
    inflight = true;
    const now = performance.now();
    fetch(PIXELS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ colors, source: srcName() }) })
      .then(() => {
        if (lastSent) { const inst = 1000 / Math.max(1, now - lastSent); fps = fps ? fps * 0.8 + inst * 0.2 : inst; }
        lastSent = now;
      })
      .catch(() => { fps = 0; })
      .finally(() => { inflight = false; });
  }

  function paintPreview() {
    const vw = mw(), vh = mh();
    if (!vw || !vh) return;
    for (const c of $$('.video-canvas')) {
      const layer = c.parentElement;
      if (!layer || layer.hidden || !layer.offsetParent) continue;
      const h = Math.max(1, Math.round(PREVIEW_W * vh / vw));
      if (c.width !== PREVIEW_W || c.height !== h) { c.width = PREVIEW_W; c.height = h; }
      c.getContext('2d').drawImage(media.el, 0, 0, PREVIEW_W, h);
    }
  }

  // ---- the layer on each stage --------------------------------------------------------
  function makeLayer() {
    const layer = document.createElement('div');
    layer.className = 'video-layer';
    // The grip is a title bar above the box: the lights sit on top of the picture and at a
    // normal zoom cover most of it, so the body alone left almost nothing to take hold of.
    layer.innerHTML = '<canvas class="video-canvas"></canvas><span class="video-tag"></span>'
      + '<span class="video-grip" title="Drag to move the video"></span><span class="video-handle" title="Drag to resize"></span>';
    layer.addEventListener('pointerdown', onLayerDown);
    layer.addEventListener('pointermove', onLayerMove);
    layer.addEventListener('pointerup', onLayerUp);
    layer.addEventListener('pointercancel', onLayerUp);
    return layer;
  }

  // Every stage view, whichever page it is on (Setup, Control, Touch and any later one):
  // the picture is the FIRST child of the stage's inner layer, so the objects' low layer,
  // the light squares and the objects' handles all paint over it, in that order.
  function place() {
    if (!S) return;
    const show = V.w > 0 && V.h > 0 && (V.on || stripOpen || running() || !!waiting);
    for (const inner of $$('.stagepane .stage-inner')) {
      let layer = inner.querySelector(':scope > .video-layer');
      if (!show) { if (layer) layer.hidden = true; placeGhost(inner, false); continue; }
      if (!layer) layer = makeLayer();
      if (inner.firstElementChild !== layer) inner.prepend(layer);
      layer.hidden = false;
      const { sc, ox, oy } = stageMap(inner.clientWidth || 0, inner.clientHeight || 0);
      const stage = inner.closest('.stage');
      const editable = stripOpen && !(stage && stage.classList.contains('viewonly'));
      // [anim] While the strip is open the box shows at A, where its grip edits it, with B as a
      // dashed ghost; closed, it shows where it is on its way from A to B.
      const box = editable ? V : curBox();
      layer.style.left = (ox + box.x * sc) + 'px';
      layer.style.top = (oy + box.y * sc) + 'px';
      layer.style.width = (box.w * sc) + 'px';
      layer.style.height = (box.h * sc) + 'px';
      placeGhost(inner, editable && V.anim && V.anim.on, sc, ox, oy);
      layer.classList.toggle('editing', editable);
      layer.classList.toggle('live', running());
      layer.classList.toggle('layeroff', !V.on);
      const text = tagText();
      layer.querySelector('.video-tag').textContent = text;
      layer.querySelector('.video-grip').textContent = text + ' · drag to move';
    }
  }

  // [anim] B: a dashed box where the video travels to, with its own grip. Right above the
  // picture, still under the lights.
  let gdrag = null;
  function placeGhost(inner, show, sc, ox, oy) {
    let g = inner.querySelector(':scope > .video-bghost');
    if (!show) { if (g) g.hidden = true; return; }
    if (!g) {
      g = document.createElement('div');
      g.className = 'video-bghost';
      g.innerHTML = '<span class="video-bgrip" title="Drag to set where the video travels to">B · where it travels to — drag</span>';
      g.addEventListener('pointerdown', onGhostDown);
      g.addEventListener('pointermove', onGhostMove);
      g.addEventListener('pointerup', onGhostUp);
      g.addEventListener('pointercancel', onGhostUp);
    }
    const layer = inner.querySelector(':scope > .video-layer');
    if (layer && layer.nextElementSibling !== g) layer.after(g);
    g.hidden = false;
    const a = V.anim, s = +a.bscale || 1;
    const w = V.w * s, h = V.h * s;
    const x = a.bx + V.w / 2 - w / 2, y = a.by + V.h / 2 - h / 2;
    g.style.left = (ox + x * sc) + 'px'; g.style.top = (oy + y * sc) + 'px';
    g.style.width = (w * sc) + 'px'; g.style.height = (h * sc) + 'px';
  }
  function onGhostDown(e) {
    if (!e.target.closest('.video-bgrip') || e.button !== 0 || spaceHeld) return;
    e.preventDefault(); e.stopPropagation();
    const g = e.currentTarget, inner = g.parentElement, stage = g.closest('.stage');
    const { sc } = stageMap(inner.clientWidth, inner.clientHeight);
    gdrag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, k: 1 / (sc * viewOf(stage).zoom), bx: V.anim.bx, by: V.anim.by };
    g.setPointerCapture(e.pointerId);
  }
  function onGhostMove(e) {
    if (!gdrag || e.pointerId !== gdrag.id) return;
    const dx = (e.clientX - gdrag.sx) * gdrag.k, dy = (e.clientY - gdrag.sy) * gdrag.k;
    postVideo({ anim: { ...V.anim, bx: clamp(gdrag.bx + dx, -1, 2), by: clamp(gdrag.by + dy, -1, 2) } });
    place();
  }
  function onGhostUp(e) {
    if (!gdrag || e.pointerId !== gdrag.id) return;
    gdrag = null;
    postVideo({}, true);
    flash('B set — close the strip to watch the video travel there', false, 4000);
  }

  function tagText() {
    if (waiting) return waiting.why;
    if (running()) return `${srcName()}${V.on ? '' : ' · preview only'}`;
    const live = S && S.videoLive;
    if (live && live.fresh) return `Video · ${live.source || 'live'} · from another screen`;
    return V.on ? 'Video · waiting for a picture' : 'Video · off';
  }

  function onLayerDown(e) {
    const layer = e.currentTarget;
    if (!layer.classList.contains('editing')) return;
    // Middle button, Space and the hand tool pan the stage, as everywhere else.
    if (e.button === 1 || spaceHeld || (typeof tool !== 'undefined' && tool === 'hand')) return;
    if (e.button !== 0 || e.target.closest('.fx-node')) return;
    e.preventDefault(); e.stopPropagation();
    const stage = layer.closest('.stage');
    const inner = layer.parentElement;
    const { sc } = stageMap(inner.clientWidth, inner.clientHeight);
    const v = viewOf(stage);
    drag = {
      id: e.pointerId, sx: e.clientX, sy: e.clientY, k: 1 / (sc * v.zoom),
      x: V.x, y: V.y, w: V.w, h: V.h, resize: e.target.classList.contains('video-handle'),
    };
    layer.setPointerCapture(e.pointerId);
    layer.classList.add('dragging');
  }
  function onLayerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = (e.clientX - drag.sx) * drag.k, dy = (e.clientY - drag.sy) * drag.k;
    if (drag.resize) {
      const w = clamp(drag.w + dx, 0.05, 3);
      postVideo({ w, h: w * (drag.h / drag.w) });
    } else {
      postVideo({ x: clamp(drag.x + dx, -1, 2), y: clamp(drag.y + dy, -1, 2) });
    }
    place();
  }
  function onLayerUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const was = drag; drag = null;
    e.currentTarget.classList.remove('dragging');
    postVideo({}, true);
    if (V.x !== was.x || V.y !== was.y || V.w !== was.w) {
      flash(was.resize ? 'Video resized — the lights under it follow' : 'Video moved — the lights under it follow', false, 3000);
    }
  }

  // ---- the strip ------------------------------------------------------------------------
  // inSlot: `host` is the Stage page's inspector slot, and the strip lives inside it.
  // Otherwise `host` is a stage pane, and the strip sits under its toolbar.
  function buildStrip(host, inSlot = false) {
    const strip = document.createElement('div');
    strip.className = 'videostrip' + (inSlot ? ' inslot' : '');
    strip.hidden = !stripOpen;
    strip.innerHTML = `
      <span class="vs-title">Video</span>
      <span class="vs-src">
        <button class="vsrc" data-src="ndi" title="An NDI source on the network, received by this desk — or, without the NDI runtime here, through NDI Tools' NDI Webcam or OMT Mini. The default">NDI / OMT</button>
        <button class="vsrc" data-src="screen" title="A window or a whole screen — pick Resolume's output window">Window / screen</button>
        <button class="vsrc" data-src="camera" title="A camera or a capture card, by name">Camera / capture card</button>
        <button class="vsrc" data-src="file" title="A video file (loops) or a still image">File</button>
        <button class="vsrc" data-src="url" title="An http(s) video, image or MJPEG stream from another machine">URL</button>
        <button class="vsrc" data-src="whep" title="WebRTC from a WHEP address — MediaMTX, OBS, VDO.Ninja, another machine">WebRTC</button>
        <button class="vsrc" data-src="test" title="Built-in pictures for checking the mapping — no hardware needed">Test patterns</button>
      </span>
      <select class="vDev" hidden title="Which source"></select>
      <span class="vHint" hidden>${RESOLUME_HINT}</span>
      <span class="vLegal muted" hidden>${NDI_LEGAL} — <a href="https://ndi.video" target="_blank" rel="noopener">ndi.video</a></span>
      <span class="vUrlBox" hidden><input type="text" class="vUrl" placeholder="http://192.168.… or https://…" spellcheck="false"><button class="vGo" title="Open this address">Open</button></span>
      <select class="vPat" hidden title="Which test pattern">${Object.entries(PATTERNS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <button class="vPlay" hidden title="Play or pause the video file — paused, the lights hold the frame">Pause</button>
      <button class="vOn" title="Send the picture to the lights, or keep it as a preview only">On</button>
      <label class="vs-slide" title="How much the video wins over the look: 100% = the lights show the video">Mix
        <input type="range" class="vMix" min="0" max="100" step="1"><span class="vMixV mono"></span></label>
      <label class="vs-slide" title="How big an area each light averages, as a share of the picture's width">Sample
        <input type="range" class="vSample" min="1" max="30" step="1"><span class="vSampleV mono"></span></label>
      <button class="vFit" title="Fit the video over the lights">Fit</button>
      <button class="vStop" title="Stop the video — the lights go back to the look">Stop</button>
      <button class="vAnimBtn" title="Move the box from A to B, breathe the mix, tune the picture, loop a file">Animate ▸</button>
      <span class="vStatus"></span>
      <button class="vClose" title="Close — the video keeps running">×</button>
      <div class="vs-anim">
        <span class="vs-group"><b>Box A → B</b>
          <button data-va="on" title="The box travels from where it is (A) to the dashed B box">Off</button>
          <label title="How long one cycle takes">Speed <input type="number" data-v="anim.speed" min="0" step="1"><select data-v="anim.timing"><option value="beats">beats</option><option value="secs">s</option></select></label>
          <label>Direction <select data-v="anim.dir"><option value="forward">Forward</option><option value="reverse">Reverse</option><option value="pingpong">Ping-pong</option></select></label>
          <label>Easing <select data-v="anim.ease"><option value="linear">Linear</option><option value="smooth">Smooth</option><option value="bounce">Bounce</option></select></label>
          <label title="How big the box is when it reaches B">Size at B <input type="number" data-v="anim.bscale" min="10" max="500" step="10"><span class="vs-u">%</span></label>
          <button data-va="play" title="Pause the box where it is, or play it on">Pause</button><button data-va="restart" title="From A again">Restart</button>
        </span>
        <span class="vs-group"><b>Mix breathes</b>
          <button data-va="lfo" title="The mix dips and comes back once every cycle">Off</button>
          <label>Every <input type="number" data-v="lfo.speed" min="0" step="1"><select data-v="lfo.timing"><option value="beats">beats</option><option value="secs">s</option></select></label>
          <label title="How far the mix dips each breath">Depth <input type="number" data-v="lfo.depth" min="0" max="100" step="5"><span class="vs-u">%</span></label>
        </span>
        <span class="vs-group"><b>Picture</b>
          <label title="Lifts or lowers every colour the lights take">Brightness <input type="number" data-v="bright" min="-100" max="100" step="5"></label>
          <label title="100% = as it is">Contrast <input type="number" data-v="contrast" min="0" max="300" step="10"><span class="vs-u">%</span></label>
        </span>
        <span class="vs-group vs-file"><b>File</b>
          <label title="Playback speed">Speed × <input type="number" data-v="speed" min="0.1" max="4" step="0.1"></label>
          <label>Loop from <input type="number" data-v="loopIn" min="0" step="0.5"><span class="vs-u">s</span></label>
          <label>to <input type="number" data-v="loopOut" min="0" step="0.5"><span class="vs-u">s</span></label>
          <button data-va="in" title="Loop from where the video is now">In = now</button><button data-va="out" title="Loop back at where the video is now">Out = now</button>
        </span>
      </div>
      <input type="file" class="vFile" accept="video/*,image/*" hidden>`;
    if (inSlot) host.appendChild(strip); else host.querySelector('.stage-tools').after(strip);
    strip.querySelector('.vUrl').value = ls.get(LS_URL) || '';

    strip.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.classList.contains('vsrc')) {
        const k = b.dataset.src;
        chosen = k; showControls(k); paintStrip();
        if (k === 'ndi') startNdi();
        else if (k === 'screen') startScreen();
        else if (k === 'camera') startCamera();
        else if (k === 'file') strip.querySelector('.vFile').click();
        else if (k === 'url' || k === 'whep') {
          const u = strip.querySelector('.vUrl'); u.focus();
          if (u.value) flash(k === 'whep' ? 'Press Connect to use this address, or paste another' : 'Press Open to use this address, or type another', false, 4000);
        }
        else startTest(strip.querySelector('.vPat').value);
      } else if (b.classList.contains('vGo')) {
        const u = strip.querySelector('.vUrl').value;
        if (chosen === 'whep') startWhep(u); else startUrl(u);
      } else if (b.classList.contains('vPlay')) {
        togglePlay();
      } else if (b.classList.contains('vOn')) {
        if (!running() && !waiting) { startDefault(); return; }
        postVideo({ on: !V.on }, true);
        flash(V.on ? 'Video on the lights' : 'Preview only — the lights are back on the look', false, 4000);
        place(); paintStrip();
      } else if (b.classList.contains('vFit')) {
        postVideo(fitRect(aspect()), true);
        flash('Video fitted over the lights', false, 3000);
        place();
      } else if (b.classList.contains('vStop')) {
        stop();
      } else if (b.classList.contains('vClose')) {
        setStrip(false);
      }
    });
    strip.querySelector('.vUrl').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (chosen === 'whep') startWhep(e.target.value); else startUrl(e.target.value); }
      e.stopPropagation();   // typing an address must not fire the desk's key bindings
    });
    strip.querySelector('.vDev').addEventListener('change', async (e) => {
      const sel = e.target;
      if (!sel.value) return;
      if (sel.value.startsWith('ndi:')) { startNative(sel.value.slice(4)); return; }
      const kind = sel.dataset.kind || 'camera';
      const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      const cam = cams.find((c) => c.deviceId === sel.value);
      if (cam) startDevice(kind, cam);
    });
    strip.querySelector('.vPat').addEventListener('change', (e) => {
      $$('.vPat').forEach((s) => { s.value = e.target.value; });
      if (src && src.kind === 'test') {
        pattern = e.target.value;
        src.label = PATTERNS[pattern];
        ls.set(LS_SOURCE, JSON.stringify({ kind: 'test', pattern }));
        flash(`Test pattern — ${PATTERNS[pattern]}`, false, 2500);
        place(); paintStrip();
      } else startTest(e.target.value);
    });
    strip.querySelector('.vFile').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) startFile(f);
      e.target.value = '';
    });
    strip.querySelector('.vMix').addEventListener('input', (e) => { postVideo({ mix: Math.round(+e.target.value * 2.55) }); paintStrip(); });
    strip.querySelector('.vSample').addEventListener('input', (e) => { postVideo({ sample: +e.target.value }); paintStrip(); });
    // [anim] the animation row
    if (!inSlot && ls.get('videoAnimOpen') === '1') strip.classList.add('anim-open');
    strip.querySelector('.vAnimBtn').addEventListener('click', () => {
      const open = !strip.classList.contains('anim-open');
      $$('.videostrip:not(.inslot)').forEach((s) => s.classList.toggle('anim-open', open));
      ls.set('videoAnimOpen', open ? '1' : '0');
      paintStrip();
    });
    strip.addEventListener('change', (e) => onAnimField(e, false));
    strip.addEventListener('input', (e) => { if (e.target.dataset && e.target.dataset.v && e.target.type === 'number') onAnimField(e, true); });
    strip.addEventListener('click', onAnimAct);
    return strip;
  }

  // [anim] The animation row's fields and buttons.
  const DIR_LABEL = { forward: 'Forward', reverse: 'Reverse', pingpong: 'Ping-pong' };
  function onAnimField(e, live) {
    const k = e.target.dataset && e.target.dataset.v;
    if (!k) return;
    const v = e.target.value, n = +v || 0, bpm = bpmNow();
    const A = { ...DEFAULT_ANIM, ...V.anim }, L = { ...DEFAULT_LFO, ...V.lfo };
    const patch = {};
    let msg = null;
    const speed = (o, val) => { if (o.timing === 'secs') o.secs = clamp(val, 0, 600); else o.beats = clamp(Math.round(val), 0, 64); };
    const timing = (o, to) => {
      if (to === o.timing) return;
      if (to === 'secs') { o.secs = Math.round((o.beats || 0) * 600 / bpm) / 10; o.timing = 'secs'; }
      else { o.beats = clamp(Math.round((o.secs || 0) * bpm / 60), 0, 64); o.timing = 'beats'; }
    };
    if (k === 'anim.speed') { speed(A, n); patch.anim = A; }
    else if (k === 'anim.timing') { timing(A, v); patch.anim = A; msg = v === 'secs' ? 'Box speed in seconds' : 'Box speed in beats — it follows the BPM'; }
    else if (k === 'anim.dir') { A.dir = v; patch.anim = A; msg = 'Box direction: ' + DIR_LABEL[v]; }
    else if (k === 'anim.ease') { A.ease = v; patch.anim = A; msg = 'Box easing: ' + v; }
    else if (k === 'anim.bscale') { A.bscale = clamp(n, 10, 500) / 100; patch.anim = A; }
    else if (k === 'lfo.speed') { speed(L, n); patch.lfo = L; }
    else if (k === 'lfo.timing') { timing(L, v); patch.lfo = L; }
    else if (k === 'lfo.depth') { L.depth = clamp(n, 0, 100) / 100; patch.lfo = L; }
    else if (k === 'bright') patch.bright = clamp(Math.round(n), -100, 100);
    else if (k === 'contrast') patch.contrast = clamp(Math.round(n), 0, 300);
    else if (k === 'speed') patch.speed = clamp(n || 1, 0.1, 4);
    else if (k === 'loopIn') patch.loopIn = Math.max(0, n);
    else if (k === 'loopOut') patch.loopOut = Math.max(0, n);
    else return;
    postVideo(patch, !live);
    if (msg) flash(msg, false, 3000);
    paintStrip();
  }
  function onAnimAct(e) {
    const b = e.target.closest && e.target.closest('[data-va]');
    if (!b) return;
    const act = b.dataset.va, now = nowDesk(), bpm = bpmNow();
    const A = { ...DEFAULT_ANIM, ...V.anim };
    if (act === 'on') {
      A.on = !A.on;
      // First time: B half a box to the right of A.
      if (A.on && Math.abs(A.bx - V.x) < 1e-6 && Math.abs(A.by - V.y) < 1e-6) { A.bx = clamp(V.x + V.w * 0.5, -1, 2); A.by = V.y; }
      if (A.on) Object.assign(A, ObjCore.restartFields(A, now));
      postVideo({ anim: A }, true);
      flash(A.on ? 'The box travels between A and B — drag the dashed B box; close the strip to watch it move' : 'The box stays at A', false, 5000);
    } else if (act === 'play') {
      Object.assign(A, A.paused ? ObjCore.playFields(A, bpm, now) : ObjCore.pauseFields(A, bpm, now));
      postVideo({ anim: A }, true);
      flash(A.paused ? 'Box paused where it is — the lights hold' : 'Box moving again', false, 3000);
    } else if (act === 'restart') {
      Object.assign(A, ObjCore.restartFields(A, now));
      postVideo({ anim: A }, true);
      flash('Box back at A — travelling again', false, 3000);
    } else if (act === 'lfo') {
      const L = { ...DEFAULT_LFO, ...V.lfo, on: !(V.lfo && V.lfo.on) };
      postVideo({ lfo: L }, true);
      flash(L.on ? `The mix breathes — down ${Math.round(L.depth * 100)}% and back, every ${L.timing === 'secs' ? L.secs + ' s' : L.beats + ' beats'}` : 'The mix stays put', false, 4000);
    } else if (act === 'in' || act === 'out') {
      if (!isVideo()) { flash('In and out are for a video file — pick one under File', true, 4000); return; }
      const t = Math.round(video.currentTime * 10) / 10;
      postVideo(act === 'in' ? { loopIn: t } : { loopOut: t }, true);
      flash(act === 'in' ? `Loop from ${t} s` : `Loop back at ${t} s`, false, 3000);
    } else return;
    place(); paintStrip();
  }

  function setStrip(open) {
    stripOpen = open;
    $$('.videostrip:not(.inslot)').forEach((s) => { s.hidden = !open; });
    $$('.videoBtn').forEach((b) => b.classList.toggle('is-active', open));
    paintSlots();
    // Opening it with nothing running goes straight to the default source: NDI.
    if (open && !running() && !waiting) startDefault();
    place(); paintStrip();
  }

  // The Stage page's inspector section shows while the strip is open or the video is on.
  function paintSlots() {
    const show = stripOpen || !!V.on || running() || !!waiting;
    for (const slot of $$('.sp-slot[data-slot="video-inspector"]')) {
      if (slot.querySelector('.videostrip')) slot.hidden = !show;
    }
  }

  function statusText() {
    if (flashText && Date.now() < flashUntil) return { text: flashText, bad: flashBad };
    if (lastErr) return { text: lastErr, bad: true };
    if (waiting) return { text: waiting.why, bad: true };
    if (!running()) return { text: V.on ? 'No picture — pick a source' : 'Off — pick a source, or press On for NDI', bad: false };
    if (!V.on) return { text: `${srcName()} — preview only, press On to send it to the lights`, bad: false };
    if (src.kind === 'ndi' && !everLit) {
      return Date.now() - startedAt > BLANK_MS
        ? { text: `${srcName()} has no picture yet — ${OMT_RE.test(srcName()) ? 'open OMT Mini and pick a source there' : NDI_OPEN}`, bad: true }
        : { text: `Waiting for a picture from ${srcName()}…`, bad: false };
    }
    if (frameStallSince && Date.now() - frameStallSince > 3000) return { text: `No new frames from ${srcName()} — is the source still playing?`, bad: true };
    if (!sentLights) return { text: 'No lights under the video — drag it over them, or press Fit', bad: true };
    const f = Math.round(fps);
    const lights = `Sending ${sentLights} light${sentLights === 1 ? '' : 's'}`;
    if (isVideo() && video.paused) return { text: `${lights} · paused — the lights hold this frame · ${srcName()}`, bad: false };
    if (document.hidden && f < 12) return { text: `${lights} · ${f} fps — the browser is slowing this background tab; give the desk its own window`, bad: true };
    // [anim] and what is animating
    const moving = (V.anim && V.anim.on ? (V.anim.paused ? ' · box paused' : ' · box moving A → B') : '')
      + (V.lfo && V.lfo.on ? ' · mix breathing' : '');
    return { text: `${lights} · ${f} fps · ${srcName()}${moving}`, bad: false };
  }

  function paintStatus() {
    const st = statusText();
    for (const el of $$('.vStatus')) { el.textContent = st.text; el.classList.toggle('bad', st.bad); }
    for (const b of $$('.videoBtn')) {
      b.classList.toggle('live', running() && V.on && !st.bad);
      b.classList.toggle('waiting', !!waiting || (st.bad && (running() || V.on)));
      b.title = 'Video — ' + st.text;
    }
  }

  // [anim] The animation row, from V (fields are left alone while focused).
  function paintAnimRow(strip) {
    const A = { ...DEFAULT_ANIM, ...V.anim }, L = { ...DEFAULT_LFO, ...V.lfo };
    const set = (k, val) => { const el = strip.querySelector(`[data-v="${k}"]`); if (el && document.activeElement !== el && el.value !== String(val)) el.value = val; };
    set('anim.timing', A.timing); set('anim.speed', A.timing === 'secs' ? A.secs : A.beats);
    set('anim.dir', A.dir); set('anim.ease', A.ease); set('anim.bscale', Math.round((A.bscale || 1) * 100));
    set('lfo.timing', L.timing); set('lfo.speed', L.timing === 'secs' ? L.secs : L.beats); set('lfo.depth', Math.round(L.depth * 100));
    set('bright', V.bright || 0); set('contrast', V.contrast == null ? 100 : V.contrast);
    set('speed', V.speed || 1); set('loopIn', V.loopIn || 0); set('loopOut', V.loopOut || 0);
    const on = strip.querySelector('[data-va="on"]'); on.textContent = A.on ? 'On' : 'Off'; on.classList.toggle('is-on', !!A.on);
    const lf = strip.querySelector('[data-va="lfo"]'); lf.textContent = L.on ? 'On' : 'Off'; lf.classList.toggle('is-on', !!L.on);
    const pl = strip.querySelector('[data-va="play"]'); pl.textContent = A.paused ? 'Play' : 'Pause'; pl.disabled = !A.on;
    strip.querySelector('[data-va="restart"]').disabled = !A.on;
    strip.querySelector('.vs-file').classList.toggle('dim', !isVideo());
    const btn = strip.querySelector('.vAnimBtn'); if (btn) btn.textContent = strip.classList.contains('anim-open') ? 'Animate ▾' : 'Animate ▸';
  }

  function paintStrip() {
    const mixPct = Math.round((V.mix / 255) * 100);
    for (const strip of $$('.videostrip')) {
      strip.querySelectorAll('.vsrc').forEach((b) => b.classList.toggle('is-active', b.dataset.src === chosen));
      const on = strip.querySelector('.vOn');
      on.textContent = V.on ? 'On' : 'Off';
      on.classList.toggle('is-on', !!V.on);
      const play = strip.querySelector('.vPlay');
      play.hidden = !isVideo();
      play.textContent = video.paused ? 'Play' : 'Pause';
      const mix = strip.querySelector('.vMix'), smp = strip.querySelector('.vSample');
      if (document.activeElement !== mix) mix.value = mixPct;
      if (document.activeElement !== smp) smp.value = V.sample;
      strip.querySelector('.vMixV').textContent = mixPct + '%';
      strip.querySelector('.vSampleV').textContent = V.sample + '%';
      const p = strip.querySelector('.vPat');
      if (document.activeElement !== p) p.value = pattern;
      paintAnimRow(strip);   // [anim]
    }
    paintStatus();
  }

  // ---- wiring -------------------------------------------------------------------------
  // Every editable stage pane gets the button and a strip — Setup, Control, and any stage
  // page added later (checked again every quarter second, so one that appears is wired).
  function wirePanes() {
    for (const pane of $$('.stagepane')) {
      if (pane.dataset.videoWired) continue;
      const stage = pane.querySelector('.stage');
      const tools = pane.querySelector('.stage-tools');
      if (!stage || !tools || stage.classList.contains('viewonly')) continue;
      pane.dataset.videoWired = '1';
      // The Stage page (stagepage.js) keeps slots for this: an icon in its vertical tool
      // rail, and the controls in its inspector, which stays in view while the stage is
      // edited ([data-obj-keep] — pressing there does not drop an object's selection).
      const railSlot = tools.querySelector('.sp-slot[data-slot="video-rail"]');
      const inspSlot = railSlot && pane.parentElement && pane.parentElement.querySelector('.sp-slot[data-slot="video-inspector"]');
      if (railSlot && inspSlot) {
        const btn = document.createElement('button');
        btn.className = 'tool videoBtn';
        btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14"/><path d="M10 9l5 3-5 3z"/></svg>';
        btn.addEventListener('click', () => setStrip(!stripOpen));
        railSlot.appendChild(btn);
        const strip = buildStrip(inspSlot, true);
        strip.hidden = false;
        continue;
      }
      // After the objects group (Line / Radar / Ring / Spot), else after the arrange tools.
      const objs = tools.querySelectorAll('.objBtn');
      const anchor = objs.length ? objs[objs.length - 1] : tools.querySelector('.circleBtn');
      const sep = document.createElement('span'); sep.className = 'sep';
      const btn = document.createElement('button');
      btn.className = 'tool videoBtn';
      btn.textContent = 'Video';
      btn.classList.toggle('is-active', stripOpen);
      btn.addEventListener('click', () => setStrip(!stripOpen));
      if (anchor) anchor.after(sep, btn); else tools.append(sep, btn);
      buildStrip(pane);
      showControls(chosen);
    }
  }

  function init() {
    wirePanes();
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', () => { if (waiting) retryNow(); });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && stripOpen && !(e.target && e.target.closest && e.target.closest('.videostrip input'))) setStrip(false);
    });
    // Keep in step with the server (another screen may move it), keep the picture under
    // the objects and the lights, and repaint the status.
    setInterval(() => {
      if (!S) return;
      wirePanes();
      if (S.video && !drag && Date.now() - postedAt > 2500) {
        const next = { ...DEFAULT, ...S.video };
        if (JSON.stringify(next) !== JSON.stringify(V)) { V = next; paintStrip(); }
      }
      if (!autoTried) autoReconnect();
      place();
      paintSlots();
      paintStatus();
    }, 250);
  }

  // Reopen the remembered source when the desk loads — NDI, a camera, a URL or a test
  // pattern (a window or a file needs her to pick again) — unless she pressed Stop last
  // time, or another screen is already sending (two senders would fight).
  function autoReconnect() {
    const r = remembered();
    const reopenable = r && ((r.kind === 'ndi' || r.kind === 'camera') ? !!r.label : (r.kind === 'url' || r.kind === 'whep') ? !!r.url : r.kind === 'test');
    if (ls.get(LS_AUTO) !== '1' || !reopenable) { autoTried = true; return; }
    // Pixels still arriving could be another screen — or this very page before a reload,
    // whose last frames stay fresh for a second. Give that a moment to fade before
    // deciding; a real second sender keeps them fresh, and then this page stays out.
    if (S.videoLive && S.videoLive.fresh) {
      if (!autoSeenLiveAt) autoSeenLiveAt = Date.now();
      if (Date.now() - autoSeenLiveAt < 3500) return;   // > two polls (1.5 s) past the 1 s freshness
      autoTried = true;
      flash('Video is live from another screen — not reconnecting here', false, 6000);
      return;
    }
    autoTried = true;
    chosen = r.kind;
    const name = (r.kind === 'url' || r.kind === 'whep') ? hostOf(r.url) : r.kind === 'test' ? PATTERNS[r.pattern] || 'test pattern' : r.label;
    flash(`Reconnecting to ${name}…`, false, 6000);
    say(`Reconnecting to ${name}…`);
    if (r.kind === 'ndi') startNdi({ label: r.label, strict: true });
    else if (r.kind === 'camera') startCamera({ label: r.label, strict: true });
    else if (r.kind === 'url') startUrl(r.url);
    else if (r.kind === 'whep') startWhep(r.url, { retry: true });
    else startTest(r.pattern);
  }

  window.VideoMap = {
    place,
    // For the harness and for anything else that has a MediaStream in hand: the same path
    // a camera or a window takes once it has been granted.
    startStream: (s, label = 'Test stream', kind = 'camera') => beginStream({ kind, label }, s),
    stop,
    status: () => ({
      ...statusText(), running: running(), waiting: waiting && { ...waiting }, src: src && { ...src },
      media: media && media.type, paused: isVideo() ? video.paused : null, loop: video.loop, pattern,
      sentLights, fps: Math.round(fps), V: { ...V }, stripOpen, chosen, box: curBox(),
    }),
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
