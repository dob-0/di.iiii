const { chromium } = require("playwright")
const [base, tag, out] = process.argv.slice(2)
;(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] })
  for (const [name, path] of [['landing','/'],['wiki','/wiki']]) {
    for (const [dev, ctx] of [['desktop',{viewport:{width:1440,height:900}}]]) {
      const p = await (await b.newContext(ctx)).newPage()
      await p.goto(base+path, { waitUntil: 'load' }); await p.waitForTimeout(6000)
      const target = await p.evaluate(()=>{const e=document.elementFromPoint(40,450);const c=document.querySelector('canvas');return {el:e&&e.tagName+'.'+e.className, canvas:!!c, canvasPE:c&&getComputedStyle(c).pointerEvents, wrapPE:c&&getComputedStyle(c.parentElement.parentElement).pointerEvents}})
      const scroller = await p.evaluate(()=>{const r=document.querySelector('.wiki-root,.lp-root');return r?r.className:null})
      await p.mouse.move(40,450); await p.mouse.wheel(0,400); await p.waitForTimeout(1200)
      const moved = await p.evaluate(()=>{const r=document.querySelector('.wiki-root,.lp-root');return Math.max(r?r.scrollTop:0, window.scrollY)})
      await p.screenshot({ path: `${out}/${tag}-${name}-${dev}.png` })
      console.log(tag, name, dev, JSON.stringify({target, scroller, scrolledPx: moved}))
    }
  }
  await b.close()
})()
