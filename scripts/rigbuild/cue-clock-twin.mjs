#!/usr/bin/env node
// Writes src/shared/cueClock.js (the browser's ESM twin) from shared/cueClock.cjs, so the desk's cue
// runner, the show's clock and the Cue node run the same lines. `--check` exits 1 if the twin on disk
// differs (src/shared/cueClock.test.js runs the same comparison).
// Usage: node scripts/rigbuild/cue-clock-twin.mjs [--check]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SOURCE = path.join(root, 'shared/cueClock.cjs')
const TWIN = path.join(root, 'src/shared/cueClock.js')
// The light desk directory runs alone on the club machine and may require nothing outside itself
// (src/shared/waves.test.js), so it carries a verbatim copy of the source.
const DESK = path.join(root, 'serverXR/src/lighting/cueClock.js')
export const buildDeskCopy = (cjs) => '// COPY of shared/cueClock.cjs by scripts/rigbuild/cue-clock-twin.mjs — edit the .cjs, then run it (this directory must not require outside itself).\n' + cjs

export const buildTwin = (cjs) => {
    const body = cjs
        .replace(/^'use strict'\n/m, '')
        .replace(/module\.exports = \{([\s\S]*?)\}\n?$/m, (_, names) => `export {${names}}\n`)
    return '// GENERATED from shared/cueClock.cjs by scripts/rigbuild/cue-clock-twin.mjs — edit the .cjs, then run it.\n' + body
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const twin = buildTwin(fs.readFileSync(SOURCE, 'utf8'))
    if (process.argv.includes('--check')) {
        const same = fs.existsSync(TWIN) && fs.readFileSync(TWIN, 'utf8') === twin
            && fs.existsSync(DESK) && fs.readFileSync(DESK, 'utf8') === buildDeskCopy(fs.readFileSync(SOURCE, 'utf8'))
        console.log(same ? 'cueClock twin: in step' : 'cueClock twin: DIFFERS — run node scripts/rigbuild/cue-clock-twin.mjs')
        process.exit(same ? 0 : 1)
    }
    fs.writeFileSync(TWIN, twin)
    fs.writeFileSync(DESK, buildDeskCopy(fs.readFileSync(SOURCE, 'utf8')))
    console.log(`wrote ${path.relative(root, TWIN)}`)
}
