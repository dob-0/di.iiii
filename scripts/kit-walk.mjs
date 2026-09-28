#!/usr/bin/env node
/**
 * kit-walk.mjs — walk the Kit at /tools the way a person does, in Firefox.
 *
 * Two sizes: a desk at 1440×900 DPR 1 and a phone at 390×844 DPR 3. Opens
 * /tools, makes one card live (hover on the desk, the live button on the
 * phone), waits for its frame to paint, presses Try on four tools and checks
 * each opens a usable surface, follows a Made-with link and a source link,
 * reaches the page with the keyboard, measures every tap target under a finger
 * and the page's horizontal overflow. Writes a screenshot per step.
 *
 *   node scripts/kit-walk.mjs --base http://localhost:5382 --out /tmp/kit-walk
 */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const arg = (name, fallback = null) => {
    const index = process.argv.indexOf(`--${name}`)
    if (index === -1) return fallback
    const value = process.argv[index + 1]
    return value && !value.startsWith('--') ? value : true
}
const base = String(arg('base', 'http://localhost:5382')).replace(/\/$/, '')
const out = String(arg('out', '/tmp/kit-walk'))
mkdirSync(out, { recursive: true })

const { firefox } = await import('playwright')
const browser = await firefox.launch()
const findings = []
const note = (line) => { findings.push(line); console.log(line) }

const shot = async (page, name) => {
    const file = path.join(out, `${name}.png`)
    await page.screenshot({ path: file, fullPage: false })
    console.log(`  shot ${file}`)
    return file
}

const errorsOf = (page) => {
    const errors = []
    page.on('pageerror', (error) => errors.push(`pageerror: ${error?.message || error}`))
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
    return errors
}

const overflow = (page) => page.evaluate(() => {
    const doc = document.documentElement
    const kit = document.querySelector('.kit')
    return { docScroll: doc.scrollWidth, docClient: doc.clientWidth, kitScroll: kit?.scrollWidth, kitClient: kit?.clientWidth }
})

// Every control a finger could land on, with its box.
const smallTargets = (page, floor) => page.evaluate((min) => {
    const nodes = [...document.querySelectorAll('.kit a, .kit button')]
    return nodes
        .map((node) => {
            const rect = node.getBoundingClientRect()
            return { text: (node.getAttribute('aria-label') || node.textContent || '').trim().slice(0, 40), w: Math.round(rect.width), h: Math.round(rect.height), visible: rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== 'hidden' }
        })
        .filter((t) => t.visible && (t.h < min || t.w < min))
}, floor)

const walk = async ({ name, viewport, deviceScaleFactor, hasTouch }) => {
    const context = await browser.newContext({ viewport, deviceScaleFactor, hasTouch })
    const page = await context.newPage()
    const errors = errorsOf(page)
    console.log(`\n== ${name} ${viewport.width}×${viewport.height} @${deviceScaleFactor}x`)

    await page.goto(`${base}/tools`, { waitUntil: 'networkidle' })
    await page.waitForSelector('.kit-card')
    const cards = await page.locator('.kit-card').count()
    const frames = await page.locator('iframe').count()
    note(`${name}: ${cards} cards on /tools, ${frames} live frames on arrival (must be 0)`)
    await shot(page, `${name}-01-tools-top`)
    const ov = await overflow(page)
    note(`${name}: overflow doc ${ov.docScroll}/${ov.docClient}, kit ${ov.kitScroll}/${ov.kitClient}`)

    // Make a card live.
    const walkCard = page.locator('#kit-walk')
    await walkCard.scrollIntoViewIfNeeded()
    if (hasTouch) {
        await walkCard.locator('.kit-live-button').tap()
    } else {
        await walkCard.hover()
    }
    await page.waitForSelector('#kit-walk iframe', { timeout: 10000 })
    const src = await page.locator('#kit-walk iframe').getAttribute('src')
    note(`${name}: walk card live at ${src}`)
    // Wait for the frame to paint (poster fades) or the backstop.
    await page.waitForSelector('#kit-walk .kit-poster.is-behind', { timeout: 20000 }).catch(() => note(`${name}: walk frame did not report painted in 20s`))
    await page.waitForTimeout(1500)
    await shot(page, `${name}-02-walk-live`)
    const live = await page.locator('iframe').count()
    note(`${name}: ${live} live frame(s) after making one live (must be 1)`)

    // A second card: only one frame stays.
    const nodesCard = page.locator('#kit-nodes')
    await nodesCard.scrollIntoViewIfNeeded()
    if (hasTouch) await nodesCard.locator('.kit-live-button').tap()
    else await nodesCard.hover()
    await page.waitForSelector('#kit-nodes iframe', { timeout: 10000 })
    await page.waitForSelector('#kit-nodes .kit-poster.is-behind', { timeout: 20000 }).catch(() => note(`${name}: nodes frame did not report painted in 20s`))
    await page.waitForTimeout(1000)
    note(`${name}: ${await page.locator('iframe').count()} live frame(s) after a second card (must be 1)`)
    await shot(page, `${name}-03-nodes-live`)

    // Tap targets under a finger.
    if (hasTouch) {
        const small = await smallTargets(page, 44)
        note(`${name}: ${small.length} controls under 44px${small.length ? ': ' + small.map((t) => `${t.text || '?'} ${t.w}×${t.h}`).join(' · ') : ''}`)
    }

    // The stack section.
    await page.locator('#kit-stack').scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    await shot(page, `${name}-04-what-we-use`)

    // Keyboard: Tab from the top reaches the first Try.
    await page.goto(`${base}/tools`, { waitUntil: 'networkidle' })
    await page.waitForSelector('.kit-card')
    let reached = null
    for (let i = 0; i < 40 && !reached; i += 1) {
        await page.keyboard.press('Tab')
        reached = await page.evaluate(() => {
            const el = document.activeElement
            return el && el.classList.contains('kit-try') ? el.textContent.trim() : null
        })
    }
    note(`${name}: keyboard reached a Try button: ${reached || 'NO'}`)
    const focusRing = await page.evaluate(() => {
        const el = document.activeElement
        const style = getComputedStyle(el)
        return `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`
    })
    note(`${name}: focus outline on it: ${focusRing}`)
    await shot(page, `${name}-05-keyboard-focus`)

    // Try on four tools.
    const tries = ['nodes', 'projection', 'perform', 'studio']
    for (const id of tries) {
        await page.goto(`${base}/tools`, { waitUntil: 'networkidle' })
        const href = await page.locator(`#kit-${id} .kit-try`).getAttribute('href')
        await page.locator(`#kit-${id} .kit-try`).click()
        await page.waitForLoadState('networkidle').catch(() => {})
        await page.waitForTimeout(3500)
        const url = page.url()
        const text = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160)
        const restricted = /Access restricted|sign in to/i.test(text)
        note(`${name}: Try ${id} → ${href} landed ${url.replace(base, '')} ${restricted ? 'RESTRICTED' : 'ok'} · "${text.slice(0, 90)}"`)
        await shot(page, `${name}-06-try-${id}`)
    }

    // Made-with and source links.
    await page.goto(`${base}/tools`, { waitUntil: 'networkidle' })
    const made = await page.locator('#kit-walk .kit-fact dd a').first().getAttribute('href')
    const source = await page.locator('#kit-walk .kit-sources a').first().getAttribute('href')
    const check = async (url) => {
        const response = await context.request.get(url, { maxRedirects: 3 }).catch((error) => ({ status: () => `ERR ${error.message}` }))
        return response.status()
    }
    note(`${name}: made-with link ${made} → HTTP ${await check(made)}`)
    note(`${name}: source link ${source} → HTTP ${await check(source)}`)

    // Sandbox door: did the session give one?
    await page.waitForTimeout(1500)
    const sandboxTry = await page.locator('#kit-sandbox .kit-try').getAttribute('href').catch(() => null)
    note(`${name}: sandbox Try → ${sandboxTry || 'none (no session)'}`)
    if (sandboxTry) {
        await page.locator('#kit-sandbox .kit-try').click()
        await page.waitForLoadState('networkidle').catch(() => {})
        await page.waitForTimeout(3000)
        const text = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 120)
        note(`${name}: sandbox opened ${page.url().replace(base, '')} · "${text}"`)
        await shot(page, `${name}-07-sandbox`)
    }

    note(`${name}: ${errors.length} console/page errors${errors.length ? ': ' + [...new Set(errors)].slice(0, 6).join(' | ') : ''}`)
    await context.close()
}

await walk({ name: 'desk', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, hasTouch: false })
await walk({ name: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true })
await browser.close()
console.log('\n== findings\n' + findings.join('\n'))
