// Edit tool: Shift+middle pan, then 5 wheel notches — does the wheel reach the app and move the camera? (stress test finding 2026-10-12)
const { chromium } = require('playwright')
const URL = process.env.NAV_URL
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const findCc = () => { const rootEl = document.getElementById('root') || document.body.firstElementChild; const key = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$')); const stack = [rootEl[key]]; while (stack.length) { const f = stack.pop(); if (!f) continue; for (let h = f.memoizedState; h && typeof h === 'object'; h = h.next) { const s = h.memoizedState; if (s && typeof s === 'object' && s.current && typeof s.current.getPosition === 'function') { window.__cc = s.current; return true } } if (f.sibling) stack.push(f.sibling); if (f.child) stack.push(f.child) } return false }
let page
;(async () => {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    page = await browser.contexts()[0].newPage()
    await page.setViewportSize({ width: 1707, height: 960 }).catch(() => {})
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 }); await page.waitForSelector('canvas', { timeout: 60000 })
    let ok = false; for (let i = 0; i < 40 && !ok; i++) { ok = await page.evaluate(findCc); if (!ok) await sleep(500) }
    await sleep(3000)
    const box = await page.locator('canvas').first().boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2
    await page.evaluate(() => { window.__w = { doc: 0, el: 0, targets: [] }; document.addEventListener('wheel', (e) => { window.__w.doc++; window.__w.targets.push(e.target.tagName + '.' + String(e.target.className).slice(0, 30)) }, { capture: true, passive: true }); window.__cc._domElement.addEventListener('wheel', () => { window.__w.el++ }, { passive: true }) })
    const pos = () => page.evaluate(() => window.__cc._camera.position.toArray().map((v) => +v.toFixed(2)))
    const step = async (name, fn) => { const a = await pos(); const t0 = await page.evaluate(() => (window.__diNavTrace || []).length); await fn(); await sleep(600); const b = await pos(); const tr = await page.evaluate((t0) => (window.__diNavTrace || []).slice(t0).map((e) => e.action), t0); const w = await page.evaluate(() => window.__w); console.log('STEP', name, 'moved', +Math.hypot(...a.map((v, i) => v - b[i])).toFixed(2), 'm; trace', JSON.stringify(tr), 'wheel doc/el', w.doc, w.el, 'targets', JSON.stringify([...new Set(w.targets)].slice(0, 3)), 'elementAtCentre', await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.tagName + '.' + String(e.className).slice(0, 40) : null }, [cx, cy])) }
    const wheel5 = async () => { await page.mouse.move(cx, cy); for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -100); await sleep(60) } }
    const pan = async () => { await page.keyboard.down('Shift'); await page.mouse.move(cx, cy); await page.mouse.down({ button: 'middle' }); for (let i = 1; i <= 10; i++) { await page.mouse.move(cx + 15 * i, cy, { steps: 1 }); await sleep(25) } await page.mouse.up({ button: 'middle' }); await page.keyboard.up('Shift') }
    await step('navigate: wheel 5', wheel5)
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click({ timeout: 10000 }); await sleep(500)
    await step('edit: wheel 5', wheel5)
    await step('edit: shift+middle pan', pan)
    await step('edit: wheel 5 after the pan', wheel5)
    await step('edit: middle orbit', async () => { await page.mouse.move(cx, cy); await page.mouse.down({ button: 'middle' }); for (let i = 1; i <= 10; i++) { await page.mouse.move(cx + 15 * i, cy); await sleep(25) } await page.mouse.up({ button: 'middle' }) })
    await step('edit: wheel 5 after the orbit', wheel5)
    await page.mouse.dblclick(cx + 100, cy + 40); await sleep(300)
    const open1 = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.tagName + '.' + String(e.className).slice(0, 50) : null }, [cx, cy])
    await page.keyboard.press('Escape'); await sleep(400)
    const open2 = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.tagName + '.' + String(e.className).slice(0, 50) : null }, [cx, cy])
    console.log('QUICKINSERT after dblclick:', open1, '| after Escape:', open2)
    await step('edit: wheel 5 after dblclick+Escape', wheel5)
    await page.close(); process.exit(0)
})().catch(async (e) => { console.log('ERR', e.message); try { await page?.close() } catch {} ; process.exit(1) })
