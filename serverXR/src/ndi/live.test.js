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
    console.log('[live] worker stats:', JSON.stringify(stats.worker.receivers))
  }, 30000)
})
