// One Edit (Blender tool) wheel run, notch by notch: 40 in, then 20 out at the same spot, the scene distance measured, whether
// the notch counted as the same run, the distance used, the step. The rule (sceneDistance.js): inside a run the distance changes
// at most 1.2x per notch, so the step never jumps; through a surface the wheel never stops. 2026-10-13.
// NAV_URL=<studio url> di-test-browser run scripts/nav/probe-wheel-run.cjs
const { chromium } = require('playwright')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let page
const bye = async (code) => { try { await page.goto('about:blank') } catch {} try { await page.close() } catch {} process.exit(code) }
;(async () => {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    page = await browser.contexts()[0].newPage()
    await page.setViewportSize({ width: 1707, height: 960 })
    await page.goto(process.env.NAV_URL, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForSelector('canvas', { timeout: 60000 }); await sleep(6000)
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Edit', exact: true }).first().click({ timeout: 5000 }).catch(() => {}); await sleep(300)
    const box = await page.locator('canvas').first().boundingBox()
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45)
    await page.evaluate(() => { window.__diNavTrace = [] })
    for (const [n, dir] of [[40, 1], [20, -1]]) for (let i = 0; i < n; i++) { await page.mouse.wheel(0, -100 * dir); await sleep(90) }
    await sleep(500)
    const rows = await page.evaluate(() => { const t = window.__diNavTrace || []; const out = []; for (let i = 0; i < t.length; i++) if (t[i].action === 'wheel-measure') { const w = t[i + 1]; out.push([t[i].measured, t[i].consecutive ? 'run' : 'new', t[i].distance, w?.step ?? null]) } return out })
    let worst = 0; for (let i = 1; i < rows.length; i++) { const a = Math.abs(rows[i - 1][3] || 0), b = Math.abs(rows[i][3] || 0); if (a && b && rows[i][1] === 'run') worst = Math.max(worst, a / b, b / a) }
    console.log('RUN', JSON.stringify({ notches: rows.length, dead: rows.filter((r) => !r[3]).length, worstStepRatio: +worst.toFixed(3) }))
    rows.forEach((r, i) => console.log('N', i + 1, r.map((v) => (typeof v === 'number' ? +v.toFixed(3) : v)).join(' ')))
    await bye(0)
})().catch(async (e) => { console.log('ERR', String(e).slice(0, 200)); await bye(3) })
