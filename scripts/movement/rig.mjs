/**
 * rig.mjs — the shared harness of the movement measurements (docs/architecture/MOVEMENT.md).
 *
 * Opens a published room the way a visitor does, on the NVIDIA card (headed Chromium, PRIME
 * render offload, ANGLE on Vulkan — the combination that reaches the RTX 3080 on aylmo; a
 * software renderer stops the run: SwiftShader overheated this machine, 2026-09-27) and reads
 * the camera back without the app's help: three.js announces every Scene to
 * `__THREE_DEVTOOLS__` (its documented devtools hook), and every object react-three-fiber
 * makes carries `__r3f.root`, the store — so `probe()` returns the live camera and
 * camera-controls whether the page is a dev build or a release.
 *
 * Always run inside the cross-session lock (one browser machine-wide):
 *   flock <scratchpad>/locks/browser.lock node scripts/movement/<script>.mjs ...
 */
import { execSync } from 'node:child_process'

const PRIME_ENV = {
    __NV_PRIME_RENDER_OFFLOAD: '1',
    __GLX_VENDOR_LIBRARY_NAME: 'nvidia',
    __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json',
    __VK_LAYER_NV_optimus: 'NVIDIA_only'
}
export const GPU_ARGS = ['--use-gl=angle', '--use-angle=vulkan', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan',
    '--ignore-gpu-blocklist', '--ignore-certificate-errors', '--window-position=40,40']

export const cpuC = () => {
    try {
        const m = /Package id 0:\s+\+([\d.]+)/.exec(execSync('sensors', { encoding: 'utf8' }))
        return m ? Number(m[1]) : null
    } catch { return null }
}
export const waitForCool = async (max = 84, log = console.log) => {
    for (let i = 0; i < 80; i += 1) {
        const c = cpuC()
        if (c === null || c <= max) return c
        log(`  CPU package ${c} C > ${max} C, waiting`)
        await new Promise((r) => setTimeout(r, 15_000))
    }
    throw new Error(`CPU did not cool below ${max} C in 20 minutes`)
}

const hook = () => {
    window.__movementScenes = []
    window.__THREE_DEVTOOLS__ = new EventTarget()
    window.__THREE_DEVTOOLS__.addEventListener('observe', (e) => {
        if (e.detail && e.detail.isScene) window.__movementScenes.push(e.detail)
    })
}

/** Runs in the page: the live camera, its controls, the scene, the size. */
const readState = () => {
    for (const scene of (window.__movementScenes || []).slice().reverse()) {
        const stack = [...scene.children]
        while (stack.length) {
            const o = stack.pop()
            const store = o.__r3f?.root
            if (store?.getState) {
                const s = store.getState()
                if (s.camera && s.scene === scene) {
                    const cc = s.controls
                    const t = cc?.getTarget ? cc.getTarget({ x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; return this } }) : null
                    return {
                        pos: s.camera.position.toArray(),
                        target: t ? [t.x, t.y, t.z] : null,
                        fov: s.camera.fov,
                        distance: cc?.distance ?? null,
                        polar: cc?.polarAngle ?? null,
                        azimuth: cc?.azimuthAngle ?? null,
                        hasControls: Boolean(cc),
                        maxDistance: cc?.maxDistance ?? null,
                        maxPolarAngle: cc?.maxPolarAngle ?? null,
                        w: s.size.width, h: s.size.height,
                        fog: s.scene.fog ? [s.scene.fog.near, s.scene.fog.far] : null
                    }
                }
            }
            for (const c of o.children || []) stack.push(c)
        }
    }
    return null
}

export const launch = async (chromium) => chromium.launch({ headless: false, env: { ...process.env, ...PRIME_ENV }, args: GPU_ARGS })

export const rendererOf = (page) => page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    const ctx = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'))
    const info = ctx && ctx.getExtension('WEBGL_debug_renderer_info')
    return info ? ctx.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown'
})

/**
 * @param {object} o
 * @param {string} o.base   http://localhost:5361
 * @param {string} [o.path] /moxir
 * @param {boolean} [o.phone] 390×844 at DPR 3, touch
 * @param {number} [o.settle] seconds after the canvas exists
 */
export const openRoom = async ({ base, path = '/moxir', phone = false, settle = 12, size = [1440, 900], dpr = 2 }) => {
    const { chromium } = await import('playwright')
    await waitForCool()
    const browser = await launch(chromium)
    const context = await browser.newContext(phone
        ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true }
        : { viewport: { width: size[0], height: size[1] }, deviceScaleFactor: dpr, ignoreHTTPSErrors: true })
    await context.addInitScript(hook)
    const page = await context.newPage()
    const errors = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 240)) })
    page.on('pageerror', (e) => errors.push(`THREW ${e.message.slice(0, 240)}`))
    await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded', timeout: 180_000 })
    await page.waitForFunction(() => Boolean(document.querySelector('canvas')), null, { timeout: 120_000 })
    await page.waitForTimeout(settle * 1000)
    const renderer = await rendererOf(page)
    if (/swiftshader|llvmpipe|software/i.test(renderer)) { await browser.close(); throw new Error(`software renderer (${renderer}), stopping`) }
    const probe = () => page.evaluate(readState)
    return { browser, context, page, probe, renderer, errors }
}

/** Set the camera with no glide: position, target, fov. */
export const teleport = (page, pos, target) => page.evaluate(([p, t]) => {
    for (const scene of (window.__movementScenes || []).slice().reverse()) {
        const stack = [...scene.children]
        while (stack.length) {
            const o = stack.pop()
            const store = o.__r3f?.root
            const cc = store?.getState?.().controls
            if (cc?.setLookAt) { cc.setLookAt(p[0], p[1], p[2], t[0], t[1], t[2], false); cc.update?.(1 / 60); return true }
            for (const c of o.children || []) stack.push(c)
        }
    }
    return false
}, [pos, target])

export const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
export const settled = async (probe, { every = 100, quiet = 300, max = 8000 } = {}) => {
    const t0 = Date.now()
    let last = await probe()
    let still = 0
    while (Date.now() - t0 < max) {
        await new Promise((r) => setTimeout(r, every))
        const now = await probe()
        still = dist3(now.pos, last.pos) < 0.005 && dist3(now.target || [0, 0, 0], last.target || [0, 0, 0]) < 0.005 ? still + every : 0
        last = now
        if (still >= quiet) return { state: now, ms: Date.now() - t0 - quiet }
    }
    return { state: last, ms: max, timedOut: true }
}

/** Where a world point falls on the screen (CSS px), or null when it is behind the camera. */
export const screenOf = (page, point) => page.evaluate((pt) => {
    for (const scene of (window.__movementScenes || []).slice().reverse()) {
        const stack = [...scene.children]
        while (stack.length) {
            const o = stack.pop()
            const st = o.__r3f?.root?.getState?.()
            if (st?.camera && st.scene === scene) {
                const cam = st.camera
                cam.updateMatrixWorld()
                const v = cam.matrixWorldInverse.elements
                const x = v[0] * pt[0] + v[4] * pt[1] + v[8] * pt[2] + v[12]
                const y = v[1] * pt[0] + v[5] * pt[1] + v[9] * pt[2] + v[13]
                const z = v[2] * pt[0] + v[6] * pt[1] + v[10] * pt[2] + v[14]
                if (z >= 0) return null
                const t = Math.tan((cam.fov * Math.PI) / 360)
                return [st.size.width / 2 + (x / (-z * t * (st.size.width / st.size.height))) * (st.size.width / 2), st.size.height / 2 - (y / (-z * t)) * (st.size.height / 2)]
            }
            for (const c of o.children || []) stack.push(c)
        }
    }
    return null
}, point)
