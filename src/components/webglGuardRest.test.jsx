import React from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// #807 guarded five canvases; these two scenes still used R3F's raw Canvas.
// The real Canvas runs here (not mocked) so the test sees what a visitor with
// no WebGL sees: the notice, not a thrown render error.
import ProcessField from '../wccSite/landing/ProcessField.jsx'
import AlgoVrithmExperience from '../algoVrithm/AlgoVrithmExperience.jsx'

afterEach(() => vi.restoreAllMocks())

describe('the remaining 3D canvases say so when WebGL is missing', () => {
    it.each([
        ['WCC ProcessField', () => <ProcessField images={[]} />],
        ['algoVrithm', () => <AlgoVrithmExperience embedded />]
    ])('%s renders the notice instead of throwing', async (_name, make) => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
        vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        render(make())
        // algoVrithm resolves its saved timing first, so wait for the scene to mount
        expect(await screen.findByTestId('webgl-unavailable')).toHaveTextContent(/3D isn.t available/)
    })
})
