// Before/after for the brand-tokens addendum (native controls, color-scheme).
// Local stack, admin account `ann`, project `main/token-look`:
//   node docs/ai/handover/brand-tokens/shoot-addendum.mjs <before|after> docs/ai/handover/brand-tokens
// /light/api/clock is STUBBED to up:true in the browser so /perform draws its
// "Follow Light" checkbox; no light desk runs in this stack.
import fs from 'node:fs'
import { chromium } from 'playwright'
const BASE = 'http://localhost:5173'
const [, , stage, outDir] = process.argv
fs.mkdirSync(outDir, { recursive: true })
const DEVICES = {
  laptop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
}
const SURFACES = [
  ['perform', '/main/perform/token-look', null],
  ['studio-inspector', '/main/studio/projects/token-look', async (page, dev) => {
    if (dev === 'phone') { await page.getByText('Objects', { exact: true }).last().click().catch(() => {}); await page.waitForTimeout(1500) }
    await page.getByText('Box', { exact: true }).first().click(); await page.waitForTimeout(2500)
  }],
  ['equipment-order', '/main/equipment/token-look', async (page) => {
    await page.getByRole('button', { name: 'order', exact: true }).first().click().catch(() => {}); await page.waitForTimeout(2000)
  }],
]
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const login = await (await browser.newContext()).newPage()
await login.goto(`${BASE}/login`); await login.getByLabel('Email or username').waitFor({ timeout: 20000 })
await login.getByLabel('Email or username').fill('ann'); await login.getByLabel('Password', { exact: true }).fill('driver-passphrase-9x')
await login.locator('form').getByRole('button', { name: 'Sign in' }).click(); await login.waitForTimeout(3000)
const state = await login.context().storageState()
const measure = {}
const ONLY_EMBED = process.env.ONLY_EMBED === "1"
for (const [dev, opts] of Object.entries(ONLY_EMBED ? {} : DEVICES)) for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ ...opts, colorScheme: scheme, storageState: state, reducedMotion: 'reduce' })
  await ctx.route('**/light/api/clock*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ up: true, bpm: 120, epoch: Date.now(), now: Date.now() }) }))
  const page = await ctx.newPage()
  for (const [name, path, act] of SURFACES) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(6000)
    if (act) await act(page, dev)
    await page.screenshot({ path: `${outDir}/${name}-${dev}-${scheme}-${stage}.jpg`, type: 'jpeg', quality: 72 })
    measure[`${name}-${dev}-${scheme}`] = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement)
      const natives = [...document.querySelectorAll('input[type=checkbox], input[type=radio], input[type=range], input[type=date], input[type=color], select')].filter((e) => e.offsetParent)
      const per = natives.map((e) => { const s = getComputedStyle(e); return `${e.type || e.tagName}:${s.colorScheme}:${s.accentColor}` })
      const tally = {}; for (const k of per) tally[k] = (tally[k] || 0) + 1
      return { rootScheme: root.colorScheme, rootAccent: root.accentColor, natives: natives.length, tally,
        pill: root.getPropertyValue('--di-radius-pill').trim() }
    })
    console.log(stage, name, dev, scheme, JSON.stringify(measure[`${name}-${dev}-${scheme}`]))
  }
  await ctx.close()
}

// Embed backdrop: a magenta host page holding an iframe; count magenta pixels
// inside the frame. Transparent embed → magenta shows; opaque Canvas → it does not.
const host = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1, storageState: state })
const hp = await host.newPage()
const magentaShare = async () => {
  const file = `${outDir}/.probe.png`
  await hp.locator('iframe').screenshot({ path: file })
  const { execFileSync } = await import('node:child_process')
  const out = execFileSync('python3', ['-c', "import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert('RGB');px=list(im.getdata());print(round(100*sum(1 for r,g,b in px if r>200 and g<60 and b>200)/len(px),1))", file]).toString().trim()
  fs.unlinkSync(file)
  return Number(out)
}
const cases = {}
// a) our viewer embedded (?embed=1) in an ordinary (normal-scheme) host page
await hp.goto(`${BASE}/login`)
await hp.setContent(`<body style="margin:0;background:#f0f;"><iframe src="${BASE}/main/token-look?embed=1" style="border:0;width:800px;height:600px"></iframe></body>`)
await hp.waitForTimeout(9000)
// The scene's WebGL canvas paints opaque by itself; hide it so what is left is
// the embedded document's own backdrop (html/body/#root and the UA canvas).
const inner = hp.frames().find((f) => f.url().includes('embed=1'))
cases.embedClassSet = await inner.evaluate(() => {
  for (const c of document.querySelectorAll('canvas')) c.style.visibility = 'hidden'
  return document.documentElement.classList.contains('dii-embed')
})
cases.embeddedRootScheme = await inner.evaluate(() => getComputedStyle(document.documentElement).colorScheme)
await hp.waitForTimeout(800)
cases.viewerEmbedInNormalHost = await magentaShare()
// a) a code page (normal scheme, transparent) inside an iframe whose element
// sits in our dark-scheme document — the PublicProjectViewer code-view case.
const iframeScheme = await (async () => {
  await hp.goto(`${BASE}/main/token-look`, { waitUntil: 'domcontentloaded' }); await hp.waitForTimeout(4000)
  return hp.evaluate(() => getComputedStyle(document.documentElement).colorScheme)
})()
await hp.evaluate(() => {
  document.body.innerHTML = '<iframe class="probe-default" style="border:0;width:800px;height:600px;background:transparent"></iframe>'
  document.documentElement.style.background = '#f0f'; document.body.style.background = '#f0f'
  for (const id of ['root']) { const r = document.getElementById(id); if (r) r.remove() }
  const f = document.querySelector('iframe'); f.srcdoc = '<html><body style="margin:0;background:transparent"><p>code page</p></body></html>'
})
await hp.waitForTimeout(1500)
cases.codePageIframeDefault = await magentaShare()
await hp.evaluate(() => { document.querySelector('iframe').style.colorScheme = 'normal' })
await hp.waitForTimeout(800)
cases.codePageIframeSchemeNormal = await magentaShare()
cases.hostRootScheme = iframeScheme
console.log(stage, 'embed', JSON.stringify(cases))
if (!ONLY_EMBED) fs.writeFileSync(`${outDir}/addendum-${stage}.json`, JSON.stringify(measure, null, 2))
fs.writeFileSync(`${outDir}/embed-${stage}.json`, JSON.stringify(cases, null, 2))
await browser.close()
