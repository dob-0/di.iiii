const { chromium } = require('playwright')
;(async () => {
  const b = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
  const ctx = b.contexts()[0]; const p = await ctx.newPage()
  try {
    await p.setViewportSize({ width: 1100, height: 760 })
    await p.goto('http://quality-words.diiii.localhost/moxir/moxir-v2-1', { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(9000)
    const chip = p.getByRole('button', { name: /display/i }).first()
    if (await chip.count()) await chip.click().catch(() => {})
    await p.waitForTimeout(1500)
    const btns = await p.$$eval('button', bs => bs.map(x => (x.textContent || '').trim()).filter(t => /^(Low|High|Lite|Full)$/.test(t)))
    console.log('quality buttons:', JSON.stringify(btns))
    await p.screenshot({ path: process.env.QW_OUT })
  } finally { await p.goto('about:blank').catch(() => {}); await p.close().catch(() => {}) }
  await b.close().catch(() => {})
})()
