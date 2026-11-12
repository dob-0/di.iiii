// deck-round-4-walk: measures the merged deck round 4 (panes + perform) in a scratch stack. Changes nothing in the app.
//   DI_TEST_LANES=3 DI_TEST_LANE=3 di-test-browser run scripts/deck-round-4-walk.mjs -- --base URL --out DIR
// a borders shown + drag per width (1700 1100 800 620 500) · b hit zones · c side-by-side-without-border widths 500..1700 step 20
// d fold/unfold + reload · e one-border reset, lock, whole reset with lock · f Perform: Arrange all, overlap pairs, reload keeps a moved window
// g console errors. One JSON line + result-round4.json; pictures into --out. No MIDI (removed before load).
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
const arg = (n, f = null) => { const i = process.argv.indexOf(`--${n}`); if (i === -1) return f; const v = process.argv[i + 1]; return v && !v.startsWith('--') ? v : f }
const BASE = String(arg('base', 'http://deck-round-4.diiii.localhost'))
const OUT = String(arg('out', '.'))
fs.mkdirSync(OUT, { recursive: true })
const PASSWORD = 'driver-passphrase-9x'
const NAMES = ['1 BACK', '2 MID', '3 CAM', '4 TEXT', '5 TOP']
const CLIPS = ['clip-one-demo.png', 'glow-magenta.png', 'tunnel-grid-long-name-v3.png', 'cam-loop.png', 'title-outro.png', 'back-noise.png', 'strobe-white.png', 'x.png']
const apiOf = (page) => (method, url, body) => page.evaluate(async ({ method, url, body }) => {
    const a = await fetch(`/serverXR${url}`, { method, credentials: 'include', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
    return { status: a.status, body: await a.json().catch(() => null) }
}, { method, url, body })
const seedDeck = () => ({ bpm: 128, epoch: 0, master: 0.8, effects: [], crossfade: 0.5, columns: 8, layers: NAMES.map((name, l) => ({ id: `layer${l + 1}`, name, opacity: 1 - l * 0.1, blend: String(l % 3), active: -1, trigger: 0, bypass: false, solo: false, side: l === 0 ? 'a' : l === 4 ? 'b' : '', effects: [], clips: Array.from({ length: 8 }, (_, c) => ((c + l) % 2 === 0 ? { id: `c${l}${c}`, kind: 'asset', asset: `still-${l}-${c}`, label: CLIPS[(c + l * 3) % CLIPS.length], speed: 1, mode: '0', in: 0, out: 1 } : null)) })) })
const setup = async (page) => {
    const api = apiOf(page)
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    const name = `walk${Date.now().toString(36)}`
    const made = await api('POST', '/api/auth/password/register', { username: name, password: PASSWORD, displayName: name }); if (made.status >= 300) throw new Error(`register ${made.status}`)
    await api('POST', '/api/spaces', { label: 'main', slug: 'main', permanent: false })
    const project = await api('POST', '/api/spaces/main/projects', { title: `deck-walk-${Date.now()}` }); if (project.status >= 300) throw new Error(`project ${project.status}`)
    const projectId = project.body?.project?.id || project.body?.projectId || project.body?.id
    const { body: cur } = await api('GET', `/api/projects/${projectId}/document`)
    const sent = await api('POST', `/api/projects/${projectId}/ops`, { baseVersion: cur.version, ops: [{ type: 'createNode', payload: { node: { id: 'deck', typeId: 'vj.deck', label: 'VJ Deck', graphX: 60, graphY: 60, parentId: null, values: { deck: seedDeck() } } } }] })
    if (sent.status >= 300) throw new Error(`ops ${sent.status}`)
    return projectId
}
const openP1 = async (page, projectId) => {
    await page.goto(`${BASE}/main/raw/projects/${projectId}`, { waitUntil: 'domcontentloaded' })
    const card = page.locator('[data-node-id="deck"], .raw-node-card:has-text("VJ Deck"), [class*="node"]:has-text("VJ Deck")').first()
    await card.waitFor({ timeout: 40000 }); await card.dblclick(); await page.waitForSelector('.vj-deck', { timeout: 20000 })
    await page.waitForTimeout(700)
}
const openP2 = async (page, projectId) => { await page.goto(`${BASE}/main/perform/${projectId}?preset=vj-windows`, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('.vj-deck', { timeout: 40000 }); await page.waitForTimeout(900) }

const shot = (page, name) => page.screenshot({ path: path.join(OUT, name), scale: 'css' }).then(() => path.join(OUT, name)).catch((e) => `shot failed ${e.message.slice(0, 60)}`)
const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
const context = await browser.newContext({ viewport: { width: 1700, height: 920 } })
await context.addInitScript(() => { try { Object.defineProperty(navigator, 'requestMIDIAccess', { value: undefined, configurable: true }) } catch { /* none */ } })
const page = await context.newPage(); page.setDefaultTimeout(15000)
const R = { a: {}, b: {}, c: {}, d: {}, e: {}, f: {}, g: {}, pictures: [] }
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
page.on('pageerror', (e) => errors.push(`pageerror ${String(e.message).slice(0, 200)}`))
const wait = (ms = 300) => page.waitForTimeout(ms)
const setW = async (w) => { await page.setViewportSize({ width: w, height: 920 }); await wait(500) }
// what the page shows: each shown border (box, by id), each bottom panel box, deck width, fold state
const probe = () => page.evaluate(() => {
    const deck = document.querySelector('.vj-deck'); if (!deck) return null
    const box = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] }
    const shown = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' }
    const seams = {}; for (const s of deck.querySelectorAll('.vj-deck-seam')) if (shown(s)) seams[s.dataset.seam] = box(s)
    const panels = {}; for (const p of deck.querySelectorAll('.vj-deck-panel')) if (shown(p)) panels[(p.getAttribute('aria-label') || p.className).slice(0, 24)] = box(p)
    return { deckW: Math.round(deck.getBoundingClientRect().width), seams, panels, fold: deck.dataset.fold || null, locked: deck.dataset.locked || null, cols: getComputedStyle(deck).getPropertyValue('--vj-fold-cols').trim() }
})
const zone = (id) => page.evaluate((id) => { const e = document.querySelector(`.vj-deck-seam[data-seam="${id}"]`); if (!e) return null; const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) } }, id)
const dragSeam = async (id, dx, dy) => {
    const s = (await probe()).seams[id]; if (!s) return null
    const x = s[0] + s[2] / 2; const y = s[1] + s[3] / 2
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 }); await page.mouse.move(x + dx, y + dy, { steps: 4 }); await page.mouse.up(); await wait(300)
    return true
}
const sizes = (p) => Object.fromEntries(Object.entries(p.panels).map(([k, v]) => [k, [v[2], v[3]]]))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const pairsOverlapping = () => page.evaluate(() => { const w = [...document.querySelectorAll('.raw-window')].filter((e) => !e.classList.contains('is-minimized')).map((e) => e.getBoundingClientRect()); let n = 0; for (let i = 0; i < w.length; i++) for (let j = i + 1; j < w.length; j++) { const a = w[i]; const b = w[j]; if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) n++ } return { windows: w.length, overlappingPairs: n, boxes: w.map((r) => [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]) } })
try {
    const projectId = await setup(page)
    await openP1(page, projectId)
    // a + b
    for (const w of [1700, 1100, 800, 620, 500]) {
        await setW(w); const before = await probe(); const row = { deckW: before.deckW, shown: Object.keys(before.seams), zones: {}, drag: {} }
        for (const id of row.shown) row.zones[id] = await zone(id)
        for (const id of row.shown) {
            const vertical = !['s4'].includes(id)
            await dragSeam(id, vertical ? 40 : 0, vertical ? 0 : -30); const after = await probe()
            row.drag[id] = { moved: !same(sizes(before), sizes(after)), before: sizes(before), after: sizes(after) }
            await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.vj-deck'); await wait(500)
        }
        R.a[w] = row; R.b[w] = row.zones
    }
    // c: bottom panels side by side with no border between them
    const bad = []; const widths = {}
    for (let w = 500; w <= 1700; w += 20) {
        await setW(w); const p = await probe(); const names = Object.keys(p.panels).filter((k) => /Sources|Clip|Effects/.test(k)); const boxes = names.map((k) => p.panels[k])
        const sideBySide = boxes.length >= 2 && boxes.some((a, i) => boxes.some((b, j) => i < j && Math.abs(a[1] - b[1]) < 4))
        widths[w] = { deckW: p.deckW, seams: Object.keys(p.seams).join(','), sideBySide }
        if (sideBySide && !(p.seams.s5 || p.seams.s6) && !p.fold) bad.push(w)
    }
    R.c = { badViewportWidths: bad, count: bad.length, samples: widths }
    // d: fold
    await setW(1700); await wait(300); await shot(page, 'deck-full-1700.png').then((f) => R.pictures.push(f))
    R.d = {}
    for (const n of ['Sources', 'Clip', 'Effects']) {
        const btn = page.locator(`.vj-deck-fold[aria-label="${n} panel"]`).first()
        if (!(await btn.count())) { R.d[n] = { error: 'no fold button' }; continue }
        await btn.click(); await wait(300); const f = await probe()
        if (n === 'Sources') await shot(page, 'deck-sources-folded-1700.png').then((x) => R.pictures.push(x))
        await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.vj-deck'); await wait(600); const rl = await probe()
        const again = page.locator(`.vj-deck-fold[aria-label="${n} panel"]`).first(); await again.click(); await wait(300); const u = await probe()
        R.d[n] = { foldAttr: f.fold, afterReload: rl.fold, afterUnfold: u.fold, keptOnReload: !!rl.fold && rl.fold === f.fold }
    }
    // e: double-click one border, lock, whole reset
    const p0 = await probe(); await dragSeam('s5', 60, 0); const dragged = await probe()
    const s5 = dragged.seams.s5; await page.mouse.dblclick(s5[0] + s5[2] / 2, s5[1] + s5[3] / 2); await wait(300); const reset1 = await probe()
    R.e.dblclick = { initial: sizes(p0), dragged: sizes(dragged), afterDblclick: sizes(reset1), changedByDrag: !same(sizes(p0), sizes(dragged)), backToInitial: same(sizes(p0), sizes(reset1)) }
    await page.getByRole('button', { name: 'Lock layout' }).click(); await wait(300)
    const l0 = await probe(); await dragSeam('s5', 60, 0); const l1 = await probe()
    R.e.lockedDragChangesNothing = same(sizes(l0), sizes(l1)); R.e.lockedAttr = l1.locked
    await page.getByRole('button', { name: 'Unlock layout' }).click(); await wait(200)
    await dragSeam('s5', 60, 0); await page.getByRole('button', { name: 'Lock layout' }).click(); await wait(200)
    const rb = page.getByRole('button', { name: 'Reset layout' }); R.e.resetVisibleWithLock = (await rb.count()) > 0
    if (R.e.resetVisibleWithLock) { await rb.first().click(); await wait(300) }
    const r2 = await probe(); R.e.wholeResetWorksWithLock = same(sizes(p0), sizes(r2)); R.e.stillLockedAfterReset = r2.locked
    // 620 picture
    await setW(620); await shot(page, 'deck-620.png').then((f) => R.pictures.push(f))
    await setW(1700)
    // f: Perform desk
    await openP2(page, projectId); await wait(600)
    const arr = page.getByRole('button', { name: /^Arrange all/ }); R.f.buttonPresent = (await arr.count()) > 0
    R.f.before = await pairsOverlapping(); await shot(page, 'perform-before-arrange.png').then((f) => R.pictures.push(f))
    if (R.f.buttonPresent) { await arr.first().click(); await wait(600) }
    R.f.after = await pairsOverlapping(); await shot(page, 'perform-after-arrange.png').then((f) => R.pictures.push(f))
    const head = page.locator('.raw-window-header').first(); const hb = await head.boundingBox()
    if (hb) { await page.mouse.move(hb.x + 40, hb.y + hb.height / 2); await page.mouse.down(); await page.mouse.move(hb.x + 90, hb.y + 60, { steps: 6 }); await page.mouse.up(); await wait(400) }
    const moved = await pairsOverlapping(); await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.vj-deck'); await wait(1200)
    const reloaded = await pairsOverlapping()
    R.f.movedThenReload = { moved: moved.boxes, reloaded: reloaded.boxes, sameAfterReload: same(moved.boxes, reloaded.boxes) }
} catch (e) { R.error = String(e && e.stack || e).slice(0, 600) }
R.g = { consoleErrors: errors.length, first3: errors.slice(0, 3) }
fs.writeFileSync(path.join(OUT, 'result-round4.json'), JSON.stringify(R, null, 1))
console.log(JSON.stringify({ c: R.c.count, d: R.d, e: { ...R.e, dblclick: undefined }, f: { present: R.f.buttonPresent, before: R.f.before?.overlappingPairs, after: R.f.after?.overlappingPairs, kept: R.f.movedThenReload?.sameAfterReload }, g: R.g, error: R.error }))
await page.goto('about:blank').catch(() => {})
await context.close().catch(() => {})
