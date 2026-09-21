// Shoots the harness room headless, on SwiftShader — plain `chromium.launch()`,
// never the GPU (a headless Chrome that gets the NVIDIA card locks this machine).
//
//   npx vite scripts/lights-harness --port 5218 --strictPort   # any free port >= 5200
//   node scripts/lights-harness/shoot.mjs                             # writes ~/Downloads/lights-on-a-place
//
// BASE / OUT / SHOTS come from the environment; SHOTS is [[name, query], ...].
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const OUT = process.env.OUT || '/home/dob/Downloads/lights-on-a-place'
mkdirSync(OUT, { recursive: true })
const base = process.env.BASE || 'http://localhost:5217'
const shots = JSON.parse(process.env.SHOTS)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE ERROR:', m.text()) })
page.on('pageerror', (e) => console.log('PAGE THREW:', e.message))
for (const [name, query] of shots) {
    await page.goto(`${base}/index.html${query}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(3500)
    await page.screenshot({ path: `${OUT}/${name}.png` })
    console.log('shot', name)
}
await browser.close()
