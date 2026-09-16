// Memory (Linux path): MemTotal and MemTotal-MemAvailable from /proc/meminfo,
// in whole MB. MemAvailable is a better "used" estimate than MemFree (it
// accounts for reclaimable cache), and it's absent on very old kernels, so
// usedMb stays null there rather than being computed from the wrong field.
'use strict'

const fs = require('fs')
const path = require('path')

function readMem(fsRoot) {
    let text
    try {
        text = fs.readFileSync(path.join(fsRoot, '/proc/meminfo'), 'utf8')
    } catch {
        return { totalMb: null, usedMb: null }
    }

    const totalMatch = /^MemTotal:\s+(\d+)\s*kB/m.exec(text)
    if (!totalMatch) return { totalMb: null, usedMb: null }
    const totalKb = Number(totalMatch[1])
    const totalMb = Math.round(totalKb / 1024)

    const availMatch = /^MemAvailable:\s+(\d+)\s*kB/m.exec(text)
    let usedMb = null
    if (availMatch) {
        const availKb = Number(availMatch[1])
        usedMb = Math.round((totalKb - availKb) / 1024)
    }

    return { totalMb, usedMb }
}

module.exports = { readMem }
