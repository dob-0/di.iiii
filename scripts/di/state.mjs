/**
 * The two small files under DI_HOME that survive between commands:
 * state.json (what is installed) and di.env (how it runs).
 *
 * Both are read defensively. A corrupt state file must degrade to "not
 * installed", never to a crash — an artist who cannot run `di doctor` because
 * `di doctor` throws has no way back.
 */

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

import { paths } from './paths.mjs'

export const DEFAULT_PORT = 4000

export const readState = (home) => {
    const p = paths(home)
    try {
        const parsed = JSON.parse(fs.readFileSync(p.state, 'utf8'))
        return (parsed && typeof parsed === 'object') ? parsed : {}
    } catch {
        return {}
    }
}

export const writeState = async (home, patch = {}) => {
    const p = paths(home)
    const next = { ...readState(home), ...patch }
    await fsp.mkdir(p.home, { recursive: true })
    await fsp.writeFile(p.state, `${JSON.stringify(next, null, 2)}\n`)
    return next
}

export const readEnv = (home) => {
    const p = paths(home)
    const out = {}
    let raw = ''
    try {
        raw = fs.readFileSync(p.env, 'utf8')
    } catch {
        return out
    }
    for (const line of raw.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eq = trimmed.indexOf('=')
        if (eq === -1) continue
        out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
    }
    return out
}

export const writeEnv = async (home, patch = {}) => {
    const p = paths(home)
    const next = { ...readEnv(home), ...patch }
    const body = Object.entries(next)
        .filter(([, value]) => value !== null && value !== undefined)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n')
    await fsp.mkdir(p.home, { recursive: true })
    await fsp.writeFile(p.env, `${body}\n`)
    return next
}

export const resolvePort = (home, override) => {
    const fromFlag = Number(override)
    if (Number.isFinite(fromFlag) && fromFlag > 0) return fromFlag
    const fromEnv = Number(readEnv(home).PORT)
    if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv
    return DEFAULT_PORT
}

export const localUrl = (port) => `http://localhost:${port}`

/** The installed version directory `current` points at, or null. */
export const currentVersionDir = (home) => {
    const p = paths(home)
    try {
        const stat = fs.statSync(p.current)
        if (!stat.isDirectory()) return null
        return fs.realpathSync(p.current)
    } catch {
        return null
    }
}

export const isInstalled = (home) => Boolean(currentVersionDir(home))

export const installedVersion = (home) => {
    const dir = currentVersionDir(home)
    if (!dir) return null
    return readState(home).version || path.basename(dir)
}

/** Directory size in bytes, best effort — used only to print a friendly total. */
export const dirSize = async (dir) => {
    let total = 0
    const walk = async (target) => {
        let entries = []
        try {
            entries = await fsp.readdir(target, { withFileTypes: true })
        } catch {
            return
        }
        for (const entry of entries) {
            const full = path.join(target, entry.name)
            if (entry.isDirectory()) {
                await walk(full)
            } else if (entry.isFile()) {
                try {
                    total += (await fsp.stat(full)).size
                } catch {
                    // a file that vanished mid-walk is not worth failing over
                }
            }
        }
    }
    await walk(dir)
    return total
}

export const humanSize = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    const value = bytes / (1024 ** exponent)
    return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`
}
