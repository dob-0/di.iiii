import { readFileSync } from 'node:fs'
import { Suspense, lazy } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

// The first walk into a project with a wired Text loads the layer's chunk. That
// wait must stay inside the layer's own boundary, never the page's stall ring.
describe('the first walk loads the graph layer without suspending the page', () => {
    afterEach(cleanup)

    it('the surface mounts the lazy layer inside its own Suspense with a null fallback', () => {
        const src = readFileSync('src/project/components/PublicProjectSceneSurface.jsx', 'utf8')
        expect(src).toMatch(/walkNeedsGraph\(document\) \? <Suspense fallback=\{null\}><WalkGraphLayer /)
    })

    it('while the chunk loads the outer boundary shows nothing new and the sibling stays', async () => {
        const Layer = lazy(() => import('./WalkGraphLayer.jsx'))
        render(
            <Suspense fallback={<span>outer-stall</span>}>
                <span>walk</span>
                <Suspense fallback={null}><Layer document={{ projectMeta: { id: 'p' }, nodes: [], edges: [] }} /></Suspense>
            </Suspense>
        )
        expect(screen.queryByText('outer-stall')).toBeNull()
        expect(screen.getByText('walk')).toBeTruthy()
    })
})
