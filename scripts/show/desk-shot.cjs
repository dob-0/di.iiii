// Usage: node scripts/show/desk-shot.cjs <tree> <out.png> [w h density]  (needs playwright-core + /usr/bin/chromium; read-only: files from <tree>, GETs from the live desk on :4000, every other method blocked)
// Read-only render of the Show desk from a worktree: files from disk, GETs proxied from the live desk, every non-GET blocked.
const { chromium } = require('playwright-core')
const fs = require('fs'), path = require('path')
const TREE = process.argv[2], OUT = process.argv[3], W = +process.argv[4] || 1278, H = +process.argv[5] || 766
const LIVE = 'http://127.0.0.1:4000'
const MAP = [['/serverXR/show/', `${TREE}/serverXR/src/showDesk/ui/`], ['/serverXR/laser/', `${TREE}/serverXR/src/laser/ui/`], ['/serverXR/light/', `${TREE}/serverXR/src/lighting/ui/`]]
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' }
;(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] })
  const p = await b.newPage({ viewport: { width: W, height: H } }); if (process.argv[6]) await p.addInitScript((d) => localStorage.setItem('diShowDesk.density.v1', d), process.argv[6])
  const blocked = []
  await p.route('http://desk.test/**', async (route) => {
    const req = route.request(), u = new URL(req.url())
    if (req.method() !== 'GET') { blocked.push(req.method() + ' ' + u.pathname); return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }) }
    if (u.pathname.includes('/api/')) {
      try { const r = await fetch(LIVE + u.pathname.replace('/serverXR', '/') .replace('//', '/') + u.search); return route.fulfill({ status: r.status, contentType: 'application/json', body: await r.text() }) } catch (e) { return route.fulfill({ status: 502, body: '{}' }) }
    }
    for (const [pre, dir] of MAP) if (u.pathname.startsWith(pre)) {
      let f = path.join(dir, u.pathname.slice(pre.length) || 'index.html'); if (f.endsWith('/')) f += 'index.html'
      if (fs.existsSync(f)) return route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'text/plain', body: fs.readFileSync(f) })
    }
    return route.fulfill({ status: 404, body: 'nf' })
  })
  await p.goto('http://desk.test/serverXR/show/', { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2500)
  const m = await p.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: innerHeight, rows: [...document.body.children].map((e) => e.className.toString().slice(0, 20) + ':' + Math.round(e.getBoundingClientRect().bottom)), scenes: document.querySelectorAll('.scenebtn').length }))
  await p.screenshot({ path: OUT, fullPage: true })
  console.log(JSON.stringify({ m, blocked }))
  await b.close()
})()
