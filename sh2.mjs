import { chromium } from 'playwright'
const OUT='/tmp/claude-1000/-home-dob/440e2406-c8e4-453a-bbf7-d78223acffa3/scratchpad/shots'
const shoot = async (name) => {
  const b = await chromium.launch({ args:['--ignore-certificate-errors','--use-gl=angle'] })
  const ctx = await b.newContext({ ignoreHTTPSErrors:true, viewport:{width:1440,height:900}, deviceScaleFactor:2 })
  const p = await ctx.newPage()
  await p.goto('https://local.thedi.studio/test/p/one-lamp', { waitUntil:'domcontentloaded' })
  await p.waitForTimeout(16000)
  await p.screenshot({ path: `${OUT}/${name}.png` })
  await b.close()
}
await shoot(process.argv[2] || 'lamp-shot')
console.log('shot', process.argv[2])
