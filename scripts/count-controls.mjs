/**
 * count-controls.mjs — how many things a person can press on one screen.
 *
 * The layers decision (di-atlas/decisions/2026-09-23-layers-what-inside-what.md)
 * measures "everything at once" as a number: the controls on the first screen of
 * a new project. 62 in Studio at 1440×900 on 2026-09-23, before one thing was
 * placed. The method is progressive disclosure (Nielsen, "Progressive
 * Disclosure", NN/g 2006): show the few things first, the rest when earned — and
 * the count is how we know which screen is which.
 *
 * WHAT COUNTS AS A CONTROL
 *   Every element a person can operate: button, a[href], input (not hidden),
 *   select, textarea, summary, and the ARIA roles button, tab, link, checkbox,
 *   switch, menuitem. A <label> that wraps a hidden file input ("Import files")
 *   counts once, as the label. One control is one element, however it is drawn.
 *
 *   It is counted when it is on screen: a box of at least 2×2 CSS px, inside the
 *   viewport, and neither it nor any ancestor has display:none, visibility:hidden
 *   or opacity 0. "topmost" also says whether the element is the one hit at its
 *   own centre — a control buried under a window still counts in the total (the
 *   sketch's rule), and the topmost figure says how many can be reached.
 *
 * USAGE
 *   node scripts/count-controls.mjs --url http://localhost:5173/lab/studio/projects/p1
 *   node scripts/count-controls.mjs --url <url> --phone --shot .verify/phone.png
 *   node scripts/count-controls.mjs --url <url> --wait 8000 --json
 *
 *   --phone   390×844 at DPR 3, touch, mobile (the S24 this is opened on)
 *             default: 1440×900 at DPR 1.5 (his laptop at 150%)
 *   --wait    ms to let the editor load before counting (default 7000)
 *   --shot    write a screenshot of what was counted
 *   --json    print the rows as JSON instead of a table
 *   --ignore-https-errors   for local.thedi.studio's certificate
 *
 * Exit code 0 when it counted; 1 when the page could not be opened.
 */
import { chromium } from 'playwright'

const arg = (name, fallback = null) => {
    const i = process.argv.indexOf(`--${name}`)
    if (i === -1) return fallback
    const next = process.argv[i + 1]
    return next && !next.startsWith('--') ? next : true
}

const URL_ARG = arg('url')
const PHONE = Boolean(arg('phone', false))
const WAIT = Number(arg('wait', 7000)) || 7000
const SHOT = arg('shot')
const AS_JSON = Boolean(arg('json', false))
const IGNORE_HTTPS = Boolean(arg('ignore-https-errors', false))

const DEVICES = {
    phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 }
}

// Runs in the page. Kept a plain function so it can be read in one place and
// handed to page.evaluate as-is.
export function collectControls() {
    const selector = 'button, a[href], input:not([type=hidden]), select, textarea, summary, label:has(> input[type=file]), [role=button], [role=tab], [role=link], [role=checkbox], [role=switch], [role=menuitem]'
    const seen = new Set()
    const rows = []
    const hiddenByAncestor = (el) => {
        for (let a = el; a; a = a.parentElement) {
            const c = getComputedStyle(a)
            if (c.display === 'none' || c.visibility === 'hidden' || Number(c.opacity) === 0) return true
        }
        return false
    }
    for (const el of document.querySelectorAll(selector)) {
        if (seen.has(el)) continue
        seen.add(el)
        // A file input inside a counted label is the label's own mechanism.
        if (el.matches('input[type=file]') && el.closest('label')) continue
        const r = el.getBoundingClientRect()
        if (r.width < 2 || r.height < 2) continue
        if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue
        if (hiddenByAncestor(el)) continue
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        const topmost = Boolean(hit && (hit === el || el.contains(hit) || hit.contains(el)))
        rows.push({
            tag: el.tagName.toLowerCase(),
            text: (el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || el.title || '')
                .replace(/\s+/g, ' ').trim().slice(0, 40),
            x: Math.round(r.left),
            y: Math.round(r.top),
            topmost
        })
    }
    return rows
}

async function main() {
    if (!URL_ARG || URL_ARG === true) {
        console.error('usage: node scripts/count-controls.mjs --url <url> [--phone] [--wait ms] [--shot file.png] [--json]')
        process.exit(1)
    }
    const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] })
    try {
        const context = await browser.newContext({ ...(PHONE ? DEVICES.phone : DEVICES.desktop), ignoreHTTPSErrors: IGNORE_HTTPS })
        const page = await context.newPage()
        // domcontentloaded, never networkidle: an editor holds a socket open.
        const response = await page.goto(URL_ARG, { waitUntil: 'domcontentloaded' }).catch((error) => ({ error }))
        if (response?.error) {
            console.error(`could not open ${URL_ARG}: ${response.error.message}`)
            process.exitCode = 1
            return
        }
        await page.waitForTimeout(WAIT)
        if (SHOT && SHOT !== true) await page.screenshot({ path: SHOT })
        const rows = await page.evaluate(collectControls)
        const topmost = rows.filter((row) => row.topmost).length
        if (AS_JSON) {
            console.log(JSON.stringify({ url: URL_ARG, device: PHONE ? 'phone' : 'desktop', total: rows.length, topmost, rows }, null, 2))
            return
        }
        for (const row of rows) {
            console.log(`${row.topmost ? ' ' : '~'} ${row.tag.padEnd(8)} ${String(row.x).padStart(5)},${String(row.y).padStart(4)}  ${row.text}`)
        }
        console.log(`total ${rows.length} · topmost ${topmost} · ${PHONE ? '390×844 phone' : '1440×900'} · ${URL_ARG}`)
    } finally {
        await browser.close()
    }
}

// Imported for collectControls alone (a walk script can reuse it) — only a
// direct run counts a page.
if (import.meta.url === `file://${process.argv[1]}`) {
    await main()
}
