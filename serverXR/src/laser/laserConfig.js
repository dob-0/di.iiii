// WRITE laser.json FROM THE PANEL — the cubes picked in Laser Out's "Find cubes" (2026-10-14).
//
// The engine reads <dataDir>/laser/laser.json (laserEngine.js, its header has the format). This
// writes it, so nobody edits JSON by hand at a jam:
//   - IDS ARE KEPT BY SERIAL. A cube the file already holds with the same serial keeps its id (and
//     its officer-approved stillBeams), so a new DHCP address never renames it and a graph's
//     "cube-2" keeps meaning the same box. A cube in the file without a serial yet (written by hand)
//     is matched once by its address and gets the serial from then on. A new cube takes the lowest
//     free cube-N.
//   - What the file says besides the cubes (zone, dacRate) is kept as it is.
//   - The write is atomic (a temp file, then rename) and the file before it is kept beside it as
//     laser.json.prev — the one-step undo.
'use strict'

const fs = require('fs')
const path = require('path')
const { isIPv4 } = require('./laserFind')

const MAX_CUBES = 16
const MAX_NAME = 40
const SERIAL = /^[0-9a-f]{12}$/

const readRaw = (dir) => {
    try {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, 'laser.json'), 'utf8'))
        return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    } catch {
        return {}
    }
}

// Printable only: control characters (code points below 0x20, and 0x7f) are dropped.
const cleanName = (s) => [...String(s ?? '')].filter((ch) => ch.codePointAt(0) >= 0x20 && ch.codePointAt(0) !== 0x7f).join('').trim().slice(0, MAX_NAME)

/**
 * The picked cubes checked: each { serial, ip, name }. Pure.
 * @returns {{ ok: true, picked: object[] } | { ok: false, error: string }}
 */
const validatePicked = (cubes) => {
    if (!Array.isArray(cubes) || cubes.length === 0) return { ok: false, error: 'pick at least one cube' }
    if (cubes.length > MAX_CUBES) return { ok: false, error: `at most ${MAX_CUBES} cubes` }
    const picked = []
    const serials = new Set()
    const ips = new Set()
    for (const [i, c] of cubes.entries()) {
        const serial = String(c?.serial ?? '').toLowerCase()
        const ip = String(c?.ip ?? '')
        if (!SERIAL.test(serial)) return { ok: false, error: `cube ${i + 1}: the serial must be the 12 hex digits the cube answered with` }
        if (!isIPv4(ip)) return { ok: false, error: `cube ${i + 1}: "${ip}" is not an IPv4 address` }
        if (serials.has(serial)) return { ok: false, error: `the serial ${serial} is picked twice` }
        if (ips.has(ip)) return { ok: false, error: `the address ${ip} is picked twice` }
        serials.add(serial)
        ips.add(ip)
        picked.push({ serial, ip, name: cleanName(c?.name) })
    }
    return { ok: true, picked }
}

/**
 * The new file's content: the existing file with its cubes replaced by the picked ones, ids kept by
 * serial (then by address for a cube without a serial). Pure.
 */
const mergeConfig = (existing, picked) => {
    const old = Array.isArray(existing?.cubes) ? existing.cubes.filter((c) => c && typeof c === 'object') : []
    const used = new Set()
    const claimed = new Set()
    const matchOf = (p) => {
        const bySerial = old.find((c) => !claimed.has(c) && String(c.serial || '').toLowerCase() === p.serial)
        if (bySerial) return bySerial
        return old.find((c) => !claimed.has(c) && !c.serial && c.ip === p.ip) || null
    }
    const matches = picked.map((p) => {
        const m = matchOf(p)
        if (m) { claimed.add(m); if (m.id) used.add(String(m.id)) }
        return m
    })
    const nextId = () => {
        let n = 1
        while (used.has(`cube-${n}`)) n += 1
        used.add(`cube-${n}`)
        return `cube-${n}`
    }
    const cubes = picked.map((p, i) => {
        const m = matches[i]
        const id = m?.id ? String(m.id) : nextId()
        const cube = { id, name: p.name || cleanName(m?.name) || id, ip: p.ip, serial: p.serial }
        if (Array.isArray(m?.stillBeams) && m.stillBeams.length) cube.stillBeams = m.stillBeams
        return cube
    })
    return { ...existing, cubes }
}

/** Write <dir>/laser.json atomically, keeping the previous file as laser.json.prev. */
const writeConfig = (dir, config) => {
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, 'laser.json')
    if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.prev`)
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`)
    fs.renameSync(tmp, file)
    return file
}

/** Validate, merge with what is there, write. @returns {{ ok, config?, file?, error? }} */
const saveCubes = (dir, cubes) => {
    const checked = validatePicked(cubes)
    if (!checked.ok) return checked
    const config = mergeConfig(readRaw(dir), checked.picked)
    const file = writeConfig(dir, config)
    return { ok: true, config, file }
}

module.exports = { saveCubes, mergeConfig, validatePicked, readRaw, writeConfig, MAX_CUBES }
