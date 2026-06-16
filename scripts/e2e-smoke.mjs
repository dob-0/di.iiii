/**
 * Smoke test — visits every major surface and checks key interactions.
 * Run: node scripts/e2e-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = 'http://localhost:5173'
const SPACE_ID = 'main'
const PROJECT_ID = 'default-scene-test'
const RESULTS = []

function pass(name) { RESULTS.push({ status: '✅ PASS', name }) }
function fail(name, reason) { RESULTS.push({ status: '❌ FAIL', name, reason }) }
function skip(name, reason) { RESULTS.push({ status: '⚠️  SKIP', name, reason }) }

async function check(name, fn) {
    try { await fn(); pass(name) }
    catch (e) { fail(name, e.message.split('\n')[0]) }
}

// goto that handles WebSocket pages (networkidle never fires with active WS)
async function goto(page, url) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 })
    // give React a moment to render
    await page.waitForTimeout(1500)
}

async function run() {
    const browser = await chromium.launch({ headless: true })
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    const page = await ctx.newPage()

    const consoleErrors = []
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
    page.on('pageerror', e => consoleErrors.push('PAGE ERROR: ' + e.message))

    // ── 1. Root / AuthGate ────────────────────────────────────────────────
    await check('Root loads (no white screen / no TDZ crash)', async () => {
        await goto(page, BASE)
        const body = await page.locator('body').innerHTML()
        if (body.trim() === '') throw new Error('Empty body')
        const tdz = consoleErrors.find(e => e.includes('Cannot access') && e.includes('initialization'))
        if (tdz) throw new Error('TDZ crash: ' + tdz)
    })

    await check('AuthGate: resolves — no infinite spinner', async () => {
        const spinner = page.locator('[role="progressbar"]')
        const visible = await spinner.isVisible().catch(() => false)
        if (visible) {
            await page.waitForFunction(
                () => !document.querySelector('[role="progressbar"]'),
                { timeout: 10000 }
            )
        }
    })

    const isAuthScreen = await page.locator('text=Enter your access token').isVisible().catch(() => false)

    if (isAuthScreen) {
        skip('All app surfaces', 'Auth required — no token provided')
    } else {

        // ── 2. Studio Hub ─────────────────────────────────────────────────
        await check('Studio Hub: loads at /main/studio', async () => {
            await goto(page, `${BASE}/${SPACE_ID}/studio`)
            await page.waitForFunction(
                () => document.body.innerText.length > 50,
                { timeout: 8000 }
            )
        })

        await check('Studio Hub: renders project list or empty state', async () => {
            const text = await page.locator('body').innerText()
            if (!text.match(/project|hub|space|create/i))
                throw new Error('No recognisable Studio Hub content')
        })

        // ── 3. Studio project editor ──────────────────────────────────────
        await check('Studio Editor: opens project page', async () => {
            await goto(page, `${BASE}/${SPACE_ID}/studio/projects/${PROJECT_ID}`)
        })

        await check('Studio Editor: World tab visible', async () => {
            await page.locator('text=World').first().waitFor({ timeout: 8000 })
        })

        await check('Studio Editor: View tab visible', async () => {
            await page.locator('text=View').first().waitFor({ timeout: 5000 })
        })

        await check('Studio Editor: Graph tab visible', async () => {
            await page.locator('text=Graph').first().waitFor({ timeout: 5000 })
        })

        await check('Studio Editor: Hub back-button visible', async () => {
            const hub = page.locator('button:has-text("Hub"), a:has-text("Hub"), [class*="hub"]').first()
            await hub.waitFor({ timeout: 5000 })
        })

        await check('Studio Editor: inspector panel present', async () => {
            await page.waitForFunction(
                () => document.body.innerText.includes('Inspector') ||
                    !!document.querySelector('[class*="inspector"]'),
                { timeout: 6000 }
            )
        })

        await check('Studio Editor: assets panel present', async () => {
            await page.waitForFunction(
                () => document.body.innerText.includes('Asset') ||
                    !!document.querySelector('[class*="asset"]'),
                { timeout: 6000 }
            )
        })

        await check('Studio Editor: click View tab', async () => {
            await page.locator('text=View').first().click()
            await page.waitForTimeout(600)
        })

        await check('Studio Editor: click World tab', async () => {
            await page.locator('text=World').first().click()
            await page.waitForTimeout(600)
        })

        await check('Studio Editor: click Graph tab', async () => {
            await page.locator('text=Graph').first().click()
            await page.waitForTimeout(600)
        })

        await check('Studio Editor: canvas / 3D viewport present', async () => {
            const canvas = page.locator('canvas').first()
            const present = await canvas.isVisible().catch(() => false)
            if (!present) throw new Error('No <canvas> element found')
        })

        // ── 4. Studio Hub back-navigation ─────────────────────────────────
        await check('Studio Hub: Hub back-button navigates home', async () => {
            const hub = page.locator('button:has-text("Hub"), a:has-text("Hub"), [class*="hub"]').first()
            await hub.click()
            await page.waitForTimeout(800)
            const url = page.url()
            if (url.includes('/projects/')) throw new Error('Still on project page: ' + url)
        })

        // ── 5. Beta editor ────────────────────────────────────────────────
        await check('Beta editor: opens project page', async () => {
            await goto(page, `${BASE}/${SPACE_ID}/beta/projects/${PROJECT_ID}`)
        })

        await check('Beta editor: World tab visible', async () => {
            await page.locator('text=World').first().waitFor({ timeout: 8000 })
        })

        await check('Beta editor: Graph tab visible', async () => {
            await page.locator('text=Graph').first().waitFor({ timeout: 5000 })
        })

        await check('Beta editor: View tab visible', async () => {
            await page.locator('text=View').first().waitFor({ timeout: 5000 })
        })

        await check('Beta editor: Add View Node button', async () => {
            await page.locator('text=Add View Node').first().waitFor({ timeout: 5000 })
        })

        await check('Beta editor: Size selector (Compact/Full)', async () => {
            const size = page.locator('text=Compact, text=Full').first()
            const visible = await size.isVisible().catch(() => false)
            if (!visible) throw new Error('Size selector not found')
        })

        await check('Beta editor: Help button visible', async () => {
            await page.locator('text=Help').first().waitFor({ timeout: 5000 })
        })

        await check('Beta editor: switch to World tab', async () => {
            await page.locator('text=World').first().click()
            await page.waitForTimeout(500)
        })

        await check('Beta editor: switch to Graph tab', async () => {
            await page.locator('text=Graph').first().click()
            await page.waitForTimeout(500)
        })

        await check('Beta editor: switch back to View tab', async () => {
            await page.locator('text=View').first().click()
            await page.waitForTimeout(500)
        })

        await check('Beta editor: outliner panel present', async () => {
            await page.waitForFunction(
                () => document.body.innerText.includes('Outliner') ||
                    document.body.innerText.includes('outliner') ||
                    !!document.querySelector('[class*="outliner"]'),
                { timeout: 6000 }
            )
        })

        await check('Beta editor: node graph canvas present', async () => {
            const canvas = page.locator('canvas').first()
            const present = await canvas.isVisible().catch(() => false)
            if (!present) throw new Error('No <canvas> element')
        })

        // ── 6. Browser back / forward ─────────────────────────────────────
        await check('Browser back/forward: back works', async () => {
            await page.goBack()
            await page.waitForTimeout(800)
            if (page.url() === 'about:blank') throw new Error('Ended at about:blank')
        })

        await check('Browser back/forward: forward works', async () => {
            await page.goForward()
            await page.waitForTimeout(800)
            if (page.url() === 'about:blank') throw new Error('Ended at about:blank')
        })
    }

    // ── 7. Backend API ────────────────────────────────────────────────────
    await check('Backend /api/health → 200', async () => {
        const r = await page.request.get(`${BASE}/serverXR/api/health`)
        if (r.status() !== 200) throw new Error(`Status ${r.status()}`)
    })

    await check('Backend /api/spaces → JSON array', async () => {
        const r = await page.request.get(`${BASE}/serverXR/api/spaces`)
        if (r.status() !== 200) throw new Error(`Status ${r.status()}`)
        const j = await r.json()
        if (!j.spaces || !Array.isArray(j.spaces)) throw new Error('Expected {spaces:[...]}')
    })

    await check(`Backend /api/spaces/${SPACE_ID}/projects → JSON array`, async () => {
        const r = await page.request.get(`${BASE}/serverXR/api/spaces/${SPACE_ID}/projects`)
        if (r.status() !== 200) throw new Error(`Status ${r.status()}`)
        const j = await r.json()
        if (!j.projects || !Array.isArray(j.projects)) throw new Error('Expected {projects:[...]}')
    })

    await check(`Backend /api/spaces/${SPACE_ID}/projects/${PROJECT_ID}/document → 200`, async () => {
        const r = await page.request.get(`${BASE}/serverXR/api/projects/${PROJECT_ID}/document`)
        if (r.status() !== 200) throw new Error(`Status ${r.status()}`)
    })

    await check('Backend /api/auth/session → 200/304', async () => {
        const r = await page.request.get(`${BASE}/serverXR/api/auth/session`)
        if (r.status() !== 200 && r.status() !== 304) throw new Error(`Status ${r.status()}`)
    })

    // ── 8. No critical JS errors ──────────────────────────────────────────
    await check('No TDZ crashes in console', async () => {
        const tdz = consoleErrors.filter(e => e.includes('Cannot access') && e.includes('initialization'))
        if (tdz.length) throw new Error(tdz[0])
    })

    await check('No uncaught TypeError crashes', async () => {
        const crash = consoleErrors.filter(e =>
            (e.includes('undefined is not a function') || e.includes('is not a constructor')) &&
            e.includes('TypeError')
        )
        if (crash.length) throw new Error(crash[0])
    })

    // ── Summary ───────────────────────────────────────────────────────────
    await browser.close()

    const pad = s => s.padEnd(60)
    console.log('\n══════════════════════════════════════════════════════════════')
    console.log('  SMOKE TEST RESULTS')
    console.log('══════════════════════════════════════════════════════════════')
    for (const r of RESULTS) {
        const line = `  ${r.status}  ${pad(r.name)}`
        console.log(r.reason ? `${line}\n           ↳ ${r.reason}` : line)
    }
    const passed = RESULTS.filter(r => r.status.includes('PASS')).length
    const failed = RESULTS.filter(r => r.status.includes('FAIL')).length
    const skipped = RESULTS.filter(r => r.status.includes('SKIP')).length
    console.log('══════════════════════════════════════════════════════════════')
    console.log(`  ${passed} passed  ${failed} failed  ${skipped} skipped`)
    console.log('══════════════════════════════════════════════════════════════\n')

    if (failed > 0) process.exit(1)
}

run().catch(e => { console.error(e); process.exit(1) })
