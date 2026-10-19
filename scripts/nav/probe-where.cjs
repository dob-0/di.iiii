// Where does the Studio URL land? Prints the final URL, title and body text head after 8 s. NAV_URL=<studio url>
const { chromium } = require('playwright')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    const page = await browser.contexts()[0].newPage()
    const errors = []; page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text().slice(0, 160)) })
    page.on('response', (r) => { if (r.status() >= 300 && r.status() !== 304) errors.push(`${r.status()} ${r.url().slice(0, 120)}`) })
    try {
        await page.goto(process.env.NAV_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
        await sleep(8000)
        console.log('URL', page.url()); console.log('TITLE', await page.title())
        console.log('CANVAS', await page.locator('canvas').count())
        console.log('TEXT', (await page.evaluate(() => document.body.innerText)).slice(0, 300).replace(/\n+/g, ' | '))
        console.log('LOG', JSON.stringify(errors.slice(0, 12)))
    } finally { await page.goto('about:blank').catch(() => {}); await page.close().catch(() => {}); process.exit(0) }
})()
