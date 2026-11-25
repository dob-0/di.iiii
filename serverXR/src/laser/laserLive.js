// The desk's pictures, live (2026-11-07, REA, the owner: "can we do without any restart cuz i want live work with u and
// its will be impossible in performance time"). shared/laserShapes.cjs (the shapes) and shared/laserLook.cjs (a look
// drawn at a moment) are read again when they change on disk, so a new or changed animation reaches a running desk
// while the lasers play: no Save, no disarm, no restart.
//
// What may change this way and what may not. Only those two files, the pictures. The engine (laserEngine.js: arming,
// the still-beam and frame guards, the stream to the cubes), laserGuards.js and laserFrame.cjs are never reloaded: they
// check every frame whatever drew it, so a new picture can never get round them, and changing them still takes a restart
// on purpose.
//
// How a change gets in. At most once a second (check(), asked by the desk's tick and the page's poll) the two files are
// looked at; when they differ from what is running, the new text is tried on a worker thread (laserLiveCheck.js →
// checkSources), never on the thread that feeds the cubes: it must load, keep every shape the running code has (a bank
// look may use it), and draw every shape at three sizes and nine beats without throwing, inside the field and within the
// frame format; a picture it changes or adds must fit one pass of the real cube (2333 points at 35 kpps, as laserGuards
// will draw it); every bank look must draw at four moments. Only then is it compiled here and swapped in, and the version goes up (the page
// reloads itself on it, routes/laserRoutes.js deskVersion, and fetches the new /laser/lib/laser.js). A change that fails
// is kept out, with the reason in status().error, and the running pictures stay. Should the new code still throw while
// the desk draws, the desk goes back to the code before it (revert) and draws a blank meanwhile (laserDesk.js drawLook).
'use strict'

const fs = require('fs')
const path = require('path')
const Module = require('module')

const SHARED = path.join(__dirname, '../../../shared')
const SHAPES_FILE = path.join(SHARED, 'laserShapes.cjs')
const LOOK_FILE = path.join(SHARED, 'laserLook.cjs')
const CHECK_EVERY_MS = 1000
const CHECK_TIMEOUT_MS = 30000
// The trial: sizes × points, at these beats (spread over a 32-beat phrase, off the whole beats as well as on them).
const TRIAL_SIZES = [[1, 600], [0.5, 1992], [0.1, 120]]
const TRIAL_BEATS = [0, 0.37, 1.5, 3.9, 7.99, 12.3, 15.3, 22.1, 29.6]
const TRIAL_TIMES = [0, 777, 5000, 14321]
const CUBE_RATE = 35000
const CUBE_BUFFER = 6000

/**
 * The two files' text as fresh modules, laserLook.cjs requiring this laserShapes.cjs (not the one already loaded);
 * laserFrame.cjs is the one already loaded, the engine's own. Throws when either does not load.
 */
const compileSources = ({ shapesFile = SHAPES_FILE, lookFile = LOOK_FILE, shapesSource, lookSource }) => {
    const compile = (file, source, swap) => {
        const m = new Module(file, module)
        m.filename = file
        m.paths = Module._nodeModulePaths(path.dirname(file))
        const base = m.require.bind(m)
        m.require = (id) => (Object.prototype.hasOwnProperty.call(swap, id) ? swap[id] : base(id))
        m._compile(source, file)
        m.loaded = true
        return m.exports
    }
    const shapes = compile(shapesFile, shapesSource, {})
    const look = compile(lookFile, lookSource, { './laserShapes.cjs': shapes })
    return { shapes, look }
}

/** The trial a change must pass before it may draw (see the top). Pure but slow: run on a worker. */
const checkSources = ({ shapesFile = SHAPES_FILE, lookFile = LOOK_FILE, shapesSource, lookSource, oldShapes = [], looks = [], oldSources = null }) => {
    const fail = (error) => ({ ok: false, error })
    let mods
    try {
        mods = compileSources({ shapesFile, lookFile, shapesSource, lookSource })
    } catch (error) {
        return fail(`does not load: ${error?.message || error}`)
    }
    // The running code, to tell a picture the change leaves as it is (drawn the same) from one it changes or adds: only
    // those must fit the cube's pass. A picture that is over it today (pendulum at 1992 points) is not the change's doing.
    let old = null
    try { if (oldSources) old = compileSources({ shapesFile, lookFile, shapesSource: oldSources.shapes, lookSource: oldSources.look }) } catch { old = null }
    const sameFrame = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((p, i) => p.every((v, k) => v === b[i][k]))
    const names = mods.shapes.LASER_SHAPES
    const generateShape = mods.shapes.generateShape
    if (!Array.isArray(names) || !names.length || !names.every((s) => typeof s === 'string')) return fail('LASER_SHAPES is not a list of names')
    if (typeof generateShape !== 'function' || typeof mods.shapes.shapeListOf !== 'function') return fail('generateShape or shapeListOf is missing')
    if (typeof mods.look.lookPointsAt !== 'function') return fail('lookPointsAt is missing')
    const gone = oldShapes.filter((s) => !names.includes(s))
    if (gone.length) return fail(`shapes the desk has would be gone: ${gone.join(', ')}`)
    const g = require('./laserGuards')
    const { applyZone, normaliseZone } = require('./laserEngine')
    const { flattenLaserPaths, FRAME_MAX_POINTS } = require('../../../shared/laserFrame.cjs')
    const plan = g.pathPlan(g.DEFAULT_GUARDS, CUBE_RATE)
    const budget = g.frameBudget(CUBE_RATE, CUBE_BUFFER)
    const zone = normaliseZone({ xMin: -1, xMax: 1, yMin: -1, yMax: 1 })
    const isLit = (p) => p[2] + p[3] + p[4] > 0
    const broken = (pts) => {
        if (!Array.isArray(pts) || pts.length > FRAME_MAX_POINTS) return 'not a frame'
        for (const p of pts) {
            if (!Array.isArray(p) || p.length < 5) return 'a point is not [x, y, r, g, b]'
            for (let k = 0; k < 5; k += 1) if (typeof p[k] !== 'number' || !Number.isFinite(p[k])) return 'a point is not a number'
            if (Math.abs(p[0]) > 1 || Math.abs(p[1]) > 1) return 'a point is outside the field'
            if (p[2] < 0 || p[2] > 1 || p[3] < 0 || p[3] > 1 || p[4] < 0 || p[4] > 1) return 'a colour is outside 0…1'
        }
        return null
    }
    let frames = 0
    for (const shape of names) {
        for (const [size, points] of TRIAL_SIZES) {
            for (const beat of TRIAL_BEATS) {
                const label = `${shape} at size ${size}, ${points} points, beat ${beat}`
                let pts
                try {
                    pts = generateShape({ shape, size, height: 0, points, beat, colour: '#ffffff', colour2: '#ff0000' })
                } catch (error) {
                    return fail(`${label} throws: ${error?.message || error}`)
                }
                const why = broken(pts)
                if (why) return fail(`${label}: ${why}`)
                let before = null
                if (old && old.shapes.LASER_SHAPES.includes(shape)) {
                    try { before = old.shapes.generateShape({ shape, size, height: 0, points, beat, colour: '#ffffff', colour2: '#ff0000' }) } catch { before = null }
                }
                if (pts.some(isLit) && !sameFrame(pts, before)) {
                    const sent = g.optimisePath(applyZone(flattenLaserPaths(pts, { budget: null }).points, zone).points, plan).points
                    if (sent.length > budget) return fail(`${label} needs ${sent.length} points a pass, more than the cube's ${budget}`)
                }
                frames += 1
            }
        }
    }
    for (const look of looks) {
        for (const t of TRIAL_TIMES) {
            let pts
            try {
                pts = mods.look.lookPointsAt(look, { t, clock: { bpm: 120, zero: 0 }, index: 0 })
            } catch (error) {
                return fail(`the look "${look?.name ?? look?.id}" throws at ${t} ms: ${error?.message || error}`)
            }
            const why = broken(pts)
            if (why) return fail(`the look "${look?.name ?? look?.id}" at ${t} ms: ${why}`)
            frames += 1
        }
    }
    return { ok: true, shapes: names.slice(), frames }
}

// The trial on a worker thread, so the thread that feeds the cubes never waits for it.
const onWorker = (data, { timeoutMs = CHECK_TIMEOUT_MS } = {}) => new Promise((resolve) => {
    const { Worker } = require('worker_threads')
    let done = false
    const finish = (result) => { if (!done) { done = true; clearTimeout(timer); resolve(result) } }
    const worker = new Worker(path.join(__dirname, 'laserLiveCheck.js'), { workerData: data })
    const timer = setTimeout(() => { worker.terminate(); finish({ ok: false, error: `the trial took more than ${timeoutMs / 1000} s` }) }, timeoutMs)
    timer.unref?.()
    worker.once('message', (result) => { finish(result); worker.terminate() })
    worker.once('error', (error) => finish({ ok: false, error: `the trial failed: ${error?.message || error}` }))
    worker.once('exit', (code) => finish({ ok: false, error: `the trial stopped (exit ${code})` }))
})

/**
 * The pictures a desk draws with, kept up to date with the two files. Starts from the modules already loaded when the
 * files are the real ones (so a desk that never sees a change runs exactly the code it started with).
 */
const createLiveCode = ({ shapesFile = SHAPES_FILE, lookFile = LOOK_FILE, now = Date.now, log = null, runCheck = onWorker, checkEveryMs = CHECK_EVERY_MS } = {}) => {
    const read = () => ({ shapes: fs.readFileSync(shapesFile, 'utf8'), look: fs.readFileSync(lookFile, 'utf8') })
    const statKey = () => {
        try {
            return [shapesFile, lookFile].map((f) => { const s = fs.statSync(f); return `${s.mtimeMs}:${s.size}` }).join('|')
        } catch {
            return null
        }
    }
    const sources = read()
    const real = shapesFile === SHAPES_FILE && lookFile === LOOK_FILE
    const mods = real
        ? { shapes: require(SHAPES_FILE), look: require(LOOK_FILE) }
        : compileSources({ shapesFile, lookFile, shapesSource: sources.shapes, lookSource: sources.look })
    let current = { ...mods, sources, version: 0, at: now() }
    let previous = null
    let error = null
    let refused = null // the text that failed, so it is not tried again until it changes
    let lastKey = statKey()
    let askedAt = -Infinity
    let trial = null // the running trial's promise
    let again = null // looks to try with once the running trial ends (a newer change came in meanwhile)
    const same = (a, b) => Boolean(a && b) && a.shapes === b.shapes && a.look === b.look

    const swapIn = (text, result) => {
        const next = compileSources({ shapesFile, lookFile, shapesSource: text.shapes, lookSource: text.look })
        previous = current
        current = { ...next, sources: text, version: current.version + 1, at: now() }
        error = null
        refused = null
        log?.info?.(`[laser desk] new pictures live (v${current.version}): ${result.shapes.length} shapes, ${result.frames} frames tried`)
    }

    const tryText = (text, looks) => {
        trial = Promise.resolve(runCheck({ shapesFile, lookFile, shapesSource: text.shapes, lookSource: text.look, oldShapes: current.shapes.LASER_SHAPES.slice(), looks, oldSources: current.sources }))
            .then((result) => {
                // The files may have changed again while it ran: only the text that is still on disk counts.
                let onDisk = null
                try { onDisk = read() } catch { /* gone for a moment: try again on the next look */ }
                if (!same(onDisk, text)) return
                if (!result?.ok) {
                    refused = text
                    error = result?.error || 'refused'
                    log?.warn?.(`[laser desk] new pictures kept out, the running ones stay: ${error}`)
                    return
                }
                try { swapIn(text, result) } catch (e) { refused = text; error = `does not load here: ${e?.message || e}` }
            }, (e) => { error = `the trial failed: ${e?.message || e}` })
            .finally(() => {
                trial = null
                if (again) { const looks2 = again; again = null; lastKey = null; check(looks2, { force: true }) }
            })
        return trial
    }

    /** Looks at the files (at most once a second unless forced) and, if they changed, starts their trial. */
    const check = (looks = [], { force = false } = {}) => {
        const t = now()
        if (!force && t - askedAt < checkEveryMs) return trial
        askedAt = t
        const key = statKey()
        if (key === null || (key === lastKey && !force)) return trial
        if (trial) { again = looks; return trial }
        lastKey = key
        let text
        try { text = read() } catch { return null }
        if (same(text, current.sources) || same(text, refused)) return null
        return tryText(text, looks)
    }

    /** Back to the code before the last change (it threw while drawing). False when there is none to go back to. */
    const revert = (why) => {
        if (!previous) return false
        refused = current.sources
        current = { ...previous, version: current.version + 1, at: now() }
        previous = null
        error = `went back to the pictures before the last change: ${why?.message || why}`
        log?.warn?.(`[laser desk] ${error}`)
        return true
    }

    return {
        shapes: () => current.shapes,
        look: () => current.look,
        version: () => current.version,
        sources: () => current.sources,
        status: () => ({ version: current.version, at: current.at, error, trying: Boolean(trial) }),
        check,
        revert
    }
}

// The desk's own, one per process like the modules it replaces.
let shared = null
const liveCode = () => (shared ??= createLiveCode())

module.exports = { createLiveCode, liveCode, checkSources, compileSources, SHAPES_FILE, LOOK_FILE, TRIAL_SIZES, TRIAL_BEATS }
