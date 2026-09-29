import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'

// The engine client is exercised on its own in liveAiRestyle.test.js; here it is
// a stand-in the test can speak through, so what is checked is the SURFACE:
// what the wall shows before, during and after the first AI frame.
const started = []
vi.mock('./liveAiRestyle.js', () => ({
    startLiveAiRestyle: (options) => {
        const handle = { options, setParams: vi.fn(), stop: vi.fn() }
        started.push(handle)
        return handle
    }
}))

import MapSourceView from './MapSourceView.jsx'
import { normalizeMappingSurface } from '../shared/projectSchema.js'

const aiCamera = (effect = {}) => normalizeMappingSurface({
    id: 's1',
    resolution: [640, 360],
    source: { kind: 'camera', ref: '' },
    effect: { kind: 'ai', prompt: 'gold leaf', strength: 0.6, ...effect }
})

beforeEach(() => {
    started.length = 0
    vi.stubGlobal('navigator', {
        ...navigator,
        mediaDevices: { getUserMedia: vi.fn(() => new Promise(() => {})) }
    })
})

describe('a camera surface with AI restyle', () => {
    it('starts the engine client with the prompt and strength the desk set', () => {
        render(<MapSourceView surface={aiCamera()} label="wall" />)
        expect(started).toHaveLength(1)
        expect(started[0].options.params).toEqual({ prompt: 'gold leaf', strength: 0.6 })
    })

    it('says what the engine is doing — never a black box — until the first frame, then shows the picture', () => {
        render(<MapSourceView surface={aiCamera()} label="wall" />)
        expect(screen.getByText('reaching the live-AI engine…')).toBeTruthy()
        act(() => started[0].options.onStatus({ state: 'no-engine', detail: 'no live-AI engine at ws://127.0.0.1:7861/ws — start it' }))
        expect(screen.getByText(/no live-AI engine at/)).toBeTruthy()
        act(() => started[0].options.onFrame())
        expect(screen.queryByText(/no live-AI engine at/)).toBeNull()
    })

    it('changes the prompt in place, without restarting the engine client', () => {
        const { rerender } = render(<MapSourceView surface={aiCamera()} label="wall" />)
        rerender(<MapSourceView surface={aiCamera({ prompt: 'deep blue' })} label="wall" />)
        expect(started).toHaveLength(1)
        expect(started[0].setParams).toHaveBeenLastCalledWith({ prompt: 'deep blue', strength: 0.6 })
    })

    it('lets the engine go when the effect is switched off', () => {
        const { rerender } = render(<MapSourceView surface={aiCamera()} label="wall" />)
        rerender(<MapSourceView surface={aiCamera({ kind: 'none' })} label="wall" />)
        expect(started[0].stop).toHaveBeenCalled()
    })
})
