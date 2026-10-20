import React from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@react-three/fiber', () => ({
    Canvas: ({ children }) => { throw new Error('Error creating WebGL context.') }
}))

import GuardedCanvas, { canCreateWebGL } from './GuardedCanvas.jsx'

afterEach(() => vi.restoreAllMocks())

describe('GuardedCanvas', () => {
    it('shows a readable message and raises no error when the browser has no WebGL', () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
        const onError = vi.fn()
        window.addEventListener('error', onError)
        render(<GuardedCanvas />)
        window.removeEventListener('error', onError)
        expect(screen.getByTestId('webgl-unavailable')).toHaveTextContent(/3D isn.t available/)
        expect(onError).not.toHaveBeenCalled()
    })
    it('falls back to the message when context creation throws inside the canvas', () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ getExtension: () => null })
        vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        render(<GuardedCanvas />)
        expect(screen.getByTestId('webgl-unavailable')).toBeInTheDocument()
    })
    it('probe reports false when getContext throws', () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => { throw new Error('x') })
        expect(canCreateWebGL()).toBe(false)
    })
})
