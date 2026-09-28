#!/usr/bin/env node
// Look probe: inject N real relative mouse counts into a pointer-locked walk
// and read back how far the view turned. The check behind the numbers in
// src/components/lookSensitivity.js and walkModeConfig.js.
//
// Why a separate X server: the moves are real X input events (XTest via
// xdotool), so they must not go to the owner's own display — they would move
// his cursor, and a window on another virtual desktop cannot take pointer
// lock anyway. Rootful Xwayland inside a headless KWin gives a private X11
// screen where XTest works (a rootless Xwayland ignores XTest without libei):
//
//   kwin_wayland --virtual --xwayland --socket wl-looktest --width 1920 --height 1080 &
//   WAYLAND_DISPLAY=wl-looktest Xwayland :7 -geometry 1920x1080 -noreset &
//   echo "Xft.dpi: 144" | DISPLAY=:7 xrdb -merge      # DPR 1.5, as on the owner's screen
//   DISPLAY=:7 flatpak run org.chromium.Chromium --ozone-platform=x11 \
//       --user-data-dir=<tmp> --remote-debugging-port=9333 --start-maximized about:blank &
//
// Then, with a dev server up (any port but 4000/443/80):
//
//   DISPLAY=:7 node scripts/look-probe.mjs --url 'http://127.0.0.1:5391/moxir' \
//       [--cdp http://localhost:9333] [--counts 1000] [--step 10] [--settings '{"sens":1}']
//
// Prints JSON: raw-input result, DPR, Σ movementX the page saw, yaw turned in
// degrees, and the degrees expected from the page's own look settings. Needs
// the walker's ?inputdebug=1 readout, which the script adds to the URL.

import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'

const args = Object.fromEntries(
    process.argv.slice(2).reduce((acc, a, i, all) => {
        if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true'])
        return acc
    }, [])
)
const cdp = args.cdp || 'http://localhost:9333'
const counts = Number(args.counts || 1000)
const step = Number(args.step || 10)
const gapMs = Number(args.gap || 16)
if (!args.url) throw new Error('--url is required')
if (!process.env.DISPLAY) throw new Error('DISPLAY must name the private X server, never the owner\'s')

const xdo = (...a) => execFileSync('xdotool', a, { encoding: 'utf8' }).trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const url = new URL(args.url)
url.searchParams.set('inputdebug', '1')

const browser = await chromium.connectOverCDP(cdp)
const page = browser.contexts()[0].pages()[0]
if (args.settings) {
    await page.goto(url.origin + '/', { waitUntil: 'domcontentloaded' })
    await page.evaluate((s) => localStorage.setItem('di.iiii.look.v1', s), args.settings)
}
await page.goto(url.href, { waitUntil: 'domcontentloaded' })
const walk = page.getByText('Walk / Fly')
await walk.waitFor({ timeout: 60_000 })
await walk.click()
// A plain poll: waitForFunction never resolved over connectOverCDP here.
for (let i = 0; ; i++) {
    if (await page.evaluate(() => /inputdebug: waiting for mouse events/.test(document.body.innerText))) break
    if (i > 120) throw new Error('walk mode never showed the ?inputdebug readout')
    await sleep(250)
}
await sleep(Number(args.settle || 4000))

// A real click in the middle of the window: the user gesture pointer lock needs.
const win = xdo('search', '--onlyvisible', '--class', 'chromium').split('\n')[0]
const geo = Object.fromEntries(xdo('getwindowgeometry', '--shell', win).split('\n').map((l) => l.split('=')))
xdo('mousemove', String(Number(geo.X) + Math.round(geo.WIDTH / 2)), String(Number(geo.Y) + Math.round(geo.HEIGHT * 0.6)))
xdo('click', '1')
await sleep(600) // past BROKEN_LOCK_SETTLE_MS

const hud = () => page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find((d) => d.textContent.startsWith('lock:'))
    return el ? el.textContent : ''
})
const read = (text) => ({
    locked: /^lock: (?!none)/.test(text),
    broken: text.includes('marked broken'),
    yawDeg: Number((text.match(/yaw: [-\d.]+ rad \(([-\d.]+)°\)/) || [])[1]),
    raw: (text.match(/raw input: (\w+) \(([^)]*)\)/) || []).slice(1).join(' '),
    dpr: Number((text.match(/dpr: ([\d.]+)/) || [])[1]),
    sumX: Number((text.match(/Σ locked mvX: (-?\d+)/) || [])[1])
})

// One tiny move so the HUD has a baseline, then the measured sweep.
xdo('mousemove_relative', '--', '8', '0')
await sleep(200)
const before = read(await hud())
let sent = 0
while (sent < counts) {
    const d = Math.min(step, counts - sent)
    xdo('mousemove_relative', '--', String(d), '0')
    sent += d
    await sleep(gapMs)
}
await sleep(400)
const after = read(await hud())
const settings = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('di.iiii.look.v1') || 'null') } catch { return null }
})
// Default preset when nothing is stored: CS2 yaw 0.022 × sens 1.25.
const yaw = { cs2: 0.022, apex: 0.022, source: 0.022, valorant: 0.07, overwatch: 0.0066, fortnite: 0.5555, degrees: 1 }[settings?.game || 'cs2']
const degPerCount = (settings?.sens ?? 1.25) * yaw
const turned = before.yawDeg - after.yawDeg // yaw decreases turning right
console.log(JSON.stringify({
    countsSent: counts,
    stepPerEvent: step,
    locked: after.locked,
    lockMarkedBroken: after.broken,
    rawInput: after.raw,
    dpr: after.dpr,
    sumMovementX: after.sumX - before.sumX,
    turnedDeg: Number(turned.toFixed(4)),
    expectedDeg: Number((counts * degPerCount).toFixed(4)),
    degPerCountMeasured: Number((turned / counts).toFixed(6)),
    settings
}, null, 2))
xdo('key', 'Escape')
await browser.close().catch(() => {})
