import { describe, expect, it } from 'vitest'
import library from './types/moxir.json'
import { rigProgress } from './rigProgress.js'

const lamp = (id, fixture) => ({ id, type: 'spotLight', name: id, components: { transform: { position: [0, 6, 0], rotation: [0, 0, 0] }, fixture } })
const B = { type: 'up-b380f', mode: '16ch', position: 'booth' }

describe('rigProgress — the patch step says what its warning is', () => {
    // 2 addressed and overlapping, 1 addressed clean, 1 with no address at all
    const entities = [
        lamp('a', { ...B, index: 1, universe: 1, address: 1 }),
        lamp('b', { ...B, index: 2, universe: 1, address: 10 }),
        lamp('c', { ...B, index: 3, universe: 1, address: 100 }),
        lamp('d', { ...B, index: 4 })
    ]
    const p = rigProgress({ entities, library })

    it('says "to decide", not a bare "! n"', () => {
        expect(p.said.patch).toBe('3 of 4 addressed · 2 to decide')
        expect(p.said.patch).not.toMatch(/!/)
        expect(p.warn.patch).toBe(true)
    })
    it("names the causes and points at the sheet's own list", () => {
        expect(p.hints.patch).toMatch(/2 to decide \(2 overlap\)/)
        expect(p.hints.patch).toMatch(/Flags list/)
        expect(p.hints.patch).toMatch(/1 of the 4 lamps have no address yet/)
    })
    it('says nothing extra when nothing is to decide', () => {
        const clean = rigProgress({ entities: [lamp('a', { ...B, index: 1, universe: 1, address: 1 })], library })
        expect(clean.said.patch).toBe('1 of 1 addressed')
        expect(clean.hints).toEqual({})
    })
    it("words the desk's own refusals instead of printing the code", () => {
        const q = rigProgress({ entities: [lamp('a', { ...B, index: 1 })], library, projectId: 'p', deskFlags: [{ key: 'p:a', code: 'no-room' }] })
        expect(q.hints.patch).toMatch(/1 no universe had room/)
    })
})

describe('rigProgress reads the desk when given one (the sheet page and the room agree)', () => {
    const project = 'p1'
    const entities = Array.from({ length: 36 }, (_, i) => ({ id: `l${i}`, type: 'spotLight', components: { fixture: { index: i + 1, type: 'up-b380f', mode: '16ch', circuit: 'C1', position: 'truss', unit: i + 1 } } }))
    const desk = entities.slice(0, 29).map((e, i) => ({ key: `${project}:${e.id}`, universe: 1, address: 1 + i * 16 }))
    it('counts the desk addresses: 29 of 36; without the desk, 0 of 36', () => {
        expect(rigProgress({ entities, library, projectId: project, desk }).said.patch).toMatch(/^29 of 36 addressed/)
        expect(rigProgress({ entities, library, projectId: project }).said.patch).toMatch(/^0 of 36 addressed/)
    })
})
