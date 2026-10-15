/**
 * laser-scene-shots.cjs — the Studio page and the room page of a project, one scene held, its laser frame held (2026-10-15).
 * Read-only for projects: Playwright edits only the browser's copy of the document — the scene's look is held by one cue
 * (as env-pick-shots.cjs), and every laser line's `frames` is cut to the ONE frame the scene plays (its index in the list),
 * so the picture shows that scene's lasers whatever the server clock says. Run it through `di-test-browser run` (CDP).
 *
 *   node scripts/measure/laser-scene-shots.cjs --base http://<tree>.diiii.localhost --space moxir --project moxir-v2-11 \
 *       --scene "The storm:rig-the-storm:123" --scene "The matrix:rig-matrix:128" --out <dir> [--heat 85] [--wait-s 600]
 *       [--camera '{"position":[0,1.7,19.8],"target":[0,3,4.8],"fov":60}']
 *
 * --scene "<name>:<lookId>:<frame index>". Files: <out>/<n>-<page>-<scene>.png and shots.json. Waits while the CPU package is
 * over --heat (at most --wait-s, then stops and says so); refuses a software renderer; ends on about:blank, also on error.
 * --camera (2026-10-15, lasers-look job): the browser's copy gets it as presentationState.fixedCamera, and after the settle the
 * room's camera (HdrBloom's DEV handle window.__diRoom: camera, and controls.setLookAt when the page has camera-controls) is put there and read back into shots.json, so
 * laser-lines-measure.py can project the lines with the camera the picture was really taken from.
 */
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')
const { closeOnSignal } = require('../place/close-on-signal.cjs')

const args = process.argv.slice(2)
const arg = (n, d = null) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d }
const all = (n) => args.flatMap((a, i) => (a === `--${n}` && args[i + 1] ? [args[i + 1]] : []))
const BASE = String(arg('base', '')).replace(/\/+$/, '')
const SPACE = String(arg('space', ''))
const PROJECT = String(arg('project', ''))
const OUT = path.resolve(String(arg('out', '.')))
const HEAT = Number(arg('heat', 85))
const WAIT_S = Number(arg('wait-s', 600))
const SETTLE_MS = Number(arg('settle-ms', 20000))
const SIZE = [1600, 900]
const MODE = String(arg('frame-mode', 'as-is')) // as-is | first-point | no-frames | no-lasers (diagnosis variants of the browser's copy)
const KINDS = String(arg('pages', 'studio,room')).split(',')
const CAMERA = arg('camera') ? JSON.parse(arg('camera')) : null
const SCENES = all('scene').map((s) => { const [name, lookId, frame] = s.split(':'); return { name, lookId, frame: Number(frame) } })
if (!BASE || !SPACE || !PROJECT || !SCENES.length || SCENES.some((s) => !s.lookId || !(s.frame >= 0))) {
    console.error('usage: --base URL --space S --project P --scene "name:lookId:frame" [--scene …] --out DIR'); process.exit(2)
}
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
const waitCool = async () => {
    const t0 = Date.now()
    let t = packageTemp()
    while (t !== null && t > HEAT && Date.now() - t0 < WAIT_S * 1000) { await sleep(15000); t = packageTemp() }
    return { ok: t === null || t <= HEAT, now: t, waited_s: Math.round((Date.now() - t0) / 1000) }
}

const cutFrame = (f) => (MODE === 'first-point' ? [f.find((p) => p[2] > 0 || p[3] > 0 || p[4] > 0) || f[0]] : f)
/** The browser's copy: the scene's look held, each laser line's frames cut to the scene's frame. Pure on `doc`. */
const holdScene = (doc, scene) => {
    const cue = { id: `held-${scene.lookId}`, name: `held: ${scene.name}`, key: '', fade: 0, hold: 3600, lightLook: scene.lookId, surfaces: {} }
    doc.mappingState = { ...(doc.mappingState || {}), cues: [cue], loop: true, showEpoch: Date.now() - 500, showSource: 'clock' }
    if (CAMERA) {
        const ps = doc.presentationState || {}
        doc.presentationState = { ...ps, entryView: 'fixed-camera', fixedCamera: { ...(ps.fixedCamera || {}), projection: 'perspective', zoom: 1, near: 0.05, far: 400, locked: false, ...CAMERA } }
    }
    let cut = 0
    if (MODE === 'no-lasers') { const before = doc.entities.length; doc.entities = doc.entities.filter((e) => !e?.components?.beam?.laser); return before - doc.entities.length }
    if (MODE === 'no-frames') { for (const e of doc.entities || []) if (e?.components?.beam?.laser?.frames) { delete e.components.beam.laser.frames; cut += 1 } return cut }
    for (const e of doc.entities || []) {
        const fr = e?.components?.beam?.laser?.frames
        if (!fr?.list?.length) continue
        e.components.beam.laser.frames = { period: fr.period, list: [cutFrame(fr.list[Math.min(scene.frame, fr.list.length - 1)])] }
        cut += 1
    }
    return cut
}

const main = async () => {
    const cdp = process.env.DI_TEST_CDP
    if (!cdp) throw new Error('DI_TEST_CDP is not set: run it through `di-test-browser run`')
    fs.mkdirSync(OUT, { recursive: true })
    const res = { script: 'scripts/measure/laser-scene-shots.cjs', at: new Date().toISOString(), base: BASE, project: PROJECT, size: SIZE, shots: [] }
    const save = () => fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(res, null, 1))
    const browser = await chromium.connectOverCDP(cdp)
    const context = browser.contexts()[0] || (await browser.newContext())
    const page = await context.newPage()
    closeOnSignal(() => page)
    let held = null
    await page.route(`**/api/projects/${PROJECT}/document*`, async (route) => {
        const response = await route.fetch()
        const body = await response.json()
        if (held && body?.document) res.shots.at(-1).linesCut = holdScene(body.document, held)
        return route.fulfill({ response, body: JSON.stringify(body), headers: { ...response.headers(), 'content-type': 'application/json' } })
    })
    let n = 0
    try {
        await page.setViewportSize({ width: SIZE[0], height: SIZE[1] })
        await page.goto('about:blank')
        res.renderer = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const x = gl && gl.getExtension('WEBGL_debug_renderer_info'); return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : 'no webgl2' })
        if (/swiftshader|llvmpipe|software/i.test(res.renderer)) throw new Error(`software renderer: ${res.renderer}`)
        for (const scene of SCENES) {
            for (const [kind, url] of [['studio', `${BASE}/${SPACE}/studio/projects/${PROJECT}`], ['room', `${BASE}/${SPACE}/p/${PROJECT}`]].filter(([k]) => KINDS.includes(k))) {
                n += 1
                const heat = await waitCool()
                const r = { n, page: kind, scene: scene.name, frame: scene.frame, url, heat }
                res.shots.push(r)
                if (!heat.ok) { r.skipped = `CPU package ${heat.now} °C over ${HEAT} after ${heat.waited_s} s`; save(); continue }
                held = scene
                await page.goto('about:blank')
                await page.goto(url, { waitUntil: 'load', timeout: 90000 })
                await sleep(SETTLE_MS)
                if (CAMERA) {
                    r.camera = await page.evaluate(async (c) => {
                        const cam = window.__diRoom?.camera
                        if (!cam) return { error: 'no window.__diRoom.camera (dev build of HdrBloom.jsx needed)' }
                        cam.fov = c.fov; cam.updateProjectionMatrix()
                        // the page's camera controls own the camera (camera-controls setLookAt); without them, set it directly
                        const ctl = window.__diRoom.controls
                        if (ctl?.setLookAt) await ctl.setLookAt(...c.position, ...c.target, false)
                        else { cam.position.set(...c.position); cam.lookAt(...c.target) }
                        await new Promise((res) => setTimeout(res, 3000))
                        return { position: cam.position.toArray(), target: c.target, fov: cam.fov, readBack: cam.position.toArray().map((n) => Math.round(n * 100) / 100) }
                    }, CAMERA)
                }
                r.file = `${String(n).padStart(2, '0')}-${kind}-${MODE === 'as-is' ? '' : `${MODE}-`}${scene.name.replace(/\W+/g, '-').toLowerCase()}.png`
                await page.screenshot({ path: path.join(OUT, r.file) })
                r.tempAfter = packageTemp()
                save()
            }
        }
    } finally {
        held = null
        await page.goto('about:blank').catch(() => {})
        save()
        await browser.close().catch(() => {})
    }
    console.log(JSON.stringify(res.shots.map((s) => [s.n, s.page, s.scene, s.file || s.skipped, s.linesCut])))
}
main().catch((e) => { console.error(e.message); process.exit(1) })
