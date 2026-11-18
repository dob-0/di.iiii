'use strict'
// The answers to "may this di address use your camera / microphone", kept in
// one small JSON file under userData: { "<origin>": { "camera": true, "microphone": false } }.
// Written atomically (temp file, then rename). No Electron import.

const nodeFs = require('node:fs')
const path = require('node:path')

const KINDS = Object.freeze(['camera', 'microphone'])

const createMediaStore = ({ file, fs = nodeFs }) => {
    let data = null
    const load = () => {
        if (data) return data
        try {
            const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
            data = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
        } catch {
            data = {}
        }
        return data
    }
    const save = () => {
        const tmp = `${file}.${process.pid}.tmp`
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 })
        fs.renameSync(tmp, file)
    }
    return {
        // true / false when answered, undefined when never asked.
        get: (origin, kind) => {
            const answer = Object.prototype.hasOwnProperty.call(load(), origin) ? load()[origin][kind] : undefined
            return typeof answer === 'boolean' ? answer : undefined
        },
        set: (origin, kind, value) => {
            if (!KINDS.includes(kind)) throw new Error(`unknown kind: ${kind}`)
            const all = load()
            all[origin] = { ...(Object.prototype.hasOwnProperty.call(all, origin) ? all[origin] : {}), [kind]: Boolean(value) }
            save()
        },
        clear: () => {
            data = {}
            save()
        }
    }
}

module.exports = { KINDS, createMediaStore }
