import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { normalizeProjectDocument } from '../shared/projectSchema.js'
import { createEntityOfType } from './entityRegistry.js'
import { useProjectLayers } from './useProjectLayers.js'

const doc = (id, entities = []) => normalizeProjectDocument({ projectMeta: { id, spaceId: 'lab' }, entities })
const box = createEntityOfType('box')

describe('useProjectLayers', () => {
    it('decides nothing while the store still holds the blank stand-in', () => {
        const { result } = renderHook(() => useProjectLayers(doc(''), 'p1'))
        expect(result.current.loaded).toBe(false)
        expect(result.current.open).toBeNull()
        expect(result.current.held).toBe(false)
    })

    it('never takes back on this page what the project was given — an undo of the first box keeps the tools', () => {
        const { result, rerender } = renderHook(({ document }) => useProjectLayers(document, 'p1'), {
            initialProps: { document: doc('p1') }
        })
        expect(result.current.held).toBe(false)
        expect(result.current.open.connections).toBe(false)

        rerender({ document: doc('p1', [box]) })
        expect(result.current.held).toBe(true)
        expect(result.current.open.connections).toBe(true)

        // The box undone: the rule alone says empty, the page keeps what it gave.
        rerender({ document: doc('p1') })
        expect(result.current.empty).toBe(true)
        expect(result.current.held).toBe(true)
        expect(result.current.open.connections).toBe(true)
    })

    it('starts over for another project — the memory is per project, and only this page\'s', () => {
        const { result, rerender } = renderHook(({ document, id }) => useProjectLayers(document, id), {
            initialProps: { document: doc('p1', [box]), id: 'p1' }
        })
        expect(result.current.held).toBe(true)
        // Switched: until p2's document arrives nothing is decided …
        rerender({ document: doc('p1', [box]), id: 'p2' })
        expect(result.current.open).toBeNull()
        // … and an empty p2 opens bare.
        rerender({ document: doc('p2'), id: 'p2' })
        expect(result.current.held).toBe(false)
        expect(result.current.open.connections).toBe(false)
    })
})
