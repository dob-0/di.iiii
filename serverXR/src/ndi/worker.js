// The NDI® child — forked by manager.js (child_process.fork), never required by
// serverXR. The proprietary runtime lives HERE so a fault inside it costs a restart of
// this process, not the server. It receives AND encodes: only JPEG crosses the IPC.
//
//   parent → child   { type:'open', id, name, maxWidth, bandwidth }
//                    { type:'close', id }      { type:'shutdown' }
//   child → parent   { type:'ready', version, path }
//                    { type:'fatal', reason, how, detail }      (then exits 0 — do not restart)
//                    { type:'sources', sources:[{ name, address }] }      (on change)
//                    { type:'state', id, state, source, detail }
//                       state: waiting (finder has not seen the name) · connecting · live · stalled
//                    { type:'frame', id, jpeg:Buffer, width, height, seq }
//                    { type:'stats', receivers:{ [id]: {…} } }            (every 2 s)
//
// Every native wait (find 500 ms, capture 100 ms) runs through koffi's `.async`, on a
// koffi worker thread — this process's event loop stays free for IPC and for sharp.
const { loadNdi } = require('./library')
const { matchSourceName } = require('./names')

const CAPTURE_TIMEOUT_MS = 100
const FIND_WAIT_MS = 500
const FIRST_LIST_MS = 1500
const STALL_AFTER_MS = 3000
const STATS_EVERY_MS = 2000
const JPEG_QUALITY = 80
// Encodes in flight per receiver. Measured on the stage machine (i7-8565U): with ONE, a
// 27 ms 1080p encode meets a 33 ms frame gap badly — every frame that lands mid-encode is
// let go and 30 fps in becomes 22 out. Two overlap on sharp's thread pool; a frame that
// finishes after a newer one has gone out is dropped, so order never runs backwards.
const MAX_ENCODES = Math.max(1, Math.min(4, Number(process.env.DI_NDI_ENCODES) || 2))

const send = (message, done) => {
  if (!process.connected) return false
  try { process.send(message, done); return true } catch { return false }
}

const call = (fn, ...args) => new Promise((resolve, reject) => {
  fn.async(...args, (error, result) => (error ? reject(error) : resolve(result)))
})

function main() {
  const loaded = loadNdi()
  if (!loaded.ok) {
    send({ type: 'fatal', reason: loaded.reason, how: loaded.how, detail: loaded.detail || '' }, () => process.exit(0))
    return
  }
  let sharp
  let ndi
  try {
    sharp = require('sharp')
    ndi = require('./binding').bindNdi(loaded.koffi, loaded.lib)
    if (!ndi.fn.initialize()) throw new Error('NDIlib_initialize() returned false — this CPU is not supported by the runtime')
  } catch (error) {
    send({ type: 'fatal', reason: 'load-failed', how: loaded.how || require('./library').howFor(), detail: String(error?.message || error) }, () => process.exit(0))
    return
  }
  const { koffi, fn, types, NDI } = ndi
  send({ type: 'ready', version: fn.version(), path: loaded.path })

  let stopping = false
  let sources = []
  const receivers = new Map()

  // ── the finder ──────────────────────────────────────────────────────────────
  // DI_NDI_EXTRA_IPS: comma-separated addresses to ask directly, for a network (or a
  // Windows firewall) where mDNS does not arrive. An operator's env var — never a
  // value from a request.
  const extraIps = String(process.env.DI_NDI_EXTRA_IPS || '').trim() || null
  const finder = fn.findCreate({ show_local_sources: true, p_groups: null, p_extra_ips: extraIps })

  const publishSources = () => {
    const next = ndi.readSources(finder)
    const a = JSON.stringify(next)
    if (a === JSON.stringify(sources) && publishSources.sent) return
    sources = next
    publishSources.sent = true
    send({ type: 'sources', sources })
    for (const r of receivers.values()) if (!r.instance) tryConnect(r)
  }

  const findLoop = async () => {
    if (!finder) return
    // The first list is not published the instant the finder exists — it would always
    // be empty. It goes out when the finder reports a change, or after 1.5 s of nothing.
    const startedAt = Date.now()
    while (!stopping) {
      let changed = false
      try { changed = await call(fn.findWait, finder, FIND_WAIT_MS) } catch { break }
      if (stopping) break
      if (changed || publishSources.sent || Date.now() - startedAt >= FIRST_LIST_MS) publishSources()
    }
  }

  // ── receivers ───────────────────────────────────────────────────────────────
  const setState = (r, state, detail = '') => {
    if (r.state === state && r.detail === detail) return
    r.state = state; r.detail = detail
    send({ type: 'state', id: r.id, state, detail, source: r.source ? r.source.name : null })
  }

  const tryConnect = (r) => {
    // Only a name the finder has SEEN is ever connected. A client's string is a
    // question put to that list — never an address, never passed to the library as-is.
    const match = matchSourceName(sources, r.name)
    if (!match) { setState(r, 'waiting', `no NDI source matching "${r.name}" on this network yet`); return }
    r.source = match
    r.instance = fn.recvCreate({
      source_to_connect_to: { p_ndi_name: match.name, p_url_address: match.address || null },
      color_format: NDI.COLOR_RGBX_RGBA,
      bandwidth: r.bandwidth === 'lowest' ? NDI.BANDWIDTH_LOWEST : NDI.BANDWIDTH_HIGHEST,
      allow_video_fields: false,
      p_ndi_recv_name: 'di.iiii'
    })
    if (!r.instance) { setState(r, 'waiting', 'the NDI runtime refused to create a receiver'); return }
    r.framePtr = koffi.alloc(types.VideoFrame, 1)
    setState(r, 'connecting')
    captureLoop(r)
  }

  const captureLoop = async (r) => {
    r.looping = true
    let lastVideoAt = Date.now()
    while (!stopping && !r.closed) {
      const t0 = process.hrtime.bigint()
      let kind
      try {
        kind = await call(fn.recvCapture, r.instance, r.framePtr, null, null, CAPTURE_TIMEOUT_MS)
      } catch (error) {
        setState(r, 'stalled', String(error?.message || error)); break
      }
      if (kind === NDI.FRAME_VIDEO) {
        const gotAt = Date.now()
        r.stats.recvMs.push(Number(process.hrtime.bigint() - t0) / 1e6)
        r.stats.received += 1
        lastVideoAt = gotAt
        const v = koffi.decode(r.framePtr, types.VideoFrame)
        const rgb = v.FourCC === NDI.FOURCC_RGBA || v.FourCC === NDI.FOURCC_RGBX
        if (r.closed || r.encoding >= MAX_ENCODES || !rgb || !v.p_data || v.xres <= 0 || v.yres <= 0) {
          // Latest frame wins: while the encoders are busy this frame is simply let go.
          if (!rgb) r.stats.unsupported += 1; else r.stats.dropped += 1
        } else {
          // Copy out, give the library its buffer back at once, encode off the copy.
          const c0 = process.hrtime.bigint()
          const stride = v.line_stride_in_bytes > 0 ? v.line_stride_in_bytes : v.xres * 4
          const bytes = stride * v.yres
          const pixels = Buffer.allocUnsafe(bytes)
          pixels.set(new Uint8Array(koffi.view(v.p_data, bytes)))
          r.stats.copyMs.push(Number(process.hrtime.bigint() - c0) / 1e6)
          encode(r, pixels, v.xres, v.yres, stride)
        }
        fn.recvFreeVideo(r.instance, r.framePtr)
        if (r.state !== 'live') setState(r, 'live')
      } else if (kind === NDI.FRAME_ERROR) {
        setState(r, 'stalled', 'the connection to the source was lost')
      } else if (Date.now() - lastVideoAt > STALL_AFTER_MS && r.state === 'live') {
        setState(r, 'stalled', 'no picture for 3 s')
      }
    }
    r.looping = false
    destroyReceiver(r)
  }

  const encode = (r, pixels, width, height, stride) => {
    r.encoding += 1
    r.captured += 1
    const order = r.captured
    const e0 = process.hrtime.bigint()
    const rawWidth = Math.floor(stride / 4)
    let img
    let outW = width
    let outH = height
    if (r.maxWidth && width > r.maxWidth) {
      // Four channels make libvips premultiply around a resize — measured on the stage
      // machine (i7-8565U, 1080p → 1280): 53 ms, against 30 ms when the X byte is
      // dropped here first. So the resize path gets plain RGB.
      const rgb = Buffer.allocUnsafe(width * height * 3)
      for (let y = 0, o = 0; y < height; y += 1) {
        for (let i = y * stride, end = i + width * 4; i < end; i += 4, o += 3) {
          rgb[o] = pixels[i]; rgb[o + 1] = pixels[i + 1]; rgb[o + 2] = pixels[i + 2]
        }
      }
      outW = r.maxWidth
      outH = Math.max(1, Math.round(height * (r.maxWidth / width)))
      img = sharp(rgb, { raw: { width, height, channels: 3 } }).resize(outW, outH, { kernel: 'linear', fit: 'fill' })
    } else {
      img = sharp(pixels, { raw: { width: rawWidth, height, channels: 4 } })
      if (rawWidth !== width) img = img.extract({ left: 0, top: 0, width, height })
      img = img.removeAlpha()
    }
    img.jpeg({ quality: JPEG_QUALITY, optimiseCoding: false }).toBuffer()
      .then((jpeg) => {
        r.stats.encodeMs.push(Number(process.hrtime.bigint() - e0) / 1e6)
        if (r.closed) return
        if (order < r.sentOrder) { r.stats.dropped += 1; return }
        // Never queue on the pipe either: one frame in flight, the rest are let go.
        if (r.sending) { r.stats.dropped += 1; return }
        r.sending = true
        r.sentOrder = order
        r.seq += 1
        r.stats.sent += 1
        r.stats.bytes += jpeg.length
        r.stats.width = outW; r.stats.height = outH
        r.stats.sourceWidth = width; r.stats.sourceHeight = height
        if (!send({ type: 'frame', id: r.id, jpeg, width: outW, height: outH, seq: r.seq }, () => { r.sending = false })) r.sending = false
      })
      .catch((error) => { r.stats.encodeErrors += 1; r.lastError = String(error?.message || error) })
      .finally(() => { r.encoding -= 1 })
  }

  const destroyReceiver = (r) => {
    if (r.looping) return // the loop destroys it on its way out — never under a pending capture
    if (r.instance) { try { fn.recvDestroy(r.instance) } catch {} r.instance = null }
    if (r.framePtr) { try { koffi.free(r.framePtr) } catch {} r.framePtr = null }
  }

  const freshStats = () => ({
    since: Date.now(), received: 0, sent: 0, dropped: 0, unsupported: 0, encodeErrors: 0, bytes: 0,
    recvMs: [], copyMs: [], encodeMs: [], width: 0, height: 0, sourceWidth: 0, sourceHeight: 0
  })
  const mean = (list) => (list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 100) / 100 : null)
  const peak = (list) => (list.length ? Math.round(Math.max(...list) * 100) / 100 : null)

  const statsTimer = setInterval(() => {
    const out = {}
    const cpu = process.cpuUsage()
    for (const r of receivers.values()) {
      const s = r.stats
      const seconds = Math.max(0.001, (Date.now() - s.since) / 1000)
      out[r.id] = {
        name: r.name, source: r.source ? r.source.name : null, state: r.state, detail: r.detail,
        maxWidth: r.maxWidth, bandwidth: r.bandwidth,
        sourceWidth: s.sourceWidth, sourceHeight: s.sourceHeight, width: s.width, height: s.height,
        // recvMs is the wait inside recv_capture — mostly the gap between frames, not work.
        recvFps: Math.round((s.received / seconds) * 10) / 10,
        fps: Math.round((s.sent / seconds) * 10) / 10,
        recvMs: mean(s.recvMs), copyMs: mean(s.copyMs), encodeMs: mean(s.encodeMs), encodeMsMax: peak(s.encodeMs),
        bytesPerFrame: s.sent ? Math.round(s.bytes / s.sent) : 0,
        dropped: s.dropped, unsupported: s.unsupported, encodeErrors: s.encodeErrors, lastError: r.lastError || ''
      }
      r.stats = freshStats()
    }
    send({ type: 'stats', pid: process.pid, cpuUserMs: Math.round(cpu.user / 1000), cpuSystemMs: Math.round(cpu.system / 1000), rssMb: Math.round(process.memoryUsage().rss / 1048576), receivers: out })
  }, STATS_EVERY_MS)

  // ── messages ────────────────────────────────────────────────────────────────
  const shutdown = () => {
    if (stopping) return
    stopping = true
    clearInterval(statsTimer)
    for (const r of receivers.values()) r.closed = true
    // Give pending native waits (≤ 500 ms) time to return before the process goes.
    setTimeout(() => {
      for (const r of receivers.values()) destroyReceiver(r)
      try { if (finder) fn.findDestroy(finder) } catch {}
      try { fn.destroy() } catch {}
      process.exit(0)
    }, FIND_WAIT_MS + 150)
  }

  process.on('message', (message) => {
    if (!message || typeof message !== 'object') return
    if (message.type === 'open' && typeof message.id === 'string' && !receivers.has(message.id)) {
      const r = {
        id: message.id,
        name: String(message.name || '').slice(0, 200),
        maxWidth: Number(message.maxWidth) > 0 ? Math.floor(Number(message.maxWidth)) : 0,
        bandwidth: message.bandwidth === 'lowest' ? 'lowest' : 'highest',
        instance: null, framePtr: null, source: null, state: '', detail: '',
        closed: false, looping: false, encoding: 0, captured: 0, sentOrder: 0, sending: false, seq: 0, stats: freshStats()
      }
      receivers.set(r.id, r)
      tryConnect(r)
    } else if (message.type === 'close' && receivers.has(message.id)) {
      const r = receivers.get(message.id)
      receivers.delete(message.id)
      r.closed = true
      destroyReceiver(r)
    } else if (message.type === 'shutdown') {
      shutdown()
    }
  })
  // The parent went away (crash, kill -9, `di down`): nothing is left to serve.
  process.on('disconnect', shutdown)

  findLoop()
}

if (require.main === module) main()

module.exports = { main }
