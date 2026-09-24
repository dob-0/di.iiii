// Screens: one entry per DRM connector under /sys/class/drm/card*-<connector>,
// connected or not — "no screen" is information, not something to hide.
'use strict'

const fs = require('fs')
const path = require('path')

function readScreens(fsRoot) {
    const drmDir = path.join(fsRoot, '/sys/class/drm')
    let entries = []
    try {
        entries = fs.readdirSync(drmDir)
    } catch {
        return []
    }

    const screens = []
    for (const entry of entries) {
        const m = /^card\d+-(.+)$/.exec(entry)
        if (!m) continue
        const name = m[1]
        const dir = path.join(drmDir, entry)

        let status = null
        try {
            status = fs.readFileSync(path.join(dir, 'status'), 'utf8').trim()
        } catch {
            // no status file — treat as unknown/disconnected
        }
        const connected = status === 'connected'

        let width = null
        let height = null
        if (connected) {
            try {
                const modes = fs.readFileSync(path.join(dir, 'modes'), 'utf8').trim()
                const first = modes.split('\n')[0] || ''
                const dims = /^(\d+)x(\d+)/.exec(first)
                if (dims) {
                    width = Number(dims[1])
                    height = Number(dims[2])
                }
            } catch {
                // no modes file — dimensions stay null
            }
        }

        screens.push({ name, connected, width, height })
    }

    screens.sort((a, b) => a.name.localeCompare(b.name))
    return screens
}

module.exports = { readScreens }
