#!/usr/bin/env node
// Writes src/shared/lampDmx.js (the browser's ESM twin) from shared/lampDmx.cjs, so the two cannot drift: one
// source, one command — the laser frame's arrangement (scripts/laser/laser-frame-twin.mjs). `--check` exits 1 if
// the twin on disk differs (src/shared/lampDmx.test.js runs the same comparison).
// Usage: node scripts/rigbuild/lamp-dmx-twin.mjs [--check]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SOURCE = path.join(root, 'shared/lampDmx.cjs')
const TWIN = path.join(root, 'src/shared/lampDmx.js')

export const buildTwin = (cjs) => {
    const body = cjs
        .replace(/^'use strict'\n/m, '')
        .replace(/module\.exports = \{([\s\S]*?)\}\n?$/m, (_, names) => `export {${names}}\n`)
    return '// GENERATED from shared/lampDmx.cjs by scripts/rigbuild/lamp-dmx-twin.mjs — edit the .cjs, then run it.\n' + body
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const twin = buildTwin(fs.readFileSync(SOURCE, 'utf8'))
    if (process.argv.includes('--check')) {
        const same = fs.readFileSync(TWIN, 'utf8') === twin
        console.log(same ? 'lampDmx twin: in step' : 'lampDmx twin: DIFFERS — run node scripts/rigbuild/lamp-dmx-twin.mjs')
        process.exit(same ? 0 : 1)
    }
    fs.writeFileSync(TWIN, twin)
    console.log(`wrote ${path.relative(root, TWIN)}`)
}
