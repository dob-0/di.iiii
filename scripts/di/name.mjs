/**
 * A name for the room to type.
 *
 * `di up --lan` prints a list of IPv4 addresses, which is the truth and is also
 * the thing nobody wants to read out loud to a room of people holding phones.
 * mDNS already solves this on every phone in that room: publish `di.local` and
 * they type a word.
 *
 * avahi-publish does it as an ordinary user — no root, no /etc, nothing left
 * behind — for exactly as long as the process lives, which is why its pid sits
 * beside the server's and `di down` ends both. A machine without avahi (macOS
 * publishes its own name already, Windows has none) simply keeps the addresses:
 * this is a nicety, never a dependency.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'

import { paths } from './paths.mjs'

export const MDNS_NAME = 'di.local'

const readPid = (home) => {
    try { return Number(fs.readFileSync(paths(home).namePidFile, 'utf8').trim()) } catch { return 0 }
}

const alive = (pid) => {
    if (!pid) return false
    try { process.kill(pid, 0); return true } catch { return false }
}

/**
 * Publish `di.local` for one address. Returns the name, or null when the
 * machine cannot publish one — the caller prints addresses either way.
 */
export const publishName = async (home, address, { name = MDNS_NAME } = {}) => {
    if (!address) return null
    await stopName(home)
    try {
        const child = spawn('avahi-publish', ['-a', '-R', name, address], {
            detached: true,
            stdio: 'ignore'
        })
        child.unref()
        if (!child.pid) return null
        await fsp.mkdir(paths(home).run, { recursive: true })
        await fsp.writeFile(paths(home).namePidFile, String(child.pid))
        // avahi-publish exits within a moment if the name is taken or the
        // daemon is not there; anything still alive after that has the name.
        await new Promise((resolve) => { setTimeout(resolve, 700) })
        if (!alive(child.pid)) {
            await fsp.rm(paths(home).namePidFile, { force: true })
            return null
        }
        return name
    } catch {
        return null
    }
}

export const stopName = async (home) => {
    const pid = readPid(home)
    if (alive(pid)) {
        try { process.kill(pid, 'SIGTERM') } catch { /* already gone */ }
    }
    await fsp.rm(paths(home).namePidFile, { force: true })
}
