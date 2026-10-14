#!/usr/bin/env node
// walk-select-check.cjs — three seams in a real browser on the agent screen (2026-10-14):
//   VIEW page:  the version chip's words; Walk drags to look and never takes a pointer lock (#924, walkLook 'drag').
//   BUILD page: a click on the scene still takes the pointer lock (walkLook 'lock' stays for /build).
//   STUDIO:     a box selection in Select writes nothing (#929): compare the project's version from outside before/after.
// Usage: CHECK_VIEW=<view url> CHECK_BUILD=<build url> CHECK_STUDIO=<studio url> DI_TEST_LANE=2 \
//        di-test-browser run scripts/audit/walk-select-check.cjs      (a DEV build: window.__diiWalkerRef). Ends on about:blank.
const { chromium: browserType } = require('playwright')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const out = (k, v) => console.log(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)

const dragOn = async (page, fx0, fy0, fx1, fy1, steps = 12) => {
    const box = await page.locator('canvas').first().boundingBox()
    const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy]
    const [x0, y0] = at(fx0, fy0); const [x1, y1] = at(fx1, fy1)
    await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps }); await page.mouse.up()
}

;(async () => {
    const browser = await browserType.connectOverCDP(process.env.DI_TEST_CDP)
    const context = browser.contexts()[0] || await browser.newContext()
    const page = await context.newPage()
    try {
        await page.setViewportSize({ width: 1600, height: 900 })
        if (process.env.CHECK_VIEW) {
            await page.goto(process.env.CHECK_VIEW, { waitUntil: 'domcontentloaded' })
            await page.waitForSelector('canvas', { timeout: 60000 }); await sleep(9000)
            out('view.chip', await page.evaluate(() => (document.body.innerText.match(/Versions\s*·[^\n]*/i) || ['-'])[0].slice(0, 90)))
            const walk = page.getByRole('button', { name: /^walk( \/ fly)?$/i }).first()
            if (await walk.count()) {
                await walk.click(); await sleep(1500)
                const item = page.getByRole('button', { name: /^walk$/i }).first() // the Walk / Fly toggle may open a choice
                if (await item.count()) { await item.click(); await sleep(1500) }
                const before = await page.evaluate(() => { const p = window.__diiWalkerRef?.current; return p ? [p.yaw, p.pitch] : null })
                await dragOn(page, 0.45, 0.5, 0.6, 0.42); await sleep(800)
                const after = await page.evaluate(() => { const p = window.__diiWalkerRef?.current; return p ? [p.yaw, p.pitch] : null })
                out('view.walk.yawPitch.before', before); out('view.walk.yawPitch.after', after)
                out('view.walk.pointerLock', await page.evaluate(() => document.pointerLockElement?.tagName || 'none'))
                out('view.walk.hint', await page.evaluate(() => (document.body.innerText.match(/(Drag|Mouse) · look[^\n]*/) || ['-'])[0].slice(0, 120)))
            } else out('view.walk', 'no Walk button: ' + (await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 30).join(' | '))))
        }
        if (process.env.CHECK_BUILD) {
            await page.goto(process.env.CHECK_BUILD, { waitUntil: 'domcontentloaded' })
            await page.waitForSelector('canvas', { timeout: 60000 }); await sleep(9000)
            const box = await page.locator('canvas').first().boundingBox()
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await sleep(1200)
            out('build.pointerLock', await page.evaluate(() => document.pointerLockElement?.tagName || 'none'))
            await page.keyboard.press('Escape'); await sleep(500)
        }
        if (process.env.CHECK_STUDIO) {
            await page.goto(process.env.CHECK_STUDIO, { waitUntil: 'domcontentloaded' })
            await page.waitForSelector('canvas', { timeout: 60000 }); await sleep(12000)
            await page.getByRole('button', { name: 'Select', exact: true }).first().click(); await sleep(800)
            await dragOn(page, 0.3, 0.3, 0.7, 0.85, 20); await sleep(2500)
            out('studio.selected', await page.evaluate(() => (document.body.innerText.match(/(\d+)\s+selected/i) || ['-'])[0]))
            await page.keyboard.press('Escape'); await sleep(2500)
            out('studio.done', new Date().toISOString())
        }
    } finally {
        await page.goto('about:blank').catch(() => {})
        await page.close().catch(() => {})
        await browser.close().catch(() => {})
    }
})()
