#!/usr/bin/env node
// A test SENDER — an NDI® source with no camera, no TouchDesigner, no OBS:
//   node serverXR/src/ndi/devSender.js [--name "di test"] [--w 1280] [--h 720] [--fps 30] [--seconds 0]
// It needs the NDI runtime on this machine (library.js) and is never started by the
// server. The picture is a slow dark-warm field with grain, a moving bar and a frame
// counter — never white, so it can be left running on a wall.
const { loadNdi } = require('./library')
const { bindNdi } = require('./binding')

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const NAME = String(arg('--name', 'di test'))
const W = Math.max(64, Number(arg('--w', 1280)) | 0)
const H = Math.max(64, Number(arg('--h', 720)) | 0)
const FPS = Math.max(1, Number(arg('--fps', 30)) | 0)
const SECONDS = Number(arg('--seconds', 0))

const loaded = loadNdi()
if (!loaded.ok) { console.error(`[ndi sender] ${loaded.reason}: ${loaded.how}`); process.exit(2) }
const { fn, NDI } = bindNdi(loaded.koffi, loaded.lib, { send: true })
if (!fn.initialize()) { console.error('[ndi sender] this CPU is not supported by the NDI runtime'); process.exit(2) }

// The field is painted once (RGBX rows, deep brown → ember, with fixed grain so a JPEG
// encoder downstream has honest work); each frame is that field scrolled by whole rows
// — two memcpys — plus a bar and a seven-segment counter.
const field = Buffer.alloc(W * H * 4)
for (let y = 0; y < H; y += 1) {
  const t = 0.5 - 0.5 * Math.cos((y / H) * Math.PI * 2)
  for (let x = 0; x < W; x += 1) {
    const grain = ((x * 73856093) ^ (y * 19349663)) & 15
    const o = (y * W + x) * 4
    field[o] = 28 + t * 110 + (x / W) * 40 + grain
    field[o + 1] = 12 + t * 46 + grain / 2
    field[o + 2] = 8 + t * 14
    field[o + 3] = 255
  }
}
const frame = Buffer.alloc(field.length)
const rect = (x0, y0, w, h, r, g, b) => {
  for (let y = Math.max(0, y0); y < Math.min(H, y0 + h); y += 1) {
    for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x += 1) {
      const o = (y * W + x) * 4
      frame[o] = r; frame[o + 1] = g; frame[o + 2] = b
    }
  }
}
//            a(top) b(top-right) c(bottom-right) d(bottom) e(bottom-left) f(top-left) g(middle)
const SEGMENTS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg']
const digit = (n, x, y, s) => {
  const on = SEGMENTS[n]; const t = Math.max(2, s >> 2); const c = [230, 150, 60]
  if (on.includes('a')) rect(x, y, s, t, ...c)
  if (on.includes('g')) rect(x, y + s - (t >> 1), s, t, ...c)
  if (on.includes('d')) rect(x, y + 2 * s - t, s, t, ...c)
  if (on.includes('f')) rect(x, y, t, s, ...c)
  if (on.includes('b')) rect(x + s - t, y, t, s, ...c)
  if (on.includes('e')) rect(x, y + s, t, s, ...c)
  if (on.includes('c')) rect(x + s - t, y + s, t, s, ...c)
}

const sender = fn.sendCreate({ p_ndi_name: NAME, p_groups: null, clock_video: true, clock_audio: false })
if (!sender) { console.error('[ndi sender] could not create the sender'); process.exit(2) }
console.log(`[ndi sender] "${NAME}" ${W}x${H}@${FPS} — runtime ${fn.version()} — pid ${process.pid}`)

let n = 0
let running = true
const started = Date.now()
const stop = () => { running = false }
process.on('SIGINT', stop); process.on('SIGTERM', stop)

const tick = () => {
  if (!running || (SECONDS > 0 && Date.now() - started > SECONDS * 1000)) {
    fn.sendDestroy(sender); fn.destroy(); process.exit(0)
  }
  const shift = ((n * 2) % H) * W * 4
  field.copy(frame, 0, shift); field.copy(frame, field.length - shift, 0, shift)
  const s = Math.max(8, H >> 4)
  rect((n * 6) % W, H - s, s * 3, s >> 1, 200, 96, 40)
  String(n % 1000000).padStart(6, '0').split('').forEach((d, i) => digit(Number(d), s + i * Math.round(s * 1.5), s, s))
  // clock_video:true → this call blocks until the frame is due: the runtime paces us.
  fn.sendVideo(sender, {
    xres: W, yres: H, FourCC: NDI.FOURCC_RGBX, frame_rate_N: FPS * 1000, frame_rate_D: 1000,
    picture_aspect_ratio: W / H, frame_format_type: NDI.FORMAT_PROGRESSIVE, timecode: NDI.TIMECODE_SYNTHESIZE,
    p_data: frame, line_stride_in_bytes: W * 4, p_metadata: null, timestamp: 0
  })
  n += 1
  if (n % (FPS * 5) === 0) console.log(`[ndi sender] ${n} frames, ${(n / ((Date.now() - started) / 1000)).toFixed(1)} fps`)
  setImmediate(tick)
}
tick()
