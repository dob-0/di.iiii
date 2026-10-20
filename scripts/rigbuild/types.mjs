#!/usr/bin/env node
/**
 * types.mjs — write a fixture-type library from a sourced fixtures manifest.
 * docs/architecture/RIG_BUILD.md §2.1.
 *
 *   node scripts/rigbuild/types.mjs                      # fixtures.json -> src/rigbuild/types/library/
 *   node scripts/rigbuild/types.mjs --manifest <file> --out <dir> [--glb-dir <dir>]
 *   node scripts/rigbuild/types.mjs --check              # exit 1 if a committed file is stale
 *
 * The library is di.iiii's one shared fixture library (decision 4, 2026-10-13): ONE FILE PER
 * TYPE (`<id>.json`, with its provenance) so a viewer loads only the types its project uses
 * (src/rigbuild/types/projectTypes.js), and `index.json`: the order, and each type's code and
 * category, small enough for anything to read first. The rule for adding a type: the README.
 *
 * ALIAS: src/rigbuild/types/moxir.json, the whole library in one file under its old name,
 * is still written (identical content): the app and many tests read it until the split of PR #914
 * moves them to the library (part 3). Delete it, and ALIAS_FILE here, once nothing reads it.
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

export const LIBRARY_DIR = 'src/rigbuild/types/library'
export const ALIAS_FILE = 'src/rigbuild/types/moxir.json'
export const INDEX_FILE = 'index.json'

/** The library's index: the order, and per type the little a reader needs before it loads one. Pure. */
export const indexOf = (library) => ({
    library: library.library,
    howToRead: library.howToRead,
    generatedFrom: library.generatedFrom,
    types: library.types.map((t) => ({ id: t.id, code: t.code, category: t.category }))
})

/**
 * Every file the generator writes, path (from the repo root) → text. Pure.
 * @param {object} library  buildLibrary()'s output
 * @param {{ dir?: string, alias?: string|null }} [where]
 */
export const libraryFiles = (library, { dir = LIBRARY_DIR, alias = ALIAS_FILE } = {}) => {
    const files = { [`${dir}/${INDEX_FILE}`]: serialise(indexOf(library)) }
    for (const t of library.types) files[`${dir}/${t.id}.json`] = serialise(t)
    if (alias) files[alias] = serialise(library)
    return files
}

const main = () => {
    const dir = opt('out', LIBRARY_DIR)
    const library = buildLibrary({ manifest: opt('manifest', undefined), glbDir: opt('glb-dir', undefined) })
    const files = libraryFiles(library, { dir, alias: dir === LIBRARY_DIR ? ALIAS_FILE : null })
    if (args.includes('--check')) {
        const stale = Object.entries(files).filter(([file, text]) => {
            const target = path.join(ROOT, file)
            return !fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== text
        }).map(([file]) => file)
        const extra = fs.existsSync(path.join(ROOT, dir))
            ? fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.json')).map((f) => `${dir}/${f}`).filter((f) => !(f in files))
            : []
        if (stale.length || extra.length) {
            console.error(`stale: ${[...stale, ...extra.map((f) => `${f} (no such type)`)].join(', ')} — run: node scripts/rigbuild/types.mjs`)
            process.exit(1)
        }
        console.log(`${dir} is current`)
        return
    }
    for (const [file, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(ROOT, file)), { recursive: true })
        fs.writeFileSync(path.join(ROOT, file), text)
    }
    const lib = library
    console.log(`${dir}: ${lib.types.length} types`)
    for (const t of lib.types) {
        console.log(`  ${t.id.padEnd(16)} ${t.provenance.identified.padEnd(10)} ${JSON.stringify(t.provenance.values)} modes ${t.modesOwed ? 'OWED' : t.modes.map((m) => m.name + (m.channels ? '' : '*')).join(' ')}  ${t.power_w?.value ?? '?'} W`)
    }
    console.log('  (* = channel list owed)')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
