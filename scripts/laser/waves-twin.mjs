#!/usr/bin/env node
// Writes src/shared/waves.js (the browser's ESM twin) from serverXR/src/lighting/waves.js, so the light
// desk and the Nodes Oscillator run one wave module: one source, one command. `--check` exits 1 if the twin
// on disk differs (src/shared/waves.test.js runs the same comparison).
// Why a generated twin and not an import of the .cjs: Vite 8's dev server serves a .cjs outside node_modules
// untouched (module.exports, no ESM export), so a named import of it fails in the browser; only `vite build`
// converts it. Measured 2026-10-21 on shared/laserFrame.cjs; the same reason scripts/laser/laser-frame-twin.mjs exists.
//   Usage: node scripts/laser/waves-twin.mjs [--check]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SOURCE = path.join(root, 'serverXR/src/lighting/waves.js')
const TWIN = path.join(root, 'src/shared/waves.js')

export const buildTwin = (cjs) => {
    const body = cjs
        .replace(/^'use strict';\n/m, '')
        .replace(/module\.exports = \{([\s\S]*?)\};\n?$/m, (_, names) => `export {${names}};\n`)
    return '// GENERATED from serverXR/src/lighting/waves.js by scripts/laser/waves-twin.mjs — edit the source, then run it.\n' + body
}

export const readTwinPair = () => ({
    expected: buildTwin(fs.readFileSync(SOURCE, 'utf8')),
    actual: fs.existsSync(TWIN) ? fs.readFileSync(TWIN, 'utf8') : null
})

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const { expected, actual } = readTwinPair()
    if (process.argv.includes('--check')) {
        const same = actual === expected
        console.log(same ? 'waves twin: in step' : 'waves twin: DIFFERS — run node scripts/laser/waves-twin.mjs')
        process.exit(same ? 0 : 1)
    }
    fs.writeFileSync(TWIN, expected)
    console.log(`wrote ${path.relative(root, TWIN)}`)
}
