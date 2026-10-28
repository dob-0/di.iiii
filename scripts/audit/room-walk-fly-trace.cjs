// Trace the walker pose in the room page while W is held: does it move, and does something put it back?
// WF_BASE=http://walkfly.diiii.localhost [WF_QS=?render=tech] di-test-browser run scripts/audit/room-walk-fly-trace.cjs   (DEV build; ends on about:blank)
const { chromium } = require('playwright')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let page
;(async () => {
    try {
        page = await (await chromium.connectOverCDP(process.env.DI_TEST_CDP)).contexts()[0].newPage()
        const errs = []; page.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 90)))
        await page.setViewportSize({ width: 1280, height: 900 })
        await page.goto(process.env.WF_BASE + '/moxir/p/moxir-v2-11' + (process.env.WF_QS || ''), { waitUntil: 'domcontentloaded', timeout: 90000 })
        await page.waitForSelector('canvas', { timeout: 90000 }); await sleep(12000)
        await page.getByRole('button', { name: /walk\s*\/\s*fly/i }).first().click()
        await sleep(3000)
        await page.evaluate(() => { window.__ids = 0; window.__last = window.__diiWalkerRef?.current; window.__swaps = [] ; setInterval(() => { const c = window.__diiWalkerRef?.current; if (c !== window.__last) { window.__swaps.push(performance.now() | 0); window.__last = c } }, 50) })
        const rows = []
        const box = await page.locator('canvas').first().boundingBox(); await page.mouse.move(box.x + 640, box.y + 450)
        for (let t = 0; t < 40; t++) {
            if (t === 4) await page.keyboard.down('w')
            if (t === 24) await page.keyboard.up('w')
            const s = await page.evaluate(() => { const p = window.__diiWalkerRef?.current; return p ? [+p.x.toFixed(1), +p.z.toFixed(1), +p.yaw.toFixed(2)] : null })
            rows.push((t < 4 || t >= 24 ? '.' : 'W') + JSON.stringify(s)); await sleep(500)
        }
        console.log('TRACE', rows.join(' '))
        console.log('SWAPS', JSON.stringify(await page.evaluate(() => window.__swaps)), 'ctxerrs', errs.filter((e) => /context/i.test(e)).length, 'canvases', await page.evaluate(() => document.querySelectorAll('canvas').length))
    } catch (e) { console.log('ERR', e.message) }
    try { await page.goto('about:blank'); await page.close() } catch {}
    process.exit(0)
})()
