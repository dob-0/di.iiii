#!/usr/bin/env node
// Writes src/shared/laserFrame.js (the browser's ESM twin) from shared/laserFrame.cjs, so the two cannot
// drift: one source, one command. `--check` exits 1 if the twin on disk differs (src/shared/laserFrame.test.js
// runs the same comparison).  Usage: node scripts/laser/laser-frame-twin.mjs [--check]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SOURCE = path.join(root, 'shared/laserFrame.cjs')
const TWIN = path.join(root, 'src/shared/laserFrame.js')

export const buildTwin = (cjs) => {
    const body = cjs
        .replace(/^'use strict'\n/m, '')
        .replace(/module\.exports = \{([\s\S]*?)\}\n?$/m, (_, names) => `export {${names}}\n`)
    return '// GENERATED from shared/laserFrame.cjs by scripts/laser/laser-frame-twin.mjs — edit the .cjs, then run it.\n' + body
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const twin = buildTwin(fs.readFileSync(SOURCE, 'utf8'))
    if (process.argv.includes('--check')) {
        const same = fs.readFileSync(TWIN, 'utf8') === twin
        console.log(same ? 'laserFrame twin: in step' : 'laserFrame twin: DIFFERS — run node scripts/laser/laser-frame-twin.mjs')
        process.exit(same ? 0 : 1)
    }
    fs.writeFileSync(TWIN, twin)
    console.log(`wrote ${path.relative(root, TWIN)}`)
}
