// Writes src/project/graph/nodeAnatomy.generated.js — where every node type's
// code lives, as line ranges the browser slices real source by.
//
// Same sync/check contract as sync-agent-docs.mjs: this writes, its twin
// check-node-anatomy.mjs re-renders and diffs, CI runs the twin. Staleness is
// a red CI diff a human reads — never a wrong slice a visitor reads.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractDoorwaySpan, extractIfChain, extractSwitchCases } from './node-anatomy-lib.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_PATH = path.join(ROOT, 'src/project/graph/nodeAnatomy.generated.js')

// The three measured files, by the repo-relative names the manifest carries.
export const RUNTIME_FILE = 'src/project/graph/nodeGraphRuntime.js'
export const VIEWPORT_FILE = 'src/raw/components/RawViewport.jsx'
export const EDITOR_FILE = 'src/raw/components/RawEditor.jsx'

// The one hand-kept entry. `time` is the single type whose reality includes a
// file no extractor can find: without useGraphClock's scan the context's clock
// never advances and the case reads a dead `now`. Guarded by a test asserting
// the named symbol still lives in the named file — a hand-kept fact is the one
// thing here a person must remember, so a machine remembers it too.
export const EXTRA_PLACES = {
    time: {
        file: 'src/project/graph/useGraphClock.js',
        symbol: 'useGraphClock',
        sentence: 'It only moves because something outside it keeps a clock — useGraphClock.js.'
    }
}

export async function buildManifest() {
    const { fingerprintSource } = await import('../src/raw/utils/sourceFingerprint.js')
    const { NODE_TYPES } = await import('../src/project/nodeRegistry.js')

    const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8')
    const runtimeSource = read(RUNTIME_FILE)
    const viewportSource = read(VIEWPORT_FILE)
    const editorSource = read(EDITOR_FILE)

    const anatomy = {}
    for (const id of Object.keys(NODE_TYPES)) {
        anatomy[id] = { computes: null, draws: null, panel: null, alsoNeeds: EXTRA_PLACES[id] || null }
    }
    const place = (slot, file) => (group) => {
        for (const id of group.typeIds) {
            if (!anatomy[id]) continue // a case for a type the registry dropped — assertion 3 in the test reports it
            anatomy[id][slot] = {
                file,
                fromLine: group.fromLine,
                toLine: group.toLine,
                sharedWith: group.typeIds.filter((other) => other !== id),
                ...(slot === 'computes' ? { answers: group.answers } : {})
            }
        }
    }
    extractSwitchCases(runtimeSource, 'computeNodeOutput').forEach(place('computes', RUNTIME_FILE))
    extractSwitchCases(viewportSource, 'renderNodeBody').forEach(place('draws', VIEWPORT_FILE))
    extractIfChain(editorSource, 'renderViewNodeContent').forEach(place('panel', EDITOR_FILE))

    return {
        anatomy,
        doorway: { file: RUNTIME_FILE, ...extractDoorwaySpan(runtimeSource, 'computeNodeOutput') },
        fingerprints: {
            [RUNTIME_FILE]: fingerprintSource(runtimeSource),
            [VIEWPORT_FILE]: fingerprintSource(viewportSource),
            [EDITOR_FILE]: fingerprintSource(editorSource)
        }
    }
}

export function renderManifestModule({ anatomy, doorway, fingerprints }) {
    const json = (value) => JSON.stringify(value, null, 4)
        .replace(/"([a-zA-Z_][a-zA-Z0-9_]*)":/g, '$1:')
        .replace(/"/g, "'")
    return `// GENERATED — do not edit. \`npm run docs:anatomy:sync\` rewrites it; CI runs
// \`npm run check:node-anatomy\` and fails when this file disagrees with the
// sources it measures. Where each node type's code lives, as LINE RANGES in
// named files — the sheet slices real source by these, and the fingerprints
// are how it refuses to show lines from a file that has moved on.
export const NODE_ANATOMY = ${json(anatomy)}

// The block at the top of computeNodeOutput that answers a container's
// promoted sockets before the type switch is ever consulted.
export const DOORWAY_PLACE = ${json(doorway)}

export const SOURCE_FINGERPRINTS = ${json(fingerprints)}
`
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
    const next = renderManifestModule(await buildManifest())
    const current = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : null
    if (current === next) {
        console.log('nodeAnatomy.generated.js is current.')
    } else {
        fs.writeFileSync(OUT_PATH, next)
        console.log(`wrote ${path.relative(ROOT, OUT_PATH)}`)
    }
}
