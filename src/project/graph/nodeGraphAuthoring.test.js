import { describe, expect, it } from 'vitest'
import { buildNodeValues } from './nodeGraphAuthoring.js'

describe('buildNodeValues', () => {
    it('lifts a spatial-3d node above the clicked surface point', () => {
        const values = buildNodeValues('geom.cube', {}, { point: [1, 0, 2] })
        expect(values.position).toEqual([1, 0.5, 2])
    })

    it('never lifts a spatial-3d node below its minimum height', () => {
        const values = buildNodeValues('geom.cube', {}, { point: [0, -5, 0] })
        expect(values.position[1]).toBe(0.5)
    })

    it('uses a taller lift for non-cube spatial-3d nodes', () => {
        const values = buildNodeValues('geom.sphere', {}, { point: [0, 0, 0] })
        expect(values.position[1]).toBe(1.2)
    })

    it('builds a floating-window frame for a panel-2d node', () => {
        const values = buildNodeValues('view.text', {}, { clientX: 300, clientY: 200 }, { workspaceTop: 100, topZIndex: 6 })
        expect(values.frame).toMatchObject({
            width: 360,
            height: 280,
            zIndex: 7,
            visible: true
        })
        expect(values.frame.x).toBe(120)
        expect(values.frame.y).toBeGreaterThanOrEqual(100 + 24)
    })

    it('gives the world node a larger default frame than other panels', () => {
        const values = buildNodeValues('universe.world', {}, { clientX: 400, clientY: 200 })
        expect(values.frame.width).toBe(680)
        expect(values.frame.height).toBe(480)
    })

    it('passes params through untouched for hidden-render node types', () => {
        const values = buildNodeValues('value.number', { amount: 5 }, {})
        expect(values).toEqual({ amount: 5 })
        expect(values.frame).toBeUndefined()
        expect(values.position).toBeUndefined()
    })

    it('falls back to sane defaults when no workspaceTop/topZIndex is passed', () => {
        const values = buildNodeValues('view.text', {}, {})
        expect(values.frame.zIndex).toBe(7)
        expect(values.frame.y).toBeGreaterThanOrEqual(0)
    })
})
