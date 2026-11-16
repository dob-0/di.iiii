// The owner's example, by hand: /admin -> Monitor -> Full screen -> Back = the Monitor window (not off the site);
// Back again = the desk home. Also: tab and Esc, own close buttons leave no orphan entry, a deep link, the phone Back button.
// Usage: node scripts/ui/nav-back-check.mjs <local stack url> [<outdir for pictures>]   (di-dev up <tree> --api scratch)
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const base = (process.argv[2] || '').replace(/\/$/, '')
const out = process.argv[3]
if (!/^https?:\/\/(?:[a-z0-9-]+\.)*(?:diiii\.localhost|localhost|127\.0\.0\.1)(?::\d+)?$/i.test(base)) { console.error('usage: nav-back-check.mjs <local stack url> [outdir]'); process.exit(2) }
if (out) fs.mkdirSync(out, { recursive: true })
const results = []
const check = (name, ok, note = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`) }

const browser = await chromium.launch({ executablePath: process.env.NAV_AUDIT_CHROME || '/usr/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const state = (page) => page.evaluate(() => ({
    path: location.pathname, hash: location.hash,
    windows: document.querySelectorAll('.admin-window').length,
    full: document.querySelector('[data-monitor-full]')?.getAttribute('data-monitor-full') || null,
    tab: document.querySelector('.monitor-tab.is-active')?.getAttribute('data-monitor-tab') || null
}))
const shot = async (page, name) => { if (out) await page.screenshot({ path: path.join(out, `${name}.png`) }) }
const settle = (page, ms = 700) => page.waitForTimeout(ms)
const openMonitor = async (page) => {
    await page.getByRole('button', { name: 'Windows' }).click()
    await page.getByRole('menuitem', { name: /monitor/i }).first().click()
    await page.waitForSelector('.monitor-page', { timeout: 15000 })
    await settle(page)
}
const newDesk = async (viewport, url = `${base}/admin`) => {
    const ctx = await browser.newContext({ viewport })
    const page = await ctx.newPage()
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.admin-desk', { timeout: 30000 })
    await settle(page, 1500)
    return { ctx, page }
}

try {
    // 1. desk: the owner's example
    let { ctx, page } = await newDesk({ width: 1440, height: 1000 })
    await openMonitor(page)
    let s = await state(page)
    check('Monitor window open on the desk', s.windows === 1 && s.full === 'off', JSON.stringify(s))
    await shot(page, '1-monitor-window')
    await page.getByRole('button', { name: 'Full screen' }).click(); await settle(page)
    s = await state(page); check('Full screen on', s.full === 'on', JSON.stringify(s)); await shot(page, '2-monitor-full')
    await page.goBack(); await settle(page)
    s = await state(page); check('Back from Full screen = Monitor window, still on /admin', s.path === '/admin' && s.full === 'off' && s.windows === 1, JSON.stringify(s)); await shot(page, '3-back-to-monitor-window')
    await page.goBack(); await settle(page)
    s = await state(page); check('Back again = desk home (no window), still on /admin', s.path === '/admin' && s.windows === 0, JSON.stringify(s)); await shot(page, '4-desk-home')

    // 2. tab, own buttons and Esc leave no orphan entry
    await openMonitor(page)
    await page.locator('[data-monitor-tab="map"]').click(); await settle(page, 400)
    s = await state(page); check('Map tab open', s.tab === 'map')
    await page.goBack(); await settle(page, 400)
    s = await state(page); check('Back from Map tab = Now tab, window stays', s.tab === 'now' && s.windows === 1, JSON.stringify(s))
    await page.getByRole('button', { name: 'Full screen' }).click(); await settle(page, 400)
    await page.getByRole('button', { name: 'Leave full screen' }).click(); await settle(page, 600)
    s = await state(page); check('"Leave full screen" button: back to the window', s.full === 'off' && s.windows === 1, JSON.stringify(s))
    await page.getByRole('button', { name: 'Full screen' }).click(); await settle(page, 400)
    await page.keyboard.press('Escape'); await settle(page, 600)
    s = await state(page); check('Esc leaves full screen', s.full === 'off' && s.windows === 1, JSON.stringify(s))
    await page.goBack(); await settle(page)
    s = await state(page); check('one Back after open/leave/open/Esc = desk home (no orphan entries)', s.path === '/admin' && s.windows === 0, JSON.stringify(s))
    await page.close(); await ctx.close()

    // 3. deep link
    ;({ ctx, page } = await newDesk({ width: 1440, height: 1000 }))
    await page.goto(`${base}/admin#monitor-full`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.monitor-page', { timeout: 20000 }); await settle(page, 1200)
    s = await state(page); check('deep link #monitor-full opens the Monitor in full screen', s.full === 'on', JSON.stringify(s))
    await page.goBack(); await settle(page)
    s = await state(page); check('Back from the deep link stays on /admin, full screen off', s.path === '/admin' && s.full !== 'on', JSON.stringify(s))
    await page.goBack(); await settle(page)
    s = await state(page); check('Back again: desk home, still /admin', s.path === '/admin' && s.windows === 0, JSON.stringify(s))
    await page.close(); await ctx.close()

    // 4. phone
    ;({ ctx, page } = await newDesk({ width: 390, height: 844 }))
    await openMonitor(page)
    await shot(page, '5-phone-monitor')
    await page.getByRole('button', { name: 'Back', exact: true }).click(); await settle(page)
    s = await state(page); check('phone: the bar Back button = desk home', s.path === '/admin' && s.windows === 0, JSON.stringify(s)); await shot(page, '6-phone-home')
    await openMonitor(page)
    await page.goBack(); await settle(page)
    s = await state(page); check('phone: browser Back from the Monitor = desk home', s.path === '/admin' && s.windows === 0, JSON.stringify(s))
    await page.close(); await ctx.close()
} catch (e) { check('script ran to the end', false, String(e.message).slice(0, 200)) }
await browser.close()
const failed = results.filter((r) => !r.ok).length
console.log(`${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
