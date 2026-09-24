// The NDI® send child — forked by sendManager.js (child_process.fork), never required
// by serverXR. The proprietary runtime lives HERE so a fault inside it costs a restart
// of this process, not the server. It is worker.js turned around: that one receives
// and encodes, this one decodes and sends, and only JPEG crosses the IPC either way.
// The picture is made in the browser (the TOP engine); the browser posts each frame to
// the local server, the server hands it here, and here it goes out as an NDI source
// any machine on the network can pick — Resolume, OBS, a media server, another di.iiii.
//
//   parent → child   { type:'open', id, name }
//                    { type:'frame', id, jpeg:Buffer, seq }
//                    { type:'close', id }      { type:'shutdown' }
//   child → parent   { type:'ready', version, path }
//                    { type:'fatal', reason, how, detail }      (then exits 0 — do not restart)
//                    { type:'state', id, state, detail, viewers }
//                       state: starting (no frame on the wire yet) · sending · failed
//                    { type:'stats', outputs:{ [id]: {…} } }            (every 2 s)
//
// The browser is the pacer. Nothing here waits on a clock: a frame goes out the moment
// it is decoded, and while one is on its way the newest arrival replaces the one
// before it — latest frame wins, never a queue. The send itself runs through koffi's
// `.async`, on a koffi worker thread — this process's event loop stays free for IPC
// and for sharp.
const { loadNdi } = require('./library')

const STATS_EVERY_MS = 2000
// How often each output asks the runtime who is connected. A timeout of 0 answers at
// once, so this is cheap — and once a second is plenty for a sentence a person reads.
const VIEWERS_EVERY_MS = 1000
// The frame rate written into every frame. It is a label, not a clock: with
// clock_video false the runtime sends whatever it is handed, when it is handed it, and
// receivers use the label only to size their buffers.
const NOMINAL_FPS = 30
// How long shutdown waits for a decode or a send already in flight before the senders
// go. A 1080p send is a few milliseconds; this is generous on purpose, because
// destroying a sender underneath its own send_video is a crash inside the runtime.
const DRAIN_MS = 250

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
    ndi = require('./binding').bindNdi(loaded.koffi, loaded.lib, { send: true })
    if (!ndi.fn.initialize()) throw new Error('NDIlib_initialize() returned false — this CPU is not supported by the runtime')
  } catch (error) {
    send({ type: 'fatal', reason: 'load-failed', how: loaded.how || require('./library').howFor(), detail: String(error?.message || error) }, () => process.exit(0))
    return
  }
  const { fn, NDI } = ndi
  send({ type: 'ready', version: fn.version(), path: loaded.path })

  let stopping = false
  const outputs = new Map()

  // ── outputs ─────────────────────────────────────────────────────────────────
  const setState = (o, state, detail = '') => {
    if (o.state === state && o.detail === detail) return
    o.state = state; o.detail = detail
    send({ type: 'state', id: o.id, state, detail, viewers: o.viewers })
  }

  // The sentence beside "sending". Nobody receiving is the ORDINARY case, not a fault:
  // an output comes up before anyone has chosen it in Resolume or OBS, and stays up
  // between shows. So it is said as a plain fact, the way a person would say it.
  const describe = (o) => {
    if (o.viewers === null) return `on the network as "${o.name}"`
    if (o.viewers === 0) return `on the network as "${o.name}" — nothing is receiving it yet, which is normal until someone picks it on another machine`
    return `on the network as "${o.name}" — ${o.viewers === 1 ? 'one receiver is' : `${o.viewers} receivers are`} watching`
  }

  // → how many receivers are connected to this sender, or null when this runtime has
  // no such entry point (or the call failed). Cheap, but never called on the hot path.
  const viewersOf = (o) => {
    if (!fn.sendNoConnections || !o.instance) return null
    try {
      const n = fn.sendNoConnections(o.instance, 0)
      return Number.isFinite(n) ? n : null
    } catch { return null }
  }

  const openOutput = (message) => {
    const o = {
      id: message.id,
      name: String(message.name || '').trim().slice(0, 200),
      instance: null, state: '', detail: '', viewers: null,
      closed: false, busy: false, pending: null, seq: 0,
      frames: 0, dropped: 0, decodeErrors: 0, width: 0, height: 0, lastError: '', stats: freshStats()
    }
    outputs.set(o.id, o)
    if (!o.name) { setState(o, 'failed', 'an output needs a name before it can go on the network'); return }
    // clock_video is FALSE here, and true in devSender.js — both on purpose. With true,
    // send_video blocks until the frame is due, which is exactly what a generator wants:
    // the runtime is its pacer. Here the browser is the pacer, frames arrive when they
    // arrive, and a blocking send would hold the pump while the next frames stack up in
    // the IPC pipe behind it — the picture would drift ever further behind the browser.
    o.instance = fn.sendCreate({ p_ndi_name: o.name, p_groups: null, clock_video: false, clock_audio: false })
    if (!o.instance) { setState(o, 'failed', `the NDI runtime refused to create a sender named "${o.name}"`); return }
    setState(o, 'starting', `bringing "${o.name}" up — waiting for its first frame`)
  }

  const acceptFrame = (o, jpeg, seq) => {
    // A failed or closing output has nowhere to put a frame: it is let go, and counted,
    // so the parent's numbers still add up.
    if (o.closed || !o.instance) { o.dropped += 1; return }
    // Latest frame wins: a frame still waiting when the next one lands is replaced, not
    // queued. A queue here would grow without bound the moment decode+send ran slower
    // than the browser, and the output would fall further behind every second.
    if (o.pending) o.dropped += 1
    o.pending = jpeg
    o.seq = seq
    pump(o)
  }

  // One pump per output, never re-entered: `busy` is the guard. It drains `pending`
  // one frame at a time — decode, then send, then look again — and destroys the output
  // on its way out if the output was closed underneath it.
  const pump = async (o) => {
    if (o.busy) return
    o.busy = true
    while (!stopping && !o.closed && o.pending) {
      const jpeg = o.pending
      o.pending = null
      const d0 = process.hrtime.bigint()
      let decoded
      try {
        // ensureAlpha: a JPEG has three channels; the runtime is handed four (RGBA).
        decoded = await sharp(jpeg).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      } catch (error) {
        o.decodeErrors += 1
        o.lastError = String(error?.message || error)
        continue
      }
      o.stats.decodeMs.push(Number(process.hrtime.bigint() - d0) / 1e6)
      const { data, info } = decoded
      if (o.closed) break
      if (info.channels !== 4 || info.width <= 0 || info.height <= 0) {
        o.decodeErrors += 1
        o.lastError = `decoded to ${info.width}x${info.height}x${info.channels}, not RGBA`
        continue
      }
      // The browser may resize between frames; NDI takes each frame's own size, so what
      // sharp reports is what goes on the wire, and stats carry the current size.
      const s0 = process.hrtime.bigint()
      try {
        await call(fn.sendVideo, o.instance, {
          xres: info.width, yres: info.height, FourCC: NDI.FOURCC_RGBA,
          frame_rate_N: NOMINAL_FPS * 1000, frame_rate_D: 1000,
          picture_aspect_ratio: info.width / info.height, frame_format_type: NDI.FORMAT_PROGRESSIVE,
          timecode: NDI.TIMECODE_SYNTHESIZE,
          p_data: data, line_stride_in_bytes: info.width * 4, p_metadata: null, timestamp: 0
        })
      } catch (error) {
        // The call itself refused — not a bad frame but a bad sender. Say so and stop
        // pumping; frames that still arrive are counted as dropped, not retried.
        o.lastError = String(error?.message || error)
        setState(o, 'failed', `the NDI runtime refused a frame for "${o.name}": ${o.lastError}`)
        break
      }
      o.stats.sendMs.push(Number(process.hrtime.bigint() - s0) / 1e6)
      o.stats.sent += 1
      o.frames += 1
      o.width = info.width; o.height = info.height
      if (o.state !== 'sending' && o.state !== 'failed') setState(o, 'sending', describe(o))
    }
    o.busy = false
    if (o.closed || stopping) destroyOutput(o)
  }

  const destroyOutput = (o) => {
    if (o.busy) return // the pump destroys it on its way out — never under a send in flight
    o.pending = null
    if (o.instance) { try { fn.sendDestroy(o.instance) } catch {} o.instance = null }
  }

  // ── who is watching ─────────────────────────────────────────────────────────
  const viewersTimer = setInterval(() => {
    for (const o of outputs.values()) {
      if (o.closed || !o.instance) continue
      const n = viewersOf(o)
      if (n === o.viewers) continue
      o.viewers = n
      // Only a sending output re-describes itself; "starting" and "failed" keep their
      // own sentence, and the count still travels with every state message.
      if (o.state === 'sending') setState(o, 'sending', describe(o))
    }
  }, VIEWERS_EVERY_MS)

  // ── stats ───────────────────────────────────────────────────────────────────
  // The per-window numbers (fps, the timings) reset every 2 s like worker.js; the counts
  // a person reads as totals — frames, dropped, decodeErrors — live on the output and
  // only ever grow, so "frames: 27" never means "27 in the last two seconds".
  const freshStats = () => ({ since: Date.now(), sent: 0, decodeMs: [], sendMs: [] })
  const mean = (list) => (list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 100) / 100 : null)
  const peak = (list) => (list.length ? Math.round(Math.max(...list) * 100) / 100 : null)

  const statsTimer = setInterval(() => {
    const out = {}
    const cpu = process.cpuUsage()
    for (const o of outputs.values()) {
      const s = o.stats
      const seconds = Math.max(0.001, (Date.now() - s.since) / 1000)
      out[o.id] = {
        name: o.name, state: o.state, detail: o.detail, viewers: o.viewers,
        frames: o.frames, dropped: o.dropped, decodeErrors: o.decodeErrors,
        width: o.width, height: o.height,
        fps: Math.round((s.sent / seconds) * 10) / 10,
        decodeMs: mean(s.decodeMs), decodeMsMax: peak(s.decodeMs), sendMs: mean(s.sendMs), sendMsMax: peak(s.sendMs),
        lastError: o.lastError || ''
      }
      o.stats = freshStats()
    }
    send({ type: 'stats', pid: process.pid, cpuUserMs: Math.round(cpu.user / 1000), cpuSystemMs: Math.round(cpu.system / 1000), rssMb: Math.round(process.memoryUsage().rss / 1048576), outputs: out, at: Date.now() })
  }, STATS_EVERY_MS)

  // ── messages ────────────────────────────────────────────────────────────────
  const shutdown = () => {
    if (stopping) return
    stopping = true
    clearInterval(statsTimer)
    clearInterval(viewersTimer)
    for (const o of outputs.values()) { o.closed = true; o.pending = null }
    // Give a decode or a send in flight time to return before the process goes.
    setTimeout(() => {
      for (const o of outputs.values()) destroyOutput(o)
      try { fn.destroy() } catch {}
      process.exit(0)
    }, DRAIN_MS)
  }

  // With advanced serialization a Buffer crosses the IPC as a Buffer; a plain
  // Uint8Array is accepted too. Anything else is not a frame and is left alone.
  const asBytes = (jpeg) => {
    if (Buffer.isBuffer(jpeg)) return jpeg.length ? jpeg : null
    if (jpeg instanceof Uint8Array) return jpeg.byteLength ? Buffer.from(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength) : null
    return null
  }

  process.on('message', (message) => {
    if (!message || typeof message !== 'object') return
    if (message.type === 'open' && typeof message.id === 'string' && !outputs.has(message.id)) {
      openOutput(message)
    } else if (message.type === 'frame' && outputs.has(message.id)) {
      const o = outputs.get(message.id)
      const jpeg = asBytes(message.jpeg)
      if (!jpeg) { o.lastError = 'a frame arrived that was not bytes'; return }
      acceptFrame(o, jpeg, Number(message.seq) || 0)
    } else if (message.type === 'close' && outputs.has(message.id)) {
      const o = outputs.get(message.id)
      outputs.delete(message.id)
      o.closed = true
      destroyOutput(o)
    } else if (message.type === 'shutdown') {
      shutdown()
    }
  })
  // The parent went away (crash, kill -9, `di down`): nothing is left to serve.
  process.on('disconnect', shutdown)
}

if (require.main === module) main()

module.exports = { main }
