import { render } from '@testing-library/react'
import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// useFrame drives a render loop we do not want in jsdom — the sequence's
// per-frame work is not what is under test here.
vi.mock('@react-three/fiber', () => ({ useFrame: () => {} }))

const DispersionSphere = (await import('./DispersionSphere.jsx')).default

// The edit list plays this sequence on an unattended loop (window 44.2s->53.0s
// of a piece that repeats all day), so the piece is REMOUNTED roughly every 53
// seconds for the length of an exhibition. Geometries and materials hold GPU
// buffers that `new` does not free — only an explicit dispose() does. Without
// the unmount effect each pass leaked another full set, which is invisible in
// every unit test and in any session short enough to sit through.

describe('DispersionSphere releases its GPU buffers on unmount', () => {
    let geometryDispose
    let materialDispose

    beforeEach(() => {
        geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose')
        materialDispose = vi.spyOn(THREE.Material.prototype, 'dispose')
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('disposes every geometry and material it allocated', () => {
        const { unmount } = render(<DispersionSphere progress={0.5} />)

        // Nothing is freed while the sequence is on screen.
        expect(geometryDispose).not.toHaveBeenCalled()
        expect(materialDispose).not.toHaveBeenCalled()

        unmount()

        // The sphere and the shell are the two geometries built in useMemo.
        expect(geometryDispose.mock.calls.length).toBeGreaterThanOrEqual(2)
        // Body material + shell materials + floor + stone + column materials.
        expect(materialDispose.mock.calls.length).toBeGreaterThanOrEqual(5)
    })

    it('frees on unmount only, so a re-render mid-sequence does not blank it', () => {
        const { rerender, unmount } = render(<DispersionSphere progress={0.1} />)
        rerender(<DispersionSphere progress={0.9} />)

        // A progress change must not tear down the buffers the next frame reads.
        expect(geometryDispose).not.toHaveBeenCalled()
        expect(materialDispose).not.toHaveBeenCalled()

        unmount()
        expect(geometryDispose).toHaveBeenCalled()
    })
})
