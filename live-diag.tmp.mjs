import { firefox } from 'playwright'
import fs from 'fs'
const OUT = process.env.DIAG_OUT
const browser = await firefox.launch({
    headless: false,
    env: { ...process.env, MOZ_ENABLE_WAYLAND: '1' },
})
const page = await browser.newPage({ viewport: null })
await page.goto('https://staging.di-studio.xyz/wcc/scene?inputdebug=1', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('canvas', { timeout: 30000 })
await page.evaluate(() => {
    window.__evlog = []
    const push = (s) => { window.__evlog.push(`${Date.now() % 100000} ${s}`); if (window.__evlog.length > 120) window.__evlog.shift() }
    for (const t of ['pointerdown', 'pointerup', 'pointercancel']) {
        document.addEventListener(t, (e) => push(`${t} btn=${e.button} buttons=${e.buttons} client=${e.clientX},${e.clientY} target=${e.target.tagName}`), true)
    }
    document.addEventListener('pointerlockchange', () => push(`lockchange -> ${document.pointerLockElement ? document.pointerLockElement.tagName : 'null'}`), true)
    let n = 0
    document.addEventListener('mousemove', (e) => {
        n++
        if (n % 10 === 0 || e.buttons !== 0) push(`mousemove#${n} mv=${e.movementX},${e.movementY} client=${e.clientX},${e.clientY} buttons=${e.buttons} locked=${!!document.pointerLockElement}`)
    }, true)
})
setInterval(async () => {
    try {
        const snap = await page.evaluate(() => ({
            hud: [...document.querySelectorAll('div')].find((d) => d.textContent.startsWith('lock:') || d.textContent.startsWith('inputdebug'))?.textContent || '(no hud)',
            lock: document.pointerLockElement?.tagName || null,
            log: window.__evlog.slice(-40),
        }))
        fs.writeFileSync(OUT, JSON.stringify(snap, null, 1))
    } catch { /* page navigating */ }
}, 2000)
