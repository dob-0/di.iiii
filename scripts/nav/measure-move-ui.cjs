// The Move settings on the real surface (owner, 2026-10-13: "settable in settings that you can set how you want"):
// the Studio's Scene window (Move section) and the public viewer's Move control, on the RTX 3080 via di-test-browser.
// For each place: a picture cropped to the control, and the proof that changing Speed changes how far ONE wheel notch moves
// the camera (read before and after, at Auto and at 1 m; Shift and Alt as the hint says). The camera is read without any app
// hook: the script walks the React fiber tree for the ref that holds camera-controls (as measure-pan-after-zoom.cjs does).
//   NAV_STUDIO_URL=http://<tree>.diiii.localhost/<space>/studio/projects/<id> NAV_VIEWER_URL=http://<tree>.diiii.localhost/<space>/p/<id>[,<more>] [NAV_PHONE=1] \
//   NAV_OUT=<dir for the pictures and numbers> NODE_PATH=<tree>/node_modules di-test-browser run scripts/nav/measure-move-ui.cjs
// Every page ends on about:blank, also on an error or the watchdog (NAV_WATCHDOG_S, default 420 s).
const { chromium } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')

const STUDIO = process.env.NAV_STUDIO_URL
const VIEWER = process.env.NAV_VIEWER_URL
const OUT = process.env.NAV_OUT || '.'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const opened = []
const results = { studio: {}, viewer: {} }
const say = (...a) => console.log(...a)

const cleanup = async () => {
    for (const p of opened) { await p.goto('about:blank').catch(() => {}); await p.close().catch(() => {}) }
}
const saveNumbers = () => fs.writeFileSync(path.join(OUT, `numbers${process.env.NAV_RUN_TAG ? '-' + process.env.NAV_RUN_TAG : ''}.json`), JSON.stringify(results, null, 2))
const dog = setTimeout(async () => { say('WATCHDOG fired'); results.error = 'watchdog'; try { saveNumbers() } catch { /* nothing to save */ } await cleanup(); process.exit(9) }, Number(process.env.NAV_WATCHDOG_S || 420) * 1000)

// In the page: find camera-controls through the React fibers and keep it as window.__cc.
const install = () => {
    const rootEl = document.getElementById('root') || document.body.firstElementChild
    const key = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'))
    const stack = [rootEl[key]]
    while (stack.length) {
        const f = stack.pop()
        if (!f) continue
        for (let h = f.memoizedState; h && typeof h === 'object'; h = h.next) {
            const s = h.memoizedState
            if (s && typeof s === 'object' && s.current && typeof s.current.getPosition === 'function') { window.__cc = s.current; return true }
        }
        if (f.sibling) stack.push(f.sibling)
        if (f.child) stack.push(f.child)
    }
    return false
}
const readPos = (page) => page.evaluate(() => { const p = window.__cc._camera.position; return [p.x, p.y, p.z] })
// The camera has stopped when two reads 300 ms apart agree.
const settle = async (page) => {
    let a = await readPos(page)
    for (let i = 0; i < 20; i++) {
        await sleep(300)
        const b = await readPos(page)
        if (dist(a, b) < 1e-5) return b
        a = b
    }
    return a
}
const prefs = (page) => page.evaluate(() => ({ speed: localStorage.getItem('di.studio.navigation.speed'), turn: localStorage.getItem('di.studio.navigation.turn') }))
const clearPrefs = (page) => page.evaluate(() => { localStorage.removeItem('di.studio.navigation.speed'); localStorage.removeItem('di.studio.navigation.turn') })

// One wheel notch over the middle of the canvas (deltaY -100 = one notch forward), with optional held keys; the metres the camera moved.
async function notch(page, { keys = [], back = false } = {}) {
    const box = await page.locator('canvas').first().boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    const p0 = await settle(page)
    for (const k of keys) await page.keyboard.down(k)
    await page.mouse.wheel(0, back ? 100 : -100)
    for (const k of keys.slice().reverse()) await page.keyboard.up(k)
    const p1 = await settle(page)
    return +dist(p0, p1).toFixed(4)
}

async function openPage(url, { width = 1600, height = 900, needCamera = true } = {}) {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    const page = await browser.contexts()[0].newPage()
    opened.push(page)
    await page.setViewportSize({ width, height }).catch(() => {})
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForSelector('canvas', { timeout: 90000 })
    if (!needCamera) { await sleep(3000); say('open', url, '(layout only)'); return page }
    let ok = false
    for (let i = 0; i < 90 && !ok; i++) { await sleep(1000); ok = await page.evaluate(install) }
    say('open', url, 'camera found:', ok)
    if (!ok) throw new Error('no camera-controls found on ' + url)
    return page
}
const shot = async (target, name) => { const file = path.join(OUT, name); await target.screenshot({ path: file }); say('shot', file); return file }
// A picture of the clip that holds all these boxes, with a margin.
const clipShot = async (page, boxes, name, margin = 8) => {
    const live = boxes.filter(Boolean)
    const x0 = Math.max(0, Math.min(...live.map((b) => b.x)) - margin), y0 = Math.max(0, Math.min(...live.map((b) => b.y)) - margin)
    const x1 = Math.max(...live.map((b) => b.x + b.width)) + margin, y1 = Math.max(...live.map((b) => b.y + b.height)) + margin
    const file = path.join(OUT, name)
    await page.screenshot({ path: file, clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } })
    say('shot', file)
    return file
}

async function studioPart() {
    const page = await openPage(STUDIO)
    // The Scene window (key 'world'): open it from the control cluster if it is not already open.
    if (!(await page.getByText('Default camera', { exact: true }).isVisible().catch(() => false))) {
        await page.getByRole('button', { name: 'Scene', exact: true }).first().click({ timeout: 15000 })
    }
    await page.getByText('Default camera', { exact: true }).waitFor({ timeout: 15000 })
    const block = page.locator('.insp-section').filter({ has: page.locator('.scc-section-label', { hasText: /^Move$/ }) })
    await block.waitFor({ timeout: 15000 })
    await clearPrefs(page)
    await sleep(500)
    const s = results.studio
    s.autoLabelBeforeMove = (await block.getByRole('button', { name: /^Auto/ }).textContent()).trim()
    await shot(block, 'studio-move-1-auto-before-first-move.png')

    s.stepAuto = await notch(page)
    s.autoLabelAfterMove = (await block.getByRole('button', { name: /^Auto/ }).textContent()).trim()
    s.prefsAuto = await prefs(page)
    await shot(block, 'studio-move-2-auto.png')

    await block.locator('#studio-move-speed').fill('1')
    s.prefsAfterType1 = await prefs(page)
    s.step1m = await notch(page)
    await shot(block, 'studio-move-3-speed-1-m.png')
    s.stepBack1m = await notch(page, { back: true })
    s.step1mShift = await notch(page, { keys: ['Shift'] })
    s.step1mAlt = await notch(page, { keys: ['Alt'] })

    await block.locator('#studio-move-turn').selectOption('place')
    s.prefsPlace = await prefs(page)
    await shot(block, 'studio-move-4-turn-where-you-stand.png')

    // The viewer's setting is the same one: reload the page and the Studio shows what was set.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByText('Default camera', { exact: true }).waitFor({ timeout: 30000 }).catch(() => {})
    s.afterReload = {
        speedField: await page.locator('#studio-move-speed').inputValue().catch(() => null),
        turnSelect: await page.locator('#studio-move-turn').inputValue().catch(() => null),
    }

    await block.getByRole('button', { name: /^Auto/ }).click().catch(() => {})
    await page.locator('#studio-move-turn').selectOption('point').catch(() => {})
    s.prefsReset = await prefs(page)
    await clearPrefs(page)
    await page.goto('about:blank')
}

// One public viewer page: the corner, the open card, the wheel proof (unless layout only), the card closing.
async function viewerPart(url, tag, { width = 1600, height = 900, proof = true } = {}) {
    const page = await openPage(url, { width, height, needCamera: proof })
    const v = (results.viewer[tag] = { url: url.replace(/^https?:\/\/[^/]+/, ''), viewport: `${width}x${height}` })
    await clearPrefs(page)
    const trigger = page.getByRole('button', { name: 'Move', exact: true })
    await trigger.waitFor({ timeout: 30000 })
    await sleep(800)
    const tbox = await trigger.boundingBox()
    // the corner: the buttons that were there and the new one
    const boxes = []
    for (const n of ['Sound', 'Walk / Fly', 'Free', 'Inside', 'Lite', 'Full', 'Move']) {
        const b = await page.getByRole('button', { name: n, exact: true }).first().boundingBox().catch(() => null)
        if (b) { boxes.push(b); v[`box ${n}`] = b }
    }
    v.layout = await page.evaluate(() => (document.querySelector('[data-testid=scene-bar]') ? 'scene bar' : 'corner column'))
    await clipShot(page, boxes, `viewer-${tag}-0-corner.png`, 12)

    await trigger.click()
    const card = page.getByRole('group', { name: 'Move' })
    await card.waitFor({ timeout: 5000 })
    await sleep(300)
    const cbox = await card.boundingBox()
    v.cardBox = cbox
    v.cardInsideWindow = cbox.x >= 0 && cbox.y >= 0 && cbox.x + cbox.width <= width && cbox.y + cbox.height <= height
    // nothing in the card runs past the card
    v.overflowPx = await card.evaluate((el) => Math.max(0, ...[...el.querySelectorAll('*')].map((c) => Math.round(c.getBoundingClientRect().right - el.getBoundingClientRect().right))))
    // the card is the top thing at its corners and middle (nothing else, such as the dev-copy chip, draws over it)
    v.cardOnTop = await card.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const points = [[4, 4], [r.width - 4, 4], [4, r.height - 4], [r.width - 4, r.height - 4], [r.width / 2, r.height / 2]]
        return points.every(([dx, dy]) => el.contains(document.elementFromPoint(r.left + dx, r.top + dy)))
    })
    await clipShot(page, [tbox, cbox], `viewer-${tag}-1-open-auto.png`, 8)
    v.autoLabelBeforeMove = (await card.getByRole('button', { name: /^Auto/ }).textContent()).trim()
    await page.keyboard.press('Escape')
    v.closedByEscape = !(await card.isVisible().catch(() => false))

    if (proof) {
        v.stepAuto = await notch(page)
        await trigger.click()
        await card.waitFor({ timeout: 5000 })
        v.autoLabelAfterMove = (await card.getByRole('button', { name: /^Auto/ }).textContent()).trim()
        await card.getByLabel('Speed (metres a step)').fill('1')
        v.prefsAfterType1 = await prefs(page)
        await card.getByRole('button', { name: 'Where you stand' }).click()
        v.prefsPlace = await prefs(page)
        await sleep(300)
        await clipShot(page, [tbox, await card.boundingBox()], `viewer-${tag}-2-open-1m-where-you-stand.png`, 8)
        // a press in the room closes the card; then one notch at 1 m
        const cv = await page.locator('canvas').first().boundingBox()
        await page.mouse.move(cv.x + cv.width / 2, cv.y + cv.height / 2)
        await page.mouse.down(); await page.mouse.up()
        v.closedByPressElsewhere = !(await card.isVisible().catch(() => false))
        v.step1m = await notch(page)
        await trigger.click()
        await card.getByRole('button', { name: /^Auto/ }).click()
        await card.getByRole('button', { name: 'Around a point ahead' }).click()
        v.prefsReset = await prefs(page)
    }
    await clearPrefs(page)
    await page.goto('about:blank')
}

;(async () => {
    try {
        fs.mkdirSync(OUT, { recursive: true })
        if (STUDIO) await studioPart()
        // NAV_VIEWER_URL: public viewer pages with the wheel proof; NAV_LAYOUT_URL: pages for the pictures and layout only (no camera
        // needed); NAV_PHONE_URL: the portrait-phone layout only. Comma-separated; each gets a tag by its space. NAV_PHONE=1 adds the
        // portrait phone to every page of the first two lists.
        const phone = (url, tag) => process.env.NAV_PHONE === '1' ? viewerPart(url, `${tag}-phone`, { width: 390, height: 844, proof: false }) : null
        const tagOf = (url) => url.replace(/^https?:\/\/[^/]+\//, '').split('/')[0]
        for (const url of (VIEWER || '').split(',').filter(Boolean)) { await viewerPart(url, tagOf(url)); await phone(url, tagOf(url)) }
        for (const url of (process.env.NAV_LAYOUT_URL || '').split(',').filter(Boolean)) { await viewerPart(url, tagOf(url), { proof: false }); await phone(url, tagOf(url)) }
        // NAV_PHONE_URL: pages for the portrait-phone layout only
        for (const url of (process.env.NAV_PHONE_URL || '').split(',').filter(Boolean)) await viewerPart(url, `${tagOf(url)}-phone`, { width: 390, height: 844, proof: false })
    } catch (e) {
        say('ERROR', e && e.message)
        results.error = String(e && e.message)
        for (const p of opened) await p.screenshot({ path: path.join(OUT, 'error-last-page.png') }).catch(() => {})
    } finally {
        saveNumbers()
        say(JSON.stringify(results))
        await cleanup()
        clearTimeout(dog)
        process.exit(results.error ? 2 : 0)
    }
})()
