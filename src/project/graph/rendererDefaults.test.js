import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createNode, getTypeInputDefault } from '../nodeRegistry.js'
import { createNodeGraphContext, evaluateNodeOutput } from './nodeGraphRuntime.js'

// The room, a wire and the inspector must agree about a cleared field
// (Raw nodes audit 2026-09-14, cross-cutting #17).
const viewport = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../raw/components/RawViewport.jsx'), 'utf8')

describe('renderer fallbacks agree with registry defaults', () => {
    it('the registry holds the numbers the audit found disagreeing', () => {
        expect(getTypeInputDefault('geom.sphere', 'radius')).toBe(0.5)
        expect(getTypeInputDefault('geom.plane', 'width')).toBe(2)
        expect(getTypeInputDefault('geom.plane', 'height')).toBe(2)
        expect(getTypeInputDefault('colour.ramp', 'b')).toBe('#5fa8ff')
        expect(getTypeInputDefault('nope', 'x')).toBeUndefined()
    })

    it('RawViewport reads sphere radius and plane size from the registry, not literals', () => {
        expect(viewport).toContain("asFiniteNumber(values.radius, getTypeInputDefault('geom.sphere', 'radius'))")
        expect(viewport).toContain("asFiniteNumber(values.width, getTypeInputDefault('geom.plane', 'width'))")
        expect(viewport).toContain("asFiniteNumber(values.height, getTypeInputDefault('geom.plane', 'height'))")
        expect(viewport).not.toMatch(/values\.radius, 0\.6\)/)
    })

    it('a Ramp with a cleared middle stop passes through the registry blue', () => {
        const ramp = createNode('colour.ramp', { id: 'r', values: { position: 0.5, a: '#000000', b: '', c: '#ffffff' } })
        const context = createNodeGraphContext({ nodes: [ramp], edges: [] })
        expect(evaluateNodeOutput(ramp, 'out', context)).toBe('#5fa8ff')
    })

    it('Cube bounds are the box the room draws: magnitudes, never a zero axis', () => {
        const cube = createNode('geom.cube', { id: 'c', values: { size: [-2, 0, 3] } })
        const context = createNodeGraphContext({ nodes: [cube], edges: [] })
        expect(evaluateNodeOutput(cube, 'bounds', context)).toEqual([2, 0.001, 3])
    })
})
