// @vitest-environment node
// 2026-10-02 (human audit, item 2): Known · full carried the set's five looks made for the hung rig,
// each lighting nothing here, beside working looks of the same names — a mis-tap on the desk. The
// version omits them (`omitLooks`), and its default look is one it really has.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../place/common.mjs'

const rig = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/place/rigs/moxir-2026-10-17-known-full.json'), 'utf8'))

describe('Known · full plays only looks it can light', () => {
    it('has none of the five hung-rig looks', () => {
        for (const id of ['white-cathedral', 'red-room', 'strobe-hit', 'one-beam', 'slow-sweep']) expect(rig.looks[id]).toBeUndefined()
    })
    it('rests on a look it has', () => {
        expect(rig.looks[rig.defaultLook]).toBeDefined()
    })
})
