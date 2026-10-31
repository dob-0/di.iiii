#!/usr/bin/env node
// Writes the browser's ESM twins from their CommonJS sources in shared/, so the two cannot drift: one source, one
// command. src/shared/laserFrame.js from shared/laserFrame.cjs, and (2026-10-29, the laser desk) src/shared/laserShapes.js
// from shared/laserShapes.cjs — the Laser node's shapes, which the desk on the server draws too. `--check` exits 1 if a
// twin on disk differs (src/shared/laserFrame.test.js and laserShapes.test.js run the same comparison).
// Usage: node scripts/laser/laser-frame-twin.mjs [--check]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const TWINS = [
    { name: 'laserFrame', source: 'shared/laserFrame.cjs', twin: 'src/shared/laserFrame.js' },
    { name: 'laserShapes', source: 'shared/laserShapes.cjs', twin: 'src/shared/laserShapes.js' },
]

// A Windows checkout (core.autocrlf) reads CRLF; the twin is built from the LF text git stores.
const lf = (text) => text.replace(/\r\n/g, '\n')

export const buildTwin = (cjs, name = 'laserFrame') => {
    const body = lf(cjs)
        .replace(/^'use strict'\n/m, '')
        // A twin needs a twin: require('./x.cjs') in shared/ is import from './x.js' in src/shared/.
        .replace(/^const \{([^}]*)\} = require\('\.\/(\w+)\.cjs'\)$/gm, (_, names, file) => `import {${names}} from './${file}.js'`)
        .replace(/module\.exports = \{([\s\S]*?)\}\n?$/m, (_, names) => `export {${names}}\n`)
    return `// GENERATED from shared/${name}.cjs by scripts/laser/laser-frame-twin.mjs — edit the .cjs, then run it.\n` + body
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    let differs = false
    for (const { name, source, twin: target } of TWINS) {
        const twin = buildTwin(fs.readFileSync(path.join(root, source), 'utf8'), name)
        if (process.argv.includes('--check')) {
            const same = lf(fs.readFileSync(path.join(root, target), 'utf8')) === twin
            console.log(same ? `${name} twin: in step` : `${name} twin: DIFFERS — run node scripts/laser/laser-frame-twin.mjs`)
            differs ||= !same
            continue
        }
        fs.writeFileSync(path.join(root, target), twin)
        console.log(`wrote ${target}`)
    }
    if (differs) process.exit(1)
}
