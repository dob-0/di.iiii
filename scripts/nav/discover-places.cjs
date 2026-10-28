// A READ-ONLY look at a Studio scene, to choose the camera places of a nav fixture (scripts/nav/fixtures/) for a project that has none,
// or to check a fixture against the scene it is meant for. Prints: the canvas, the opening pose (camera, aim, distance, field of view),
// the controls' limits, the box of the solid content, the biggest groups of entity roots by name, and the first surface a ray meets
// from the opening view, from the middle of the content and from every place of NAV_PLACES, along the six axes and the view direction.
// Solid = visible, writes depth, not see-through. A picture of the opening view goes to NAV_OUT (default: the system temp dir).
// The rays need the dev server's three module (di-dev up). Nothing in the scene is changed; if the page has no scene handle until the
// first gesture (a dev build hands it over then), one 4 px middle-button drag gets it.
// NAV_URL=<studio url> [NAV_PLACES=<fixture>] [NAV_OUT=<dir>] NODE_PATH=<tree>/node_modules di-test-browser run scripts/nav/discover-places.cjs
const { chromium } = require('playwright')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { loadFixture } = require('./lib/common.cjs')
const URL = process.env.NAV_URL
if (!URL) { console.log('usage: NAV_URL=<studio url> [NAV_PLACES=<fixture>] [NAV_OUT=<dir>] NODE_PATH=<tree>/node_modules di-test-browser run scripts/nav/discover-places.cjs'); process.exit(2) }
let FIXTURE = null
if (process.env.NAV_PLACES) { try { FIXTURE = loadFixture(process.env.NAV_PLACES) } catch (e) { console.log('ERR ' + e.message); process.exit(2) } }
const OUT = process.env.NAV_OUT || os.tmpdir()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let page
const bye = async (code) => { try { await page.goto('about:blank') } catch {} try { await page.close() } catch {} process.exit(code) }
const dog = setTimeout(() => { console.log('ERR watchdog'); bye(4) }, 240000)
const install = () => {
    const rootEl = document.getElementById('root') || document.body.firstElementChild
    const key = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'))
    const stack = [rootEl[key]]; let cc = null
    while (stack.length && !cc) { const f = stack.pop(); if (!f) continue
        for (let h = f.memoizedState; h && typeof h === 'object'; h = h.next) { const s = h.memoizedState; if (s && typeof s === 'object' && s.current && typeof s.current.getPosition === 'function') { cc = s.current; break } }
        if (f.child) stack.push(f.child); if (f.sibling) stack.push(f.sibling) }
    if (!cc) return false
    window.__cc = cc; return true
}
const hasScene = () => { try { const s = window.__cc.__r3f.root.getState().scene; if (s && s.isScene) return true } catch (e) {} return Boolean(window.__diNavScene && window.__diNavScene.isScene) }
;(async () => {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    page = await browser.contexts()[0].newPage()
    await page.setViewportSize({ width: 1707, height: 960 })
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForSelector('canvas', { timeout: 60000 })
    let ok = false; for (let i = 0; i < 40 && !ok; i++) { ok = await page.evaluate(install); if (!ok) await sleep(500) }
    if (!ok) { console.log('no cc'); await bye(2) }
    await sleep(4000)
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Edit', exact: true }).first().click({ timeout: 5000 }).catch(() => {}); await sleep(300)
    const box = await page.locator('canvas').first().boundingBox()
    if (!(await page.evaluate(hasScene))) {
        const x = box.x + box.width / 2, y = box.y + box.height / 2
        await page.mouse.move(x, y); await page.mouse.down({ button: 'middle' }); await page.mouse.move(x + 4, y); await page.mouse.up({ button: 'middle' }); await sleep(600)
    }
    const places = FIXTURE ? FIXTURE.places.map((p) => ({ id: p.id, pos: p.pos, at: p.at })) : []
    const info = await page.evaluate(async ({ places }) => {
        const cc = window.__cc, cam = cc._camera, f = (v) => +Number(v).toFixed(2), fa = (a) => a.map(f)
        const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/deps\/three\.js|three\.module\.js/.test(n))
        if (!url) return { error: "three is not a separate module here (a production build?): the ray read needs the dev server (di-dev up)" }
        const THREE = await import(url)
        const scene = (() => { try { const s = cc.__r3f.root.getState().scene; if (s && s.isScene) return s } catch (e) {} return window.__diNavScene && window.__diNavScene.isScene ? window.__diNavScene : null })()
        if (!scene) return { error: 'no scene handle: the R3F store was not found and window.__diNavScene is empty' }
        const V = THREE.Vector3
        const pos = cc.getPosition(new V(), true), tgt = cc.getTarget(new V(), true), dir = cam.getWorldDirection(new V())
        const out = { error: null }
        out.opening = `camera [${fa(pos.toArray())}] aim [${fa(tgt.toArray())}] distance ${f(cc.distance)} fov ${f(cam.fov || 0)}`
        out.limits = `minDistance ${cc.minDistance} maxDistance ${cc.maxDistance} minPolarAngle ${f(cc.minPolarAngle)} maxPolarAngle ${f(cc.maxPolarAngle)}`
        const seeThrough = (m) => { const l = Array.isArray(m) ? m : [m]; return l.every((x) => !x || x.visible === false || x.depthWrite === false || x.colorWrite === false || (x.transparent === true && Number(x.opacity) < 0.99)) }
        const roots = []; scene.traverse((o) => { if (o.userData && o.userData.svEntityId != null) roots.push(o) })
        const groups = {}, all = new THREE.Box3(); let solid = 0
        for (const r of roots) {
            const b = new THREE.Box3(); let n = 0
            r.traverse((o) => { if (!o.isMesh) return; for (let p = o; p; p = p.parent) if (!p.visible) return; if (seeThrough(o.material)) return; const bb = new THREE.Box3().setFromObject(o); if (!bb.isEmpty()) { b.union(bb); n++ } })
            if (!n) continue
            solid++; all.union(b)
            const name = String(r.name || r.userData.svEntityName || r.userData.svEntityId); const k = name.replace(/[-_ ]?\d+[a-z]?$/, '').slice(0, 26)
            const g = (groups[k] ||= { n: 0, box: new THREE.Box3(), ex: [] }); g.n++; g.box.union(b)
            if (g.ex.length < 3) { const c = b.getCenter(new V()), s = b.getSize(new V()); g.ex.push(`${name.slice(-12)} c=[${fa(c.toArray())}] s=[${fa(s.toArray())}]`) }
        }
        out.solidRoots = `${solid} of ${roots.length} entity roots have solid meshes`
        out.contentBox = all.isEmpty() ? 'empty' : `[${fa(all.min.toArray())}]..[${fa(all.max.toArray())}] size [${fa(all.getSize(new V()).toArray())}]`
        out.groups = Object.entries(groups).sort((a, b) => b[1].n - a[1].n).slice(0, 26).map(([k, g]) => `${k} x${g.n} box=[${fa(g.box.min.toArray())}]..[${fa(g.box.max.toArray())}] ex: ${g.ex[0]}`)
        // rays against solid meshes only
        const meshes = []; scene.traverse((o) => { if (o.isMesh && !seeThrough(o.material)) { for (let p = o; p; p = p.parent) if (!p.visible) return; meshes.push(o) } })
        out.meshes = meshes.length
        const ray = new THREE.Raycaster(); ray.far = 2000
        const cast = (o, d) => { ray.set(new V(...o), new V(...d).normalize()); const h = ray.intersectObjects(meshes, false)[0]; return h ? `${f(h.distance)} m (${(h.object.name || (h.object.parent && h.object.parent.name) || '?').slice(0, 24)})` : 'nothing' }
        const AX = [['+x', [1, 0, 0]], ['-x', [-1, 0, 0]], ['+y', [0, 1, 0]], ['-y', [0, -1, 0]], ['+z', [0, 0, 1]], ['-z', [0, 0, -1]]]
        const from = [['opening view', pos.toArray(), dir.toArray()]]
        if (!all.isEmpty()) from.push(['middle of the content', all.getCenter(new V()).toArray(), null])
        for (const p of places) from.push([`place ${p.id}`, p.pos, [p.at[0] - p.pos[0], p.at[1] - p.pos[1], p.at[2] - p.pos[2]]])
        out.rays = from.map(([label, o, d]) => { const r = AX.map(([k, v]) => `${k} ${cast(o, v)}`); if (d) r.push(`view ${cast(o, d)}`); return `${label} @[${fa(o)}]: ${r.join(' | ')}` })
        return out
    }, { places })
    fs.mkdirSync(OUT, { recursive: true })
    const shot = path.join(OUT, 'nav-open.jpg')
    console.log('CANVAS', JSON.stringify({ x: box.x, y: box.y, w: box.width, h: box.height }))
    await page.screenshot({ path: shot, type: 'jpeg', quality: 70 }); console.log('SHOT', shot)
    if (info.error) console.log('ERR', info.error)
    for (const [k, v] of Object.entries(info)) { if (k === 'error') continue; if (Array.isArray(v)) { console.log(k.toUpperCase()); v.forEach((l) => console.log('  ' + l)) } else console.log(k.toUpperCase(), v) }
    clearTimeout(dog); await bye(info.error ? 3 : 0)
})().catch(async (e) => { console.log('ERR', String(e).slice(0, 300)); await bye(3) })
