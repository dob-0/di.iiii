#!/usr/bin/env node
// look_shots.cjs — pictures of a project's scene from chosen viewpoints, for the physics-first check (2026-10-14).
// Owner's hard rule (2026-10-13): every rig or lamp change runs physics_check.py (0 leaks) AND a look from OUTSIDE and from
// the floor before it is shown. This takes those looks: it opens the Studio page of a project, finds its camera-controls
// through the React tree (as scripts/nav/measure-pan-after-zoom.cjs does), sets the camera to each viewpoint and saves a
// picture. Read-only: it never clicks, never selects, never changes a scene, so nothing is written to the project.
// Real GPU, agent screen:  LOOK_URL=<studio project url> LOOK_VIEWS=<views.json> LOOK_OUT=<dir> DI_TEST_LANE=2 \
//                          di-test-browser run scripts/place/look_shots.cjs
// views.json: [{ "name": "outside-left", "eye": [x, y, z], "at": [x, y, z] }, ...] in the scene's metres. Ends on about:blank.
const fs = require('fs')
const path = require('path')
const { chromium: browserType } = require('playwright')

const URL = process.env.LOOK_URL
const VIEWS = JSON.parse(fs.readFileSync(process.env.LOOK_VIEWS, 'utf8'))
const OUT = process.env.LOOK_OUT || '.verify-surfaces/look-shots'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const install = () => {
    const el = document.querySelector('canvas')
    if (!el) return false
    let node = el
    let key = null
    while (node && !key) {
        key = Object.keys(node).find((k) => k.startsWith('__reactFiber$'))
        if (!key) node = node.parentElement
    }
    if (!key) return false
    let f = node[key]
    while (f.return) f = f.return
    const stack = [f]
    let cc = null
    while (stack.length && !cc) {
        const x = stack.pop()
        if (!x) continue
        for (let h = x.memoizedState; h && typeof h === 'object'; h = h.next) {
            const s = h.memoizedState
            if (s && typeof s === 'object' && s.current && typeof s.current.setLookAt === 'function') { cc = s.current; break }
        }
        if (x.sibling) stack.push(x.sibling)
        if (x.child) stack.push(x.child)
    }
    if (!cc) return false
    window.__lookCC = cc
    return true
}

;(async () => {
    if (!URL || !process.env.DI_TEST_CDP) { console.log('needs LOOK_URL and DI_TEST_CDP (run it with di-test-browser run)'); process.exit(2) }
    fs.mkdirSync(OUT, { recursive: true })
    const browser = await browserType.connectOverCDP(process.env.DI_TEST_CDP)
    const context = browser.contexts()[0] || await browser.newContext()
    const page = await context.newPage()
    try {
        await page.setViewportSize({ width: 1600, height: 900 })
        await page.goto(URL, { waitUntil: 'domcontentloaded' })
        let ok = false
        for (let i = 0; i < 90 && !ok; i++) { await sleep(1000); ok = await page.evaluate(install) }
        console.log('camera-controls found', ok)
        if (!ok) process.exitCode = 2
        else {
            await sleep(8000) // the hall model, lamps and beams settle
            const scene = await page.evaluate(() => [...document.querySelectorAll('[aria-pressed="true"]')].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 4).join(' | '))
            console.log('pressed (scene etc.):', scene || '-')
            for (const v of VIEWS) {
                await page.evaluate(([e, a]) => window.__lookCC.setLookAt(e[0], e[1], e[2], a[0], a[1], a[2], false), [v.eye, v.at])
                await sleep(2500)
                const file = path.join(OUT, `${v.name}.png`)
                await page.screenshot({ path: file })
                console.log('shot', v.name, file)
            }
        }
    } finally {
        await page.goto('about:blank').catch(() => {})
        await page.close().catch(() => {})
        await browser.close().catch(() => {}) // a CDP connection: closes the link, not the lane's browser
    }
})()
