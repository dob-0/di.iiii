#!/usr/bin/env node
// The site's front pages across the device matrix (docs/ai/audits/2026-10-21-site-wiki-admin.md):
// landing, wiki, the spaces list, sign-in, the closed door, device sign-in and /admin → Manage.
//   node scripts/audit/site-wiki-admin.cjs [base] [--token <admin API_TOKEN>] [--out <dir>]
//   default base http://localhost:5173 (a dev stack: `npm run dev`, or `di-dev up <tree>` on aylmo)
// Per page × matrix row it prints measured lines, never a verdict it did not take:
//   axe-core WCAG 2.2 AA violations (rule, impact, nodes) · horizontal overflow ·
//   targets under 24 px (44 px on touch rows) · keyboard: elements Tab reaches and how many
//   show no focus ring · touchpad: two-finger scroll (real wheel input, deltaX ≠ 0) — how far the
//   page moved — and pinch (wheel + ctrlKey) — whether a listener swallowed the browser's zoom.
// Exit 1 when any axe violation is found, so it can gate.
// Chromium: Playwright's own build, or CHROMIUM_PATH (the cloud image has /opt/pw-browsers/chromium).
const fs = require('node:fs')
const path = require('node:path')
const { chromium, devices } = require('playwright')
const { AxeBuilder } = require('@axe-core/playwright')

const args = process.argv.slice(2)
const flag = (name, fallback) => {
    const i = args.indexOf(name)
    return i >= 0 ? args[i + 1] : fallback
}
const BASE = (args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) || 'http://localhost:5173').replace(/\/$/, '')
const TOKEN = flag('--token', process.env.AUDIT_ADMIN_TOKEN || '')
const OUT = flag('--out', path.join(process.cwd(), '.verify-surfaces', 'site-wiki-admin'))

const PAGES = [
    { key: 'landing', path: '/' },
    { key: 'wiki', path: '/wiki' },
    { key: 'spaces', path: '/spaces' },
    { key: 'login', path: '/login' },
    { key: 'closed-door', path: '/no-such-space-here' },
    { key: 'device', path: '/device' },
    { key: 'admin', path: '/admin', admin: true }
]

const ROWS = [
    { key: 'desktop@1x', ctx: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, touch: false },
    { key: 'desktop@2x', ctx: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }, touch: false },
    { key: 'phone', ctx: { ...devices['iPhone 13'] }, touch: true },
    { key: 'tablet', ctx: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, touch: true }
]

const lines = []
let violationsTotal = 0
const say = (row, page, what, detail) => {
    const line = `[${row}] ${page} — ${what}: ${detail}`
    lines.push(line)
    console.log(line)
}

const signInAdmin = async (page) => {
    if (!TOKEN) return false
    const status = await page.evaluate(async (token) => {
        const res = await fetch('/serverXR/api/auth/session', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        })
        return res.status
    }, TOKEN)
    return status >= 200 && status < 300
}

const settle = async (page) => {
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2500)
}

const smallTargets = (page, min) => page.evaluate((min) => {
    const out = []
    for (const el of document.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])')) {
        const r = el.getBoundingClientRect()
        const st = getComputedStyle(el)
        if (!r.width || !r.height || st.visibility === 'hidden' || st.display === 'none') continue
        // WCAG 2.5.8's inline exception: a link inside a run of text.
        if (el.tagName === 'A' && st.display === 'inline' && el.parentElement && /P|LI|SPAN/.test(el.parentElement.tagName)) continue
        if (r.width < min || r.height < min) {
            const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().slice(0, 32)
            out.push(`${name} ${Math.round(r.width)}×${Math.round(r.height)}`)
        }
    }
    return out
}, min)

const overflow = (page) => page.evaluate(() => {
    const d = document.documentElement
    return d.scrollWidth - d.clientWidth
})

// Tab through the page; for every element reached, read what the browser paints for focus.
const keyboardWalk = async (page, max = 40) => {
    await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0) })
    const seen = []
    for (let i = 0; i < max; i++) {
        await page.keyboard.press('Tab')
        const info = await page.evaluate(() => {
            const el = document.activeElement
            if (!el || el === document.body) return null
            const st = getComputedStyle(el)
            // MUI buttons paint focus as a pulsing ripple (.Mui-focusVisible), not an outline:
            // counted apart, because it is faint and a reader should see the number.
            const ripple = el.classList.contains('Mui-focusVisible')
            const paints = (s) => (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== 'none')
            // A MUI field draws focus on its wrapper (.Mui-focused), not on the <input>.
            const wrapper = el.closest('.Mui-focused')
            const ring = paints(st) || Boolean(wrapper && paints(getComputedStyle(wrapper)))
            const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().slice(0, 28)
            if (!el.dataset.auditTab) el.dataset.auditTab = String(document.querySelectorAll('[data-audit-tab]').length + 1)
            return { name, ring, ripple, outline: `${st.outlineStyle} ${st.outlineWidth} ${st.outlineColor}`, id: el.dataset.auditTab }
        })
        if (!info) break
        if (seen.length && seen[0].id === info.id) break
        seen.push(info)
    }
    return seen
}

// Wheel-dead area, run in the page: the share of the screen (sampled every 40 px) where a
// wheel cannot reach the page's scroller. Walking up from the element under the pointer,
// a position:fixed ancestor met before the scroller cuts the scroll chain (it goes to the
// viewport), even when the DOM nests the element inside the scroller — the landing's
// background canvas was exactly that (L6). 0 when the page does not scroll at all.
// Fixed toolbars and chips count too, so a few per cent is normal.
function deadArea() {
    let scroller = document.scrollingElement.scrollHeight > innerHeight ? document.scrollingElement : null
    if (!scroller) {
        for (const el of document.querySelectorAll('*')) {
            const oy = getComputedStyle(el).overflowY
            if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight
                && (!scroller || el.clientHeight * el.clientWidth > scroller.clientHeight * scroller.clientWidth)) scroller = el
        }
    }
    if (!scroller) return 0
    const reaches = (start) => {
        for (let el = start; el; el = el.parentElement) {
            if (el === scroller || el === document.documentElement) return el === scroller || scroller === document.scrollingElement
            if (getComputedStyle(el).position === 'fixed') return false
        }
        return false
    }
    let hit = 0, n = 0
    for (let x = 10; x < innerWidth; x += 40) {
        for (let y = 10; y < innerHeight; y += 40) {
            n += 1
            const el = document.elementFromPoint(x, y)
            if (el && !reaches(el)) hit += 1
        }
    }
    return Math.round((100 * hit) / n)
}

// Touchpad: two-finger scroll and pinch are both wheel events in Chromium. The scroll is
// real input (page.mouse.wheel goes through the browser, so it scrolls natively, with
// deltaX ≠ 0); the pinch is a synthetic ctrlKey wheel, read only for whether a listener
// swallowed it (preventDefault there is what takes the browser's zoom away).
const touchpad = async (page, scroller) => {
    const probe = () => page.evaluate((scroller) => {
        const under = () => {
            for (let el = document.elementFromPoint(400, 400); el; el = el.parentElement) {
                const oy = getComputedStyle(el).overflowY
                if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return el
            }
            return document.scrollingElement
        }
        const target = (scroller && document.querySelector(scroller)) || under()
        return { top: target.scrollTop, scrollable: target.scrollHeight > target.clientHeight }
    }, scroller)
    // The Tab walk leaves the page scrolled wherever focus went; start from the top.
    await page.evaluate(() => {
        document.activeElement?.blur?.()
        // 'instant': these pages set scroll-behavior: smooth, and an animated reset is
        // still moving when the starting position is read.
        for (const el of document.querySelectorAll('*')) if (el.scrollTop) el.scrollTo({ top: 0, behavior: 'instant' })
        window.scrollTo({ top: 0, behavior: 'instant' })
    })
    const before = await probe()
    const swallowed = await page.evaluate(() => {
        let scrollPrevented = false
        const watch = (e) => { if (!e.ctrlKey) setTimeout(() => { scrollPrevented = scrollPrevented || e.defaultPrevented }) }
        window.addEventListener('wheel', watch, { capture: false, passive: true })
        window.__auditWheel = () => { window.removeEventListener('wheel', watch); return scrollPrevented }
        const pinch = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaMode: 0, deltaY: -8, ctrlKey: true, clientX: 400, clientY: 400 })
        ;(document.elementFromPoint(400, 400) || document.body).dispatchEvent(pinch)
        return pinch.defaultPrevented
    })
    await page.mouse.move(400, 400)
    for (let i = 0; i < 6; i++) await page.mouse.wheel(12, 60)
    await page.waitForTimeout(600)
    const after = await probe()
    const scrollPrevented = await page.evaluate(() => window.__auditWheel())
    const dead = await page.evaluate(deadArea)
    return { scrollPrevented, pinchPrevented: swallowed, moved: Math.round(after.top - before.top), scrollable: before.scrollable, dead }
}

module.exports = { deadArea }

if (require.main === module) (async () => {
    fs.mkdirSync(OUT, { recursive: true })
    const launch = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
    let browser
    try {
        browser = await chromium.launch(launch)
    } catch (error) {
        if (fs.existsSync('/opt/pw-browsers/chromium')) browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
        else throw error
    }
    for (const row of ROWS) {
        // One context per row: every fresh context is a new guest session, and serverXR
        // allows 60 new guest sessions per address per 10 minutes. A walk that burned one
        // per page measured the 429 screen ("We can't reach the server") instead of the
        // page. The admin page runs last, so its sign-in does not leak into the others.
        const ctx = await browser.newContext(row.ctx)
        let refused = 0
        ctx.on('response', (res) => { if (res.status() === 429) refused += 1 })
        for (const spec of PAGES) {
            const page = await ctx.newPage()
            const errors = []
            page.on('pageerror', (e) => errors.push(e.message))
            const refusedBefore = refused
            if (spec.admin) {
                await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
                const ok = await signInAdmin(page)
                if (!ok) {
                    say(row.key, spec.key, 'skipped', 'no admin token (--token) or sign-in refused')
                    await page.close()
                    continue
                }
            }
            await page.goto(`${BASE}${spec.path}`, { waitUntil: 'domcontentloaded' })
            await settle(page)
            if (spec.admin) {
                // Manage opens on the Spaces root; open the first space so its detail (rename, toggles) is in the page.
                const firstSpace = page.locator('.preferences-tree-row.is-child').first()
                if (await firstSpace.count()) { await firstSpace.click(); await page.waitForTimeout(800) }
                const rename = page.getByRole('button', { name: 'Rename' }).first()
                if (await rename.count()) { await rename.click(); await page.waitForTimeout(300) }
            }
            await page.screenshot({ path: path.join(OUT, `${spec.key}-${row.key}.png`), fullPage: false })

            const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
            violationsTotal += axe.violations.length
            say(row.key, spec.key, 'axe WCAG 2.2 AA', axe.violations.length
                ? axe.violations.map((v) => `${v.id}(${v.impact}) ×${v.nodes.length} [${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}]`).join('; ')
                : '0 violations')
            say(row.key, spec.key, 'horizontal overflow px', await overflow(page))
            const min = row.touch ? 44 : 24
            const small = await smallTargets(page, min)
            say(row.key, spec.key, `targets under ${min}px`, small.length ? `${small.length}: ${small.slice(0, 8).join(', ')}` : '0')
            if (!row.touch) {
                const walked = await keyboardWalk(page)
                const noRing = walked.filter((w) => !w.ring && !w.ripple)
                const rippleOnly = walked.filter((w) => !w.ring && w.ripple)
                say(row.key, spec.key, 'keyboard Tab reach / no visible ring / MUI ripple only', `${walked.length} / ${noRing.length} / ${rippleOnly.length}${noRing.length ? ` (${noRing.slice(0, 6).map((w) => `${w.name}: ${w.outline}`).join('; ')})` : ''}`)
                const pad = await touchpad(page, spec.scroller)
                say(row.key, spec.key, 'touchpad scroll / pinch', `scroll prevented=${pad.scrollPrevented} moved=${pad.moved}px scrollable=${pad.scrollable} wheel-dead area=${pad.dead}%; pinch prevented=${pad.pinchPrevented}`)
            }
            if (errors.length) say(row.key, spec.key, 'page errors', errors.slice(0, 3).join(' | '))
            if (refused > refusedBefore) say(row.key, spec.key, 'NOT MEASURED', `${refused - refusedBefore} request(s) answered 429; the numbers above may describe the error screen`)
            await page.close()
        }
        await ctx.close()
    }
    await browser.close()
    fs.writeFileSync(path.join(OUT, 'report.txt'), `${lines.join('\n')}\n`)
    console.log(`\n${violationsTotal} axe violation groups in all; screenshots and report.txt in ${OUT}`)
    process.exit(violationsTotal ? 1 : 0)
})().catch((error) => {
    console.error(error)
    process.exit(2)
})
