import { chromium } from 'playwright'

const base = 'http://localhost:5173'
const launchArgs = ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
let browser
try {
    browser = await chromium.launch({ args: launchArgs })
} catch {
    browser = await chromium.launch({ channel: 'msedge', args: launchArgs })
}
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

// 1. Landing
await page.goto(base + '/wcc', { waitUntil: 'networkidle' }).catch((e) => errors.push('GOTO: ' + e.message))
await page.waitForTimeout(2500)
await page.screenshot({ path: 'wcc-1-landing.png' })

// 2. Click "Enter exhibition" -> dive transition into the Studio exhibition
const enter = page.locator('.wcc-enter-button').first()
if (await enter.count()) {
    await enter.click()
    await page.waitForTimeout(950) // mid-transition flash
    await page.screenshot({ path: 'wcc-2-transition.png' })
    await page.waitForTimeout(4500) // settle + let GLB models load
}
await page.screenshot({ path: 'wcc-3-scene.png' })

const state = await page.evaluate(() => ({
    path: window.location.pathname,
    hasSceneWrap: !!document.querySelector('.wcc-experience__scene'),
    hasCanvas: !!document.querySelector('.wcc-experience__scene canvas'),
    hasExit: !!document.querySelector('.wcc-experience__exit'),
    loadingText: document.body.innerText.includes('Loading live experience'),
    landingStillMounted: !!document.querySelector('.wcc-landing')
}))
console.log('AFTER_ENTER', JSON.stringify(state))

// 2b. Browser BACK should return to the 2D landing
await page.goBack().catch(() => {})
await page.waitForTimeout(1500)
const afterBack = await page.evaluate(() => ({
    path: window.location.pathname,
    landingMounted: !!document.querySelector('.wcc-landing'),
    sceneMounted: !!document.querySelector('.wcc-experience__scene')
}))
console.log('AFTER_BACK', JSON.stringify(afterBack))

// 2c. Re-enter a second time (re-entry must work)
const enter2 = page.locator('.wcc-enter-button').first()
if (await enter2.count()) {
    await enter2.click()
    await page.waitForTimeout(3500)
}
const reEnter = await page.evaluate(() => ({
    path: window.location.pathname,
    hasCanvas: !!document.querySelector('.wcc-experience__scene canvas')
}))
console.log('RE_ENTER', JSON.stringify(reEnter))

// 3. Direct deep-link load of /wcc/scene (the viewer holds an SSE stream, so
// 'networkidle' never settles — wait for DOM instead).
await page.goto(base + '/wcc/scene', { waitUntil: 'domcontentloaded' }).catch((e) => errors.push('GOTO2: ' + e.message))
await page.waitForTimeout(5000)
await page.screenshot({ path: 'wcc-4-direct-scene.png' })
const direct = await page.evaluate(() => ({
    path: window.location.pathname,
    hasCanvas: !!document.querySelector('.wcc-experience__scene canvas'),
    landingMounted: !!document.querySelector('.wcc-landing')
}))
console.log('DIRECT', JSON.stringify(direct))

console.log('ERRORS', JSON.stringify(errors.slice(0, 25)))
await browser.close()
