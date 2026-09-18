// CPU load: a percentage from two samples of cumulative jiffies (Linux
// /proc/stat) or os.cpus() times. Each createCpuProbe() instance remembers
// its last sample, so most read()s just diff against the previous call — no
// need to block. Only the very first read (nothing to diff against yet)
// pays a real ~150ms pause.
'use strict'

const fs = require('fs')
const path = require('path')

const SAMPLE_GAP_MS = 150
const MIN_REUSE_GAP_MS = 50

function pctFromSamples(a, b) {
    const dTotal = b.total - a.total
    const dIdle = b.idle - a.idle
    if (dTotal <= 0) return 0
    const pct = (1 - dIdle / dTotal) * 100
    return Math.max(0, Math.min(100, Math.round(pct)))
}

function readProcStatSample(fsRoot) {
    let text
    try {
        text = fs.readFileSync(path.join(fsRoot, '/proc/stat'), 'utf8')
    } catch {
        return null
    }
    const line = text.split('\n')[0] || ''
    const m = /^cpu\s+(.+)$/.exec(line)
    if (!m) return null
    const parts = m[1].trim().split(/\s+/).map(Number)
    if (parts.length === 0 || parts.some((n) => !Number.isFinite(n))) return null
    const idle = (parts[3] || 0) + (parts[4] || 0)
    const total = parts.reduce((a, b) => a + b, 0)
    return { idle, total }
}

function osTimesSample(os) {
    const cpus = os.cpus() || []
    let idle = 0
    let total = 0
    for (const c of cpus) {
        const t = c.times
        idle += t.idle
        total += t.user + t.nice + t.sys + t.idle + t.irq
    }
    return { idle, total }
}

function createCpuProbe() {
    let prevProc = null // { sample, at }
    let prevOs = null

    async function readLinux(fsRoot) {
        const sample = readProcStatSample(fsRoot)
        if (!sample) return null
        const now = Date.now()
        if (prevProc && now - prevProc.at >= MIN_REUSE_GAP_MS) {
            const pct = pctFromSamples(prevProc.sample, sample)
            prevProc = { sample, at: now }
            return pct
        }
        await new Promise((resolve) => setTimeout(resolve, SAMPLE_GAP_MS))
        const sample2 = readProcStatSample(fsRoot)
        if (!sample2) return null
        const pct = pctFromSamples(sample, sample2)
        prevProc = { sample: sample2, at: Date.now() }
        return pct
    }

    async function readOs(os) {
        let sample
        try {
            sample = osTimesSample(os)
        } catch {
            return null
        }
        const now = Date.now()
        if (prevOs && now - prevOs.at >= MIN_REUSE_GAP_MS) {
            const pct = pctFromSamples(prevOs.sample, sample)
            prevOs = { sample, at: now }
            return pct
        }
        await new Promise((resolve) => setTimeout(resolve, SAMPLE_GAP_MS))
        let sample2
        try {
            sample2 = osTimesSample(os)
        } catch {
            return null
        }
        const pct = pctFromSamples(sample, sample2)
        prevOs = { sample: sample2, at: Date.now() }
        return pct
    }

    return { readLinux, readOs }
}

module.exports = { createCpuProbe, pctFromSamples, readProcStatSample }
