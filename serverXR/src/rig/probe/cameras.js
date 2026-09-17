// Cameras: /dev/video* nodes, named from /sys/class/video4linux/videoN/name.
// A physical camera can expose several nodes (capture, metadata, …) that
// share one sysfs "index" — only the index-0 node is reported so one camera
// is one entry.
'use strict'

const fs = require('fs')
const path = require('path')

function readCameras(fsRoot) {
    const devDir = path.join(fsRoot, '/dev')
    let entries = []
    try {
        entries = fs.readdirSync(devDir)
    } catch {
        return []
    }

    const cameras = []
    for (const entry of entries) {
        const m = /^video(\d+)$/.exec(entry)
        if (!m) continue
        const n = m[1]
        const sysDir = path.join(fsRoot, '/sys/class/video4linux', `video${n}`)

        let index = '0'
        try {
            index = fs.readFileSync(path.join(sysDir, 'index'), 'utf8').trim()
        } catch {
            // no index file — single-node devices default to index 0
        }
        if (index !== '0') continue

        let name = null
        try {
            name = fs.readFileSync(path.join(sysDir, 'name'), 'utf8').trim()
        } catch {
            // name unknown — stays null, never guessed
        }

        cameras.push({ name, path: `/dev/video${n}` })
    }

    cameras.sort((a, b) => a.path.localeCompare(b.path))
    return cameras
}

module.exports = { readCameras }
