// The keys on the real surface: in a project with a head light and in the same room without one.
// Fly is F in both; L switches the light where the project turns it on and does nothing elsewhere; G does nothing.
//
//   HEAD_LIGHT_URL=<project with the head light> HEAD_LIGHT_NONE_URL=<the same room without it> \
//     di-test-browser run scripts/head-light/keys.cjs      (the second room: scripts/head-light/seed.mjs ... --no-head-light)
//
// It drives the page like a visitor (a real key press over CDP) and prints each check with PASS or FAIL; exit code 1 on any FAIL.
// Every context it opens is closed and its page left on about:blank.
const { chromium } = require('playwright')

const WITH = process.env.HEAD_LIGHT_URL
const NONE = process.env.HEAD_LIGHT_NONE_URL
if (!WITH || !NONE) { console.error('HEAD_LIGHT_URL and HEAD_LIGHT_NONE_URL are required'); process.exit(2) }

const flyWord = async (page) => (await page.textContent('.live-scene-fly-btn')).trim()
const lightState = async (page) => {
    if (!(await page.locator('.live-scene-light-btn').count())) return 'no button'
    return page.getAttribute('.live-scene-light-btn', 'aria-pressed')
}
const hintText = async (page) => ((await page.locator('.live-scene-hint').first().textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim()
const press = async (page, key) => { await page.keyboard.press(key); await page.waitForTimeout(700) }

let failures = 0
const check = (label, actual, expected) => {
    const ok = actual === expected
    if (!ok) failures += 1
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: ${actual}${ok ? '' : `  (expected ${expected})`}`)
}

const visit = async (browser, name, url, steps) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, colorScheme: 'dark' })
    const page = await context.newPage()
    try {
        await page.addInitScript(() => { try { window.sessionStorage.setItem('dii:arrive-walking', '1') } catch { /* blocked */ } })
        await page.goto(`${url}?quality=low`, { waitUntil: 'load' })
        await page.waitForSelector('.live-scene-fly-btn', { timeout: 40000 })
        await page.waitForTimeout(3000)
        await page.bringToFront()
        console.log(name)
        await steps(page)
    } finally {
        await page.goto('about:blank').catch(() => {})
        await context.close().catch(() => {})
    }
}

;(async () => {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    try {
        await visit(browser, 'project WITH a head light', WITH, async (page) => {
            console.log(`  hint: ${await hintText(page)}`)
            check('Fly button before', await flyWord(page), 'Fly')
            check('light before', await lightState(page), 'false')
            await press(page, 'f'); check('after F: Fly button', await flyWord(page), 'Walk'); check('after F: light', await lightState(page), 'false')
            await press(page, 'f'); check('after F again: Fly button', await flyWord(page), 'Fly')
            await press(page, 'l'); check('after L: light', await lightState(page), 'true'); check('after L: Fly button', await flyWord(page), 'Fly')
            await press(page, 'l'); check('after L again: light', await lightState(page), 'false')
            await press(page, 'g'); check('after G: Fly button', await flyWord(page), 'Fly'); check('after G: light', await lightState(page), 'false')
        })
        await visit(browser, 'project WITHOUT a head light', NONE, async (page) => {
            console.log(`  hint: ${await hintText(page)}`)
            check('light button', await lightState(page), 'no button')
            await press(page, 'l'); check('after L: Fly button', await flyWord(page), 'Fly'); check('after L: light button', await lightState(page), 'no button')
            await press(page, 'f'); check('after F: Fly button', await flyWord(page), 'Walk')
            await press(page, 'l'); check('after F then L: Fly button', await flyWord(page), 'Walk')
            await press(page, 'f'); check('after F again: Fly button', await flyWord(page), 'Fly')
        })
        console.log(failures ? `RESULT: ${failures} FAIL` : 'RESULT: every check PASS')
    } finally {
        await browser.close().catch(() => {})
    }
    if (failures) process.exitCode = 1
})().catch((e) => { console.error(e); process.exit(1) })
