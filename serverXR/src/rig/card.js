// Lane B — the card: this machine's own hardware snapshot for GET /api/rig/card
// (protocol §2.2). Every probe is tolerant: a field this platform can't read
// comes back null or [], never missing and never guessed. See
// docs/architecture/rig/PROTOCOL-1.md §2.2 and §7 for the frozen shape.
'use strict'

const { promisify } = require('util')
const cp = require('child_process')

const { readScreens } = require('./probe/screens')
const { readAudio } = require('./probe/audio')
const { readCameras } = require('./probe/cameras')
const { readSerial } = require('./probe/serial')
const { readMidi } = require('./probe/midi')
const { readNet } = require('./probe/net')
const { readTempC } = require('./probe/temp')
const { readMem } = require('./probe/mem')
const { createCpuProbe } = require('./probe/cpu')
const { readThrottled } = require('./probe/throttled')

const CACHE_MS = 2000

const defaultExec = promisify(cp.exec)

function safeCall(fn, fallback) {
    try {
        return fn()
    } catch {
        return fallback
    }
}

function describeReason({ cores, memTotalMb, hasScreen }) {
    const coresPart = cores != null ? `${cores} core${cores === 1 ? '' : 's'}` : 'unknown cores'
    const memPart = memTotalMb != null ? `${(memTotalMb / 1024).toFixed(1)} GB` : 'unknown memory'
    const screenPart = hasScreen ? 'a screen connected' : 'no screen connected'
    return `${coresPart}, ${memPart}, ${screenPart}`
}

function decidePart({ env, hasScreen, memTotalMb, cores }) {
    const override = env && env.DI_PART
    if (override === 'studio' || override === 'stage' || override === 'hands') {
        return { part: override, partReason: 'set by DI_PART' }
    }

    const partReason = describeReason({ cores, memTotalMb, hasScreen })

    if (!hasScreen && memTotalMb != null && memTotalMb <= 2048) {
        return { part: 'hands', partReason }
    }
    if ((memTotalMb != null && memTotalMb <= 6144) || (cores != null && cores <= 2)) {
        return { part: 'stage', partReason }
    }
    return { part: 'studio', partReason }
}

async function readLinuxSnapshot({ fsRoot, os, execFn, cpuProbe }) {
    const audio = safeCall(() => readAudio(fsRoot), { audioOut: [], audioIn: [] })
    const ports = {
        screens: safeCall(() => readScreens(fsRoot), []),
        audioOut: audio.audioOut,
        audioIn: audio.audioIn,
        cameras: safeCall(() => readCameras(fsRoot), []),
        serial: safeCall(() => readSerial(fsRoot), []),
        midi: safeCall(() => readMidi(fsRoot), []),
        net: safeCall(() => readNet(fsRoot, os, { detectWireless: true }), [])
    }

    const mem = safeCall(() => readMem(fsRoot), { totalMb: null, usedMb: null })

    let cpuPct = null
    try {
        cpuPct = await cpuProbe.readLinux(fsRoot)
    } catch {
        cpuPct = null
    }

    let throttled = null
    try {
        throttled = await readThrottled(execFn)
    } catch {
        throttled = null
    }

    const health = {
        tempC: safeCall(() => readTempC(fsRoot), null),
        cpuPct,
        memUsedMb: mem.usedMb,
        memTotalMb: mem.totalMb,
        throttled,
        uptimeS: safeCall(() => Math.floor(os.uptime()), null)
    }

    return { ports, health }
}

async function readOtherPlatformSnapshot({ os, cpuProbe }) {
    const ports = {
        screens: [],
        audioOut: [],
        audioIn: [],
        cameras: [],
        serial: [],
        midi: [],
        net: safeCall(() => readNet('/', os, { detectWireless: false }), [])
    }

    let totalMb = null
    let usedMb = null
    try {
        const total = os.totalmem()
        const free = os.freemem()
        totalMb = Math.round(total / (1024 * 1024))
        usedMb = Math.round((total - free) / (1024 * 1024))
    } catch {
        // stay null
    }

    let cpuPct = null
    try {
        cpuPct = await cpuProbe.readOs(os)
    } catch {
        cpuPct = null
    }

    const health = {
        tempC: null,
        cpuPct,
        memUsedMb: usedMb,
        memTotalMb: totalMb,
        throttled: null,
        uptimeS: safeCall(() => Math.floor(os.uptime()), null)
    }

    return { ports, health }
}

function createCardSource({ env = process.env, fsRoot = '/', exec, os = require('os') } = {}) {
    const execFn = typeof exec === 'function' ? exec : defaultExec
    const cpuProbe = createCpuProbe()

    let cached = null // { at, value }
    let pending = null

    async function computeRead() {
        const platform = safeCall(() => os.platform(), 'unknown')
        const isLinux = platform === 'linux'

        const { ports, health } = isLinux
            ? await readLinuxSnapshot({ fsRoot, os, execFn, cpuProbe })
            : await readOtherPlatformSnapshot({ os, cpuProbe })

        const hasScreen = ports.screens.some((s) => s && s.connected === true)
        const cores = safeCall(() => (os.cpus() || []).length, null)
        const { part, partReason } = decidePart({ env, hasScreen, memTotalMb: health.memTotalMb, cores })

        const shows = [{ output: null, url: (env && env.DI_KIOSK_URL) || null }]

        return { part, partReason, ports, health, shows }
    }

    async function read() {
        const now = Date.now()
        if (cached && now - cached.at < CACHE_MS) {
            return cached.value
        }
        if (pending) return pending

        pending = computeRead()
            .then((value) => {
                cached = { at: Date.now(), value }
                pending = null
                return value
            })
            .catch((err) => {
                pending = null
                // Never throw out of the card source — fall back to an honest
                // all-unknown snapshot rather than surface an internal error.
                const fallback = {
                    part: 'studio',
                    partReason: 'unknown cores, unknown memory, no screen connected',
                    ports: { screens: [], audioOut: [], audioIn: [], cameras: [], serial: [], midi: [], net: [] },
                    health: { tempC: null, cpuPct: null, memUsedMb: null, memTotalMb: null, throttled: null, uptimeS: null },
                    shows: [{ output: null, url: null }]
                }
                cached = { at: Date.now(), value: fallback }
                return fallback
            })
        return pending
    }

    return { read }
}

module.exports = { createCardSource }
