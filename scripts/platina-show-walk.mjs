// platina-show-walk — the human check of the joined show copy (reads and looks; changes nothing in the app).
//   DI_TEST_LANES=3 DI_TEST_LANE=3 di-test-browser run scripts/platina-show-walk.mjs -- --base URL --space S --project P --out DIR [--views nodes,scene,near,studio,tech,deck]
// Safety: every /light/api/ request is aborted and counted; no MIDI and no camera permission is granted.
// Clicks: the bar's Nodes / Scene / Studio / Open VJ Deck only; the 3D view gets mouse moves and the wheel only.
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
const arg = (n, f) => { const i = process.argv.indexOf(`--${n}`); const v = i === -1 ? null : process.argv[i + 1]; return v && !v.startsWith('--') ? v : f }
const BASE = arg('base', 'http://platina-show.diiii.localhost'); const SPACE = arg('space', 'platina-show'); const PROJECT = arg('project', 'platina-show')
const OUT = arg('out', '.'); const VIEWS = arg('views', 'nodes,scene,near,studio,tech,deck').split(',')
fs.mkdirSync(OUT, { recursive: true })
const NAMES = { nodes: '01-nodes', scene: '02-scene', near: '03-scene-near', studio: '04-studio', tech: '05-tech', deck: '06-deck' }
const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
const context = await browser.newContext({ viewport: { width: 1700, height: 920 } })
await context.addInitScript(() => { try { Object.defineProperty(navigator, 'requestMIDIAccess', { value: undefined, configurable: true }) } catch { /* none */ } })
const page = await context.newPage(); page.setDefaultTimeout(20000)
let aborted = 0; const R = { views: {}, lightApiAborted: 0 }
await page.route('**/*', (route) => { if (route.request().url().includes('/light/api/')) { aborted += 1; return route.abort() } return route.continue() })
let errs = []; page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)) }); page.on('pageerror', (e) => errs.push(`pageerror ${String(e).slice(0, 200)}`))
const wait = (ms) => page.waitForTimeout(ms)
const fps = () => page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n += 1; if (performance.now() - t0 < 5000) requestAnimationFrame(f); else res(Math.round(n / ((performance.now() - t0) / 1000) * 10) / 10) }; requestAnimationFrame(f) }))
const nodesUrl = (q = '') => `${BASE}/${SPACE}/raw/projects/${PROJECT}${q}`
const barButtons = () => page.evaluate(() => [...document.querySelectorAll('.sbar-link, .raw-cell, .raw-topbar button, header button, nav a, nav button')].map((e) => (e.textContent || '').trim().slice(0, 30)).filter(Boolean).slice(0, 40))
const sceneBtn = () => page.locator('button.raw-cell', { hasText: /^Scene/ }).first()
const orbit = async (dx, dy, wheel) => { const b = await page.locator('canvas').first().boundingBox(); if (!b) return; const cx = b.x + b.width / 2; const cy = b.y + b.height / 2; await page.mouse.move(cx, cy); if (wheel) { await page.mouse.wheel(0, wheel); await wait(600) } if (dx || dy) { await page.mouse.down(); await page.mouse.move(cx + dx, cy + dy, { steps: 12 }); await page.mouse.up(); await wait(600) } }
const finish = async (view, extra = {}) => { await wait(1500); const f = await fps(); await page.screenshot({ path: path.join(OUT, `${NAMES[view]}.png`) }); R.views[view] = { fps: f, consoleErrors: errs.length, firstErrors: errs.slice(0, 3), url: page.url(), ...extra }; errs = [] }
const t0 = Date.now()
try {
    for (const v of VIEWS) {
        try {
            if (v === 'nodes') { await page.goto(nodesUrl(), { waitUntil: 'domcontentloaded' }); await wait(5000); await finish(v, { buttons: await barButtons(), sceneButtonText: await sceneBtn().textContent().catch(() => null) }) }
            else if (v === 'scene' || v === 'near') {
                if (v === 'scene') { await page.goto(nodesUrl(), { waitUntil: 'domcontentloaded' }); await wait(4000); await sceneBtn().click(); await wait(8000); }
                else { await orbit(0, 0, -600) }
                await finish(v)
            } else if (v === 'studio') { await page.goto(nodesUrl(), { waitUntil: 'domcontentloaded' }); await wait(4000); await page.locator('a', { hasText: /^Studio$/ }).first().click(); await wait(9000); await finish(v) }
            else if (v === 'tech') { await page.goto(nodesUrl('?render=tech'), { waitUntil: 'domcontentloaded' }); await wait(4000); await sceneBtn().click(); await wait(8000); await finish(v) }
            else if (v === 'deck') { await page.goto(nodesUrl(), { waitUntil: 'domcontentloaded' }); await wait(4000); await page.getByRole('button', { name: 'Open VJ Deck' }).first().click(); await wait(6000); await finish(v) }
        } catch (e) { R.views[v] = { error: String(e).slice(0, 300), url: page.url() }; try { await page.screenshot({ path: path.join(OUT, `${NAMES[v]}-ERROR.png`) }) } catch { /* none */ } }
    }
} finally { R.lightApiAborted = aborted; R.seconds = Math.round((Date.now() - t0) / 1000); await page.goto('about:blank').catch(() => {}); await context.close().catch(() => {}) }
fs.writeFileSync(path.join(OUT, `result-${VIEWS.join('_')}.json`), JSON.stringify(R, null, 2)); console.log(JSON.stringify(R).slice(0, 1500))
