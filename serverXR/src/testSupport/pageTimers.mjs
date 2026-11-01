// Stop a jsdom page's timers when the test file that booted it ends.
//
// The laser desk page (laser/ui/desk.js) never stops: it polls in `setTimeout(run, ms)` loops and `pollView`, and in calm
// motion it ticks setTimeout -> requestAnimationFrame -> setTimeout. The Show desk page (showDesk/ui/show.js) re-arms its
// poll and preview timers the same way. A test boots a page with `new Function(pageJs)()` and the loops outlive the file.
// When vitest then takes `document` and `requestAnimationFrame` out of the global scope, the next tick throws ReferenceError
// ("document is not defined", "requestAnimationFrame is not defined") while no test is running; vitest counts that as an
// unhandled error and exits 1 although every test passed (stage CI run 41305326654, 2026-11-01: 8 to 13 per job, in a
// different file each time). Which file is hit depends on timing, so every test file that boots one of these pages uses
// this; pageTimers.test.js fails a laser desk or Show desk page test that boots the page without it.
//
//     const pageTimers = capturePageTimers()        // at module level, so it runs before any hook boots the page
//     afterAll(async () => { await pageTimers.stop() })
//
// Method: wrap setTimeout, setInterval and requestAnimationFrame, remember every handle they hand out, cancel them all at
// stop(). Handles made before capturing (the runner's own) are never touched.
import { setImmediate as nextTurn } from 'node:timers/promises'

export function capturePageTimers() {
    const real = {
        setTimeout: globalThis.setTimeout,
        clearTimeout: globalThis.clearTimeout,
        setInterval: globalThis.setInterval,
        clearInterval: globalThis.clearInterval,
        requestAnimationFrame: globalThis.requestAnimationFrame,
        cancelAnimationFrame: globalThis.cancelAnimationFrame
    }
    const timers = new Set()
    const frames = new Set()
    globalThis.setTimeout = (fn, ms, ...args) => { const id = real.setTimeout(fn, ms, ...args); timers.add(id); return id }
    globalThis.setInterval = (fn, ms, ...args) => { const id = real.setInterval(fn, ms, ...args); timers.add(id); return id }
    if (real.requestAnimationFrame) {
        globalThis.requestAnimationFrame = (fn) => { const id = real.requestAnimationFrame(fn); frames.add(id); return id }
    }

    const cancelAll = () => {
        for (const id of timers) { real.clearTimeout(id); real.clearInterval(id) }
        for (const id of frames) real.cancelAnimationFrame(id)
        timers.clear()
        frames.clear()
    }

    let stopped = false
    return {
        async stop() {
            if (stopped) return
            stopped = true
            cancelAll()
            // A poll that is awaiting its (fake) fetch re-arms itself the moment it resumes. One turn of the event loop lets
            // every such continuation run, still through the wrappers, so the second pass cancels what they re-armed.
            await nextTurn()
            cancelAll()
            globalThis.setTimeout = real.setTimeout
            globalThis.setInterval = real.setInterval
            if (real.requestAnimationFrame) globalThis.requestAnimationFrame = real.requestAnimationFrame
        }
    }
}
