// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Buffer } from 'node:buffer'
import JSZip from 'jszip'
import library from './types/moxir.json'
import { typeById } from './fixtureTypes.js'
import { gdtfArchive, gdtfDescription, gdtfFileName, gdtfMatrix, gdtfName, stableUuid } from './gdtf.js'
import { absoluteAddress, mvrMatrix, mvrScene, toMvr } from './mvr.js'

const lamp = (id, fixture, position = [1, 6, -2]) => ({ id, type: 'spotLight', name: id, components: { transform: { position, rotation: [0, 0, 0] }, fixture } })

describe('GDTF, authored', () => {
    it('writes every known mode at its footprint and invents no channel', () => {
        const xml = gdtfDescription(typeById(library, 'up-250bsw'))
        expect(xml).toMatch(/<GDTF DataVersion="1.2">/)
        expect([...xml.matchAll(/<DMXMode Name="([^"]+)"/g)].map((m) => m[1])).toEqual(['24ch', '30ch'])
        const mode24 = xml.split('<DMXMode ')[1]
        expect((mode24.match(/<DMXChannel /g) || []).length).toBe(24)
        expect(mode24).toMatch(/Attribute="OwedChannel24"/)
        expect(xml).toMatch(/<PowerConsumption Value="280" Connector="Power"\/>/)
        expect(xml).toMatch(/<Weight Value="13.5"\/>/)
        expect(xml).toMatch(/Not from GDTF Share/)
    })

    it('uses a source\'s channel list where there is one', () => {
        const xml = gdtfDescription(typeById(library, 'up-yh600f'))
        expect(xml).toMatch(/Attribute="Fountain"/)
        expect(xml).toMatch(/Attribute="Control"/)
        expect(xml).not.toMatch(/OwedChannel/)
    })

    it('writes a type with no known mode with none', () => {
        const xml = gdtfDescription(typeById(library, 'up-q108s'))
        expect(xml).not.toMatch(/<DMXMode /)
        expect(xml).toMatch(/every DMX mode \(owed from the rental house\)/)
    })

    it('packs description.xml and the body, the same bytes every time', async () => {
        const type = typeById(library, 'up-b380f')
        const a = await gdtfArchive(JSZip, type, new Uint8Array([1, 2, 3]))
        const b = await gdtfArchive(JSZip, type, new Uint8Array([1, 2, 3]))
        expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
        const zip = await JSZip.loadAsync(a)
        expect(Object.keys(zip.files).sort()).toEqual(['description.xml', 'models/gltf/body.glb'])
        expect(gdtfFileName(type)).toBe('UPlight@UP-B380F@di.gdtf')
    })

    it('keeps names and matrices inside the schema\'s alphabets', () => {
        expect(gdtfName('UP-B380F 16ch')).toBe('UP-B380F 16ch')
        expect(gdtfName('a.b|c')).toBe('a_b_c')
        expect(gdtfMatrix([[1e-12, 0, 0, 0.1234567]])).toBe('{0,0,0,0.123457}')
        expect(stableUuid('x')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
        expect(stableUuid('x')).toBe(stableUuid('x'))
        expect(stableUuid('x')).not.toBe(stableUuid('y'))
    })
})

describe('MVR scene', () => {
    it('turns room metres (Y up) into MVR millimetres (Z up)', () => {
        expect(toMvr([1, 2, 3])).toEqual([1000, -3000, 2000])
        expect(mvrMatrix({ o: [1, 2, 3] })).toBe('{1,0,0}{0,1,0}{0,0,1}{1,2,3}')
        expect(absoluteAddress(1, 1)).toBe(1)
        expect(absoluteAddress(2, 1)).toBe(513)
    })

    it('writes a fixture with its type, mode, number, unit, position, circuit and address', () => {
        const { xml, gdtf, fixtures } = mvrScene({
            library,
            entities: [lamp('a', { index: 19, type: 'up-250bsw', mode: '24ch', universe: 2, address: 25, unit: 2, circuit: 'C16', position: 'truss header', hung: true })]
        })
        expect(fixtures).toBe(1)
        expect(gdtf.map((t) => t.id)).toEqual(['up-250bsw'])
        expect(xml).toMatch(/<GeneralSceneDescription verMajor="1" verMinor="6" provider="di.iiii"/)
        expect(xml).toMatch(/<Fixture name="UP-250BSW truss header 2"/)
        expect(xml).toMatch(/<GDTFSpec>UPlight@UP-250BSW@di.gdtf<\/GDTFSpec>/)
        expect(xml).toMatch(/<GDTFMode>24ch<\/GDTFMode>/)
        expect(xml).toMatch(/<FixtureID>19<\/FixtureID>/)
        expect(xml).toMatch(/<UnitNumber>2<\/UnitNumber>/)
        expect(xml).toMatch(/<Address break="0">537<\/Address>/)
        expect(xml).toMatch(/<Function>circuit C16<\/Function>/)
        expect(xml).toMatch(/<Position name="truss header" uuid=/)
        // Hung: identity rotation (GDTF draws devices hanging), at its clamp above the lens.
        expect(xml).toMatch(/<Matrix>\{1,0,0\}\{0,1,0\}\{0,0,1\}\{1000,2000,/)
    })

    it('a standing lamp turns over; an unpatched one carries no address; owed modes stay empty', () => {
        const { xml } = mvrScene({ library, entities: [lamp('p', { type: 'up-q108s' }, [0, 0.3, 0])] })
        expect(xml).toMatch(/<Matrix>\{1,0,0\}\{0,-1,0\}\{0,0,-1\}/)
        expect(xml).not.toMatch(/<Addresses>/)
        expect(xml).toMatch(/<GDTFMode><\/GDTFMode>/)
        expect(xml).toMatch(/<UnitNumber>0<\/UnitNumber>/)
    })

    it('a patched lamp whose maker\'s modes are owed keeps its address, with no mode named', () => {
        // 2026-09-29: MOXIR's 15 PARs ran an ASSUMED list with no maker's mode of that width,
        // so the file named none — and dropped the address. The crew still needs it.
        const { xml } = mvrScene({ library, entities: [lamp('p', { type: 'up-q108s', mode: '3ch-assumed', universe: 2, address: 101, index: 211 }, [0, 0.3, 0])] })
        expect(xml).toMatch(/<GDTFMode><\/GDTFMode>/)
        expect(xml).toMatch(/<Address break="0">613<\/Address>/)
    })

    it('writes pieces with their bodies and rig boxes as scaled cubes, and skips an unknown type', () => {
        const out = mvrScene({
            library,
            entities: [
                { id: 't', type: 'model', components: { transform: { position: [0, 6, 0], rotation: [0, Math.PI / 2, 0] }, piece: { kind: 'truss-3m' } } },
                { id: 'rig-stage-deck', type: 'box', components: { transform: { position: [0, 0, -5], scale: [16, 1.2, 10] }, primitive: { size: [1, 1, 1] } } },
                lamp('x', { type: 'nope' })
            ]
        })
        expect(out.pieces).toEqual(['truss-3m'])
        expect(out.cube).toBe(true)
        expect(out.xml).toMatch(/<Truss name="Truss 3 m"[\s\S]*<Geometry3D fileName="truss-3m.glb"\/>[\s\S]*<FixtureID><\/FixtureID>/)
        expect(out.xml).toMatch(/<Geometry3D fileName="cube.glb">\s*<Matrix>\{16,0,0\}\{0,10,0\}\{0,0,1.2\}\{0,0,0\}<\/Matrix>/)
        expect(out.skipped).toEqual(['x: type "nope" is not in the library'])
    })
})
