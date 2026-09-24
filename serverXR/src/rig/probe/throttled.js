// Raspberry Pi throttle state via `vcgencmd get_throttled`. Only ever run
// when a binary is actually there to run — a missing vcgencmd (any non-Pi
// machine) rejects immediately (ENOENT) and we report null, not a guess.
// Bit layout (Pi firmware): bit0 under-voltage now, bit16 under-voltage has
// happened since boot.
'use strict'

const EXEC_TIMEOUT_MS = 300

async function readThrottled(execFn) {
    if (typeof execFn !== 'function') return null

    let stdout = ''
    try {
        const result = await execFn('vcgencmd get_throttled', { timeout: EXEC_TIMEOUT_MS })
        stdout = (result && result.stdout) || ''
    } catch {
        return null
    }

    const m = /0x([0-9a-fA-F]+)/.exec(stdout)
    if (!m) return null

    const raw = `0x${m[1]}`
    const bits = parseInt(m[1], 16)
    const now = Boolean(bits & 0x1)
    const underVoltage = now || Boolean(bits & 0x10000)

    return { now, underVoltage, raw }
}

module.exports = { readThrottled }
