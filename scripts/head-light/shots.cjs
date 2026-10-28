// Pictures of the head light on the real surface: the walk mode of a seeded project (scripts/head-light/seed.mjs),
// High and Low quality, light off and on, at a wall, on a phone, and with a light colour scheme.
//
//   HEAD_LIGHT_URL=<project url> HEAD_LIGHT_WALL_URL=<project url spawned at a wall> HEAD_LIGHT_OUT_DIR=<dir> \
//     di-test-browser run scripts/head-light/shots.cjs
//
// It drives the page like a visitor: arrives walking, presses F (desktop) or taps the Light button (phone), and says
// what aria-pressed read after each toggle. Every context it opens is closed and its page left on about:blank.
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

const URL_MAIN = process.env.HEAD_LIGHT_URL
const URL_WALL = process.env.HEAD_LIGHT_WALL_URL || URL_MAIN
const OUT = process.env.HEAD_LIGHT_OUT_DIR
if (!URL_MAIN || !OUT) { console.error('HEAD_LIGHT_URL and HEAD_LIGHT_OUT_DIR are required'); process.exit(2) }
fs.mkdirSync(OUT, { recursive: true })

const pressed = (page) => page.getAttribute('.live-scene-light-btn', 'aria-pressed').catch(() => 'no button')

const visit = async (browser, { url, quality, scheme = 'dark', phone = false }) => {
    const context = await browser.newContext(phone
        ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme }
        : { viewport: { width: 1280, height: 720 }, colorScheme: scheme })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(`pageerror ${String(e).slice(0, 200)}`))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console ${m.text().slice(0, 200)}`) })
    await page.addInitScript(() => {
        try { window.sessionStorage.setItem('dii:arrive-walking', '1') } catch { /* blocked */ }
        // three tells __THREE_DEVTOOLS__ about every scene and renderer it makes: the probe below reads them.
        window.__hl = { scenes: [], renderers: [] }
        window.__THREE_DEVTOOLS__ = new EventTarget()
        window.__THREE_DEVTOOLS__.addEventListener('observe', (e) => {
            const o = e.detail
            if (o && o.isScene) window.__hl.scenes.push(o)
            else if (o && o.isWebGLRenderer) window.__hl.renderers.push(o)
        })
    })
    await page.goto(`${url}?quality=${quality}`, { waitUntil: 'load' })
    try {
        await page.waitForSelector('.live-scene-light-btn', { timeout: 40000 })
    } catch {
        // Not walking yet: do what a visitor does and press Walk.
        const walk = page.getByRole('button', { name: /^walk$/i }).first()
        if (await walk.count()) await walk.click()
        await page.waitForSelector('.live-scene-light-btn', { timeout: 40000 })
    }
    await page.waitForTimeout(4500)
    return { context, page, errors }
}

// What the page really holds: renderer shadow switch, the head light's state and pose, and where the meshes are.
const probe = (page, withMeshes = false) => page.evaluate((listMeshes) => {
    const { scenes, renderers } = window.__hl
    const scene = scenes.find((sc) => sc.getObjectByName('head-light'))
    const r = (n) => Math.round(n * 100) / 100
    const out = { scenes: scenes.length, shadowMap: renderers.map((x) => x.shadowMap.enabled) }
    const light = scene && scene.getObjectByName('head-light')
    if (light) {
        light.updateWorldMatrix(true, false)
        out.headLight = { visible: light.visible, castShadow: light.castShadow, intensity: light.intensity, distance: light.distance, y: r(light.position.y), x: r(light.position.x), z: r(light.position.z), lightsInScene: 0 }
        scene.traverse((o) => { if (o.isLight && o.visible) out.headLight.lightsInScene += 1 })
    }
    if (scene && listMeshes) {
        out.meshes = []
        scene.updateMatrixWorld(true)
        scene.traverse((o) => {
            if (!o.isMesh || !o.geometry || out.meshes.length >= 22) return
            if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
            const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)
            out.meshes.push(`${o.name || o.parent?.name || o.geometry.type} x${r(b.min.x)}..${r(b.max.x)} y${r(b.min.y)}..${r(b.max.y)} z${r(b.min.z)}..${r(b.max.z)} cast=${o.castShadow} recv=${o.receiveShadow}`)
        })
    }
    return out
}, withMeshes)

const toggle = async (page, phone) => {
    if (phone) await page.tap('.live-scene-light-btn')
    else { await page.bringToFront(); await page.keyboard.press('f') }
    await page.waitForTimeout(3000)
    return pressed(page)
}

const shot = async (page, name) => {
    const file = path.join(OUT, name)
    await page.screenshot({ path: file })
    console.log('picture', file)
}

const lighter = async (browser, spec, steps) => {
    const { context, page, errors } = await visit(browser, spec)
    try {
        await steps(page)
        if (errors.length) console.log('errors', JSON.stringify(errors.slice(0, 5)))
    } finally {
        await page.goto('about:blank').catch(() => {})
        await context.close().catch(() => {})
    }
}

;(async () => {
    const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
    try {
        await lighter(browser, { url: URL_MAIN, quality: 'high' }, async (page) => {
            console.log('high: before F, aria-pressed =', await pressed(page))
            await shot(page, '01-high-off.png')
            console.log('high: after F, aria-pressed =', await toggle(page, false))
            console.log('probe high', JSON.stringify(await probe(page, true), null, 1))
            await shot(page, '02-high-on.png')
        })
        await lighter(browser, { url: URL_MAIN, quality: 'low' }, async (page) => {
            console.log('low: after F, aria-pressed =', await toggle(page, false))
            console.log('probe low', JSON.stringify(await probe(page)))
            await shot(page, '03-low-on.png')
        })
        await lighter(browser, { url: URL_WALL, quality: 'high' }, async (page) => {
            console.log('wall: after F, aria-pressed =', await toggle(page, false))
            await shot(page, '04-wall-high-on.png')
        })
        await lighter(browser, { url: URL_MAIN, quality: 'low', phone: true }, async (page) => {
            console.log('phone: before tap, aria-pressed =', await pressed(page))
            console.log('phone: after tap, aria-pressed =', await toggle(page, true))
            await shot(page, '05-phone-low-on.png')
        })
        await lighter(browser, { url: URL_MAIN, quality: 'high', scheme: 'light' }, async (page) => {
            console.log('light scheme: after F, aria-pressed =', await toggle(page, false))
            await shot(page, '06-high-on-light-scheme.png')
        })
    } finally {
        await browser.close().catch(() => {})
    }
})().catch((e) => { console.error(e); process.exit(1) })
