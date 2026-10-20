// Walk: the Studio's Walk builds, Minecraft style (owner 2026-10-13: "walk mode in studio can be the minecraft
// style one"). Local stack (npm run dev, scratch DATA_ROOT), account `walker` in space `main`, project `walk-build`.
// Enters Walk, picks a lamp slot (6), clicks to place ONE object where the crosshair aims, presses Ctrl+Z, and prints
// the op count and the entity count before / after each step, plus whether the hotbar was on screen in and out of the walk.
//   CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/audit/studio-walk-build.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'
import { account, person } from '../../.claude/skills/run-di-iiii/driver.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d }
// No default address (the local rule: <tree>.diiii.localhost; a bare port is never handed out): --base or DI_BASE.
const BASE = arg('base', process.env.DI_BASE || null)
if (!BASE) { console.error('usage: node scripts/audit/studio-walk-build.mjs --base http://<tree>.diiii.localhost [--shots dir]'); process.exit(2) }
const SHOTS = arg('shots', '/tmp/walk-build')
const PID = 'walk-build'
fs.mkdirSync(SHOTS, { recursive: true })

await account('walker', ['main'])
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await person(browser, { as: 'walker' })
try {
    const api = (p, o = {}) => page.evaluate(async ([p, o]) => {
        const r = await fetch(`/serverXR/api${p}`, { credentials: 'include', headers: { 'content-type': 'application/json' }, ...o })
        return { status: r.status, body: await r.json().catch(() => null) }
    }, [p, o])
    console.log('create project', (await api('/spaces/main/projects', { method: 'POST', body: JSON.stringify({ title: PID, slug: PID }) })).status)
    const state = async () => {
        const ops = ((await api(`/projects/${PID}/ops?since=0`)).body || {})
        const doc = (await api(`/projects/${PID}/document`)).body?.document
        return { ops: (ops.ops || ops.operations || []).length, entities: (doc?.entities || []).length }
    }
    const hotbar = () => page.locator('[aria-label="Hotbar"]').count()

    await page.goto(`${BASE}/main/studio/projects/${PID}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(6000)
    const out = { before: await state(), hotbarOutsideWalk: await hotbar() }
    // Shift+` starts Fly (Blender's Walk key); Tab switches to Walk (gravity, eye 1.6 m).
    await page.mouse.move(640, 360)
    await page.keyboard.press('Shift+Backquote')
    await page.waitForTimeout(800)
    out.hotbarInFly = await hotbar()
    await page.keyboard.press('Tab')
    await page.waitForTimeout(1500)
    out.hotbarInWalk = await hotbar()
    await page.keyboard.press('6')
    const vp = page.viewportSize() || { width: 1280, height: 720 }
    await page.mouse.click(vp.width / 2, vp.height / 2)
    await page.waitForTimeout(2000)
    await page.screenshot({ path: `${SHOTS}/placed.png` })
    out.afterPlace = await state()
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(2000)
    out.afterUndo = await state()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    out.hotbarAfterEsc = await hotbar()
    console.log(JSON.stringify(out, null, 2))
} finally {
    // leave it as found: the page on about:blank, the browser closed, also when a step failed
    await page.goto('about:blank').catch(() => {})
    await browser.close()
}
