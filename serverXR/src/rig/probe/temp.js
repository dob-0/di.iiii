// Temperature: the highest reading across thermal zones and coretemp hwmon
// sensors, in degrees C. Millidegree files (the kernel's native unit) are
// divided down; null when nothing is readable, never a guess.
'use strict'

const fs = require('fs')
const path = require('path')

function readThermalZones(fsRoot) {
    const dir = path.join(fsRoot, '/sys/class/thermal')
    let entries = []
    try {
        entries = fs.readdirSync(dir)
    } catch {
        return []
    }

    const temps = []
    for (const entry of entries) {
        if (!/^thermal_zone\d+$/.test(entry)) continue
        try {
            const raw = fs.readFileSync(path.join(dir, entry, 'temp'), 'utf8').trim()
            const v = Number(raw)
            if (Number.isFinite(v)) temps.push(v)
        } catch {
            // unreadable zone — skip
        }
    }
    return temps
}

function readHwmonCoretemp(fsRoot) {
    const dir = path.join(fsRoot, '/sys/class/hwmon')
    let entries = []
    try {
        entries = fs.readdirSync(dir)
    } catch {
        return []
    }

    const temps = []
    for (const entry of entries) {
        const hwDir = path.join(dir, entry)
        let name = null
        try {
            name = fs.readFileSync(path.join(hwDir, 'name'), 'utf8').trim()
        } catch {
            continue
        }
        if (name !== 'coretemp') continue

        let files = []
        try {
            files = fs.readdirSync(hwDir)
        } catch {
            continue
        }
        for (const f of files) {
            if (!/^temp\d+_input$/.test(f)) continue
            try {
                const raw = fs.readFileSync(path.join(hwDir, f), 'utf8').trim()
                const v = Number(raw)
                if (Number.isFinite(v)) temps.push(v)
            } catch {
                // unreadable sensor — skip
            }
        }
    }
    return temps
}

function readTempC(fsRoot) {
    const milli = [...readThermalZones(fsRoot), ...readHwmonCoretemp(fsRoot)]
    if (milli.length === 0) return null
    return Math.max(...milli) / 1000
}

module.exports = { readTempC }
