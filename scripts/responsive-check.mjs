#!/usr/bin/env node
// Responsive behavior check: load a URL across a standard window/device matrix,
// drive human-like interaction (scroll), capture screenshots + console errors,
// and report per-viewport. Use for EVERY user-facing UI change before "done".
//
// Usage:
//   node scripts/responsive-check.mjs <url> [--scroll] [--out <dir>]
//   node scripts/responsive-check.mjs https://staging.di-studio.xyz/wcc/ --scroll
//
// Exit code is non-zero if any viewport logged a console/page error.
import { chromium, devices } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const url = process.argv[2]
if (!url) { console.error('usage: responsive-check.mjs <url> [--scroll] [--out <dir>]'); process.exit(2) }
const doScroll = process.argv.includes('--scroll')
const outIdx = process.argv.indexOf('--out')
const outDir = outIdx > -1 ? process.argv[outIdx + 1] : '/tmp/responsive-check'
fs.mkdirSync(outDir, { recursive: true })

// Standard matrix: desktop aspect ratios + real mobile/tablet device descriptors.
const VIEWPORTS = [
    { name: 'desktop-16x9', width: 1920, height: 1080 },
    { name: 'desktop-16x10', width: 1280, height: 800 },
    { name: 'desktop-4x3', width: 1200, height: 900 },
    { name: 'desktop-1x1', width: 1000, height: 1000 },
    { name: 'desktop-ultrawide', width: 2560, height: 1080 },
    { name: 'laptop-small', width: 1024, height: 640 },
]
const DEVICES = ['iPhone 13', 'iPhone SE', 'Pixel 5', 'iPad (gen 7)', 'iPad Mini landscape', 'Galaxy Tab S4']

const humanScroll = async (page, w, h) => {
    for (let i = 0; i < 12; i++) {
        await page.mouse.move(w / 2, h / 2)
        await page.mouse.wheel(0, 380)
        await page.waitForTimeout(280)
    }
}

const run = async () => {
    const browser = await chromium.launch()
    let anyError = false
    const rows = []
    const contexts = [
        ...VIEWPORTS.map((v) => ({ label: v.name, dims: `${v.width}x${v.height}`, opts: { viewport: { width: v.width, height: v.height } }, w: v.width, h: v.height })),
        ...DEVICES.filter((d) => devices[d]).map((d) => {
            const dev = devices[d]
            return { label: d.replace(/[^a-z0-9]+/gi, '-'), dims: `${dev.viewport.width}x${dev.viewport.height}${dev.isMobile ? ' touch' : ''}`, opts: { ...dev }, w: dev.viewport.width, h: dev.viewport.height }
        }),
    ]

    for (const ctx of contexts) {
        const context = await browser.newContext(ctx.opts)
        const page = await context.newPage()
        const errors = []
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)) })
        page.on('pageerror', (e) => errors.push('PAGEERR ' + e.message.slice(0, 120)))
        try {
            await page.goto(url, { waitUntil: 'load', timeout: 40000 })
            await page.waitForTimeout(3000)
            if (doScroll) await humanScroll(page, ctx.w, ctx.h)
            await page.screenshot({ path: path.join(outDir, `${ctx.label}.png`) })
        } catch (e) { errors.push('NAV ' + e.message.slice(0, 120)) }
        if (errors.length) anyError = true
        rows.push({ label: ctx.label, dims: ctx.dims, errors })
        await context.close()
    }
    await browser.close()

    console.log(`\nResponsive check — ${url}`)
    for (const r of rows) {
        console.log(`  ${r.errors.length ? '✗' : '✓'} ${r.label.padEnd(22)} ${r.dims.padEnd(16)} ${r.errors.length ? r.errors[0] : ''}`)
    }
    console.log(`\nScreenshots: ${outDir}`)
    if (anyError) { console.error('\nFAIL: console/page errors in one or more viewports.'); process.exit(1) }
    console.log('OK: no console/page errors across the matrix.')
}

run().catch((e) => { console.error(e); process.exit(1) })
