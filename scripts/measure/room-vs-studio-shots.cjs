/**
 * room-vs-studio-shots.cjs — the SAME look held, from the SAME camera, in the Studio and on the room page (Show and Tech),
 * with the live render values read from each page. Why the room page was dark where the Studio was lit (2026-10-15).
 *
 * Read-only for projects: the browser's copy of the document holds the look (one cue, 3600 s) and the camera (Playwright
 * intercepts GET /api/projects/<id>/document, as env-pick-shots.cjs does). The only write is the DESK's cue list, so run it
 * against a SCRATCH stack's desk (--desk), never a show's. Needs a DEV build (window.__diRoom, HdrBloom.jsx).
 *
 *   di-test-browser run scripts/measure/room-vs-studio-shots.cjs -- --base http://<tree>.diiii.localhost --desk http://127.0.0.1:<api>/light \
 *       --space <space> --project <id> --looks rig-a,rig-b --out DIR [--settle 20] [--heat 84] [--size 1280x720] [--pages studio,show,tech,show-noexp]
 * Writes DIR/<n>-<look>-<page>-<camera>.png and DIR/shots.json (live values per picture). Ends on about:blank.
 */
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')
const { closeOnSignal } = require('../place/close-on-signal.cjs')

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d }
const need = (n) => { const v = arg(n); if (!v) throw new Error(`--${n} is required`); return v }
const BASE = need('base').replace(/\/+$/, '')
const DESK = need('desk').replace(/\/+$/, '')
const SPACE = need('space')
const PROJECT = need('project')
const LOOKS = need('looks').split(',').filter(Boolean)
const OUT = path.resolve(need('out'))
const HEAT = Number(arg('heat', 84))
const SETTLE = Number(arg('settle', 20)) * 1000
const [W, H] = String(arg('size', '1280x720')).split('x').map(Number)
const PAGES = String(arg('pages', 'studio,show,tech,show-noexp')).split(',')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const packageTemp = () => {
    try {
        for (const h of fs.readdirSync('/sys/class/hwmon')) {
            const dir = path.join('/sys/class/hwmon', h)
            if (fs.readFileSync(path.join(dir, 'name'), 'utf8').trim() === 'coretemp') return Math.round(Number(fs.readFileSync(path.join(dir, 'temp1_input'), 'utf8')) / 1000)
        }
    } catch { /* no sensor */ }
    return null
}
const waitCool = async (limit, maxS = 600) => {
    const t0 = Date.now()
    let t = packageTemp()
    while (t !== null && t > limit && Date.now() - t0 < maxS * 1000) { await sleep(15000); t = packageTemp() }
    return { ok: t === null || t <= limit, now: t, waited_s: Math.round((Date.now() - t0) / 1000) }
}
const post = async (p, body) => { const r = await fetch(`${DESK}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${p} ${r.status}`); return r.json() }

// The live values, read in the page: what the renderer, the exposure pass, the glow, the air and the lamps are doing now.
const probe = async (page) => page.evaluate(async () => {
    const R = window.__diRoom
    if (!R?.gl) return { error: 'no window.__diRoom (not a DEV build, or no bloom in this render)' }
    const { gl, scene, camera, passes } = R
    const air = await import('/objectComponents/atmosphereStore.js')   // vite's root is src/
    const half = (h) => { const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff; return e === 0 ? s * 2 ** -14 * (f / 1024) : e === 31 ? NaN : s * 2 ** (e - 15) * (1 + f / 1024) }
    let gain = null
    try {
        const ex = passes?.exposure
        if (ex?.adapted) gain = ex.adapted.map((t) => { const b = new Uint16Array(4); gl.readRenderTargetPixels(t, 0, 0, 1, 1, b); return half(b[0]) })
    } catch (e) { gain = String(e) }
    let spots = 0, spotsOn = 0, spotSum = 0, beams = 0, beamsShown = 0, beamSum = 0
    scene.traverse((o) => {
        if (o.isSpotLight) { spots++; let v = o.visible, p = o.parent; while (v && p) { v = p.visible; p = p.parent } if (v && o.intensity > 0) { spotsOn++; spotSum += o.intensity } }
        const u = o.material?.uniforms
        if (o.isMesh && u?.uIntensity && u?.uTan) { beams++; let v = o.visible, p = o.parent; while (v && p) { v = p.visible; p = p.parent } if (v && u.uIntensity.value > 0) { beamsShown++; beamSum += u.uIntensity.value } }
    })
    const a = air.getAtmosphere(gl)
    return {
        toneMapping: gl.toneMapping, toneMappingExposure: gl.toneMappingExposure, pixelRatio: gl.getPixelRatio(),
        exposurePass: passes?.exposure ? { enabled: passes.exposure.enabled, key: passes.exposure.key, min: passes.exposure.min, max: passes.exposure.max, gain } : null,
        glow: passes?.glow ? { enabled: passes.glow.enabled, strength: passes.glow.strength, threshold: passes.glow.threshold } : null,
        bloomAllowed: air.isBloomAllowed(gl), cameraOutside: air.isCameraOutside(gl), schematic: air.isSchematic(gl),
        atmosphere: a ? { scattering: a.scattering, anisotropy: a.anisotropy, density: a.density, keys: Object.keys(a).slice(0, 12) } : null,
        spots, spotsOn, spotSum: Math.round(spotSum), beams, beamsShown, beamSum: Math.round(beamSum * 100) / 100,
        camera: camera ? { position: camera.position.toArray().map((x) => Math.round(x * 100) / 100), dir: camera.getWorldDirection(new camera.position.constructor()).toArray().map((x) => Math.round(x * 1000) / 1000), fov: camera.fov } : null
    }
})

const main = async () => {
    const cdp = process.env.DI_TEST_CDP
    if (!cdp) throw new Error('DI_TEST_CDP is not set: run it through `di-test-browser run`')
    const { withCamera } = await import('../rigbuild/cue-frames.mjs')
    fs.mkdirSync(OUT, { recursive: true })
    const res = { script: 'scripts/measure/room-vs-studio-shots.cjs', at: new Date().toISOString(), base: BASE, project: PROJECT, size: [W, H], shots: [] }
    const save = () => fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(res, null, 1))
    const browser = await chromium.connectOverCDP(cdp)
    const context = browser.contexts()[0] || (await browser.newContext())
    const page = await context.newPage()
    closeOnSignal(() => page)
    let held = null   // { lookId, camera }
    await page.route('**/api/projects/*/document*', async (route) => {
        const response = await route.fetch()
        if (!held || !route.request().url().includes(`/api/projects/${PROJECT}/document`)) return route.fulfill({ response })
        const body = await response.json()
        if (body?.document) {
            if (held.camera) withCamera(body.document, held.camera)
            // the page plays the DOCUMENT's own show on its clock: hold the look in this browser copy (env-pick-shots.cjs)
            const cue = { id: `held-${held.lookId}`, name: `held: ${held.lookId}`, key: '', fade: 0, hold: 3600, lightLook: held.lookId, surfaces: {} }
            body.document.mappingState = { ...(body.document.mappingState || {}), cues: [cue], loop: true, showEpoch: Date.now() - 500, showSource: 'clock' }
        }
        return route.fulfill({ response, body: JSON.stringify(body), headers: { ...response.headers(), 'content-type': 'application/json' } })
    })
    const hideChrome = () => page.addStyleTag({ content: 'button,[data-testid="rig-show-chip"],.mode-mark-chip,.tree-chip,.svl-pane-controls,.svl-gizmo-wrap,.svl-view-label,.scene-picker,.sfp-show-ui-btn{visibility:hidden !important}' })
    let n = 0
    try {
        await page.setViewportSize({ width: W, height: H })
        await page.goto('about:blank')
        res.renderer = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const x = gl && gl.getExtension('WEBGL_debug_renderer_info'); return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : null })
        for (const lookId of LOOKS) {
            await post('/api/cues/load', { project: PROJECT, list: [{ id: `hold-${lookId}`, name: `held: ${lookId}`, lookId, hold: 3600, fade: 0 }], loop: true })
            await post('/api/cues/go', { index: 0 })
            const cams = {}   // the Studio's views, read from the page, handed to the room as its fixed camera
            for (const view of ['Floor 1.7 m', 'DJ']) {
                for (const pg of PAGES) {
                    n++
                    const r = { n, lookId, page: pg, view, tempBefore: packageTemp() }
                    res.shots.push(r)
                    await page.goto('about:blank')
                    r.cool = await waitCool(HEAT)
                    if (!r.cool.ok) { r.error = `refused: package ${r.cool.now} C`; save(); continue }
                    const studio = pg === 'studio'
                    if (!studio && !cams[view]) { r.error = 'no Studio camera for this view'; save(); continue }
                    held = { lookId, camera: studio ? null : cams[view] }
                    const render = pg === 'tech' ? 'tech' : 'show'
                    await page.goto(studio ? `${BASE}/${SPACE}/studio/projects/${PROJECT}` : `${BASE}/${SPACE}/p/${PROJECT}?render=${render}`, { waitUntil: 'load', timeout: 90000 })
                    await page.bringToFront()
                    await sleep(SETTLE)
                    if (studio) {
                        await page.getByRole('button', { name: view, exact: true }).first().click({ timeout: 15000 })
                        await sleep(4000)
                        await page.evaluate(() => document.dispatchEvent(new Event('studio:ui-toggle')))
                    }
                    if (pg === 'show-noexp') { await page.evaluate(() => { if (window.__diRoom) window.__diRoom.debug = { noExposure: true } }); await sleep(3000) }
                    await hideChrome()
                    await sleep(2500)
                    r.live = await probe(page)
                    if (studio && r.live?.camera) {
                        const c = r.live.camera
                        cams[view] = { position: c.position, target: c.position.map((x, i) => x + c.dir[i] * 20), fov: c.fov }
                    }
                    r.file = `${String(n).padStart(2, '0')}-${lookId}-${pg}-${view.split(' ')[0].toLowerCase()}.png`
                    await page.screenshot({ path: path.join(OUT, r.file) })
                    r.at = new Date().toISOString()
                    console.log(`${r.file} ${packageTemp()} C ${JSON.stringify({ exp: r.live?.toneMappingExposure, auto: r.live?.exposurePass?.enabled, gain: r.live?.exposurePass?.gain, glow: r.live?.glow?.enabled, outside: r.live?.cameraOutside, spotsOn: r.live?.spotsOn, beamsShown: r.live?.beamsShown, err: r.live?.error })}`)
                    save()
                }
            }
        }
    } finally {
        held = null
        await page.goto('about:blank').catch(() => {})
        await page.close().catch(() => {})
        save()
    }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })   // a CDP link keeps node alive
