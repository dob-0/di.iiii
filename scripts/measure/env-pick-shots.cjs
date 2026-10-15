/**
 * env-pick-shots.cjs — the SAME scene from the SAME camera under several light environments (a picking sheet).
 * Read-only for projects: the browser's copy of the document gets the camera and the environment (Playwright intercepts
 * GET /api/projects/<id>/document, as light-env-shots.cjs does); the only write is the DESK's cue list, which holds one
 * look at a time and is restored from --restore (a saved GET /light/api/cues) in the `finally`. 2026-10-15.
 *
 *   DI_TEST_LANES=3 DI_TEST_LANE=3 di-test-browser run scripts/measure/env-pick-shots.cjs --plan plan.json --out <dir> \
 *       --restore cues-before.json [--base http://moxir-test.diiii.localhost] [--start N] [--settle S] [--cool-wait S] [--desk http://127.0.0.1:4337/light] [--heat 84]
 * plan.json: { project, space, camera:{position,target,fov}, scenes:[{name, lookId, project?, page?, desk?}], envs:[{name, file}] }  (file = lightEnvOf JSON)
 *   scene.page 'room' (default: /<space>/p/<project>) or 'studio' (/<space>/studio/projects/<project>: the camera clicked as a view
 *   button, UI hidden by the studio:ui-toggle event, the "Show UI" button hidden by CSS); scene.project overrides plan.project; scene.desk false = the desk is not written for that scene
 *   (the browser copy of the document holds the look, which is all the page plays from).
 * Files: <out>/<n>-<env>-<scene>.png and shots.json. Waits while the CPU package is over --heat; refuses a software renderer;
 * ends on about:blank.
 */
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')
const { closeOnSignal } = require('../place/close-on-signal.cjs')

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d }
const PLAN = JSON.parse(fs.readFileSync(String(arg('plan')), 'utf8'))
const OUT = path.resolve(String(arg('out', '.')))
const BASE = String(arg('base', 'http://moxir-test.diiii.localhost')).replace(/\/+$/, '')
const DESK = String(arg('desk', 'http://127.0.0.1:4337/light')).replace(/\/+$/, '')
const HEAT = Number(arg('heat', 84))
const RESTORE = arg('restore') ? JSON.parse(fs.readFileSync(String(arg('restore')), 'utf8')).cues : null   // only needed when a scene writes the desk
const SIZE = [1600, 900]
const VIEW_LABEL = 'env-pick camera'
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
const waitCool = async (limit, maxS) => {
    const t0 = Date.now()
    let t = packageTemp()
    while (t !== null && t > limit && Date.now() - t0 < maxS * 1000) { await sleep(15000); t = packageTemp() }
    return { ok: t === null || t <= limit, now: t, waited_s: Math.round((Date.now() - t0) / 1000) }
}
const post = async (p, body) => { const r = await fetch(`${DESK}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${p} ${r.status}`); return r.json() }
let deskUsed = false
const holdLook = async (project, s) => {
    if (s.desk === false) return
    deskUsed = true
    await post('/api/cues/load', { project, list: [{ id: `hold-${s.lookId}`, name: `held: ${s.name}`, lookId: s.lookId, hold: 3600, fade: 0 }], loop: true })
    await post('/api/cues/go', { index: 0 })
}
const restore = async (project) => {
    await post('/api/cues/load', { project, list: RESTORE.list, loop: RESTORE.loop !== false })
    await post('/api/cues/go', { index: 0 })
    const c = (await (await fetch(`${DESK}/api/cues`)).json()).cues
    return { n: c.n, loop: c.loop, running: c.running, index: c.index }
}

const main = async () => {
    const cdp = process.env.DI_TEST_CDP
    if (!cdp) throw new Error('DI_TEST_CDP is not set: run it through `di-test-browser run`')
    const { applyLightEnv } = await import('../../src/shared/lightEnv.js')
    const { withCamera } = await import('../rigbuild/cue-frames.mjs')
    fs.mkdirSync(OUT, { recursive: true })
    const res = { script: 'scripts/measure/env-pick-shots.cjs', at: new Date().toISOString(), project: PLAN.project, size: SIZE, camera: PLAN.camera, shots: [] }
    const save = () => fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(res, null, 1))
    const browser = await chromium.connectOverCDP(cdp)
    const context = browser.contexts()[0] || (await browser.newContext())
    const page = await context.newPage()
    closeOnSignal(() => page)
    let env = null
    let held = null
    await page.route('**/api/projects/*/document*', async (route) => {
        const response = await route.fetch()
        if (!route.request().url().includes(`/api/projects/${held?.project || PLAN.project}/document`)) return route.fulfill({ response })
        const body = await response.json()
        if (env && body?.document) { body.document = applyLightEnv(body.document, env); withCamera(body.document, PLAN.camera)
            // the Studio keeps its own view: the camera is offered as a view button (viewPresets) and clicked after load
            const ps = body.document.presentationState
            ps.viewPresets = [...(ps.viewPresets || []).filter((v) => v.id !== 'env-pick'), { id: 'env-pick', label: VIEW_LABEL, position: PLAN.camera.position, target: PLAN.camera.target, fov: PLAN.camera.fov }]
            // the page plays the DOCUMENT's own show on its clock, not the desk's: hold the scene in this browser copy too (light-env-shots.cjs docFor)
            const cue = { id: `held-${held.lookId}`, name: `held: ${held.name}`, key: '', fade: 0, hold: 3600, lightLook: held.lookId, surfaces: {} }
            body.document.mappingState = { ...(body.document.mappingState || {}), cues: [cue], loop: true, showEpoch: Date.now() - 500, showSource: 'clock' } }
        return route.fulfill({ response, body: JSON.stringify(body), headers: { ...response.headers(), 'content-type': 'application/json' } })
    })
    let n = Number(arg('start', 0))   // --start N numbers the next picture N+1 (a retry of the pictures the heat gate refused)
    try {
        await page.setViewportSize({ width: SIZE[0], height: SIZE[1] })
        await page.goto('about:blank')
        res.renderer = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const x = gl && gl.getExtension('WEBGL_debug_renderer_info'); return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : 'no webgl2' })
        if (/swiftshader|llvmpipe|softpipe|software|lavapipe/i.test(res.renderer)) throw new Error(`refused: software renderer (${res.renderer})`)
        for (const scene of PLAN.scenes) {
            held = scene
            await holdLook(PLAN.project, scene)
            await sleep(3000)
            for (const e of PLAN.envs) {
                n += 1
                const r = { n, scene: scene.name, env: e.name, tempBefore: packageTemp() }
                res.shots.push(r)
                await page.goto('about:blank')
                r.cool = await waitCool(HEAT, Number(arg('cool-wait', 600)))   // --cool-wait S: the longest a picture waits for the heat gate
                if (!r.cool.ok) { r.error = `refused: package ${r.cool.now} C`; save(); continue }
                env = JSON.parse(fs.readFileSync(e.file, 'utf8'))
                const proj = scene.project || PLAN.project
                const studio = scene.page === 'studio'
                await page.goto(`${BASE}/${PLAN.space}/${studio ? 'studio/projects' : 'p'}/${proj}`, { waitUntil: 'load', timeout: 90000 })
                await page.bringToFront()
                await sleep(Number(arg('settle', 22)) * 1000)
                if (studio) {
                    await page.getByRole('button', { name: VIEW_LABEL }).click({ timeout: 15000 })
                    await sleep(3000)
                    // "Hide UI": the shell's panels go with the studio:ui-toggle event; the viewport's own overlays (probe 2026-10-15) by CSS
                    await page.evaluate(() => document.dispatchEvent(new Event('studio:ui-toggle')))
                    await page.addStyleTag({ content: '.mode-mark-chip,.tree-chip,.svl-pane-controls,.svl-gizmo-wrap,.svl-view-label,.scene-picker,.sfp-show-ui-btn{display:none !important}' })
                    await page.evaluate((label) => {
                        document.querySelectorAll('button').forEach((b) => { if (b.textContent.trim() === label) b.parentElement.style.display = 'none'; else if (b.getBoundingClientRect().x > 1500) b.style.display = 'none' })
                    }, VIEW_LABEL)
                    await sleep(2500)
                }
                r.page = studio ? 'studio' : 'room'
                r.file = `${String(n).padStart(2, '0')}-${e.name}-${scene.name}.png`
                await page.screenshot({ path: path.join(OUT, r.file) })
                r.at = new Date().toISOString()
                console.log(`${r.file} (${r.tempBefore} C before)`)
                save()
            }
        }
    } finally {
        env = null
        held = null
        await page.goto('about:blank').catch(() => {})
        await page.close().catch(() => {})
        try { if (deskUsed) res.restored = await restore(PLAN.project); console.log('restored', JSON.stringify(res.restored)) } catch (e) { res.restoreError = String(e.message || e); console.error('RESTORE FAILED', res.restoreError) }
        save()
        await browser.close().catch(() => {})
    }
}
main().catch((e) => { console.error(e.message || e); process.exit(1) })
