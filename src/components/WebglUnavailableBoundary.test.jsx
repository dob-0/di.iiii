import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WebglUnavailableBoundary, isWebglCreationError } from './WebglContextGuard.jsx'

// Owner 2026-10-03: his browser refused a WebGL context and the uncaught
// three.js error took the whole page down. The 3D view must say why instead.
const Throws = ({ error }) => { throw error }

describe('WebglUnavailableBoundary', () => {
    it('shows why there is no 3D instead of crashing the page', () => {
        const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        try {
            render(
                <div>
                    <p>the rest of the page</p>
                    <WebglUnavailableBoundary>
                        <Throws error={new Error('THREE.WebGLRenderer: Error creating WebGL context with your selected attributes.')} />
                    </WebglUnavailableBoundary>
                </div>
            )
            expect(screen.getByRole('alert').textContent).toMatch(/no WebGL context/)
            expect(screen.getByRole('alert').textContent).toMatch(/selected attributes/)
            expect(screen.getByText('the rest of the page')).toBeTruthy()
            expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
        } finally {
            quiet.mockRestore(); warn.mockRestore()
        }
    })

    it('mounts the children again on Try again', () => {
        const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        let fail = true
        const Maybe = () => { if (fail) throw new Error('WebGL context lost for good'); return <p>drawn</p> }
        try {
            render(<WebglUnavailableBoundary><Maybe /></WebglUnavailableBoundary>)
            fail = false
            fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
            expect(screen.getByText('drawn')).toBeTruthy()
        } finally {
            quiet.mockRestore(); warn.mockRestore()
        }
    })

    it('passes any other error on unchanged', () => {
        const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
        try {
            expect(() => render(
                <WebglUnavailableBoundary><Throws error={new Error('scene data is broken')} /></WebglUnavailableBoundary>
            )).toThrow('scene data is broken')
        } finally {
            quiet.mockRestore()
        }
    })

    it('knows a WebGL creation error by its message', () => {
        expect(isWebglCreationError(new Error('THREE.WebGLRenderer: A WebGL context could not be created.'))).toBe(true)
        expect(isWebglCreationError(new Error('Cannot read properties of undefined'))).toBe(false)
    })
})
