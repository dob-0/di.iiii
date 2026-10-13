// Walk: a selection made with the Select box tool ON, then moved WITHOUT leaving Select
// (owner 2026-10-13: "you must un-press the Select button in the Studio window before you can move").
// Local stack (npm run dev, scratch DATA_ROOT), account `walker` in space `main`, project `select-move`:
// a locked box place + three spot lights. Per gesture it prints: moved? selection kept? Select still on? op count.
//   CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/audit/studio-select-then-move.mjs
// Screen points are the lamps' own world points projected with the live r3f camera (the page's own module).
import { chromium } from 'playwright'
import fs from 'node:fs'
import { account, person } from '../../.claude/skills/run-di-iiii/driver.mjs'
import { createEntityOfType } from '../../src/project/entityRegistry.js'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d }
const BASE = arg('base', 'http://localhost:5173')
const SHOTS = arg('shots', '/tmp/select-move')
const ONLY = arg('only', null)
const PID = 'select-move'
fs.mkdirSync(SHOTS, { recursive: true })

await account('walker', ['main'])
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await person(browser, { as: 'walker' })
const api = (p, o = {}) => page.evaluate(async ([p, o]) => {
    const r = await fetch(`/serverXR/api${p}`, { credentials: 'include', headers: { 'content-type': 'application/json' }, ...o })
    return { status: r.status, body: await r.json().catch(() => null) }
}, [p, o])

const mk = (type, name, position, extra = {}) => {
    const e = createEntityOfType(type, { name })
    e.components.transform = { rotation: [0, 0, 0], scale: [1, 1, 1], ...e.components.transform, position, ...extra }
    return e
}
const place = mk('box', 'Place', [0, 0, -3], { scale: [8, 4, 0.5] })
place.components.runtime = { ...(place.components.runtime || {}), locked: true }
const lamps = [mk('spotLight', 'A', [-2, 1.5, 0]), mk('spotLight', 'B', [0, 1.5, 0]), mk('spotLight', 'C', [1.5, 0.5, 0])]
const LAMP = { A: [-2, 1.5, 0], B: [0, 1.5, 0], C: [1.5, 0.5, 0] }
console.log('create project', (await api('/spaces/main/projects', { method: 'POST', body: JSON.stringify({ title: PID, slug: PID }) })).status)
const seed = async () => {
    const doc = (await api(`/projects/${PID}/document`)).body?.document || {}
    return (await api(`/projects/${PID}/document`, { method: 'PUT', body: JSON.stringify({ ...doc, entities: [place, ...lamps] }) })).status
}
const opCount = async () => {
    const b = (await api(`/projects/${PID}/ops?since=0`)).body || {}
    return (b.ops || b.operations || []).length
}
const positions = async () => {
    const d = (await api(`/projects/${PID}/document`)).body?.document
    const out = {}
    for (const e of d.entities) if (e.name !== 'Place') out[e.name] = e.components.transform.position.map((v) => +v.toFixed(2))
    return out
}

let FIBER = null
const probe = (src, arg) => page.evaluate(async ([src, arg, url]) => {
    const mod = await import(url)
    const root = [...mod._roots.values()][0].store.getState()
    // eslint-disable-next-line no-new-func
    return new Function('root', 'arg', src)(root, arg)
}, [src, arg, FIBER])
// What is selected, read from the scene: lamps carrying a gizmo or highlight box. `gizmo` = a TransformControls is attached.
const selection0 = () => probe('let g=0, h=0; root.scene.traverse(o=>{ if(o.isTransformControls && o.object) g++; if(o.isBox3Helper && o.parent) h++ }); return `gizmo:${g} boxes:${h}`')
const screenOf = async (name) => probe(`const V=root.camera.position.constructor; const v=new V(...arg).project(root.camera); const b=root.gl.domElement.getBoundingClientRect(); return {x:b.left+(v.x+1)/2*b.width, y:b.top+(1-v.y)/2*b.height}`, LAMP[name])
// The Objects window's pressed rows = what the document says is selected.
const selection = async () => {
    if (!process.env.OBJ_ROWS) return selection0()
    const gizmo = await selection0()
    await page.getByRole('button', { name: 'Objects', exact: true }).click()
    await page.waitForTimeout(500)
    const rows = await page.locator('button[aria-pressed="true"]').filter({ hasText: 'spotLight' }).count()
    await page.getByRole('button', { name: 'Objects', exact: true }).click()
    await page.waitForTimeout(300)
    return `${gizmo} rows:${rows}`
}
const gizmoAxisAt = async () => probe('let ax=null; root.scene.traverse(o=>{ if(o.isTransformControls && o.object) ax=o.axis }); return ax')
const gizmoCenter = () => probe(`let c=null; root.scene.traverse(o=>{ if(o.isTransformControls && o.object){ const V=root.camera.position.constructor; const p=o.object.getWorldPosition(new V()).project(root.camera); const b=root.gl.domElement.getBoundingClientRect(); c={x:b.left+(p.x+1)/2*b.width,y:b.top+(1-p.y)/2*b.height}} }); return c`)

const boxSelect = async (names, { add = false } = {}) => {
    const pts = await Promise.all(names.map(screenOf))
    const x0 = Math.min(...pts.map((p) => p.x)) - 40, x1 = Math.max(...pts.map((p) => p.x)) + 40
    const y0 = Math.min(...pts.map((p) => p.y)) - 50, y1 = Math.max(...pts.map((p) => p.y)) + 50
    if (add) await page.keyboard.down('Shift')
    await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 6 }); await page.mouse.move(x1, y1, { steps: 6 }); await page.mouse.up()
    if (add) await page.keyboard.up('Shift')
    await page.waitForTimeout(500)
}
// Find the +X arrow by hovering along the line from the gizmo's centre; drag it dx px.
const gizmoDrag = async (dx = 120) => {
    const c = await gizmoCenter()
    if (!c) return { gizmo: 'NO GIZMO' }
    let hit = null
    for (let d = 15; d < 260 && !hit; d += 6) {
        await page.mouse.move(c.x + d, c.y); await page.waitForTimeout(40)
        if ((await gizmoAxisAt()) === 'X') hit = { x: c.x + d, y: c.y }
    }
    if (!hit) return { gizmo: `no X handle found from (${c.x | 0},${c.y | 0})` }
    await page.mouse.move(hit.x, hit.y); await page.mouse.down()
    await page.mouse.move(hit.x + dx / 2, hit.y, { steps: 6 }); await page.mouse.move(hit.x + dx, hit.y, { steps: 6 }); await page.mouse.up()
    return { gizmo: `X handle at (${hit.x | 0},${hit.y | 0}), dragged ${dx}px` }
}

const GESTURES = {
    'gizmo arrow, 2 lamps box-selected': async () => { await boxSelect(['A', 'B']); const s = await selection(); return { selectionBefore: s, ...(await gizmoDrag()) } },
    'G, mouse, click (2 lamps)': async () => {
        await boxSelect(['A', 'B']); const s = await selection()
        await page.keyboard.press('g'); await page.mouse.move(600, 500); await page.mouse.move(700, 500, { steps: 8 }); await page.mouse.click(700, 500)
        return { selectionBefore: s }
    },
    'G, mouse, Esc (cancel, 2 lamps)': async () => {
        await boxSelect(['A', 'B']); const s = await selection()
        await page.keyboard.press('g'); await page.mouse.move(600, 500); await page.mouse.move(700, 500, { steps: 8 }); await page.keyboard.press('Escape')
        return { selectionBefore: s }
    },
    'Move G button, then gizmo (2 lamps)': async () => {
        await boxSelect(['A', 'B']); const s = await selection()
        await page.getByRole('button', { name: /^Move G/ }).click()
        return { selectionBefore: s, ...(await gizmoDrag()) }
    },
    'gizmo arrow, 1 lamp clicked': async () => {
        const p = await screenOf('A'); await page.mouse.click(p.x, p.y); await page.waitForTimeout(500)
        const s = await selection(); return { selectionBefore: s, ...(await gizmoDrag()) }
    },
    'gizmo arrow, 1 lamp box-selected': async () => { await boxSelect(['A']); const s = await selection(); return { selectionBefore: s, ...(await gizmoDrag()) } },
    'G, mouse, click (1 lamp box-selected)': async () => {
        await boxSelect(['A']); const s = await selection()
        await page.keyboard.press('g'); await page.mouse.move(600, 500); await page.mouse.move(700, 500, { steps: 8 }); await page.mouse.click(700, 500)
        return { selectionBefore: s }
    },
    'gizmo arrow, 3 lamps box-selected': async () => { await boxSelect(['A', 'B', 'C']); const s = await selection(); return { selectionBefore: s, ...(await gizmoDrag()) } },
    'gizmo arrow, Shift box adds C to A': async () => { await boxSelect(['A']); await boxSelect(['C'], { add: true }); const s = await selection(); return { selectionBefore: s, ...(await gizmoDrag()) } },
    'G X, mouse, click (2 lamps)': async () => {
        await boxSelect(['A', 'B']); const s = await selection()
        await page.keyboard.press('g'); await page.keyboard.press('x'); await page.mouse.move(600, 500); await page.mouse.move(700, 540, { steps: 8 }); await page.mouse.click(700, 540)
        return { selectionBefore: s }
    },
    'G X, mouse, click (1 lamp clicked)': async () => {
        const p = await screenOf('A'); await page.mouse.click(p.x, p.y); await page.waitForTimeout(500)
        const s = await selection()
        await page.keyboard.press('g'); await page.keyboard.press('x'); await page.mouse.move(600, 500); await page.mouse.move(700, 540, { steps: 8 }); await page.mouse.click(700, 540)
        return { selectionBefore: s }
    },
    'R, mouse, click (2 lamps)': async () => {
        await boxSelect(['A', 'B']); const s = await selection()
        await page.keyboard.press('r'); await page.mouse.move(600, 500); await page.mouse.move(700, 540, { steps: 8 }); await page.mouse.click(700, 540)
        return { selectionBefore: s, note: 'rotation not in the position table; ops counts it' }
    },
    'gizmo arrow, one fast jump (2 lamps)': async () => {
        await boxSelect(['A', 'B']); const s = await selection(); const c = await gizmoCenter()
        let hit = null
        for (let d = 15; d < 260 && !hit; d += 6) { await page.mouse.move(c.x + d, c.y); if ((await gizmoAxisAt()) === 'X') hit = { x: c.x + d, y: c.y } }
        await page.mouse.move(hit.x, hit.y); await page.mouse.down(); await page.mouse.move(hit.x + 120, hit.y); await page.mouse.up()
        return { selectionBefore: s, gizmo: 'jump, steps 1' }
    },
    'drag on empty space still draws a box': async () => {
        await page.mouse.move(200, 650); await page.mouse.down(); await page.mouse.move(300, 700, { steps: 5 })
        const seen = await page.locator('[data-testid="studio-box-select"]').count()
        await page.mouse.move(400, 750, { steps: 5 }); await page.mouse.up()
        return { boxDrawn: seen }
    }
}

FIBER = null
await page.goto(`${BASE}/main/studio/projects/${PID}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)
FIBER = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).find((n) => /deps\/@react-three_fiber\.js/.test(n)) || null)

const rows = []
for (const [label, gesture] of Object.entries(GESTURES)) {
    if (ONLY && !label.includes(ONLY)) continue
    await seed()
    await page.goto(`${BASE}/main/studio/projects/${PID}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(6000)
    for (const w of ['Create', 'Objects']) await page.getByRole('button', { name: w, exact: true }).click().catch(() => {})  // the Windows toggles
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    if (!process.argv.includes('--noselect')) await page.getByRole('button', { name: 'Select', exact: true }).click()
    await page.waitForTimeout(800)
    const on = await page.evaluate(() => document.querySelector('canvas')?.dataset.boxSelect)
    console.log('lamp screen points', JSON.stringify({ A: await screenOf('A'), B: await screenOf('B'), C: await screenOf('C') }))
    const before = await positions(); const ops0 = await opCount()
    const info = await gesture()
    await page.waitForTimeout(1500)
    const after = await positions(); const ops1 = await opCount()
    const moved = Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k])).map((k) => `${k} ${before[k]}→${after[k]}`)
    const row = { gesture: label, selectOn: on, moved: moved.length ? moved.join('; ') : 'NO', selectionAfter: await selection(), selectStillOn: await page.evaluate(() => document.querySelector('canvas')?.dataset.boxSelect), ops: ops1 - ops0, ...info }
    rows.push(row); console.log(JSON.stringify(row))
    await page.screenshot({ path: `${SHOTS}/${label.replace(/\W+/g, '-')}.png` })
}
if (page.problems.length) console.log('PROBLEMS', page.problems)
await browser.close()
