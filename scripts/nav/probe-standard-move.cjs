// The standard move (useCameraNavigation + freeMove.js, 2026-10-13), checked with real input on the agent screen, in the Edit
// tool from one fixed pose each time: a wheel notch, Shift+wheel (5x), Alt+wheel (1/5), flying 1 s with the right button + W
// (one step), E while flying (camera up, the tool unchanged), a turn drag in place (camera stays), Walk's E (tool unchanged).
// NAV_URL=<studio url> di-test-browser run scripts/nav/probe-standard-move.cjs
const { chromium } = require('playwright')
const URL = process.env.NAV_URL
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let page
const bye = async (code) => { try { await page.goto('about:blank') } catch {} try { await page.close() } catch {} process.exit(code) }
setTimeout(() => { console.log('WATCHDOG'); bye(4) }, 420000)
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
const POSE = [-5.2, 3, 12, -5.2, 2.5, -10]
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
    const C = [box.x + box.width / 2, box.y + box.height / 2]
    const pose = () => page.evaluate((p) => { window.__cc.setLookAt(...p, false); window.__cc.update(0) }, POSE)
    const cam = () => page.evaluate(() => { const c = window.__cc; c.update(0); const p = c.camera.position; const d = c.camera.getWorldDirection(p.clone()); return { p: [p.x, p.y, p.z], d: [d.x, d.y, d.z], dist: c.distance } })
    const moved = (a, b) => Math.hypot(...a.p.map((v, i) => v - b.p[i]))
    const tool = () => page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /active/.test(b.className) && /^(Edit|Navigate)$/.test(b.textContent.trim()))?.textContent.trim() ?? null)
    const out = {}
    const notch = async (mods = []) => { await pose(); await page.mouse.move(...C); await sleep(100); const a = await cam(); for (const m of mods) await page.keyboard.down(m); await page.mouse.wheel(0, -100); for (const m of mods) await page.keyboard.up(m); await sleep(400); return moved(a, await cam()) }
    out.notch = await notch(); out.notchShift = await notch(['Shift']); out.notchAlt = await notch(['Alt'])
    // fly: right button held, W for 1 s
    await pose(); await page.mouse.move(...C); await sleep(100); let a = await cam(); const t0 = await tool()
    await page.mouse.down({ button: 'right' }); await page.keyboard.down('KeyW'); await sleep(1000); await page.keyboard.up('KeyW')
    let b = await cam(); out.fly1s = moved(a, b)
    a = b; await page.keyboard.down('KeyE'); await sleep(500); await page.keyboard.up('KeyE'); b = await cam(); out.flyE_up = b.p[1] - a.p[1]
    await page.mouse.up({ button: 'right' }); await sleep(200); out.toolAfterFlyE = { before: t0, after: await tool() }
    a = await cam(); await page.keyboard.down('KeyW'); await sleep(500); await page.keyboard.up('KeyW'); out.wWithoutButton = moved(a, await cam())
    // turn in place
    await page.evaluate(() => { localStorage.setItem('di.studio.navigation.turn', 'place'); window.dispatchEvent(new Event('di:studio-navigation-change')) }); await sleep(300)
    await pose(); await page.mouse.move(...C); a = await cam()
    await page.mouse.down({ button: 'middle' }); for (let i = 1; i <= 10; i++) { await page.mouse.move(C[0] + 20 * i, C[1]); await sleep(25) } await page.mouse.up({ button: 'middle' }); await sleep(500)
    b = await cam(); out.turnInPlace = { moved: moved(a, b), turnedDeg: Math.acos(Math.min(1, a.d.reduce((s, v, i) => s + v * b.d[i], 0))) * 180 / Math.PI, dist: b.dist }
    await page.evaluate(() => { localStorage.setItem('di.studio.navigation.turn', 'point'); window.dispatchEvent(new Event('di:studio-navigation-change')) }); await sleep(300)
    await pose(); await page.mouse.move(...C); await sleep(100); a = await cam()
    await page.mouse.down({ button: 'middle' }); for (let i = 1; i <= 10; i++) { await page.mouse.move(C[0] + 20 * i, C[1]); await sleep(25) } await page.mouse.up({ button: 'middle' }); await sleep(500)
    b = await cam(); out.turnAroundPoint = { moved: moved(a, b), dist: b.dist }
    // Walk: E while walking leaves the tool alone
    const tw = await tool(); await page.mouse.click(...C); await page.keyboard.press('Shift+Backquote'); await sleep(300); await page.keyboard.press('KeyE'); await sleep(200); await page.keyboard.press('Escape'); await sleep(300)
    out.walkE = { before: tw, after: await tool() }
    const trace = await page.evaluate(() => (window.__diNavTrace || []).filter((t) => t.why === 'auto speed taken').slice(-1)[0])
    out.autoSpeed = trace?.auto ?? null
    console.log('STANDARD', JSON.stringify(out, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)))
    await bye(0)
})().catch(async (e) => { console.log('ERR', String(e).slice(0, 200)); await bye(3) })
