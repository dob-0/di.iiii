// Where the walk controls sit on a screen, and whether any of them sits on another one. Measured with
// getBoundingClientRect, not by eye: PR #1170 round 2 (the Head light button covered the hint line on a phone).
//
//   HEAD_LIGHT_URL=<project url> di-test-browser run scripts/head-light/phone-layout.cjs
//   (DI_TEST_LANE=<n> pins a browser lane)
//
// For each size it opens the project walking in Low quality (a phone's), reads the box of the hint line and of every
// control, prints them, then prints every pair that overlaps by more than 1 px in both directions. On the touch sizes it
// then taps Fly, so the up/down buttons show, and measures again. Every context it opens is closed and its page left on about:blank.
const { chromium } = require('playwright')

const URL_MAIN = process.env.HEAD_LIGHT_URL
if (!URL_MAIN) { console.error('HEAD_LIGHT_URL is required'); process.exit(2) }

const SIZES = [
    { name: '320x568 touch', width: 320, height: 568, touch: true },
    { name: '360x740 touch', width: 360, height: 740, touch: true },
    { name: '390x844 touch', width: 390, height: 844, touch: true },
    { name: '800x600 desktop', width: 800, height: 600, touch: false },
    { name: '1280x720 desktop', width: 1280, height: 720, touch: false }
]
const SELECTORS = ['.live-scene-hint', '.live-scene-joystick', '.live-scene-fly-btn', '.live-scene-light-btn', '.live-scene-vert-controls', '.live-scene-exit']

const measure = (page) => page.evaluate((selectors) => {
    const items = []
    for (const sel of selectors) {
        for (const el of document.querySelectorAll(sel)) {
            const r = el.getBoundingClientRect()
            const cs = getComputedStyle(el)
            if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || cs.display === 'none') continue
            items.push({ sel: sel.replace('.live-scene-', ''), left: r.left, right: r.right, top: r.top, bottom: r.bottom, radius: cs.borderTopLeftRadius, text: (el.textContent || '').trim().slice(0, 44) })
        }
    }
    return { vw: window.innerWidth, vh: window.innerHeight, items }
}, SELECTORS)

const report = (label, m) => {
    const n = (v) => Math.round(v)
    console.log(`${label}  (viewport ${m.vw}x${m.vh})`)
    for (const it of m.items) {
        console.log(`  ${it.sel.padEnd(14)} x ${String(n(it.left)).padStart(4)}..${String(n(it.right)).padEnd(4)} y ${String(n(it.top)).padStart(4)}..${String(n(it.bottom)).padEnd(4)} radius ${it.radius}${it.text ? `  "${it.text}"` : ''}`)
    }
    const clashes = []
    for (let i = 0; i < m.items.length; i++) {
        for (let j = i + 1; j < m.items.length; j++) {
            const a = m.items[i]
            const b = m.items[j]
            const dx = Math.min(a.right, b.right) - Math.max(a.left, b.left)
            const dy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
            if (dx > 1 && dy > 1) clashes.push(`${a.sel} x ${b.sel}: ${n(dx)} x ${n(dy)} px`)
        }
    }
    const off = m.items.filter((it) => it.left < -1 || it.top < -1 || it.right > m.vw + 1 || it.bottom > m.vh + 1).map((it) => it.sel)
    console.log(`  overlaps: ${clashes.length ? clashes.join('; ') : 'none'}${off.length ? `   off screen: ${off.join(', ')}` : ''}`)
    return clashes.length + off.length
}

;(async () => {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    let problems = 0
    try {
        for (const size of SIZES) {
            const context = await browser.newContext(size.touch
                ? { viewport: { width: size.width, height: size.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' }
                : { viewport: { width: size.width, height: size.height }, colorScheme: 'dark' })
            const page = await context.newPage()
            try {
                await page.addInitScript(() => { try { window.sessionStorage.setItem('dii:arrive-walking', '1') } catch { /* blocked */ } })
                await page.goto(`${URL_MAIN}?quality=low`, { waitUntil: 'load' })
                await page.waitForSelector('.live-scene-light-btn', { timeout: 40000 })
                await page.waitForSelector('.live-scene-hint', { timeout: 20000 }).catch(() => {})
                await page.waitForTimeout(2500)
                problems += report(size.name, await measure(page))
                if (size.touch) {
                    await page.tap('.live-scene-fly-btn')
                    await page.waitForSelector('.live-scene-vert-controls', { timeout: 8000 }).catch(() => {})
                    await page.waitForTimeout(800)
                    problems += report(`${size.name}, after tapping Fly`, await measure(page))
                }
            } finally {
                await page.goto('about:blank').catch(() => {})
                await context.close().catch(() => {})
            }
        }
        console.log(problems ? `RESULT: ${problems} overlap(s) or off-screen control(s)` : 'RESULT: no overlap, nothing off screen, at every size')
    } finally {
        await browser.close().catch(() => {})
    }
    if (problems) process.exitCode = 1
})().catch((e) => { console.error(e); process.exit(1) })
