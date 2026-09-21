// @vitest-environment node

// The only test here that touches a real NDI® runtime, and the only one that can fail
// for reasons outside this repo — so it is OFF unless you ask for it:
//
//   NDI_LIVE=1 npx vitest run serverXR/src/ndi/live.test.js
//
// It needs koffi, the runtime, and a source on the network. Start one with the test
// sender in another terminal, which needs no camera and no TouchDesigner:
//
//   node serverXR/src/ndi/devSender.js --name "di test"
//
// Then this walks the whole chain for real: fork the child → find the source → connect →
// capture → encode → a JPEG over IPC. CI never runs it (there is no libndi on a runner).
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createNdiManager } = require('./manager.js')
const { loadNdi } = require('./library.js')

const LIVE = process.env.NDI_LIVE === '1'
// Which source to look for — any fragment of a name, as everywhere else in this lane.
const SOURCE = process.env.NDI_LIVE_SOURCE || 'di test'

let manager = null
afterEach(() => { if (manager) { manager.close(); manager = null } })

describe.runIf(LIVE)('NDI for real (NDI_LIVE=1)', () => {
  it('loads the installed runtime and reports its version', () => {
    const loaded = loadNdi()
    expect(loaded.ok, `NDI did not load: ${loaded.reason} — ${loaded.how}`).toBe(true)
    const { bindNdi } = require('./binding.js')
    const ndi = bindNdi(loaded.koffi, loaded.lib)
    expect(ndi.fn.initialize()).toBe(true)
    // e.g. "NDI SDK WIN64 16:38:09 Apr 14 2026 6.3.2.0"
    expect(ndi.fn.version()).toMatch(/NDI/)
    ndi.fn.destroy()
  }, 30000)

  it('finds a source on the network', async () => {
    manager = createNdiManager()
    const summary = await manager.summary({ waitMs: 10000 })
    expect(summary.available, `${summary.reason} — ${summary.how}`).toBe(true)

    const list = await manager.getSources({ waitMs: 8000 })
    expect(list.sources.length, `no NDI sources visible — start one with: node serverXR/src/ndi/devSender.js --name "${SOURCE}"`).toBeGreaterThan(0)
    const names = list.sources.map((s) => s.name.toLowerCase())
    expect(names.some((n) => n.includes(SOURCE.toLowerCase())), `none of ${JSON.stringify(names)} contains "${SOURCE}"`).toBe(true)
  }, 40000)

  it('receives and encodes a real frame, and it is a JPEG of the right size', async () => {
    manager = createNdiManager()
    const frame = await manager.still({ name: SOURCE, waitMs: 15000 })
    expect(frame.error, `no picture: ${frame.error} ${frame.detail || ''}`).toBeUndefined()
    expect(frame.jpeg.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff])) // SOI + a marker
    expect(frame.jpeg.length).toBeGreaterThan(2000)
    expect(frame.width).toBeGreaterThan(0)
    expect(frame.height).toBeGreaterThan(0)

    // Asked smaller, the child resizes before the JPEG — the point of `w`.
    const small = await manager.still({ name: SOURCE, maxWidth: 320, waitMs: 15000 })
    expect(small.error).toBeUndefined()
    expect(small.width).toBe(320)
    expect(small.jpeg.length).toBeLessThan(frame.jpeg.length)
  }, 60000)

  // The two-machine defect, 2026-09-20. This needs the runtime but NO sender: it dials
  // a name discovery has never seen at an address nothing answers on, which is exactly
  // the shape of the failure met on the rig (source resolved, port never reached).
  // Measured on win / NDI 6.3.2.0: no_connections stays 0 and recv_capture returns
  // NDIlib_frame_type_none for ever. Before the fix that showed as `connecting` with an
  // empty detail; now it must say, in words, that no connection was opened.
  it('says WHY there is no picture when the sender can never be reached', async () => {
    const loaded = loadNdi()
    expect(loaded.ok, `NDI did not load: ${loaded.reason} — ${loaded.how}`).toBe(true)
    const { bindNdi } = require('./binding.js')
    const { noPictureDetail } = require('./diagnose.js')
    const ndi = bindNdi(loaded.koffi, loaded.lib)
    expect(ndi.fn.initialize()).toBe(true)
    expect(ndi.fn.recvNoConnections, 'this runtime has no NDIlib_recv_get_no_connections').toBeTypeOf('function')

    // TEST-NET-3 / a black-holed RFC1918 host: routed nowhere, answers nothing.
    const source = { name: 'NOSUCHHOST (nosuchsource)', address: process.env.NDI_LIVE_DEAD || '10.255.255.1:5961' }
    const recv = ndi.fn.recvCreate({
      source_to_connect_to: { p_ndi_name: source.name, p_url_address: source.address },
      color_format: ndi.NDI.COLOR_RGBX_RGBA, bandwidth: ndi.NDI.BANDWIDTH_HIGHEST,
      allow_video_fields: false, p_ndi_recv_name: 'di.iiii live test'
    })
    expect(recv).toBeTruthy()
    const framePtr = loaded.koffi.alloc(ndi.types.VideoFrame, 1)
    const startedAt = Date.now()
    let kind = null
    while (Date.now() - startedAt < 7000) kind = ndi.fn.recvCapture(recv, framePtr, null, null, 100)
    expect(kind, 'a black-holed address must never yield a video frame').not.toBe(ndi.NDI.FRAME_VIDEO)
    const connections = ndi.fn.recvNoConnections(recv)
    expect(connections, 'nothing answers there, so no session can be open').toBe(0)

    const detail = noPictureDetail({ connections, waitedMs: Date.now() - startedAt, source: source.name, address: source.address })
    expect(detail, 'the receiver must not be left with an empty reason').toBeTruthy()
    expect(detail).toContain(source.address)
    expect(detail).toMatch(/no connection/)
    ndi.fn.recvDestroy(recv); loaded.koffi.free(framePtr); ndi.fn.destroy()
  }, 30000)

  it('keeps a stream flowing and counts real frames per second', async () => {
    manager = createNdiManager()
    let frames = 0
    const sub = manager.subscribe({ name: SOURCE, maxWidth: 640, onFrame: () => { frames += 1 } })
    await new Promise((resolve) => setTimeout(resolve, 5000))
    sub.unsubscribe()
    // A 30 fps source, minus a second of finding and connecting: a low bar on purpose.
    expect(frames, 'no frames arrived in 5 s').toBeGreaterThan(20)
    const stats = manager.stats()
    expect(stats.worker).toBeTruthy()
    // The address the runtime was handed is reported — it is the first thing anyone
    // asks on a rig with more than one network, and the sender picks it, not us.
    expect(stats.receivers[0].address, 'the dialled address must reach stats').toMatch(/:\d+$/)
    console.log('[live] worker stats:', JSON.stringify(stats.worker.receivers))
  }, 30000)
})

// The lane pointed the other way, and the one test that needs no second machine and no
// second process: this di.iiii sends a picture and this di.iiii receives it back, both
// through the real runtime. It is the whole round trip — sharp decodes the JPEG we
// push, NDI carries the pixels, and the receive lane encodes a JPEG out the far side.
describe.runIf(LIVE)('sending a picture out, for real (NDI_LIVE=1)', () => {
  let sender = null
  afterEach(() => { if (sender) { sender.close(); sender = null } })

  it('puts a named source on the network and reads its own picture back', async () => {
    const sharp = require('sharp')
    const { createNdiSendManager } = require('./sendManager.js')
    const name = `di round trip ${process.pid}`
    const W = 320
    const H = 180

    // A warm field, never white: this can end up on a wall by accident and the standing
    // rule in this studio is that white never goes on a projector.
    const raw = Buffer.alloc(W * H * 3)
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const o = (y * W + x) * 3
        raw[o] = 40 + Math.round((y / H) * 120)
        raw[o + 1] = 16 + Math.round((y / H) * 48)
        raw[o + 2] = 10
      }
    }
    const jpeg = await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 85 }).toBuffer()

    sender = createNdiSendManager()
    const summary = await sender.summary()
    expect(summary.available, `the send lane did not load NDI: ${summary.reason} — ${summary.how}`).toBe(true)

    // Keep pushing: an output that stops being fed closes itself after five seconds, and
    // the finder on the other side needs longer than that to notice a new source at all.
    const pushing = setInterval(() => { sender.pushFrame({ name, jpeg }) }, 40)
    try {
      manager = createNdiManager()
      const still = await manager.still({ name, maxWidth: W, waitMs: 15000 })
      expect(still.error, `no picture came back: ${still.detail || still.reason || ''}`).toBeUndefined()
      expect(still.jpeg.length).toBeGreaterThan(0)
      expect(still.width).toBe(W)

      // And the sender knows it is being watched — the number that tells a person at the
      // rig the difference between "nobody has picked it yet" and "it is not working".
      const mine = sender.outputs().find((o) => o.name === name)
      expect(mine.state).toBe('sending')
      expect(mine.dropped).toBe(0)
    } finally {
      clearInterval(pushing)
    }
  }, 30000)
})
