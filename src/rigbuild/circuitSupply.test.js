import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { assignCircuits, circuitLimitW } from './sheet.js'
import { powerOf, typeById } from './fixtureTypes.js'

// Audit A-05 (2026-10-05): circuits were planned on a LED PAR's 162 W rating, so the 16 column PARs of
// Known · full shared C6 — 2592 W rated, but 3200 W at the 200 W supply the maker states, over the
// 2944 W planning limit of a 16 A / 230 V circuit at 80 %. Planning now uses the supply power.
const here = path.dirname(fileURLToPath(import.meta.url))
const library = JSON.parse(fs.readFileSync(path.join(here, 'types/moxir.json'), 'utf8'))
const par = (i) => ({ id: `par-${i}`, type: 'spotLight', components: { fixture: { type: 'up-pl5403', position: 'column', index: i } } })

describe('circuits are planned on the mains draw', () => {
    it("reads a LED PAR's supply power (200 W), not its 162 W rating", () => {
        expect(powerOf(typeById(library, 'up-pl5403'))).toBe(200)
        expect(powerOf({ power_w: { value: 500 } })).toBe(500)
        expect(powerOf({})).toBe(null)
    })

    it('splits 16 PARs on one position over two circuits, each within the limit', () => {
        const entities = Array.from({ length: 16 }, (_, i) => par(i + 1))
        const ops = assignCircuits({ entities, library, replace: true })
        const byCircuit = {}
        for (const op of ops) byCircuit[op.payload.patch.circuit] = (byCircuit[op.payload.patch.circuit] || 0) + 1
        expect(Object.keys(byCircuit).length).toBe(2)
        for (const n of Object.values(byCircuit)) expect(n * 200).toBeLessThanOrEqual(circuitLimitW())
    })
})
