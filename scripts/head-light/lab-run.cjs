// Runs scripts/head-light/lab.html in the agent browser (real GPU) and prints its measurements.
//
//   HEAD_LIGHT_ORIGIN=<origin of a dev stack> HEAD_LIGHT_OUT=<result.json> di-test-browser run scripts/head-light/lab-run.cjs
//
// The page is not part of the app: this script hands it to the browser under the stack's origin (so /components/headLight.js
// is the stack's own module) with the importmap filled in. The page it opens is closed and left on about:blank.
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

const ORIGIN = (process.env.HEAD_LIGHT_ORIGIN || '').replace(/\/$/, '')
if (!ORIGIN) { console.error('HEAD_LIGHT_ORIGIN is required'); process.exit(2) }
const three = path.join(path.dirname(require.resolve('three', { paths: [__dirname] })), 'three.module.js')
const html = fs.readFileSync(path.join(__dirname, 'lab.html'), 'utf8').replace('__THREE_URL__', `/@fs${three}`)

;(async () => {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    const context = browser.contexts()[0] || await browser.newContext()
    const page = await context.newPage()
    try {
        const url = `${ORIGIN}/head-light-lab.html`
        await page.route(url, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: html }))
        page.on('pageerror', (e) => console.error('pageerror:', String(e).slice(0, 300)))
        await page.goto(url, { waitUntil: 'load' })
        await page.waitForFunction(() => window.__labResult || window.__labError, null, { timeout: 90000 })
        const result = await page.evaluate(() => window.__labResult || { error: window.__labError })
        console.log(JSON.stringify(result, null, 1))
        if (process.env.HEAD_LIGHT_OUT) fs.writeFileSync(process.env.HEAD_LIGHT_OUT, JSON.stringify(result, null, 2))
    } finally {
        await page.goto('about:blank').catch(() => {})
        await page.close().catch(() => {})
    }
    await browser.close().catch(() => {})
})().catch((e) => { console.error(e); process.exit(1) })
