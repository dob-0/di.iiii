// Before/after pictures for brand spec v2 (M17/M13/M37/M23). Run against a local
// stack with an admin account `ann` and a project `main/token-look`:
//   node docs/ai/handover/brand-tokens/shoot.mjs <before|after> docs/ai/handover/brand-tokens
import fs from 'node:fs'
import { chromium } from 'playwright'
const BASE = 'http://localhost:5173'
const [, , stage, outDir] = process.argv
fs.mkdirSync(outDir, { recursive: true })
const SURFACES = [
  ['studio', '/main/studio/projects/token-look'],
  ['preferences', '/main/preferences'],
  ['viewer', '/main/token-look'],
  ['rig-plot', '/main/plot/token-look'],
  ['light-desk', '/light'],
]
const DEVICES = {
  laptop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
}
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
// sign in once, reuse the cookie
const login = await (await browser.newContext()).newPage()
await login.goto(`${BASE}/login`); await login.getByLabel('Email or username').waitFor({ timeout: 20000 })
await login.getByLabel('Email or username').fill('ann'); await login.getByLabel('Password', { exact: true }).fill('driver-passphrase-9x')
await login.locator('form').getByRole('button', { name: 'Sign in' }).click(); await login.waitForTimeout(3000)
const state = await login.context().storageState()
const radii = {}
for (const [dev, opts] of Object.entries(DEVICES)) for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ ...opts, colorScheme: scheme, storageState: state, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  for (const [name, path] of SURFACES) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(7000)
    const file = `${outDir}/${name}-${dev}-${scheme}-${stage}.jpg`
    await page.screenshot({ path: file, type: 'jpeg', quality: 72 })
    radii[`${name}-${dev}-${scheme}`] = await page.evaluate(() => {
      const els = [...document.querySelectorAll('button, [role="button"], input, select, a')].filter(e => e.offsetParent)
      const r = els.map(e => getComputedStyle(e).borderTopLeftRadius)
      return { controls: els.length, at2px: r.filter(x => x === '2px').length, at0: r.filter(x => x === '0px').length,
        token: getComputedStyle(document.documentElement).getPropertyValue('--di-radius').trim() }
    })
    console.log(stage, name, dev, scheme, JSON.stringify(radii[`${name}-${dev}-${scheme}`]))
  }
  await ctx.close()
}
fs.writeFileSync(`${outDir}/radii-${stage}.json`, JSON.stringify(radii, null, 2))
await browser.close()
