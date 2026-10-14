import { describe, expect, it } from 'vitest'
import { columnSections, insideShowsGraph, insideViewKind } from './insideView.js'

// Audit 2026-10-05 §3.5 (the column per kind) and §3.6 (what inside opens).
describe('insideView', () => {
    it('insideViewKind sorts every kind the spec names', () => {
        expect(['universe.world', 'geom.geo', 'view.list', 'view.text', 'math.op', 'value.number', 'geom.cube', 'view.outliner', 'source.webcam', null]
            .map(insideViewKind))
            .toEqual(['graph', 'graph', 'list', 'text', 'code', 'code', 'spatial', 'tool', 'tool', 'graph'])
    })

    it('only containers and spatial nodes keep a canvas of child cards', () => {
        expect(['graph', 'spatial', 'list', 'text', 'code', 'tool', 'picture'].filter(insideShowsGraph)).toEqual(['graph', 'spatial'])
    })

    it('columnSections: header first, Delete last, settings only when there are some', () => {
        expect(columnSections({ hasSettings: false })).toEqual(['header', 'ports', 'open', 'delete'])
        expect(columnSections({ hasSettings: true })).toEqual(['header', 'settings', 'ports', 'open', 'delete'])
    })
})
