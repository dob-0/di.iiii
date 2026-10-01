// @vitest-environment node
// MOXIR 2026-10-01, the owner: "work only with the known ones and with hazer and smoke but keep
// them out of dmx". The known-ground version lists them in policy.dmx.offDmx; built and patched
// the way moxir.mjs does it (a throwaway desk), they stay in the room with no address, and the
// lights whose DMX is known are patched.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT } from '../place/common.mjs'
import { moxirDocument, patchMoxir } from './moxir.mjs'
import { loadLibrary } from './library.mjs'
import { rentalFileOf, rigFileOf, VERSIONS_FILE } from './versions.mjs'
import { libraryWithShow } from '../../src/rigbuild/rental.js'
import { typeById } from '../../src/rigbuild/fixtureTypes.js'

const read = (f) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'))
const spec = read(VERSIONS_FILE)
const hall = read(spec.hall)
const ID = 'known-ground'

describe('known-ground: hazers and smoke are run by hand, never patched', () => {
    it('marks every off-DMX device dmx:false and gives it no address; the known lights are patched', async () => {
        const rig = read(rigFileOf(spec.set, ID))
        expect(rig.policy.dmx.offDmx).toEqual(['EXT-HAZER', 'UP-YZ31P'])
        const library = libraryWithShow(loadLibrary(), read(rentalFileOf(spec.set, ID)).rentalList)
        const { document } = moxirDocument({ rig, hall, library })
        const { document: patched } = await patchMoxir({ document, rig, library })
        const lamps = patched.entities.filter((e) => e.components?.fixture?.type)
        const codeOf = (e) => typeById(library, e.components.fixture.type)?.code
        const byHand = lamps.filter((e) => rig.policy.dmx.offDmx.includes(codeOf(e)))
        expect(byHand).toHaveLength(10) // 6 hazers, 4 smoke
        for (const e of byHand) {
            expect(e.components.fixture.dmx, e.id).toBe(false)
            expect(e.components.fixture.universe ?? null, e.id).toBe(null)
            expect(e.components.fixture.address ?? null, e.id).toBe(null)
        }
        const onDmx = lamps.filter((e) => !rig.policy.dmx.offDmx.includes(codeOf(e)))
        expect(onDmx).toHaveLength(36) // 13 UP-B380F, 21 UP-PL5403, 2 UP-LA40WF
        for (const e of onDmx) expect(Number.isInteger(e.components.fixture.address), e.id).toBe(true)
    }, 60000)
})
