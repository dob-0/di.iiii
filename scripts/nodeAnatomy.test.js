import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { EXTRA_PLACES, isMeasuredFile } from './node-anatomy-lib.mjs'
import { NODE_ANATOMY, DOORWAY_PLACE, SOURCE_FINGERPRINTS } from 'virtual:node-anatomy'
import { NODE_TYPES, createNode } from '../src/project/nodeRegistry.js'
import { isLiveFedOutput } from '../src/project/graph/nodeReading.js'
import { fingerprintSource } from '../src/raw/utils/sourceFingerprint.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8')
const slice = ({ file, fromLine, toLine }) => read(file).split('\n').slice(fromLine - 1, toLine)

const places = (entry) => [entry.computes, entry.draws, entry.panel].filter(Boolean)

// These are SEMANTIC guards on the extractor. Freshness is no longer one of
// them — the manifest is measured during the build that imports it here, so a
// stale-copy assertion would be asserting against itself. What is left is the
// part that always mattered: each assertion below is one of the ways a slicer
// was actually observed to lie during design, plus the coverage rule that stops
// the sheet lying by omission when a 65th type lands. A build-time extractor
// with a bug is exactly as wrong as a committed one; only the rebases are gone.
describe('the node anatomy manifest', () => {
    // Every place the sheet points at is a file the dev server also re-measures
    // on change. These drifted apart once already: colocated runtimes arrived as
    // a manifest source without arriving as a watched one, so an edit to one
    // left a running editor quoting the previous revision's lines.
    it('points only at files a change to which re-measures the manifest', () => {
        const named = new Set([
            ...Object.values(NODE_ANATOMY).flatMap((entry) => places(entry)).map((place) => place.file),
            DOORWAY_PLACE.file
        ])
        for (const file of named) expect(isMeasuredFile(file), file).toBe(true)
    })

    it('covers every registered node type, so a new type cannot be silently absent', () => {
        for (const id of Object.keys(NODE_TYPES)) {
            expect(NODE_ANATOMY[id], id).toBeTruthy()
        }
        // …and points at no type the registry has dropped.
        for (const id of Object.keys(NODE_ANATOMY)) {
            expect(NODE_TYPES[id], id).toBeTruthy()
        }
    })

    it('never yields an empty slice — the fall-through defect', () => {
        for (const [id, entry] of Object.entries(NODE_ANATOMY)) {
            for (const place of places(entry)) {
                const meaningful = slice(place).filter((line) => {
                    const bare = line.trim()
                    return bare && !bare.startsWith('//') && !bare.startsWith('*')
                        && !/^case '.*':$/.test(bare) && bare !== 'break' && bare !== '}'
                })
                expect(meaningful.length, `${id} → ${place.file}:${place.fromLine}`).toBeGreaterThan(0)
            }
        }
    })

    it('never ends a slice on a comment — the mis-attribution defect', () => {
        for (const [id, entry] of Object.entries(NODE_ANATOMY)) {
            for (const place of places(entry)) {
                const lines = slice(place).map((line) => line.trim()).filter(Boolean)
                expect(lines[lines.length - 1].startsWith('//'), `${id} → ${place.file}:${place.toLine}`)
                    .toBe(false)
            }
        }
    })

    it('never includes another type\'s case label in a slice', () => {
        for (const [id, entry] of Object.entries(NODE_ANATOMY)) {
            for (const place of places(entry)) {
                const family = new Set([id, ...(place.sharedWith || [])])
                for (const line of slice(place)) {
                    const label = /case '([^']+)':/.exec(line)
                    if (label) expect(family.has(label[1]), `${id} slice holds case '${label[1]}'`).toBe(true)
                }
            }
        }
    })

    it('only claims answers a type actually declares as outputs', () => {
        for (const [id, entry] of Object.entries(NODE_ANATOMY)) {
            if (!entry.computes) continue
            const declared = new Set((NODE_TYPES[id].outputs || []).map((port) => port.id))
            for (const answer of entry.computes.answers) {
                expect(declared.has(answer), `${id} claims to answer '${answer}'`).toBe(true)
            }
        }
    })

    // The manifest's "this case reads the live side channel" and the runtime's
    // actual behaviour, cross-checked by two INDEPENDENT means: text scan of
    // the slice vs the Symbol-substitution probe on a real node. The day a
    // live case is added without the sheet learning of it, this goes red.
    it('agrees with the substitution probe about which types are live-fed', () => {
        for (const [id, entry] of Object.entries(NODE_ANATOMY)) {
            const sliceSaysLive = Boolean(entry.computes) && slice(entry.computes).join('\n').includes('liveOutputs')
            const node = createNode(id)
            if (!node) continue
            const document = { nodes: [node], edges: [] }
            const probeSaysLive = (NODE_TYPES[id].outputs || [])
                .some((port) => isLiveFedOutput(node, port.id, document))
            expect(probeSaysLive, `${id}: slice says ${sliceSaysLive}, probe says ${probeSaysLive}`)
                .toBe(sliceSaysLive)
        }
    })

    it('fingerprints the files it measured, and they still match the disk', () => {
        for (const [file, print] of Object.entries(SOURCE_FINGERPRINTS)) {
            expect(fingerprintSource(read(file)), file).toBe(print)
        }
    })

    it('points the doorway sentence at lines that actually read the door map', () => {
        expect(slice(DOORWAY_PLACE).join('\n')).toContain('doorwayOutByParent')
    })

    // The single hand-kept fact. If useGraphClock is renamed or moved, the
    // sheet's sentence about `time` becomes a pointer to nothing — this is the
    // machine remembering what a person would have to.
    it('keeps the hand-kept extra places true', () => {
        for (const [id, extra] of Object.entries(EXTRA_PLACES)) {
            expect(NODE_TYPES[id], id).toBeTruthy()
            expect(read(extra.file), `${extra.file} should define ${extra.symbol}`).toContain(extra.symbol)
        }
    })
})
