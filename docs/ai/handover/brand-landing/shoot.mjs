// Pictures for the brand-landing change: the landing's top, a labelled section
// and the footer, on a laptop (1440×900, DPR 2) and a phone (390×844, DPR 3),
// in a light and a dark colour scheme, plus the name in the nav on hover.
// Also the standing copy of the landing (spaces/main/pages/landing) at the top.
//
//   node docs/ai/handover/brand-landing/shoot.mjs <before|after> [base]
//
// base defaults to http://localhost:5173 (a client from `npm run dev:client`).
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../../..')
const phase = process.argv[2] || 'after'
const base = process.argv[3] || 'http://localhost:5173'
const out = resolve(HERE, phase)
mkdirSync(out, { recursive: true })

const DEVICES = {
    laptop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
    phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
}
const SCHEMES = ['light', 'dark']

const measure = (page) => page.evaluate(() => {
    const pick = (sel) => {
        const el = document.querySelector(sel)
        if (!el) return null
        const cs = getComputedStyle(el)
        return {
            letterSpacing: cs.letterSpacing,
            textTransform: cs.textTransform,
            color: cs.color,
            transition: `${cs.transitionProperty} ${cs.transitionDuration}`,
            border: cs.borderTopWidth,
            radius: cs.borderTopLeftRadius,
        }
    }
    return {
        eyebrow: pick('.lp-eyebrow'),
        sectionEyebrow: pick('.lp-section-eyebrow'),
        exampleCap: pick('.lp-example-cap'),
        aiBlockTitle: pick('.lp-ai-block-title'),
        featuredLabel: pick('.lp-hero-featured-label'),
        enterNote: pick('.lp-enter-note'),
        enterNoteLink: pick('.lp-enter-note a'),
        footerNote: pick('.lp-footer-note'),
        footerNoteLink: pick('.lp-footer-note a'),
        spacesCta: pick('.landing-cta-spaces'),
        heroInner: pick('.lp-hero-inner'),
        navLogo: pick('.lp-nav-logo'),
    }
})

// PW_CHROMIUM: a Chromium already on the machine, when it is not the build
// this Playwright pins (the cloud box ships /opt/pw-browsers/chromium).
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
const numbers = {}
for (const [device, opts] of Object.entries(DEVICES)) {
    for (const scheme of SCHEMES) {
        const ctx = await browser.newContext({ ...opts, colorScheme: scheme })
        const page = await ctx.newPage()
        await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
        await page.waitForSelector('.lp-wordmark', { timeout: 30000 })
        await page.waitForTimeout(2500)
        const tag = `${device}-${scheme}`
        await page.screenshot({ path: `${out}/${tag}-top.png` })
        await page.locator('.lp-section-eyebrow', { hasText: 'Getting started' }).evaluate((el) => {
            el.closest('section, .lp-section')?.scrollIntoView({ block: 'start', behavior: 'instant' })
        })
        await page.waitForTimeout(600)
        await page.screenshot({ path: `${out}/${tag}-section.png` })
        await page.locator('.lp-root').evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }))
        await page.waitForTimeout(600)
        await page.screenshot({ path: `${out}/${tag}-footer.png` })
        numbers[tag] = await measure(page)
        if (device === 'laptop') {
            await page.locator('.lp-root').evaluate((el) => el.scrollTo({ top: 0, behavior: 'instant' }))
            await page.waitForTimeout(400)
            await page.hover('.lp-nav-logo')
            await page.waitForTimeout(500)
            numbers[tag].navLogoHover = await page.locator('.lp-nav-logo').evaluate((el) => getComputedStyle(el).color)
            await page.screenshot({ path: `${out}/${tag}-name-hover.png`, clip: { x: 0, y: 0, width: 360, height: 56 } })
        }
        // The standing copy of the landing, a self-contained page.
        await page.goto(pathToFileURL(resolve(ROOT, 'spaces/main/pages/landing/index.html')).href)
        await page.waitForTimeout(300)
        await page.screenshot({ path: `${out}/${tag}-space-page-top.png` })
        await page.locator('.step').first().evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
        await page.waitForTimeout(200)
        await page.screenshot({ path: `${out}/${tag}-space-page-steps.png` })
        await ctx.close()
    }
}
await browser.close()
writeFileSync(`${out}/numbers.json`, `${JSON.stringify(numbers, null, 2)}\n`)
console.log(`wrote ${out}`)
