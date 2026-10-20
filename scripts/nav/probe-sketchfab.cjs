// What Sketchfab's viewer does with the wheel (the owner's reference for the NAVIGATE tool and the public viewer, 2026-10-12):
// scroll with the pointer at a corner, then far out, then far in, then a double-click; the camera from the Viewer API
// (getCameraLookAt) after each. SF_HTML=<file with the embed> di-test-browser run scripts/nav/probe-sketchfab.cjs
const { chromium } = require('playwright')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let page
const bye = async (code) => { try { await page.goto('about:blank') } catch {} try { await page.close() } catch {} process.exit(code) }
;(async () => {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    page = await browser.contexts()[0].newPage()
    await page.setViewportSize({ width: 1500, height: 900 })
    await page.goto('file://' + process.env.SF_HTML, { waitUntil: 'domcontentloaded' })
    for (let i = 0; i < 120 && !(await page.evaluate(() => window.__ready || window.__err)); i++) await sleep(500)
    if (!(await page.evaluate(() => window.__ready))) { console.log('viewer not ready'); await bye(2) }
    await sleep(2000)
    const cam = async () => { const c = await page.evaluate(() => window.__get()); const d = Math.hypot(...c.position.map((v, i) => v - c.target[i])); return { pos: c.position.map((v) => +v.toFixed(2)), target: c.target.map((v) => +v.toFixed(2)), dist: +d.toFixed(3) } }
    const wheel = async (x, y, n, dir, gap = 40) => { await page.mouse.move(x, y); for (let i = 0; i < n; i++) { await page.mouse.wheel(0, -100 * dir); await sleep(gap) } await sleep(1500) }
    const shots = process.env.NAV_SHOTS
    const log = async (what) => { const c = await cam(); console.log('SF', JSON.stringify({ what, ...c })); if (shots) await page.screenshot({ path: `${shots}/sf-${what}.png` }) }
    await log('start')
    await wheel(700, 430, 5, 1); await log('in5-centre')
    await wheel(700, 430, 5, -1); await log('out5-centre')
    await wheel(120, 100, 10, 1); await log('in10-corner')
    await wheel(120, 100, 10, -1); await log('out10-corner')
    await wheel(700, 430, 60, -1); await log('out60')
    await wheel(700, 430, 60, -1); await log('out60-more')
    await wheel(700, 430, 60, 1); await log('in60')
    await wheel(700, 430, 60, 1); await log('in60-more')
    await wheel(700, 430, 100, 1, 15); await log('in100-more')
    await page.mouse.dblclick(700, 430); await sleep(2000); await log('dblclick-centre')
    await bye(0)
})().catch(async (e) => { console.log('ERR', String(e).slice(0, 200)); await bye(3) })
