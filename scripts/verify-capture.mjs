/**
 * verify-capture.mjs — the runtime pass NODE_BACKLOG.md:155-158 owes:
 * drive source.webcam and source.mic in a REAL browser with Chromium's fake
 * media devices, and look at what actually happens.
 *
 * The two ways a naive run lies (docs/ai/known-fixes.md:297):
 *   - /raw behind AuthGate audits the sign-in card and reports clean —
 *     pass --token / VERIFY_API_TOKEN for a non-local base.
 *   - a seeded workspace hides panel windows (allNodesExample sets
 *     frame.visible=false), so capture never starts. This script places the
 *     nodes fresh from the palette instead — which also supplies the user
 *     gesture an AudioContext needs to leave "suspended".
 *
 * WHAT IT ASSERTS
 *   webcam: <video> reaches readyState>=2 with real dimensions, and the
 *           status overlay ("requesting…"/denied/unavailable) is gone.
 *   mic:    the meter bar's inline scaleX() actually VARIES over ~2.5s.
 *           A flat meter with status active is the suspended-AudioContext
 *           silent failure — the exact class this probe exists to catch.
 *   both:   no pageerror; a screenshot per node for a human to open.
 *
 * USAGE
 *   node scripts/verify-capture.mjs                                  # localhost:5173
 *   node scripts/verify-capture.mjs --base https://staging.di-studio.xyz --token <API_TOKEN>
 *
 * WebGL canvas readback is always black here (preserveDrawingBuffer:false, see
 * docs/ai/testing-tools.md) — screenshots are the only honest look at the
 * wired geom.plane, so this script takes them and the runner must OPEN them.
 */
import { chromium } from 'playwright'
import fs from 'node:fs/promises'

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : (process.argv.includes(`--${name}`) ? true : fallback)
}

const BASE = arg('base', 'http://localhost:5173')
const OUT = arg('out', '.verify-capture')
const API_TOKEN = arg('token', null) || process.env.VERIFY_API_TOKEN || null
await fs.mkdir(OUT, { recursive: true })

const browser = await chromium.launch({
  // full Chromium, not chrome-headless-shell: the shell build cannot capture
  // audio, so getUserMedia({audio:true}) hangs at "requesting" forever there
  channel: 'chromium',
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader'
  ]
})
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  permissions: ['camera', 'microphone']
})

if (API_TOKEN) {
  const res = await ctx.request.post(`${BASE}/serverXR/api/auth/session`, { data: { token: API_TOKEN } })
  if (!res.ok()) { console.error(`auth failed (${res.status()}) — refusing to audit the sign-in card`); process.exit(2) }
}

const page = await ctx.newPage()
const problems = []
page.on('pageerror', e => problems.push('pageerror: ' + String(e.message).slice(0, 160)))

await page.goto(`${BASE}/raw`, { waitUntil: 'load', timeout: 45000 })
// a cold dev server can still be compiling the editor bundle at this point —
// wait for the actual graph surface, not a fixed settle
await page.locator('.raw-graph-surface').waitFor({ timeout: 30000 })
await page.waitForTimeout(1500)

const placeNode = async (query, at) => {
  // double-click empty graph canvas -> palette (and the required user gesture).
  // Each call needs its own empty spot: a mounted panel window swallows the
  // double-click at a previous node's position.
  const input = page.locator('.raw-node-palette-input')
  for (let attempt = 0; attempt < 3 && !(await input.isVisible().catch(() => false)); attempt++) {
    await page.mouse.dblclick(at.x, at.y + attempt * 60)
    await page.waitForTimeout(1200)
  }
  await input.waitFor({ timeout: 8000 })
  await input.fill(query)
  await page.waitForTimeout(400)
  await input.press('Enter')
  await page.waitForTimeout(2500)
}

// ---- webcam ----
await placeNode('Webcam', { x: 380, y: 620 })
const video = page.locator('video').last()
let webcamOk = false
try {
  await page.waitForFunction(() => {
    const v = [...document.querySelectorAll('video')].at(-1)
    return v && v.readyState >= 2 && v.videoWidth > 0
  }, null, { timeout: 15000 })
  webcamOk = true
} catch { problems.push('webcam: video never reached readyState>=2 with dimensions') }
const webcamStatus = await page.locator('[role="status"]').allTextContents().catch(() => [])
if (webcamStatus.some(t => /denied|unavailable|error|requesting/i.test(t)))
  problems.push('webcam: status overlay still present: ' + webcamStatus.join(' | '))
const dims = await video.evaluate(v => `${v.videoWidth}x${v.videoHeight} readyState=${v.readyState}`).catch(() => 'n/a')
await page.screenshot({ path: `${OUT}/webcam.png` })

// ---- mic ----
await placeNode('Microphone', { x: 1050, y: 680 })
await page.waitForTimeout(1500)
const meter = page.locator('[class*="mic"][class*="meter"], .raw-mic-panel-meter-fill').first()
let micReadings = []
if (await meter.count()) {
  for (let i = 0; i < 25; i++) {
    micReadings.push(await meter.evaluate(el => el.style.transform || getComputedStyle(el).transform))
    await page.waitForTimeout(100)
  }
} else problems.push('mic: no meter element found')
const distinct = new Set(micReadings)
const micOk = distinct.size > 1
if (!micOk && micReadings.length)
  problems.push(`mic: meter flat across ${micReadings.length} samples (${[...distinct][0] || 'empty'}) — suspended AudioContext?`)
await page.screenshot({ path: `${OUT}/mic.png` })

console.log('webcam video:', dims, webcamOk ? 'OK' : 'FAIL')
console.log('mic meter distinct samples:', distinct.size, micOk ? 'OK (moving)' : 'FAIL (flat)')
for (const p of problems) console.log('PROBLEM:', p)
console.log(`screenshots in ${OUT}/ — open them; a green exit is not the verification`)
await browser.close()
process.exit(problems.length ? 1 : 0)
