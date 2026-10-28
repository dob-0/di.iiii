// Holding the graph clock at a moment, so a test browser can cut any project
// frame-exact: seek to t, wait for ready, take the picture, seek on. Works
// that make reels each hand-rolled this contract on their own page
// (`__seek`, `__still`, `__ready`); this is the same three words on the
// document clock every Time, LFO, Timer and Timeline already reads
// (useDocumentClock.js), so a capture script can drive any project the same
// way and needs nothing from inside it.
//
//   await page.evaluate(() => window.__seek(4.5))  // hold at 4.5 s, resolve when drawn
//   window.__ready                                 // true once the held frame is on screen
//   window.__play()                                // let the clock run again
//
// While held, the clock reads exactly t (seconds × 1000 ms) on every page
// that installed the contract, whatever the wall clock does. Nothing is held
// until something calls __seek, so an ordinary visitor's clock is untouched.

let heldMs = null
const listeners = new Set()

const notify = () => { for (const listener of [...listeners]) listener() }

/** The held document-clock time in ms, or null while the clock runs. */
export const heldClockMs = () => heldMs

export const subscribeClockHold = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

export const holdClock = (seconds) => {
    const value = Number(seconds)
    if (!Number.isFinite(value) || value < 0) return false
    heldMs = value * 1000
    notify()
    return true
}

export const releaseClock = () => {
    if (heldMs === null) return
    heldMs = null
    notify()
}

/**
 * Put __seek / __ready / __play on a page. React renders the held time on the
 * next frame and the canvas draws it on the one after, so ready waits two
 * animation frames — the rule the hand-rolled versions settled on too.
 * Returns the uninstall.
 */
export const installClockSeek = (target = globalThis.window, {
    requestFrame = (fn) => globalThis.requestAnimationFrame(fn),
} = {}) => {
    if (!target) return () => {}
    let seekId = 0
    target.__ready = true
    target.__seek = (seconds) => {
        if (!holdClock(seconds)) return Promise.reject(new Error(`__seek wants seconds ≥ 0, got ${seconds}`))
        const id = ++seekId
        target.__ready = false
        return new Promise((resolve) => {
            requestFrame(() => requestFrame(() => {
                // A later seek owns ready; this one only resolves.
                if (id === seekId) target.__ready = true
                resolve(heldMs)
            }))
        })
    }
    target.__play = () => {
        seekId += 1
        releaseClock()
        target.__ready = true
    }
    return () => {
        delete target.__seek
        delete target.__play
        delete target.__ready
        releaseClock()
    }
}
