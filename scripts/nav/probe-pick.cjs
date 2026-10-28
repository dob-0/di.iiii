// Why does the Auto Depth ray miss? Run in the state the owner hits (N notches at centre), then cast test rays.
// NAV_URL=<studio url> NAV_NOTCHES=25 di-test-browser run scripts/nav/probe-pick.cjs
const { chromium } = require('playwright')
const URL = process.env.NAV_URL, NOTCHES = Number(process.env.NAV_NOTCHES || 25)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const findCc = () => {
    const rootEl = document.getElementById('root') || document.body.firstElementChild
    const key = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'))
    const stack = [rootEl[key]]
    const look = (v) => {
        if (!v || typeof v !== 'object' && typeof v !== 'function') return
        if (v.isScene) window.__scene = v
        else if (typeof v.getState === 'function') { try { const st = v.getState(); if (st?.scene?.isScene) window.__scene = st.scene } catch {} }
        else if (v.current && typeof v.current.getPosition === 'function') window.__cc = v.current
    }
    while (stack.length) {
        const f = stack.pop(); if (!f) continue
        for (let h = f.memoizedState; h && typeof h === 'object'; h = h.next) {
            const s = h.memoizedState
            look(s); if (s && typeof s === 'object') { look(s.current); look(s.value); look(s.scene); if (Array.isArray(s)) look(s[0]) }
        }
        if (f.stateNode?.isScene) window.__scene = f.stateNode
        if (f.sibling) stack.push(f.sibling); if (f.child) stack.push(f.child)
    }
    return !!window.__cc
}
const probe = () => {
    const cc = window.__cc, cam = cc._camera
    let scene = cam.__r3f?.root?.getState?.().scene || cam.__r3f?.store?.getState?.().scene || null
    if (!scene) scene = window.__diNavScene || window.__scene || null
    if (!scene) { let o = cam; while (o.parent) o = o.parent; if (o.isScene) scene = o }
    if (!scene) return { err: 'no scene via camera', keys: Object.keys(cam.__r3f || {}) }
    const T = cam.position.constructor.prototype.constructor.__proto__ ? null : null
    const three = cam.__r3f ? null : null
    const roots = []; scene.traverse((o) => { if (o.userData?.svEntityId != null) roots.push(o) })
    const types = {}; let meshes = 0, invisible = 0, sides = {}
    for (const r of roots) r.traverse((o) => { if (o.isMesh || o.isInstancedMesh || o.isBatchedMesh || o.isSkinnedMesh) { meshes++; types[o.type] = (types[o.type] || 0) + 1; if (!o.visible) invisible++; const m = Array.isArray(o.material) ? o.material[0] : o.material; const sd = m?.side; sides[sd] = (sides[sd] || 0) + 1 } })
    const RC = cam.constructor.__proto__ // unused
    // Use the scene's own three via a mesh's raycaster-less approach: build rays with the camera's classes.
    const V3 = cam.position.constructor
    const dirs = { centre: null, down: new V3(0, -1, 0), forward: null, back: null, left: null, right: null, up: new V3(0, 1, 0) }
    const fwd = new V3(0, 0, -1).applyQuaternion(cam.quaternion); dirs.centre = fwd.clone(); dirs.forward = fwd.clone(); dirs.back = fwd.clone().negate()
    dirs.right = new V3(1, 0, 0).applyQuaternion(cam.quaternion); dirs.left = dirs.right.clone().negate()
    // Raycaster class: borrow from any mesh's constructor module? Not reachable; use geometry bounding boxes instead (cheap, side-agnostic):
    const Box3 = (scene.children[0] && scene.children[0].constructor && null) || null
    const out = { roots: roots.length, meshes, invisible, types, sides, camPos: cam.position.toArray().map((v) => +v.toFixed(2)), target: cc.getTarget(new V3()).toArray().map((v) => +v.toFixed(2)), near: cam.near, far: cam.far }
    // Ray vs world bounding boxes of every mesh, per direction (side-agnostic); then the real raycast through the app's own helper if exposed.
    const allMeshes = []; for (const r of roots) r.traverse((o) => { if (o.isMesh && o.visible) allMeshes.push(o) })
    const boxHits = {}
    for (const [name, d] of Object.entries(dirs)) {
        let best = Infinity, who = null
        for (const m of allMeshes) {
            m.geometry.computeBoundingBox?.(); const bb = m.geometry.boundingBox; if (!bb) continue
            const b = bb.clone().applyMatrix4(m.matrixWorld)
            // slab test
            let tmin = 0, tmax = Infinity, ok = true
            for (const ax of ['x', 'y', 'z']) { const o = cam.position[ax], dd = d[ax]; if (Math.abs(dd) < 1e-9) { if (o < b.min[ax] || o > b.max[ax]) { ok = false; break } continue } let t1 = (b.min[ax] - o) / dd, t2 = (b.max[ax] - o) / dd; if (t1 > t2) [t1, t2] = [t2, t1]; tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) { ok = false; break } }
            if (ok && tmin < best) { best = tmin; who = m.name || m.parent?.name || m.type }
        }
        boxHits[name] = best === Infinity ? null : { m: +best.toFixed(2), who: String(who).slice(0, 30) }
    }
    out.boxHits = boxHits
    return out
}
;(async () => {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    const page = await browser.contexts()[0].newPage()
    await page.setViewportSize({ width: 1600, height: 900 }).catch(() => {})
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForSelector('canvas', { timeout: 60000 })
    let ok = false; for (let i = 0; i < 40 && !ok; i++) { ok = await page.evaluate(findCc); if (!ok) await sleep(500) }
    if (!ok) { console.log('no cc'); process.exit(2) }
    await sleep(3000)
    const box = await page.locator('canvas').first().boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.wheel(0, -1); await sleep(400)
    console.log('START', JSON.stringify(await page.evaluate(probe)))
    for (let i = 0; i < NOTCHES; i++) { await page.mouse.wheel(0, -100); await sleep(200) }
    await sleep(800)
    console.log('AFTER', JSON.stringify(await page.evaluate(probe)))
    const probeRay = async () => {
        const cc = window.__cc, cam = cc._camera, scene = window.__diNavScene
        const ad = await import('/studio/navigation/autoDepth.js')
        const roots = []; scene.traverse((o) => { if (o.userData?.svEntityId != null) roots.push(o) })
        const meshes = []; scene.traverse((o) => { if (o.isMesh) meshes.push(o) })
        const pk = (objs) => { const p = ad.pickPivot({ camera: cam, ndc: [0, 0], objects: objs }); return p ? [p.x, p.y, p.z].map((v) => +v.toFixed(2)) : null }
        const out = { pickRoots: pk(roots), pickScene: pk(scene.children) }
        // Which directions DO hit something? Turn the camera temporarily and pick at the centre.
        const q = cam.quaternion.clone(), pos = cam.position
        const dirs = { down: [0, -1, 0], up: [0, 1, 0], left: [-1, 0, 0], right: [1, 0, 0], back: [0, 0, 1], forward: [0, 0, -1], ahead: null }
        out.dirHits = {}
        for (const [name, d] of Object.entries(dirs)) {
            if (d) { cam.lookAt(pos.x + d[0], pos.y + d[1], pos.z + d[2]); cam.updateMatrixWorld(true) }
            const h = pk(roots); out.dirHits[name] = h ? { at: h, m: +Math.hypot(h[0] - pos.x, h[1] - pos.y, h[2] - pos.z).toFixed(2) } : null
            cam.quaternion.copy(q); cam.updateMatrixWorld(true)
        }
        const mats = (m) => (Array.isArray(m.material) ? m.material : [m.material]).filter(Boolean)
        const saved = meshes.map((m) => [m, mats(m).map((x) => x.side)])
        for (const m of meshes) for (const x of mats(m)) x.side = 2
        out.pickRootsDoubleSide = pk(roots)
        for (const [m, sd] of saved) mats(m).forEach((x, i) => { x.side = sd[i] })
        out.doubleSided = meshes.filter((m) => mats(m)[0]?.side === 2).map((m) => (m.name || m.parent?.name || '?').slice(0, 30))
        const p = cam.position; out.contains = meshes.filter((m) => { m.geometry.computeBoundingBox?.(); const bb = m.geometry.boundingBox?.clone().applyMatrix4(m.matrixWorld); return bb && bb.containsPoint(p) }).map((m) => (m.name || m.parent?.name || '?').slice(0, 30) + (m.visible ? '' : '(hidden)')).slice(0, 8)
        return out
    }
    console.log('RAY', JSON.stringify(await page.evaluate(probeRay)))
    await page.close(); process.exit(0)
})().catch(async (e) => { console.log('ERR', e.message); try { for (const c of (await chromium.connectOverCDP(process.env.DI_TEST_CDP)).contexts()) for (const pg of c.pages()) if (pg.url() === URL) await pg.close() } catch {} ; process.exit(1) })
