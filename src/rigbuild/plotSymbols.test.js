import { describe, expect, it } from 'vitest'
import { TYPE_LIBRARY } from './types/index.js'
import { keyRows, lampNotation, meaningfulColour, shapePath, symbolTable } from './plotSymbols.js'

const types = TYPE_LIBRARY.types

describe('symbolTable', () => {
    const table = symbolTable(types)

    it('draws MOXIR the way sketch B does', () => {
        expect(table.get('up-b380f').shape).toBe('circle')
        expect(table.get('up-250bsw').shape).toBe('square')
        expect(table.get('up-hk1915').shape).toBe('hexagon')
        expect(table.get('up-pl5403').shape).toBe('bar')
    })

    it('never puts two lamp types on one outline; effects share the triangle by letter', () => {
        const lamps = types.filter((t) => !table.get(t.id).letter).map((t) => table.get(t.id).shape)
        expect(new Set(lamps).size).toBe(lamps.length)
        const fx = types.filter((t) => table.get(t.id).letter)
        expect(new Set(fx.map((t) => table.get(t.id).letter)).size).toBe(fx.length)
    })

    it('gives an unknown moving head a free outline, not a taken one', () => {
        const t = symbolTable([...types, { id: 'new-head', category: 'moving-head' }])
        const taken = types.map((x) => t.get(x.id)).filter((s) => !s.letter).map((s) => s.shape)
        expect(taken).not.toContain(t.get('new-head').shape)
    })
})

describe('shapePath', () => {
    it('writes a closed path around the centre for every shape', () => {
        for (const shape of ['circle', 'square', 'hexagon', 'bar', 'triangle', 'diamond', 'pentagon', 'octagon']) {
            const d = shapePath(shape, 10, 20, 1)
            expect(d.startsWith('M')).toBe(true)
            expect(d.endsWith('Z')).toBe(true)
            const nums = d.match(/-?\d+\.\d+/g).map(Number)
            expect(Math.max(...nums)).toBeLessThan(22)
        }
    })
})

describe('notation and colour', () => {
    it('writes #index and universe.address, or says why not', () => {
        expect(lampNotation({ index: 41, universe: 2, address: 145, unit: 7, flags: [] })).toEqual({ number: '#41', address: '2.145', unit: '7' })
        expect(lampNotation({ index: null, universe: null, address: null, unit: null, flags: ['mode-unknown'] }).address).toBe('mode?')
        expect(lampNotation({ index: 3, universe: null, address: null, unit: 1, flags: ['not-patched'] }).address).toBe('unpatched')
    })

    it('marks a colour only where it is a colour', () => {
        expect(meaningfulColour('#eef3ff')).toBeNull()
        expect(meaningfulColour('#ffffff')).toBeNull()
        expect(meaningfulColour('#ff2200')).toBe('#ff2200')
        expect(meaningfulColour('nope')).toBeNull()
    })

    it('keys the types in the room, in library order, with counts', () => {
        const table = symbolTable(types)
        const rows = [
            { type: 'up-250bsw', code: 'UP-250BSW', mode: '24ch' },
            { type: 'up-b380f', code: 'UP-B380F', mode: '16ch' },
            { type: 'up-250bsw', code: 'UP-250BSW', mode: '24ch' },
            { type: 'up-pl5403', code: 'UP-PL5403', mode: null }
        ]
        expect(keyRows({ rows, types, table }).map((k) => [k.code, k.n, k.mode, k.shape])).toEqual([
            ['UP-B380F', 1, '16ch', 'circle'], ['UP-250BSW', 2, '24ch', 'square'], ['UP-PL5403', 1, 'mode owed', 'bar']
        ])
    })
})
