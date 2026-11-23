// The laser desk's calm drawing mode: the rules that decide how much the page draws. Pure functions, no DOM, so the rules
// are tested on their own (drawCalm.test.js); desk.js applies them.
//
// Why (2026-10-31, the show's Mac, a MacBook Pro 2015 with an Intel Iris 6100): with the Control tab on screen the page
// drew all 72 look tiles every 50 ms and the stage every 80 ms; the Chromium GPU process held a full core and the CPU
// package sat at 101-105 C, thermal throttling. Two modes, stored per browser:
//   calm (the default)  a tile is a still picture, drawn when its look, its size or the beat changes. Only the tile
//                       on the laser, the tile open in Edit and the tile under the pointer play (at most 20 pictures a
//                       second); the Preview draws at most ~30 a second; the stage is asked every 500 ms unless a cube
//                       is on or a look is open in the Preview, and a stage picture that did not change is not redrawn.
//   full                what the page did before: every tile on screen plays, the stage is asked every 80 ms.
// Loaded by the page as a plain script (window.DiLaserCalm) and by its test as a CommonJS module.
'use strict'
;((root, factory) => {
    const api = factory()
    if (typeof module === 'object' && module.exports) module.exports = api
    else root.DiLaserCalm = api
})(typeof window !== 'undefined' ? window : globalThis, () => {
    const MODES = ['calm', 'full']
    const DEFAULT_MODE = 'calm'
    const PLAY_MS = 50 // a playing tile: at most 20 pictures a second (the same as before, for the tiles that still play)
    const PREVIEW_MS = 33 // the Preview: at most ~30 pictures a second
    const VIEW_FAST_MS = 80 // the stage while a cube is on or the Preview is in use (the same as before)
    const VIEW_IDLE_MS = 500 // the stage otherwise
    const STILL_CHECK_MS = 250 // how often the still tiles are checked for a changed look, size or beat
    const TICK_MS = 16 // calm asks the browser for a frame at most every ~33 ms (a frame callback 60 times a second costs a core on an old Mac)

    const normaliseMode = (mode) => (MODES.includes(mode) ? mode : DEFAULT_MODE)

    // Does this tile play (true) or hold a still picture (false)? calm: the tile on the laser (liveId), the one open in
    // Edit (selected) and the one under the pointer (hoverId). full: every tile.
    const tilePlays = (mode, id, { liveId = null, selected = null, hoverId = null } = {}) =>
        mode === 'full' || (id !== null && id !== undefined && (id === liveId || id === selected || id === hoverId))

    // How long the stage waits before asking the desk for the cubes' pictures again.
    const stageIntervalMs = ({ mode, armed = false, previewInUse = false }) =>
        mode === 'full' || armed || previewInUse ? VIEW_FAST_MS : VIEW_IDLE_MS

    // A cheap fingerprint of a picture's points ([x, y, r, g, b] each): FNV-1a over the values to 1/4096, so a picture
    // that moved by less than a pixel counts as the same and one that moved more does not.
    const frameHash = (points) => {
        let h = 0x811c9dc5
        if (!points) return h >>> 0
        h = Math.imul(h ^ points.length, 16777619)
        for (let i = 0; i < points.length; i += 1) {
            const p = points[i]
            for (let k = 0; k < 5; k += 1) h = Math.imul(h ^ (Math.round((p[k] || 0) * 4096) | 0), 16777619)
        }
        return h >>> 0
    }
    const zoneKey = (zone) => (zone ? `${zone.xMin},${zone.xMax},${zone.yMin},${zone.yMax}` : '')

    return { MODES, DEFAULT_MODE, PLAY_MS, PREVIEW_MS, VIEW_FAST_MS, VIEW_IDLE_MS, STILL_CHECK_MS, TICK_MS, normaliseMode, tilePlays, stageIntervalMs, frameHash, zoneKey }
})
