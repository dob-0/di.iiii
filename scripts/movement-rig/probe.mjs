/**
 * probe.mjs — the page-side half of the movement rig, injected with
 * Playwright's addInitScript BEFORE the app's own code runs.
 *
 * It needs no hook in the app. three.js announces every WebGLRenderer it
 * builds to `window.__THREE_DEVTOOLS__` (an EventTarget the three.js devtools
 * extension normally provides — three/src/renderers/WebGLRenderer.js). We
 * provide it, wrap that renderer's `render()`, and log the camera of every
 * frame that reaches the SCREEN (render target null, perspective camera):
 * that is the camera the visitor actually saw, after any smoothing, bob or
 * clamping a branch adds, whatever it calls its own state.
 *
 * The walker's own pose (`window.__diiWalkerRef`, DEV builds only, guarded by
 * `npm run check:input`) is read alongside when it exists, and is the only way
 * the rig RESETS a pose between trials. Nothing else in the app is touched.
 *
 * Everything lands in `window.__rig`:
 *   frames  [{ t, frame, px, py, pz, fx, fy, fz, w: {x,z,yaw,pitch,altY}|null }]
 *   events  [{ kind, t, ...detail }]  input events as the page saw them (timeStamp)
 */
export const PROBE_SOURCE = String.raw`
(() => {
    if (window.__rig) return
    const rig = window.__rig = {
        frames: [], events: [], recording: false, renderers: 0,
        spinMs: 0, frameNo: 0, lastScreenCanvas: null
    }
    // A frame counter the renderer wrap can stamp: many render() calls can
    // happen in one frame (render targets, post-processing, portals).
    const tick = () => {
        rig.frameNo++
        if (rig.spinMs > 0) {
            // Deterministic frame-rate throttle: burn this many ms of main
            // thread inside every frame, which is what a slow device does.
            const until = performance.now() + rig.spinMs
            while (performance.now() < until) { /* spin */ }
        }
        requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)

    const readWalker = () => {
        const p = window.__diiWalkerRef && window.__diiWalkerRef.current
        if (!p) return null
        return { x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch, altY: p.altY }
    }
    rig.readWalker = readWalker

    const wrap = (renderer) => {
        if (!renderer || typeof renderer.render !== 'function' || renderer.__rigWrapped) return
        renderer.__rigWrapped = true
        rig.renderers++
        const original = renderer.render.bind(renderer)
        renderer.render = function (scene, camera) {
            const out = original(scene, camera)
            try {
                if (!rig.recording) return out
                if (!camera || !camera.isPerspectiveCamera) return out
                if (renderer.getRenderTarget && renderer.getRenderTarget() !== null) return out
                if (renderer.xr && renderer.xr.isPresenting) return out
                const canvas = renderer.domElement
                if (!canvas || !canvas.isConnected || canvas.clientWidth < 200) return out
                rig.lastScreenCanvas = canvas
                const m = camera.matrixWorld.elements
                const entry = {
                    t: performance.now(), frame: rig.frameNo,
                    px: m[12], py: m[13], pz: m[14],
                    // camera looks down its local -Z
                    fx: -m[8], fy: -m[9], fz: -m[10],
                    w: readWalker()
                }
                const last = rig.frames[rig.frames.length - 1]
                // Keep the LAST screen render of each frame.
                if (last && last.frame === entry.frame) rig.frames[rig.frames.length - 1] = entry
                else rig.frames.push(entry)
            } catch { /* never break the app's frame */ }
            return out
        }
    }
    const devtools = new EventTarget()
    devtools.addEventListener('observe', (e) => {
        const d = e.detail
        if (d && d.isWebGLRenderer) wrap(d)
        else if (d && typeof d.render === 'function' && d.domElement) wrap(d)
    })
    // three.js checks typeof __THREE_DEVTOOLS__ at construction time.
    Object.defineProperty(window, '__THREE_DEVTOOLS__', { value: devtools, configurable: true })

    const log = (kind) => (e) => {
        if (!rig.recording) return
        const row = { kind, t: e.timeStamp }
        if (kind === 'key') { row.type = e.type; row.key = e.key }
        else if (kind === 'mouse') { row.mx = e.movementX; row.my = e.movementY; row.trusted = e.isTrusted; row.locked = !!document.pointerLockElement }
        else if (kind === 'wheel') { row.dx = e.deltaX; row.dy = e.deltaY; row.mode = e.deltaMode }
        else if (kind === 'touch') { row.type = e.type; row.n = e.touches.length }
        rig.events.push(row)
    }
    window.addEventListener('keydown', log('key'), true)
    window.addEventListener('keyup', log('key'), true)
    document.addEventListener('mousemove', log('mouse'), true)
    window.addEventListener('wheel', log('wheel'), { capture: true, passive: true })
    window.addEventListener('touchstart', log('touch'), { capture: true, passive: true })
    window.addEventListener('touchend', log('touch'), { capture: true, passive: true })

    rig.start = () => { rig.frames = []; rig.events = []; rig.recording = true }
    rig.stop = () => { rig.recording = false; return { frames: rig.frames, events: rig.events } }
    rig.setPose = (pose) => {
        const p = window.__diiWalkerRef && window.__diiWalkerRef.current
        if (!p) return false
        Object.assign(p, pose)
        return true
    }
    // Synthetic look input at the DOM level: the walker's handler reads
    // movementX/Y off any mousemove on document while the lock is held. Exact
    // integer counts, no OS or compositor in the way — the app's transfer
    // function and nothing else.
    rig.look = (dx, dy = 0) => {
        document.dispatchEvent(new MouseEvent('mousemove', { movementX: dx, movementY: dy, bubbles: true }))
    }
    // Paced synthetic look: 'counts' spread over 'events' events, one per
    // animation frame (like a real mouse polled faster than the display, but
    // coalesced by the browser to one per frame). Resolves when done.
    rig.lookPaced = (totalX, totalY, events) => new Promise((resolve) => {
        let sent = 0, sx = 0, sy = 0
        const step = () => {
            if (sent >= events) return resolve({ sx, sy })
            sent++
            const tx = Math.round(totalX * sent / events), ty = Math.round(totalY * sent / events)
            const dx = tx - sx, dy = ty - sy
            sx = tx; sy = ty
            // A real mouse sends nothing when it has not moved.
            if (dx || dy) rig.look(dx, dy)
            requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
    })
})()
`
