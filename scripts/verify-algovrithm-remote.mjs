// The front door on a deployed host, checked the way a visitor meets it.
//
// Deliberately separate from verify-algovrithm.mjs, which drives a dev server
// on :5174 and asserts interaction. This one asks the smaller question that
// only a deploy can answer: is the page actually there, does it carry the
// artist's words, did the reel atlas and the typeface ship, and does the piece
// route load.
//
// Run: node scripts/verify-algovrithm-remote.mjs https://staging.di-studio.xyz
import { chromium } from 'playwright'

const base = process.argv[2] || 'https://staging.di-studio.xyz'
const out = []
const ok = (n, p, d = '') => { out.push([n, p, d]); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`) }

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 })
const page = await ctx.newPage()
const failures = []
page.on('response', (r) => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url().replace(base, '')}`) })

await page.goto(`${base}/algovrithm`, { waitUntil: 'load' })
await page.waitForTimeout(6000)

ok('the front door is served', (await page.locator('.avl-title').count()) === 1)
ok('it is the work\'s name', (await page.locator('.avl-title').textContent()) === 'algovrithm')

const words = await page.locator('.avl-statement').innerText()
ok('the statement is the artist\'s, verbatim', words.includes('I belong to a generation that never had to cross the boundary'))
ok('the six gestures are there', ['I scroll.', 'I swipe.', 'I refresh.', 'I wait.', 'I record.', 'I repeat.'].every((g) => words.includes(g)))

ok('Space Mono shipped', await page.evaluate(() => document.fonts.check('700 96px "Space Mono"')))
ok('the reel atlas shipped', await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('reelAtlas'))
    if (!url) return false
    const r = await fetch(url, { method: 'HEAD' })
    return r.ok
}))
ok('the hero is drawing at the viewport size', await page.evaluate(() => {
    const c = document.querySelector('.avl-canvas')
    return Boolean(c && c.width >= c.clientWidth)
}))
ok('nothing 4xx/5xx on the way in', failures.length === 0, failures.slice(0, 3).join(' | '))

const before = await page.evaluate(() => document.querySelector('.avl-root').scrollTop)
await page.mouse.move(700, 500)
await page.mouse.wheel(0, 700)
await page.waitForTimeout(700)
ok('it scrolls', (await page.evaluate(() => document.querySelector('.avl-root').scrollTop)) > before)

// The space row, which is what makes it appear in Studio and public listings.
const spaces = await page.evaluate(async (host) => {
    const r = await fetch(`${host}/serverXR/api/spaces`)
    if (!r.ok) return null
    return (await r.json()).spaces.map((s) => ({ id: s.id, isPublic: s.isPublic }))
}, base)
const row = spaces?.find((s) => s.id === 'algovrithm')
ok('the space exists on this host', Boolean(row), row ? '' : `saw: ${spaces?.map((s) => s.id).join(', ')}`)
ok('and is public', row?.isPublic === true)

await page.goto(`${base}/algovrithm/scene`, { waitUntil: 'load' })
await page.waitForTimeout(12000)
ok('the piece itself loads', (await page.evaluate(() => document.querySelectorAll('canvas').length)) > 0)

await browser.close()
const bad = out.filter((r) => !r[1])
console.log(`\n${base}: ${out.length - bad.length}/${out.length} passed`)
if (bad.length) {
    console.log('FAILED:\n' + bad.map((f) => `  - ${f[0]}${f[2] ? `: ${f[2]}` : ''}`).join('\n'))
    process.exitCode = 1
}
