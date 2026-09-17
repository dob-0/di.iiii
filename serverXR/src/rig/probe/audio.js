// Audio ports: card names from /proc/asound/cards, device list from
// /proc/asound/pcm (one line per playback/capture-capable PCM device).
'use strict'

const fs = require('fs')
const path = require('path')

function readCardNames(fsRoot) {
    const names = new Map()
    let text
    try {
        text = fs.readFileSync(path.join(fsRoot, '/proc/asound/cards'), 'utf8')
    } catch {
        return names
    }
    // " 0 [PCH             ]: HDA-Intel - HDA Intel PCH"
    const re = /^\s*(\d+)\s+\[.*?\]:\s*\S+\s*-\s*(.+)$/gm
    let m
    while ((m = re.exec(text))) {
        names.set(Number(m[1]), m[2].trim())
    }
    return names
}

function readPcmLines(fsRoot) {
    let text
    try {
        text = fs.readFileSync(path.join(fsRoot, '/proc/asound/pcm'), 'utf8')
    } catch {
        return []
    }
    const lines = []
    for (const raw of text.split('\n')) {
        const line = raw.trim()
        if (!line) continue
        // "00-03: HDMI 0 : Optoma 1080P : playback 1"
        const m = /^(\d+)-(\d+):\s*(.+)$/.exec(line)
        if (!m) continue
        const cardIndex = Number(m[1])
        const rest = m[3].split(':').map((s) => s.trim())
        const id = rest[0] || null
        const name = rest[1] || id
        const hasPlayback = rest.slice(2).some((s) => /^playback/i.test(s))
        const hasCapture = rest.slice(2).some((s) => /^capture/i.test(s))
        lines.push({ cardIndex, id, name, hasPlayback, hasCapture })
    }
    return lines
}

function readAudio(fsRoot) {
    const cardNames = readCardNames(fsRoot)
    const pcms = readPcmLines(fsRoot)
    const audioOut = []
    const audioIn = []
    for (const pcm of pcms) {
        const cardName = cardNames.get(pcm.cardIndex)
        const label = cardName ? `${cardName}, ${pcm.name}` : pcm.name
        if (pcm.hasPlayback) audioOut.push({ name: label })
        if (pcm.hasCapture) audioIn.push({ name: label })
    }
    return { audioOut, audioIn }
}

module.exports = { readAudio }
