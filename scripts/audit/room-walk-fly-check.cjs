// Walk/Fly repro. WF_BASE=http://walkfly.diiii.localhost WF_OUT=<dir> WF_TAG=before|after di-test-browser run walkfly.cjs
const { chromium } = require('playwright')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const BASE = process.env.WF_BASE, OUT = process.env.WF_OUT, TAG = process.env.WF_TAG || 'before'
const PATH = '/moxir/p/moxir-v2-11'
let page
const state = () => page.evaluate(() => {
    const p = window.__diiWalkerRef?.current
    const a = document.activeElement
    return { pose: p ? { x: +p.x?.toFixed(2), y: +p.y?.toFixed(2), z: +p.z?.toFixed(2), yaw: +p.yaw?.toFixed(3), pitch: +p.pitch?.toFixed(3) } : null,
        lock: document.pointerLockElement?.tagName || null, focus: a ? a.tagName + (a.getAttribute('aria-label') ? '[' + a.getAttribute('aria-label') + ']' : '') : null,
        canvases: document.querySelectorAll('canvas').length }
})
const run = async (name, qs, preStrip) => {
    const errs = []
    page = await (await chromium.connectOverCDP(process.env.DI_TEST_CDP)).contexts()[0].newPage()
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)) })
    page.on('pageerror', (e) => errs.push('pageerror ' + e.message.slice(0, 160)))
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(BASE + PATH + qs, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForSelector('canvas', { timeout: 90000 }); await sleep(12000)
    const shot = (s) => page.screenshot({ path: `${OUT}/${TAG}-${name}-${s}.png` })
    await shot('1-loaded')
    if (preStrip) {
        const b = page.getByRole('button', { name: /^A$/ }).first()
        const n = await b.count(); console.log(name, 'strip buttons', n)
        if (n) { await b.click().catch((e) => console.log('stripclick', e.message.slice(0, 80))); await sleep(2500) }
        await shot('1b-strip')
    }
    const btn = page.getByRole('button', { name: /walk\s*\/\s*fly/i }).first()
    console.log(name, 'walkfly button', await btn.count())
    await btn.click({ timeout: 8000 }).catch((e) => console.log('click', e.message.slice(0, 100)))
    await sleep(5000); await shot('2-entered')
    const s0 = await state()
    const box = (await page.locator('canvas').first().boundingBox()) || { x: 0, y: 0, width: 1280, height: 900 }
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2
    await page.mouse.move(cx, cy); await page.mouse.click(cx, cy).catch(() => {}); await sleep(500)
    const s0b = await state()
    await page.keyboard.down('w'); await sleep(1000); await page.keyboard.up('w'); await sleep(300)
    const s1 = await state(); await shot('3-after-W')
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 200, cy + 40, { steps: 10 }); await page.mouse.up(); await sleep(400)
    const s2 = await state(); await shot('4-after-mouse')
    const d = s0b.pose && s1.pose ? Math.hypot(s1.pose.x - s0b.pose.x, s1.pose.z - s0b.pose.z, s1.pose.y - s0b.pose.y) : null
    console.log('RESULT', name, JSON.stringify({ moved_m_on_W: d && +d.toFixed(2), yaw_turn: s0b.pose && s2.pose ? +(s2.pose.yaw - s1.pose.yaw).toFixed(3) : null, entered: s0, afterClick: s0b, afterW: s1, afterMouse: s2, errs: errs.slice(0, 5) }))
    await page.goto('about:blank').catch(() => {}); await page.close()
}
;(async () => {
    try {
        for (const v of (process.env.WF_RUNS || 'plain,plain2,tech,strip').split(',')) {
            if (v.startsWith('plain')) await run(v, '')
            else if (v === 'tech') await run('tech', '?render=tech')
            else await run('strip', '', true)
        }
    } catch (e) { console.log('ERR', e.message); try { await page.goto('about:blank'); await page.close() } catch {} }
    process.exit(0)
})()
