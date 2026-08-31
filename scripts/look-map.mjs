#!/usr/bin/env node
// Look at the mapper. Shoots the desk and the output for one mapping project
// and reports what actually got drawn — surfaces, their transforms, how many
// page surfaces mounted, and any console error.
//
//   node scripts/look-map.mjs <out-dir> [base] [space] [project]
//
// Nothing here asserts. A mapping is a visual thing and the point of this
// script is to produce something to LOOK at; the numbers it prints are there
// so a black screenshot can be told apart from an empty mapping.
import { chromium } from 'playwright'

const [outDir, base = 'http://127.0.0.1:5173', space = 'mapdev', project = 'dilijan-wall'] = process.argv.slice(2)
if (!outDir) {
    console.error('usage: node scripts/look-map.mjs <out-dir> [base] [space] [project]')
    process.exit(1)
}

const views = [
    ['desk', `/${space}/map/${project}`, { width: 1600, height: 950 }],
    ['out', `/${space}/map/${project}/out`, { width: 1280, height: 720 }]
]

const browser = await chromium.launch()
for (const [name, path, viewport] of views) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2, ignoreHTTPSErrors: true })
    const page = await context.newPage()
    const errors = []
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))

    await page.goto(base + path, { waitUntil: 'domcontentloaded' })
    // Page surfaces boot through a queue and a scene needs a moment after
    // that, so a screenshot taken early is honestly black.
    await page.waitForTimeout(12000)
    await page.screenshot({ path: `${outDir}/map-${name}.png` })

    const drawn = await page.locator('.map-stage-surface').count()
    const mounted = await page.locator('.map-source-frame').count()
    const transforms = await page.locator('.map-stage-surface').evaluateAll(
        (nodes) => nodes.map((node) => getComputedStyle(node).transform.slice(0, 52))
    )
    console.log(`[${name}] ${path} -> ${drawn} surfaces, ${mounted} page sources`)
    transforms.forEach((transform, index) => console.log(`   ${index}  ${transform}`))
    if (errors.length) console.log(`   errors: ${errors.slice(0, 5).join(' | ')}`)
    await context.close()
}
await browser.close()
