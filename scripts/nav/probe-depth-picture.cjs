// The scene-distance depth picture (sceneDistance.js) against a direct ray, as a map of metres: the opening view, then the
// walkthrough's 'double-click the floor and scroll' view. Found the per-vertex distance bug (floor read 64 m, was 4.8 m), 2026-10-13.
// NAV_URL=<studio url> di-test-browser run scripts/nav/probe-depth-picture.cjs   (needs the dev build: window.__diSceneDistance)
const { chromium } = require('playwright'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => { const b = await chromium.connectOverCDP(process.env.DI_TEST_CDP); const page = await b.contexts()[0].newPage(); await page.setViewportSize({ width: 1707, height: 960 })
  try {
  await page.goto(process.env.NAV_URL, { waitUntil: 'domcontentloaded', timeout: 90000 }); await page.waitForSelector('canvas', { timeout: 60000 }); await sleep(6000)
  const box = await page.locator('canvas').first().boundingBox(); const P = (fx, fy) => [box.x + fx * box.width, box.y + fy * box.height]
  const tool = async (n) => { await page.keyboard.press('Escape'); await page.getByRole('button', { name: n, exact: true }).first().click({ timeout: 5000 }).catch(() => {}); await sleep(300) }
  const probe = async (label) => {
    await page.mouse.move(...P(0.5, 0.5)); await page.mouse.down({ button: 'middle' }); await page.mouse.move(...P(0.502, 0.5)); await page.mouse.up({ button: 'middle' }); await sleep(300)
    const r = await page.evaluate(async () => {
      const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/deps\/three\.js|three\.module\.js/.test(n)); const THREE = await import(url)
      const tr = (window.__diNavTrace || []).filter((t) => t.source === 'scene distance').slice(-1)[0]
      const scene = window.__diNavScene; const roots = []; scene.traverse((o) => { if (o.userData?.svEntityId != null) roots.push(o) })
      const meshes = []; const st = [...roots]; while (st.length) { const o = st.pop(); if (!o.visible) continue; if (o.isMesh) meshes.push(o); st.push(...o.children) }
      const ray = new THREE.Raycaster(); const cam = scene.children.find(() => false) || null
      return { trace: tr, meshes: meshes.length }
    })
    // camera from the controls the page exposes in DEV traces: read camera via the canvas' R3F store
    const cam = await page.evaluate(async () => {
      const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/deps\/three\.js|three\.module\.js/.test(n)); const THREE = await import(url)
      const scene = window.__diNavScene; let camera = null
      const rootEl = document.getElementById('root'); const key = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$')); const stack = [rootEl[key]]
      while (stack.length && !camera) { const f = stack.pop(); if (!f) continue; for (let h = f.memoizedState; h && typeof h === 'object'; h = h.next) { const s = h.memoizedState; if (s?.current?.getPosition) { camera = s.current.camera; break } } if (f.child) stack.push(f.child); if (f.sibling) stack.push(f.sibling) }
      const roots = []; scene.traverse((o) => { if (o.userData?.svEntityId != null) roots.push(o) })
      const meshes = []; const st = [...roots]; while (st.length) { const o = st.pop(); if (!o.visible) continue; if (o.isMesh) meshes.push(o); st.push(...o.children) }
      const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(0, 0), camera)
      const hits = ray.intersectObjects(meshes, false).slice(0, 4).map((h) => ({ d: +h.distance.toFixed(2), name: (h.object.name || h.object.parent?.name || '').slice(0, 30), mat: (Array.isArray(h.object.material) ? h.object.material[0] : h.object.material)?.type, dw: (Array.isArray(h.object.material) ? h.object.material[0] : h.object.material)?.depthWrite }))
      return { pos: camera.position.toArray().map((v) => +v.toFixed(2)), dir: camera.getWorldDirection(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)), near: camera.near, far: camera.far, centreRay: hits }
    })
    const sd = await page.evaluate(() => window.__diSceneDistance); const smp = sd.samples; delete sd.samples; console.log('CASE', label, JSON.stringify({ measured: r.trace?.measured, sd, ...cam }))
    const rows = []; for (let y = 35; y >= 0; y -= 4) { const row = []; for (let x = 0; x < 64; x += 4) { const v = smp[y * 64 + x]; row.push(v > 0 ? String(Math.round(v)).padStart(4) : '   .') } rows.push(row.join('')) } console.log('MAP top row first (if the picture is upright)\n' + rows.join('\n'))
  }
  await page.evaluate(() => { window.__diSceneDistanceOff = true }) // this probe reads the synchronous picture's samples
  await tool('Edit'); await probe('opening view')
  await tool('Navigate'); const f = P(0.5, 0.8); await page.mouse.move(...f); await page.mouse.dblclick(...f); await sleep(800); for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -100); await sleep(80) } await sleep(800)
  await tool('Edit'); await probe('after double-click floor + scroll 5 (walkthrough)')
  } catch (e) { console.log('ERR ' + String(e).slice(0, 300)) } finally { await page.goto('about:blank'); await page.close(); process.exit(0) } })()
