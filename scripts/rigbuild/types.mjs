#!/usr/bin/env node
/**
 * types.mjs — write a fixture-type library from a sourced fixtures manifest.
 * docs/architecture/RIG_BUILD.md §2.1.
 *
 *   node scripts/rigbuild/types.mjs                      # MOXIR: fixtures.json -> src/rigbuild/types/moxir.json
 *   node scripts/rigbuild/types.mjs --manifest <file> --out <file> [--glb-dir <dir>]
 *   node scripts/rigbuild/types.mjs --check              # exit 1 if the committed file is stale
 *
 * The output is generated, never edited by hand; src/rigbuild/fixtureTypes.test.js
 * regenerates it and compares.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { typesFromManifest } from '../../src/rigbuild/fixtureTypes.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2)
const opt = (name, fallback) => {
    const i = args.indexOf(`--${name}`)
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

export const buildLibrary = ({
    manifest = 'scripts/place/fixtures/fixtures.json',
    glbDir = 'scripts/place/fixtures/glb'
} = {}) => {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, manifest), 'utf8'))
    const sidecars = {}
    for (const kind of Object.keys(data.kinds || {})) {
        const file = path.join(ROOT, glbDir, `${kind}.json`)
        if (fs.existsSync(file)) sidecars[kind] = JSON.parse(fs.readFileSync(file, 'utf8'))
    }
    return typesFromManifest(data, { manifestFile: manifest, glbDir, sidecars })
}

export const serialise = (library) => `${JSON.stringify(library, null, 2)}\n`

const main = () => {
    const out = opt('out', 'src/rigbuild/types/moxir.json')
    const text = serialise(buildLibrary({ manifest: opt('manifest', undefined), glbDir: opt('glb-dir', undefined) }))
    const target = path.join(ROOT, out)
    if (args.includes('--check')) {
        const now = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : ''
        if (now !== text) {
            console.error(`${out} is stale — run: node scripts/rigbuild/types.mjs`)
            process.exit(1)
        }
        console.log(`${out} is current`)
        return
    }
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, text)
    const lib = JSON.parse(text)
    console.log(`${out}: ${lib.types.length} types`)
    for (const t of lib.types) {
        console.log(`  ${t.id.padEnd(12)} ${t.identified.padEnd(10)} modes ${t.modesOwed ? 'OWED' : t.modes.map((m) => m.name + (m.channels ? '' : '*')).join(' ')}  ${t.power_w?.value ?? '?'} W`)
    }
    console.log('  (* = channel list owed)')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
