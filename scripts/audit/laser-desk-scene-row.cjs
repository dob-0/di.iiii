// The laser desk's Scenes row, looked at on the agent screen (ledger N1612): the geometry in numbers, one press, a refused light
// route and a light desk that is not running. Run it under the test browser, on a SCRATCH serverXR opened at its own address
// (a di-dev tree address rewrites Host and the laser desk refuses its POSTs):
//   DESK_URL=http://127.0.0.1:<api port>/serverXR/laser/  PRESS=<scene id>  OUT=<dir>  DI_TEST_LANE=<n> di-test-browser run scripts/audit/laser-desk-scene-row.cjs
// PRESS defaults to the middle button of the row. Writes <OUT>/01-before-press.png, 02-after-press.png, 03-light-refused.png, 04-light-down.png at 1278x758 CSS px, device scale 2, and <OUT>/scene-row.json.
// Ends on about:blank and closes its own page and context, also on an error.
'use strict'
const fs = require('fs')
const path = require('path')
const { chromium } = require(process.env.PW || 'playwright')

const URL_ = process.env.DESK_URL
const OUT = process.env.OUT
if (!URL_ || !OUT) { console.error('DESK_URL and OUT are required'); process.exit(2) }
fs.mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const geometry = (page) => page.evaluate(() => {
    const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } }
    const btns = [...document.querySelectorAll('#sceneGrid .scenebtn')]
    const rows = [...new Set(btns.map((b) => Math.round(b.getBoundingClientRect().y)))]
    const grid = document.getElementById('sceneGrid')
    return {
        viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
        topbar: box(document.querySelector('.topbar')),
        disarm: box(document.getElementById('disarmBtn')),
        row: box(document.getElementById('sceneRow')),
        grid: box(grid),
        gridScrolls: grid ? grid.scrollHeight > grid.clientHeight + 1 : null,
        tiles: box(document.getElementById('tiles')),
        buttons: btns.length,
        buttonMinHeight: btns.length ? Math.min(...btns.map((b) => Math.round(b.getBoundingClientRect().height))) : null,
        buttonRows: rows.length,
        pageScrollsSideways: document.scrollingElement.scrollWidth > innerWidth
    }
})
const words = (page) => page.evaluate(() => ({
    note: document.getElementById('sceneNote').textContent,
    noteIsError: document.getElementById('sceneNote').className.includes('is-error'),
    liveName: document.getElementById('liveName') ? document.getElementById('liveName').textContent : null,
    marked: [...document.querySelectorAll('#sceneGrid .scenebtn')].filter((b) => /is-lights|is-laser/.test(b.className)).map((b) => `${b.dataset.id}: ${b.className.replace('scenebtn', '').trim()}`)
}))
const states = (page) => page.evaluate(async () => {
    const light = await fetch('../light/api/summary').then((r) => r.json()).catch((e) => ({ error: String(e) }))
    const laser = await fetch('desk/api/state').then((r) => r.json()).catch((e) => ({ error: String(e) }))
    return { light: { activeScene: light.activeScene, activeSceneName: light.activeSceneName, error: light.error }, laser: { liveId: laser.liveId, liveName: laser.live && laser.live.name, blackout: laser.blackout, error: laser.error } }
})

;(async () => {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    // Its own context (cookies and storage of nobody else's), sized like the stage Mac's window: 1278x758 CSS px, device scale 2.
    const ctx = await browser.newContext({ viewport: { width: 1278, height: 758 }, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    const report = { url: URL_, at: new Date().toISOString() }
    const shot = async (name) => { const file = path.join(OUT, name); await page.screenshot({ path: file, type: 'png' }); return file }
    try {
        const posts = []
        page.on('request', (r) => { if (r.method() === 'POST') posts.push(`${new URL(r.url()).pathname.replace(/^\/serverXR/, '')} ${r.postData() || ''}`) })
        await page.goto(URL_, { waitUntil: 'load' })
        await page.waitForSelector('#sceneGrid .scenebtn', { timeout: 15000 })
        await sleep(1500)

        // Before the press: a first scene is on (its lights and its look), so the press below visibly moves both marks.
        const first = await page.evaluate(() => document.querySelector('#sceneGrid .scenebtn').dataset.id)
        if (first !== process.env.PRESS) { await page.click(`#sceneGrid .scenebtn[data-id="${first}"]`); await sleep(1700) }
        report.geometry = await geometry(page)
        // the tile pane without the row, for the cost in height
        report.tilesHeightWithoutRow = await page.evaluate(() => { const row = document.getElementById('sceneRow'); row.hidden = true; const h = Math.round(document.getElementById('tiles').getBoundingClientRect().height); row.hidden = false; return h })
        report.idle = { words: await words(page), states: await states(page) }
        await shot('01-before-press.png')

        const ids = await page.evaluate(() => [...document.querySelectorAll('#sceneGrid .scenebtn')].map((b) => b.dataset.id))
        const press = process.env.PRESS || ids[Math.floor(ids.length / 2)]
        report.press = press
        posts.length = 0
        await page.click(`#sceneGrid .scenebtn[data-id="${press}"]`)
        await sleep(1700)
        report.afterPress = { posts: [...posts], words: await words(page), states: await states(page), geometry: await geometry(page) }
        await shot('02-after-press.png')

        // a refused light route: the words on the row, the look still goes, nothing retried
        await page.route('**/light/api/scenes/recall', (route) => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'refused for the test' }) }))
        const other = ids.find((i) => i !== press) || press
        posts.length = 0
        await page.click(`#sceneGrid .scenebtn[data-id="${other}"]`)
        await sleep(2500)
        report.lightRefused = { pressed: other, posts: [...posts], words: await words(page) }
        await shot('03-light-refused.png')
        await page.unroute('**/light/api/scenes/recall')

        // a light desk that is not running: the standing words once the poll finds it so
        await page.route('**/light/api/**', (route) => route.abort('connectionrefused'))
        await sleep(13500)
        report.lightDown = { words: await words(page), geometry: await geometry(page) }
        await shot('04-light-down.png')
        await page.unroute('**/light/api/**')
        await sleep(1500)
        report.recovered = await words(page)
        fs.writeFileSync(path.join(OUT, 'scene-row.json'), JSON.stringify(report, null, 2))
        console.log(JSON.stringify({ geometry: report.geometry, tilesHeightWithoutRow: report.tilesHeightWithoutRow, press, afterPress: report.afterPress, lightRefused: report.lightRefused, lightDown: report.lightDown.words, recovered: report.recovered }, null, 1).slice(0, 5200))
    } finally {
        try { await page.goto('about:blank') } catch { /* closing anyway */ }
        try { await page.close() } catch { /* already gone */ }
        try { await ctx.close() } catch { /* already gone */ }
        try { await browser.close() } catch { /* disconnects; the lane keeps its own browser */ }
    }
})().catch((error) => { console.error(error); process.exit(1) })
