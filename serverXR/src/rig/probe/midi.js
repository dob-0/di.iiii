// MIDI ports: prefer /proc/asound/seq/clients (one line per client, "User"
// clients are real hardware/software ports; "Kernel" ones like "System" and
// "Midi Through" are virtual). If the sequencer isn't present, fall back to
// noticing a midi* file under each /proc/asound/cardN directory.
'use strict'

const fs = require('fs')
const path = require('path')

function readFromClients(fsRoot) {
    let text
    try {
        text = fs.readFileSync(path.join(fsRoot, '/proc/asound/seq/clients'), 'utf8')
    } catch {
        return null
    }
    const midi = []
    const re = /^Client\s+\d+\s*:\s*"([^"]+)"\s*\[(Kernel|User)\]/gm
    let m
    while ((m = re.exec(text))) {
        if (m[2] === 'User') midi.push({ name: m[1] })
    }
    return midi
}

function readFromCards(fsRoot) {
    const asoundDir = path.join(fsRoot, '/proc/asound')
    let entries = []
    try {
        entries = fs.readdirSync(asoundDir)
    } catch {
        return []
    }

    const midi = []
    for (const entry of entries) {
        if (!/^card\d+$/.test(entry)) continue
        const cardDir = path.join(asoundDir, entry)
        let files = []
        try {
            files = fs.readdirSync(cardDir)
        } catch {
            continue
        }
        if (!files.some((f) => /^midi/.test(f))) continue

        let name = null
        try {
            name = fs.readFileSync(path.join(cardDir, 'id'), 'utf8').trim()
        } catch {
            // stays null
        }
        midi.push({ name })
    }
    return midi
}

function readMidi(fsRoot) {
    const fromClients = readFromClients(fsRoot)
    if (fromClients !== null) return fromClients
    return readFromCards(fsRoot)
}

module.exports = { readMidi }
