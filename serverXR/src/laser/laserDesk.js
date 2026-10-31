// THE LASER DESK (2026-10-29) — the light desk's twin for the LaserCubes.
//
// The owner's ask: "lets create laser soft like how is lighting one" — inside di. The light desk (serverXR/src/lighting)
// is a bank of scenes, a live state you edit, a master and a clock, all run by the server so the rig keeps going when a
// browser tab sleeps. This is the same for the cubes: a bank of LOOKS (a shape, its colour and its movement on the
// beat), one LIVE look you edit, a MASTER level, a BPM clock with tap, and per-cube setup (on, mirror, size, offset).
//
// What it is to the laser engine: one more sender, the Laser Out `desk` (laserEngine.js rule 10), exactly like the show
// player (laserShow.js). Every tick it draws each cube's frame and keeps it in the engine (setFrame) when it changed,
// keep-alive (alive) when it did not. NOTHING of the engine's safety moves: the cubes are DISARMED at every start, the
// sign-off phrase is a person's to type, the keep-in zone, the galvo and still-beam guards and the signal-loss stop all
// apply to the desk's frames as to any other. A cube another Out holds (a Nodes editor's Laser Out, the show player)
// refuses the desk's frames; the desk says so per cube and draws nothing there.
//
// The pictures are the Laser node's own (shared/laserShapes.cjs: circle … grid, and the owner's four TouchDesigner
// scenes galaxy, sunflower, noisy, grid), flattened the way Laser Out flattens a Laser shape's points
// (shared/laserFrame.cjs flattenLaserPaths, no budget: the shape's own points, capped to what the cube takes).
//
// Nothing is on the cubes until someone presses a look (Go), and a restart comes back RELEASED: the bank, the clock
// and the setup are kept in <data>/laser/desk.json, the live look is not.
'use strict'

const fs = require('fs')
const path = require('path')
const { LASER_SHAPES, shapeListOf, parseLaserColour } = require('../../../shared/laserShapes.cjs')
const { flattenLaserPaths, FRAME_MAX_POINTS } = require('../../../shared/laserFrame.cjs')
// A look drawn at a moment lives in shared/ (2026-10-29): the page's tiles play the looks with the same code.
const { CUBE_DEFAULTS, beatsAt, lookPointsAt } = require('../../../shared/laserLook.cjs')
// Follow the light desk (2026-10-31): the pure part and the origin rule live in sceneLink.js.
const { sceneIdOf, fillLinks, mayDrive } = require('./sceneLink')

const TICK_MS = 50 // as the show player: well inside the engine's signal-loss stop (FRAME_TIMEOUT_MS 200)
const OUT = 'desk' // the desk's Laser Out name in the engine (one sender per cube)
const FILE = 'desk.json'
const SAVE_DELAY_MS = 400
// Undo keeps this many steps of the bank; edits to one look closer than UNDO_JOIN_MS apart are one step (a slider drag).
const UNDO_DEPTH = 100
const UNDO_JOIN_MS = 1500
const MAX_LOOKS = 128
const BLANK = [0, 0, 0, 0, 0]
// What one frame may be at the cube's rate when the engine has no plan yet (LaserOutPanelWindow.jsx cubeCap: 67 ms of
// points, a 25 % margin for the galvo guards' extra points).
const FRAME_CAP_S = 0.067
const TAP_GAP_MS = 2000 // a tap more than this after the last one starts a new count
const BPM_MIN = 20
const BPM_MAX = 300

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : d)
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const round3 = (v) => Math.round(v * 1000) / 1000
const bool = (v, d = false) => (v === true || v === 'true' || v === 1 ? true : v === false || v === 'false' || v === 0 ? false : d)
const isLit = (p) => p[2] > 0 || p[3] > 0 || p[4] > 0

// ---- looks (pure) --------------------------------------------------------------------------------------------------

/** A look's every field, in range. A shape is one of LASER_SHAPES or a comma list of them (played in turn, `cycle`). */
const LOOK_DEFAULTS = Object.freeze({
    name: 'Look',
    shape: 'circle',
    colour: '#ff2030',
    rainbow: false,
    level: 1,
    size: 0.45, // 0…1 of the field's half-width
    height: 0.5, // the picture's centre up the field: 0.5 keeps a 0.45 picture inside the default keep-in zone (y ≥ 0)
    x: 0, // the picture's centre across the field
    rotation: 0, // turns
    spin: 0, // turns per beat
    copies: 0, // galaxy's spirals, noisy's rings (0 = the shape's own number)
    points: 300,
    cycle: 0, // beats each shape of a comma list plays (0 = the first only)
    pulse: 0, // 0…1: the size breathes down by this much, once every pulseBeats
    pulseBeats: 1,
    sweep: 0, // 0…1: the picture swings across the field by this much, once every sweepBeats
    sweepBeats: 4,
    mirror: false, // every second cube mirrored (x → −x)
    phase: 0, // beats each cube runs behind the one before it (a chase across the cubes)
    cubes: 'all', // 'all' or the cube ids this look draws on; the others are held dark
    // The light scene this look follows (sceneLink.js): null = never set (the first fill may set it), '' = none, else the
    // scene's id. A setting of the desk, not part of the picture: it is left out of samePicture and Save never copies it.
    follows: null
})

const shapeOf = (v) => {
    const names = shapeListOf(v).filter((s) => LASER_SHAPES.includes(s))
    return names.length ? names.join(',') : LOOK_DEFAULTS.shape
}
const colourOf = (v) => {
    const text = String(v ?? '').trim()
    if (!/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(text)) return LOOK_DEFAULTS.colour
    const rgb = parseLaserColour(text)
    return '#' + rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')
}
const idOf = (v) => String(v ?? '').trim().replace(/[^a-z0-9_-]/gi, '').slice(0, 40)
const followsOf = (v) => (v === null || v === undefined ? null : sceneIdOf(v))
/** Fields from a page's edit without the link: a link is set by setFollows only (one scene, one look). */
const withoutFollows = (fields) => { const { follows: _link, ...rest } = fields && typeof fields === 'object' ? fields : {}; return rest }
const clone = (v) => JSON.parse(JSON.stringify(v))
/** Two looks draw the same picture: every field but the name (both normalised, so the fields come in one order). */
const samePicture = (a, b) => {
    const { name: _a, follows: _fa, ...pa } = a
    const { name: _b, follows: _fb, ...pb } = b
    return JSON.stringify(pa) === JSON.stringify(pb)
}
/** An id from a name that is not in `taken`: "star", "star-2"… */
const freeId = (name, taken) => {
    const stem = idOf(String(name || 'look').toLowerCase().replace(/\s+/g, '-')) || 'look'
    let id = stem
    for (let n = 2; taken.has(id); n += 1) id = `${stem}-${n}`
    return id
}
/** The next free numbered name: "Star" → "Star 2", "Star 2" → "Star 3" when "Star 2" is taken. */
const nextName = (name, taken) => {
    const base = String(name).replace(/\s+\d+$/, '').trim() || 'Look'
    for (let n = 2; ; n += 1) {
        const candidate = `${base} ${n}`.slice(0, 40)
        if (!taken.has(candidate)) return candidate
    }
}

/** Any object as a look: unknown fields dropped, every known one clamped. `base` fills what `raw` leaves out. */
const normaliseLook = (raw = {}, base = LOOK_DEFAULTS) => {
    const r = raw && typeof raw === 'object' ? raw : {}
    const pick = (k) => (r[k] !== undefined ? r[k] : base[k])
    const cubes = pick('cubes')
    return {
        ...(idOf(r.id || base.id) ? { id: idOf(r.id || base.id) } : {}),
        name: String(pick('name') ?? '').trim().slice(0, 40) || LOOK_DEFAULTS.name,
        shape: shapeOf(pick('shape')),
        colour: colourOf(pick('colour')),
        rainbow: bool(pick('rainbow')),
        level: clamp(num(pick('level'), 1), 0, 1),
        size: clamp(num(pick('size'), LOOK_DEFAULTS.size), 0, 1),
        height: clamp(num(pick('height'), LOOK_DEFAULTS.height), -1, 1),
        x: clamp(num(pick('x'), 0), -1, 1),
        rotation: clamp(num(pick('rotation'), 0), -1, 1),
        spin: clamp(num(pick('spin'), 0), -4, 4),
        copies: Math.round(clamp(num(pick('copies'), 0), 0, 24)),
        points: Math.round(clamp(num(pick('points'), LOOK_DEFAULTS.points), 16, FRAME_MAX_POINTS - 8)),
        cycle: clamp(num(pick('cycle'), 0), 0, 64),
        pulse: clamp(num(pick('pulse'), 0), 0, 1),
        pulseBeats: clamp(num(pick('pulseBeats'), 1), 0.25, 64),
        sweep: clamp(num(pick('sweep'), 0), 0, 1),
        sweepBeats: clamp(num(pick('sweepBeats'), 4), 0.25, 64),
        mirror: bool(pick('mirror')),
        phase: clamp(num(pick('phase'), 0), 0, 16),
        cubes: Array.isArray(cubes) ? [...new Set(cubes.map(idOf).filter(Boolean))].slice(0, 64) : 'all',
        follows: followsOf(pick('follows'))
    }
}

// Below this a cube's picture shrinks into still beams and the engine's still-beam guard stops it mid-show
// (measured: 8 of 32 seed looks stop at 0.1, none at 0.3; review 1218 S3).
const CUBE_SIZE_MIN = 0.3

const CUBE_RANGE = Object.freeze({ size: [CUBE_SIZE_MIN, 3], x: [-1, 1], y: [-1, 1], order: [-999, 999] })

/**
 * A cube's place on the desk (CUBE_DEFAULTS, shared/laserLook.cjs), every field in range. `strict` (a person's change):
 * a field that is not a number or lies outside its range is REFUSED with a RangeError and nothing changes, never pulled
 * to the extreme (stage audit 2026-10-30, row 25). The file's own values are read without it (clamped, and said).
 */
const normaliseCube = (raw = {}, base = CUBE_DEFAULTS, { strict = false } = {}) => {
    const r = raw && typeof raw === 'object' ? raw : {}
    const pick = (k) => (r[k] !== undefined ? r[k] : base[k])
    const field = (k, d) => {
        const [lo, hi] = CUBE_RANGE[k]
        if (strict && r[k] !== undefined) {
            const n = num(r[k], NaN)
            if (!Number.isFinite(n)) throw new RangeError(`${k}: "${String(r[k]).slice(0, 20)}" is not a number`)
            if (n < lo || n > hi) throw new RangeError(`${k}: ${n} is outside ${lo} to ${hi}; nothing was changed`)
        }
        return clamp(num(pick(k), d), lo, hi)
    }
    return {
        on: bool(pick('on'), true),
        flipX: bool(pick('flipX')),
        size: field('size', 1),
        x: field('x', 0),
        y: field('y', 0),
        order: Math.round(field('order', 0))
    }
}

// The first bank (an empty desk.json): the node's shapes and the owner's four TouchDesigner scenes, each with a move.
// Colours as the owner's light desk keeps them: complementary pairs, no green (it can be picked, it is not a default).
const SEED_LOOKS = [
    { id: 'ring', name: 'Ring', shape: 'circle', colour: '#ff2030', pulse: 0.35, pulseBeats: 1 },
    { id: 'star', name: 'Star', shape: 'star', colour: '#20d8ff', spin: 0.125 },
    { id: 'fan', name: 'Fan', shape: 'fan', colour: '#ffffff', size: 0.5, height: 0.05, sweep: 0.25, sweepBeats: 8, mirror: true },
    { id: 'wave', name: 'Wave', shape: 'wave', colour: '#3050ff', size: 0.6, phase: 0.25, sweep: 0.15, sweepBeats: 2 },
    { id: 'triangle', name: 'Triangle', shape: 'triangle', colour: '#ff30c0', spin: -0.25 },
    { id: 'square', name: 'Square', shape: 'square', colour: '#ffb020', size: 0.35, spin: 0.0625, phase: 0.5 },
    { id: 'spiral', name: 'Spiral', shape: 'spiral', rainbow: true, spin: 0.25, points: 400 },
    { id: 'scan', name: 'Scan', shape: 'line', colour: '#ff2030', size: 0.3, rotation: 0.25, sweep: 0.6, sweepBeats: 4, phase: 0.5 },
    { id: 'galaxy', name: 'Galaxy', shape: 'galaxy', rainbow: true, spin: 0.0625, points: 600 },
    { id: 'sunflower', name: 'Sunflower', shape: 'sunflower', colour: '#ffb020', spin: 0.03125, points: 600 },
    { id: 'noisy', name: 'Noisy', shape: 'noisy', colour: '#20d8ff', points: 500 },
    { id: 'grid', name: 'Grid', shape: 'grid', colour: '#ffffff', size: 0.45, points: 400 },
    { id: 'td-cycle', name: 'TD cycle', shape: 'galaxy,sunflower,noisy,grid', cycle: 8, rainbow: true, spin: 0.0625, points: 600 },
    { id: 'pairs', name: 'Pairs', shape: 'star', colour: '#ff30c0', spin: 0.25, mirror: true, pulse: 0.2, pulseBeats: 2 },
    // 2026-10-29, the owner: "more minimalistic shapes and sparkle shapes".
    { id: 'sparkle', name: 'Sparkle', shape: 'sparkle', colour: '#ffffff', size: 0.5 },
    { id: 'twinkle', name: 'Twinkle', shape: 'twinkle', colour: '#20d8ff', size: 0.5 },
    { id: 'glint', name: 'Glint', shape: 'glint', colour: '#ffffff', size: 0.3, spin: 0.125, pulse: 0.3, pulseBeats: 2 },
    { id: 'ripple', name: 'Ripple', shape: 'rings', colour: '#ff2030', copies: 3, pulse: 0.25 },
    { id: 'corners', name: 'Corners', shape: 'corners', colour: '#ffb020', size: 0.4, pulse: 0.15, pulseBeats: 2 },
    { id: 'cross', name: 'Cross', shape: 'cross', colour: '#ff30c0', size: 0.35, spin: 0.125 },
    // The same evening: "add animations of 5 vertcal lines, and to many spots, wobbling lines as well".
    { id: 'lines', name: 'Lines', shape: 'lines', colour: '#ff2030', size: 0.5 },
    { id: 'spots', name: 'Spots', shape: 'spots', colour: '#ffb020', size: 0.5 },
    { id: 'wobble', name: 'Wobble', shape: 'wobble', colour: '#20d8ff', size: 0.5 },
    // 2026-10-30: "more scenes like complex ones but minimalistic lines circle dots". Scenes plays five of them in turn,
    // four bars each.
    { id: 'planets', name: 'Planets', shape: 'planets', colour: '#20d8ff', size: 0.5, points: 400 },
    { id: 'pendulum', name: 'Pendulum', shape: 'pendulum', colour: '#ffffff', size: 0.5, points: 400 },
    { id: 'bounce', name: 'Bounce', shape: 'bounce', colour: '#ff2030', size: 0.5, points: 400 },
    { id: 'radar', name: 'Radar', shape: 'radar', colour: '#ffb020', size: 0.5, points: 400 },
    { id: 'constellation', name: 'Constellation', shape: 'constellation', colour: '#ff30c0', size: 0.5, points: 400 },
    { id: 'clock', name: 'Clock', shape: 'clock', colour: '#ffffff', size: 0.5, points: 400 },
    { id: 'horizon', name: 'Horizon', shape: 'horizon', colour: '#ffb020', size: 0.5, points: 400 },
    { id: 'morse', name: 'Morse', shape: 'morse', colour: '#20d8ff', size: 0.5, points: 400 },
    { id: 'scenes', name: 'Scenes', shape: 'planets,pendulum,radar,constellation,horizon', cycle: 16, colour: '#ff30c0', size: 0.5, points: 400 }
].map((look) => normaliseLook(look))
// The seed looks a bank saved before `seeded` was kept (2026-10-29 evening) had been offered: the first fourteen.
const FIRST_SEEDS = ['ring', 'star', 'fan', 'wave', 'triangle', 'square', 'spiral', 'scan', 'galaxy', 'sunflower', 'noisy', 'grid', 'td-cycle', 'pairs']

// ---- the frame (pure) ----------------------------------------------------------------------------------------------
// beatsAt and lookPointsAt: shared/laserLook.cjs.

/** What one frame may hold for this cube, from the engine's own figures (as Laser Out reads them), or null. */
const capOf = (cubeState) => {
    const path = cubeState?.path
    const ratio = path?.pointsIn > 0 && path?.pointsOut > 0 ? Math.min(1, path.pointsIn / path.pointsOut) : 0.75
    if (Number.isFinite(path?.budget) && path.budget > 0) return Math.floor(path.budget * ratio)
    const rate = cubeState?.info?.dacRate
    if (Number.isFinite(rate) && rate > 0) return Math.floor(rate * FRAME_CAP_S * 0.75)
    return null
}

/** A numeric hash of a frame: the same picture is kept alive, not sent again. */
const hashPoints = (points) => {
    let h = 2166136261
    for (const p of points) for (let i = 0; i < 5; i += 1) h = Math.imul(h ^ Math.round(p[i] * 4096), 16777619)
    return `${points.length}:${h >>> 0}`
}

// ---- the desk ------------------------------------------------------------------------------------------------------

/**
 * @param {{ dataDir: string, getEngine: () => object, now?: () => number, setInterval?: Function,
 *   clearInterval?: Function, log?: object }} opts
 */
const createLaserDesk = ({ dataDir, getEngine, now = Date.now, setInterval: every = setInterval, clearInterval: stopEvery = clearInterval, log = null, lightScenes: scenesOfLight = null }) => {
    const file = path.join(dataDir, FILE)
    const show = { bpm: 120, master: 1, looks: SEED_LOOKS.map((l) => ({ ...l })), cubes: {}, blackoutKeepsArm: false, seeded: SEED_LOOKS.map((l) => l.id), followLight: false }
    let seedsAdded = false
    const clock = { bpm: 120, zero: now(), taps: [] }
    let live = null // the look on the cubes (a copy: editing it never touches the bank until Store)
    let liveId = null // the bank's look it came from
    let blackout = false
    let engineDark = false // the engine's dark latch is ours (keep-arm Blackout); only then is it lifted, and never by building an engine
    let timer = null
    const sent = new Map() // cubeId → { key, end, held, points, at }
    let saveTimer = null
    let dirty = false // the bank changed since desk.json was last written (Save)
    let loadMessage = null
    // Follow the light desk (sceneLink.js). `lastFollow` is the newest scene the link was asked about, for the page.
    let lastFollow = null

    // ---- the file
    try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
        if (Array.isArray(raw.looks)) show.looks = raw.looks.slice(0, MAX_LOOKS).map((l) => normaliseLook(l)).filter((l) => l.id)
        if (raw.cubes && typeof raw.cubes === 'object') for (const [id, c] of Object.entries(raw.cubes)) {
            if (!idOf(id)) continue
            try { normaliseCube(c, CUBE_DEFAULTS, { strict: true }) } catch (error) {
                loadMessage = `${loadMessage ? loadMessage + '; ' : ''}desk.json: ${idOf(id)} placement ${error.message.replace('; nothing was changed', '')}; pulled to the nearest edge, check Setup`
                log?.warn?.(`[laser desk] ${loadMessage}`)
            }
            show.cubes[idOf(id)] = normaliseCube(c)
        }
        show.master = clamp(num(raw.master, 1), 0, 1)
        show.blackoutKeepsArm = raw.blackoutKeepsArm === true
        show.followLight = raw.followLight === true
        show.bpm = clamp(num(raw.bpm, 120), BPM_MIN, BPM_MAX)
        clock.bpm = show.bpm
        // A seed look added since this bank was saved joins it at the end, once: `seeded` lists the seeds it has been
        // offered, so one the owner deleted is not offered again.
        const offered = Array.isArray(raw.seeded) ? raw.seeded.map(idOf).filter(Boolean) : FIRST_SEEDS
        const fresh = SEED_LOOKS.filter((l) => !offered.includes(l.id) && !show.looks.some((x) => x.id === l.id))
        show.looks.push(...fresh.slice(0, Math.max(0, MAX_LOOKS - show.looks.length)).map((l) => ({ ...l })))
        show.seeded = [...new Set([...offered, ...SEED_LOOKS.map((l) => l.id)])]
        seedsAdded = fresh.length > 0
    } catch (error) {
        if (error.code !== 'ENOENT') {
            // A file that does not read is kept beside, never overwritten: the bank in it may be someone's evening.
            loadMessage = `desk.json did not read (${error.message}); started from the first bank, the file kept as desk.json.bad`
            try { fs.copyFileSync(file, file + '.bad') } catch { /* nothing to keep */ }
            log?.warn?.(`[laser desk] ${loadMessage}`)
        }
    }
    // The bank as last saved: what desk.json holds. Edits change show.looks; only Save (saveBank) and Store move them
    // here. A write for the clock, the master or the setup writes this bank, never an edit Save has not seen.
    let savedLooks = clone(show.looks)
    const commit = () => { savedLooks = clone(show.looks); dirty = false }
    const saveNow = () => {
        saveTimer = null
        try {
            fs.mkdirSync(dataDir, { recursive: true })
            const tmp = file + '.tmp'
            fs.writeFileSync(tmp, JSON.stringify({ v: 1, bpm: show.bpm, master: show.master, blackoutKeepsArm: show.blackoutKeepsArm, followLight: show.followLight, looks: savedLooks, cubes: show.cubes, seeded: show.seeded }, null, 1))
            fs.renameSync(tmp, file)
            return true
        } catch (error) {
            log?.warn?.(`[laser desk] desk.json could not be written: ${error.message}`)
            return false
        }
    }
    const save = () => { if (!saveTimer) { saveTimer = setTimeout(saveNow, SAVE_DELAY_MS); saveTimer.unref?.() } }
    if (seedsAdded) save()

    // ---- the cubes: the engine's, in the desk's order
    const cubeCfg = (id) => show.cubes[id] || CUBE_DEFAULTS
    const orderedCubes = (engineCubes) => engineCubes
        .map((c, i) => ({ c, i }))
        .sort((a, b) => cubeCfg(a.c.id).order - cubeCfg(b.c.id).order || a.i - b.i)
        .map(({ c }) => c)

    // A person's Go (a look pressed, a blackout lifted) counts once: the first frame after it carries `go: true`, so the
    // engine may light a cube it stopped (still beam, frame too long). Nothing else the desk sends can (review D1).
    let goSeq = 0
    // The Go a cube the desk has no record of counts as seen (null = none seen: its first frame is a Go). The scene link sets
    // it to the newest Go, so the link's frames never carry go: true (a Go is a person's: stopResume "person").
    let linkBase = null
    let lastEngine = null
    let seenBlackouts = 0
    // The engine's Blackout (POST /laser/api/blackout, from any page) clears every frame. The desk must not draw
    // them straight back: the engine counts its blackouts, and when the count rises the desk goes to its own
    // blackout — lit on the page, kept until a person lifts it. Counted, not inferred from the frames, so it holds
    // whatever the desk sent last, and a Go after a blackout met while released is dark too (review 1218 S1).
    const watchEngine = () => {
        const engine = getEngine()
        const count = engine.frames().blackouts ?? 0
        // A config reload (Use these) builds a new engine with no frames: everything is sent again, not kept alive.
        if (engine !== lastEngine) { for (const s of sent.values()) s.key = null; lastEngine = engine; seenBlackouts = 0 }
        // A new engine counts from 0, so a Blackout it already took is new to the desk (review 1224 F1).
        if (count > seenBlackouts) {
            seenBlackouts = count
            if (!blackout) {
                blackout = true
                log?.warn?.('[laser desk] the laser engine was blacked out: the desk holds its blackout until it is lifted')
            }
        }
        return engine
    }
    const tickOnce = () => {
        if (!live) return
        const engine = watchEngine()
        const st = engine.state()
        const zone = st.zone
        const cubes = orderedCubes(st.cubes).filter((c) => cubeCfg(c.id).on)
        const t = now()
        cubes.forEach((cube, index) => {
            const was = sent.get(cube.id) || { key: null, end: null, held: null, points: 0, at: 0, seq: linkBase }
            const drawn = live.cubes === 'all' || live.cubes.includes(cube.id)
            const stats = { lit: 0, off: 0 }
            const raw = blackout || !drawn ? [BLANK] : lookPointsAt(live, { t, clock, index, cube: cubeCfg(cube.id), master: show.master, stats })
            // Lit points the look kept on the field but the engine's keep-in zone will blank (rows 19, 23, 36).
            const zoneCut = zone ? raw.filter((p) => isLit(p) && (p[0] < zone.xMin || p[0] > zone.xMax || p[1] < zone.yMin || p[1] > zone.yMax)).length : 0
            let points = [BLANK]
            let end = was.end
            if (raw.some(isLit)) {
                const flat = flattenLaserPaths(raw, { budget: null, start: was.end, cap: capOf(cube) ?? FRAME_MAX_POINTS })
                if (flat.points.length) { points = flat.points; end = flat.end }
            }
            const key = hashPoints(points)
            // A keep-alive only while the engine still holds the desk's picture. One it no longer has (a Blackout from
            // another page cleared it while the desk's picture was dark, so the key did not change) is posted again,
            // never counted as sent: else the cube had no frame and the dark rule switched it off (N1585).
            const alive = key === was.key && !was.held ? engine.alive(cube.id, OUT) : null
            const res = alive && !(alive.ok && alive.kept === false) ? alive : engine.setFrame(cube.id, points, OUT, { go: was.seq !== goSeq })
            const count = { lit: points.filter(isLit).length, blanked: zoneCut, offField: stats.off, source: stats.lit }
            sent.set(cube.id, res.ok
                ? { key, end, held: null, points: points.length, at: t, seq: goSeq, ...count }
                : { key: null, end: was.end, held: res.error || 'refused', points: 0, at: t, seq: was.seq, lit: 0, blanked: 0, offField: 0, source: 0 })
        })
    }
    // The 50 ms tick never throws: an error is logged once per distinct message and the next tick runs (audit row 29).
    const tickErrors = new Set()
    const tick = () => {
        try { tickOnce() } catch (error) {
            const message = String(error?.message || error)
            if (!tickErrors.has(message)) {
                if (tickErrors.size >= 50) tickErrors.clear()
                tickErrors.add(message)
                log?.warn?.(`[laser desk] tick failed: ${message} (the desk keeps ticking)`)
            }
        }
    }

    const startTicking = () => {
        if (timer) return
        timer = every(tick, TICK_MS)
        timer?.unref?.()
    }

    // Every cube the desk drew on goes dark, and the desk stops sending: its hold on them runs out (CLAIM_TTL_MS),
    // so a Nodes Laser Out or the show player can take them.
    const liftEngineDark = () => { if (engineDark) { engineDark = false; getEngine().dark(false) } }
    const release = () => {
        const was = live !== null
        live = null
        liveId = null
        // Release also lifts the desk's blackout (the top-bar Blackout button only ever turns it on; audit row 30).
        blackout = false
        liftEngineDark()
        if (timer) { stopEvery(timer); timer = null }
        // Only cubes the desk drew on are touched: a desk that never drew must not build an engine to say so.
        if (sent.size) {
            const engine = getEngine()
            // Dark first, then the cube is switched OFF (never resumed): a cube the desk let go of must not stay armed with
            // output on for the next Out to light (review E2, desk half).
            for (const [id, s] of sent) if (!s.held) { engine.setFrame(id, [BLANK], OUT); engine.arm({ armed: false, cube: id, out: OUT }) }
        }
        sent.clear()
        if (was) log?.info?.('[laser desk] released')
        return { ok: true }
    }

    // The look on the cubes. `person`: a person's Go, which counts once (goSeq) and so may light a cube the engine stopped
    // (stopResume "person"). The scene link is not a person: it changes the live look and nothing else (followScene).
    const putLive = (look, { person }) => {
        live = { ...look, cubes: Array.isArray(look.cubes) ? [...look.cubes] : 'all' }
        liveId = look.id
        for (const s of sent.values()) s.key = null
        if (person) goSeq += 1
        else { linkBase = goSeq; for (const s of sent.values()) s.seq = goSeq } // the link is never a Go, also for a cube it has not drawn on
        watchEngine()
        tick()
        startTicking()
    }
    const go = (id) => {
        const look = show.looks.find((l) => l.id === idOf(id))
        if (!look) return { ok: false, status: 404, error: `no look "${id}"` }
        putLive(look, { person: true })
        return { ok: true, live: liveId }
    }

    // ---- the bank as the page edits it (2026-10-29, the owner, after a Preview-and-Send try: "like in resolume … keep
    // changes for each scene and add save bottom"). Each look keeps its own changes: an edit changes the look in the bank
    // at once, and a look on the cubes shows it at once, like a playing clip. Bank changes (edit, copy, rename, delete,
    // order) are kept here and written by Save (or by any other write, and by a clean stop); `unsaved` says so.

    /** Change a look of the bank; the cubes follow when it is the one on them. */
    const editLook = (id, fields = {}) => {
        const i = show.looks.findIndex((l) => l.id === idOf(id))
        if (i < 0) return { ok: false, status: 404, error: `no look "${id}"` }
        remember('edit', show.looks[i].id)
        show.looks[i] = normaliseLook({ ...withoutFollows(fields), id: show.looks[i].id }, show.looks[i])
        dirty = true
        if (live && liveId === show.looks[i].id) {
            const look = show.looks[i]
            live = { ...look, cubes: Array.isArray(look.cubes) ? [...look.cubes] : 'all' }
            tick()
        }
        return { ok: true, look: show.looks[i] }
    }

    /** A copy of a look as a new tile right after it (the page edits the copy). */
    const copyLook = (id) => {
        const i = show.looks.findIndex((l) => l.id === idOf(id))
        if (i < 0) return { ok: false, status: 404, error: `no look "${id}"` }
        if (show.looks.length >= MAX_LOOKS) return { ok: false, status: 400, error: `the bank is full (${MAX_LOOKS} looks)` }
        const name = `${show.looks[i].name} 2`.slice(0, 40)
        const look = normaliseLook({ ...show.looks[i], id: newId(name), name, follows: null }) // a copy never takes the link
        remember('copy')
        show.looks.splice(i + 1, 0, look)
        dirty = true
        return { ok: true, id: look.id }
    }

    // ---- undo (2026-10-30, the owner: "add delete ctl z ctrl v ctrl c and other shortkeys"): the bank before each change
    // (an edit, a copy, a paste, a delete, a rename, the order, Store, a Save's new scenes), at most UNDO_DEPTH steps.
    // Edits to one look in a row are one step (a slider dragged) until another change comes or UNDO_JOIN_MS passes without
    // an edit. Sending a look to the laser is not a change of the bank and is not undone; a look on the laser follows an
    // undo, as it follows an edit. A Save already on disk stays there: after an undo, Save lights again.
    const past = []
    const future = []
    let lastStep = null // { kind, id, at }: what the newest step was, to join a slider's edits
    const snapshot = () => ({ looks: clone(show.looks), liveId })
    const remember = (kind, id = null) => {
        const t = now()
        if (kind === 'edit' && lastStep?.kind === 'edit' && lastStep.id === id && t - lastStep.at < UNDO_JOIN_MS) {
            lastStep.at = t
            return
        }
        past.push(snapshot())
        if (past.length > UNDO_DEPTH) past.shift()
        future.length = 0
        lastStep = { kind, id, at: t }
    }
    // The bank as it was; the look on the laser shows its picture there (or the cubes play on when it is gone).
    const restore = (snap) => {
        // The links are a setting of the desk, not part of the bank's history: an undo brings the pictures back and the links stay as they are now.
        const links = new Map(show.looks.map((l) => [l.id, l.follows ?? null]))
        show.looks = clone(snap.looks).map((l) => (links.has(l.id) ? { ...l, follows: links.get(l.id) } : l))
        const has = (id) => id !== null && show.looks.some((l) => l.id === id)
        if (!has(liveId)) liveId = has(snap.liveId) ? snap.liveId : null
        dirty = JSON.stringify(show.looks) !== JSON.stringify(savedLooks)
        lastStep = null
        const look = show.looks.find((l) => l.id === liveId)
        if (live && look) {
            live = { ...look, cubes: Array.isArray(look.cubes) ? [...look.cubes] : 'all' }
            tick()
        }
    }
    const undo = () => {
        if (!past.length) return { ok: true, undone: false }
        future.push(snapshot())
        restore(past.pop())
        return { ok: true, undone: true }
    }
    const redo = () => {
        if (!future.length) return { ok: true, redone: false }
        past.push(snapshot())
        restore(future.pop())
        return { ok: true, redone: true }
    }

    /** A copied look (Ctrl+V; from this desk or another) as a new tile after `after`, else at the end. */
    const pasteLook = (raw, after) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, status: 400, error: 'look: the look to paste' }
        if (show.looks.length >= MAX_LOOKS) return { ok: false, status: 400, error: `the bank is full (${MAX_LOOKS} looks)` }
        const base = normaliseLook({ ...raw, id: undefined })
        const names = new Set(show.looks.map((l) => l.name))
        const name = names.has(base.name) ? nextName(base.name, names) : base.name
        const look = normaliseLook({ ...base, id: newId(name), name, follows: null })
        remember('paste')
        const i = show.looks.findIndex((l) => l.id === idOf(after))
        show.looks.splice(i < 0 ? show.looks.length : i + 1, 0, look)
        dirty = true
        return { ok: true, id: look.id }
    }

    /** The saved looks whose picture changed since the last Save (Save makes each a new scene), and the looks new since. */
    const changedIds = () => {
        const before = new Map(savedLooks.map((l) => [l.id, l]))
        return show.looks.filter((l) => before.has(l.id) && !samePicture(before.get(l.id), l)).map((l) => l.id)
    }
    const addedIds = () => {
        const before = new Set(savedLooks.map((l) => l.id))
        return show.looks.filter((l) => !before.has(l.id)).map((l) => l.id)
    }

    /**
     * Save (2026-10-30, the owner: "it will be saved like new scene"): a look whose picture changed since the last
     * Save becomes a NEW scene at the end of the bank ("Star 2", or the name it was given), and the look goes back to how
     * it was saved, so nothing saved is ever overwritten. A new name alone renames it in place; a copy made since the
     * last Save is kept as it is. The cubes play on: a look on them that became a new scene is that new scene now.
     * Then the bank, the clock and the setup go into desk.json.
     */
    const saveBank = () => {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
        const before = new Map(savedLooks.map((l) => [l.id, l]))
        const names = new Set(show.looks.map((l) => l.name))
        const ids = new Set(show.looks.map((l) => l.id))
        const kept = []
        const made = []
        const created = []
        for (const look of show.looks) {
            const was = before.get(look.id)
            if (!was || samePicture(was, look)) { kept.push(look); continue }
            const name = look.name !== was.name ? look.name : nextName(was.name, names)
            names.add(name)
            const id = freeId(name, ids)
            ids.add(id)
            kept.push(clone(was))
            made.push(normaliseLook({ ...look, id, name, follows: null })) // the new scene does not take the saved one's link
            created.push({ from: look.id, id })
        }
        if (kept.length + made.length > MAX_LOOKS) return { ok: false, status: 400, error: `the bank is full (${MAX_LOOKS} looks): delete some, then Save` }
        if (made.length) remember('save')
        show.looks = [...kept, ...made]
        const moved = created.find((c) => c.from === liveId)
        if (moved) liveId = moved.id
        commit()
        return saveNow() ? { ok: true, created } : { ok: false, status: 500, error: 'desk.json could not be written (see the server log)', created }
    }

    /** Edit the live look (on the cubes at once). Refused when nothing is live: the defaults never reach a cube. */
    const editLive = (fields = {}) => {
        if (!live) return { ok: false, status: 409, error: 'nothing is live — press a look first' }
        const base = live
        live = normaliseLook({ ...withoutFollows(fields), id: undefined }, base)
        delete live.id
        tick()
        startTicking()
        return { ok: true }
    }

    const newId = (name) => freeId(name, new Set(show.looks.map((l) => l.id)))

    /**
     * Store a look: into `id` (its tile), or as a new tile when `id` is absent. The look is `look` when the page sends
     * one (its Preview, stored without going to the cubes), else the live look.
     */
    const store = ({ id, name, look: raw } = {}) => {
        const preview = raw && typeof raw === 'object' && !Array.isArray(raw)
        const from = preview ? normaliseLook({ ...raw, id: undefined }) : live
        if (!from) return { ok: false, status: 400, error: 'nothing is live to store — press a look first' }
        let stored
        if (id) {
            const i = show.looks.findIndex((l) => l.id === idOf(id))
            if (i < 0) return { ok: false, status: 404, error: `no look "${id}"` }
            show.looks[i] = normaliseLook({ ...from, id: show.looks[i].id, name: name ?? show.looks[i].name, follows: show.looks[i].follows })
            stored = show.looks[i].id
        } else {
            if (show.looks.length >= MAX_LOOKS) return { ok: false, status: 400, error: `the bank is full (${MAX_LOOKS} looks)` }
            const look = normaliseLook({ ...from, id: newId(name || from.name), name: name || from.name, follows: null })
            show.looks.push(look)
            stored = look.id
        }
        if (!preview) liveId = stored
        // Store writes the bank as it is (the look into its own tile), not as Save does.
        commit()
        save()
        return { ok: true, id: stored }
    }

    const rename = (id, name) => {
        const look = show.looks.find((l) => l.id === idOf(id))
        if (!look) return { ok: false, status: 404, error: `no look "${id}"` }
        remember('rename')
        look.name = String(name ?? '').trim().slice(0, 40) || look.name
        dirty = true
        return { ok: true }
    }

    const remove = (id) => {
        const i = show.looks.findIndex((l) => l.id === idOf(id))
        if (i < 0) return { ok: false, status: 404, error: `no look "${id}"` }
        remember('delete')
        show.looks.splice(i, 1)
        if (liveId === idOf(id)) liveId = null
        dirty = true
        return { ok: true }
    }

    const reorder = (ids = []) => {
        if (!Array.isArray(ids)) return { ok: false, status: 400, error: 'ids: the looks in their new order' }
        const rank = new Map(ids.map((id, i) => [idOf(id), i]))
        remember('order')
        show.looks.sort((a, b) => (rank.get(a.id) ?? 1e6) - (rank.get(b.id) ?? 1e6))
        dirty = true
        return { ok: true }
    }

    const setMaster = (level) => { show.master = clamp(num(level, show.master), 0, 1); save(); return { ok: true, master: show.master } }
    // `on` must be a boolean: a missing or unreadable one is refused, never a toggle that could light the cubes (review 1218 M1).
    const setBlackout = (on) => {
        if (typeof on !== 'boolean') return { ok: false, status: 400, error: 'on: true or false' }
        blackout = on
        if (!on) goSeq += 1
        // Blackout reaches the engine itself, whether the desk is released or another Out drives a cube (audit row 10): it
        // disarms every cube. The setting "Blackout keeps the arm" keeps the older desk blackout instead (dark, armed kept,
        // Shift+B brings it back at once); default off, the owner's choice for the show (D3, nothing we have is lost).
        // In keep-arm mode the engine is darkened too, every cube and every sender, the arm kept (review R5): the latch
        // holds until Blackout is lifted or the desk is released.
        if (on && !show.blackoutKeepsArm) { getEngine().blackout(); watchEngine() }
        else if (on) { getEngine().dark(true); engineDark = true }
        else liftEngineDark()
        tick()
        return { ok: true, blackout }
    }

    // A new tempo keeps the beat where it is (no jump in the picture); a tap lands the beat on the tap.
    const setBlackoutKeepsArm = (on) => {
        if (typeof on !== 'boolean') return { ok: false, status: 400, error: 'on: true or false' }
        show.blackoutKeepsArm = on
        save()
        return { ok: true, blackoutKeepsArm: on }
    }

    const setBpm = (bpm) => {
        const b = clamp(num(bpm, clock.bpm), BPM_MIN, BPM_MAX)
        const t = now()
        const beats = beatsAt(clock, t)
        clock.bpm = b
        clock.zero = t - (beats * 60000) / b
        show.bpm = Math.round(b * 10) / 10
        save()
        return { ok: true, bpm: show.bpm }
    }
    const tap = () => {
        const t = now()
        if (clock.taps.length && t - clock.taps[clock.taps.length - 1] > TAP_GAP_MS) clock.taps = []
        clock.taps.push(t)
        clock.taps = clock.taps.slice(-6)
        if (clock.taps.length >= 2) {
            const gaps = clock.taps.slice(1).map((v, i) => v - clock.taps[i])
            const bpm = clamp(60000 / (gaps.reduce((s, g) => s + g, 0) / gaps.length), BPM_MIN, BPM_MAX)
            clock.bpm = bpm
            show.bpm = Math.round(bpm * 10) / 10
            save()
        }
        clock.zero = t
        return { ok: true, bpm: show.bpm, taps: clock.taps.length }
    }

    const setCube = (id, fields = {}) => {
        const key = idOf(id)
        if (!key) return { ok: false, status: 400, error: 'which cube' }
        const known = getEngine().state().cubes.some((c) => c.id === key)
        if (!known) return { ok: false, status: 404, error: `no cube "${id}"` }
        const wasOn = cubeCfg(key).on
        let next
        try { next = normaliseCube(fields, cubeCfg(key), { strict: true }) } catch (error) {
            if (error instanceof RangeError) return { ok: false, status: 400, error: `cube ${key}: ${error.message}` }
            throw error
        }
        show.cubes[key] = next
        // Switched off on the desk: dark now, then the desk lets go of it.
        if (wasOn && !show.cubes[key].on && sent.has(key)) {
            if (!sent.get(key).held) getEngine().setFrame(key, [BLANK], OUT)
            sent.delete(key)
        }
        save()
        tick()
        return { ok: true, cube: show.cubes[key] }
    }

    /** A small picture of every look (first cube, at the beat's start), for the bank's tiles. */
    const thumbs = () => {
        const still = { bpm: clock.bpm, zero: 0 }
        return Object.fromEntries(show.looks.map((l) => {
            const pts = lookPointsAt({ ...l, points: Math.min(l.points, 240) }, { t: 0, clock: still, index: 0 })
            return [l.id, pts.map((p) => [round3(p[0]), round3(p[1]), round3(p[2]), round3(p[3]), round3(p[4])])]
        }))
    }

    /** What the engine holds for each cube right now (after the zone): the stage view. */
    const view = () => {
        const frames = getEngine().frames()
        const of = (id) => frames.byCube[id] ?? frames.all ?? null
        return {
            armed: frames.armed,
            sim: frames.sim,
            stopped: frames.stopped,
            cubes: Object.fromEntries(frames.cubes.map((id) => [id, (of(id) || []).map((p) => [round3(p[0]), round3(p[1]), round3(p[2]), round3(p[3]), round3(p[4])])]))
        }
    }

    const state = () => {
        const engine = getEngine().state()
        return {
            live,
            liveId,
            blackout,
            master: show.master,
            blackoutKeepsArm: show.blackoutKeepsArm,
            bpm: show.bpm,
            beat: beatsAt(clock, now()),
            looks: show.looks,
            shapes: LASER_SHAPES,
            defaults: LOOK_DEFAULTS,
            loadMessage,
            unsaved: dirty,
            changed: changedIds(),
            added: addedIds(),
            canUndo: past.length > 0,
            canRedo: future.length > 0,
            follow: followState(),
            cubes: orderedCubes(engine.cubes).map((c) => {
                const s = sent.get(c.id)
                const sending = Boolean(live && s && !s.held)
                // What the ENGINE plays decides `driving`, not what the desk sent: a stopped or disarmed cube is dark (D2).
                const plays = engine.sim || (c.armed && !c.stop)
                const lit = sending ? s.lit : 0
                const cut = sending ? s.offField + s.blanked : 0
                return {
                    id: c.id, ...cubeCfg(c.id),
                    // `driving` is true only while something is LIT; a cube the desk feeds a dark picture is `dark` (rows 19, 24).
                    driving: lit > 0 && plays, dark: sending && (lit === 0 || !plays), engineDark: sending && lit > 0 && !plays ? (c.stop ? 'stopped' : 'off') : null, held: s?.held ?? null, points: s?.points ?? 0,
                    lit, blanked: sending ? s.blanked : 0, offField: sending ? s.offField : 0,
                    offPercent: sending && s.source > 0 ? Math.min(100, Math.round((100 * cut) / s.source)) : 0
                }
            })
        }
    }

    // ---- Follow the light desk (2026-10-31, the owner: "one scene drives both"; sceneLink.js has the rules)
    const lightScenes = () => {
        try {
            const list = scenesOfLight ? scenesOfLight() : []
            return Array.isArray(list) ? list.map((s) => ({ id: sceneIdOf(s?.id), name: String(s?.name ?? '').slice(0, 80) })).filter((s) => s.id) : []
        } catch { return [] }
    }
    // A link is a setting of the desk, written in the bank AND in what was last saved: never an unsaved change, never a new scene at Save.
    const writeFollows = (id, scene) => {
        for (const list of [show.looks, savedLooks]) { const l = list.find((x) => x.id === id); if (l) l.follows = scene }
        if (live && liveId === id) live.follows = scene
    }
    const fillFollows = () => {
        const found = fillLinks(show.looks, lightScenes())
        for (const f of found) writeFollows(f.look, f.scene)
        if (found.length) save()
        return found
    }
    const setFollowLight = (on) => {
        if (typeof on !== 'boolean') return { ok: false, status: 400, error: 'on: true or false' }
        show.followLight = on
        const filled = on ? fillFollows().length : 0
        save()
        return { ok: true, followLight: on, filled }
    }
    const setFollows = (id, scene) => { // one scene, one look; '' = none (never refilled)
        const look = show.looks.find((l) => l.id === idOf(id))
        if (!look) return { ok: false, status: 404, error: `no look "${id}"` }
        if (typeof scene !== 'string') return { ok: false, status: 400, error: 'scene: the id of a light scene, or "" for none' }
        const want = sceneIdOf(scene)
        const moved = []
        if (want) for (const other of show.looks) if (other.id !== look.id && other.follows === want) { writeFollows(other.id, ''); moved.push(other.id) }
        writeFollows(look.id, want)
        save()
        return { ok: true, id: look.id, follows: want, moved }
    }
    // A light scene became active (sceneLink.js linkLightToLaser): the look that follows it goes live, and that is all.
    // No arm, no Go (putLive person: false), no Blackout lifted, Master and BPM untouched. A person's Release does not pause
    // it (the lead, 2026-10-31): Release switched the cubes off, and nothing reaches a cube until a person presses On.
    const followScene = (scene) => { // scene = { id, name, origin }
        if (!show.followLight) return { ok: true, followed: false, why: 'off' }
        const id = sceneIdOf(scene?.id)
        const name = String(scene?.name ?? '').slice(0, 80)
        const miss = (why) => { lastFollow = { scene: { id, name }, look: null, name: null, why, at: now() }; return { ok: true, followed: false, why } }
        // The hand is checked again here (sceneLink.js refuses first): only di's own page or the local token move the live look.
        if (!mayDrive(scene?.origin)) return miss('origin')
        if (!id) return miss('no scene')
        let look = show.looks.find((l) => l.follows === id)
        if (!look) { fillFollows(); look = show.looks.find((l) => l.follows === id) }
        if (!look) return miss('no look')
        // The look already live stays as it is (a change made to it live is kept).
        if (!(live && liveId === look.id)) putLive(look, { person: false })
        lastFollow = { scene: { id, name }, look: look.id, name: look.name, why: null, at: now() }
        return { ok: true, followed: true, look: look.id }
    }
    // What a recall would follow now, for the light desk's page: the links set, and those the first fill would set
    // (shown, not written: a GET writes nothing).
    const followMap = () => {
        const links = {}
        if (!show.followLight) return { ok: true, on: false, links }
        const fill = new Map(fillLinks(show.looks, lightScenes()).map((f) => [f.look, f.scene]))
        for (const l of show.looks) {
            const scene = l.follows || fill.get(l.id)
            if (scene && !links[scene]) links[scene] = { look: l.id, name: l.name }
        }
        return { ok: true, on: true, links }
    }
    const followState = () => ({ on: show.followLight, scenes: lightScenes(), last: lastFollow })

    // A clean stop keeps the work as Save would.
    const close = () => {
        release()
        if (dirty) saveBank()
        else if (saveTimer) { clearTimeout(saveTimer); saveNow() }
    }

    return { state, go, editLook, copyLook, pasteLook, undo, redo, saveBank, editLive, store, rename, remove, reorder, release, setMaster, setBlackout, setBlackoutKeepsArm, setBpm, tap, setCube, thumbs, view, tick, close, setFollowLight, setFollows, followScene, followMap }
}

module.exports = { createLaserDesk, normaliseLook, normaliseCube, lookPointsAt, capOf, hashPoints, beatsAt, SEED_LOOKS, LOOK_DEFAULTS, CUBE_DEFAULTS, TICK_MS, OUT }
