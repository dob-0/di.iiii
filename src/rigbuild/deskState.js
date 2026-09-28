// What the rig views say about the desk on this machine: is one here, is its output on,
// and is a console driving it. Read from the desk's own routes (GET /light/api/summary,
// GET /light/api/input — the latter from #599, Art-Net/sACN input), never assumed.
// The views used to print "console in: not on this build" as a fixed string, written
// before #599 landed; on a build that carries input that sentence was false.
import { useEffect, useState } from 'react'
import { lightingApiUrl, probeLightingDesk } from '../map/lightingLink.js'

/** One line for "console in", from GET /api/input's answer (null = the desk had no answer). */
export const consoleInWords = (input) => {
    if (input === undefined) return '…'
    if (!input || typeof input !== 'object') return 'not on this build'
    if (!input.config?.enabled) return 'off (Setup → Input)'
    return input.summary?.text || 'on'
}

// `ask: false` (the crew view, which asks the desk nothing) answers nothing.
export const useDeskState = ({ ask = true } = {}) => {
    const [desk, setDesk] = useState({ here: null, output: null, consoleIn: ask ? '…' : null })
    useEffect(() => {
        if (!ask) return undefined
        let alive = true
        ;(async () => {
            const here = await probeLightingDesk()
            let output = null
            let input = null
            if (here) {
                try {
                    const s = await (await fetch(lightingApiUrl('api/summary'))).json()
                    output = s?.output ? `${String(s.output.driver || 'out')} ${s.output.enabled ? 'ON' : 'OFF'}` : null
                } catch { output = null }
                try {
                    const r = await fetch(lightingApiUrl('api/input'))
                    input = r.ok ? await r.json() : null
                } catch { input = null }
            }
            if (alive) setDesk({ here, output, consoleIn: here ? consoleInWords(input) : 'no desk here' })
        })()
        return () => { alive = false }
    }, [ask])
    return desk
}
