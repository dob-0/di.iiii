import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/spaceSettings.js', () => ({
    getSpaceSettings: vi.fn(),
    putSpaceSettings: vi.fn()
}))

import useSavedTiming, { TIMING_LOAD_TIMEOUT_MS } from './useSavedTiming.js'
import { getSpaceSettings, putSpaceSettings } from '../services/spaceSettings.js'
import { SEQUENCES } from './sequences/index.js'

const FIRST = SEQUENCES[0].id

function Probe() {
    const timing = useSavedTiming()
    if (!timing.ready) return <p>waiting</p>
    const first = timing.sequences.find((row) => row.id === FIRST)
    return <p>{`ready ${first.endSec}`}</p>
}

describe('useSavedTiming', () => {
    beforeEach(() => { vi.clearAllMocks(); vi.useRealTimers() })
    afterEach(() => { vi.useRealTimers() })

    // The payoff: an ordinary visitor, no director flag, gets the timing that
    // was last saved to this space. Before this the overlay could only live in
    // a source file, so it could only be written from a laptop.
    it('opens the piece on the timing saved to the space', async () => {
        getSpaceSettings.mockResolvedValue({
            algovrithm: { timing: { [FIRST]: { endSec: 9.9 } } }
        })
        render(<Probe />)
        expect(await screen.findByText('ready 9.9')).toBeTruthy()
        // The file is untouched — the overlay says how the space differs.
        expect(SEQUENCES[0].endSec).not.toBe(9.9)
    })

    it('falls back to the file when the space has nothing saved', async () => {
        getSpaceSettings.mockResolvedValue({})
        render(<Probe />)
        expect(await screen.findByText(`ready ${SEQUENCES[0].endSec}`)).toBeTruthy()
    })

    // The piece loops unattended for the length of an exhibition day. A slow or
    // dead backend must cost frames, never the show — and the late answer that
    // eventually lands must not jump the playhead mid-beat.
    it('starts on the file when the server does not answer in time, and ignores a late answer', async () => {
        vi.useFakeTimers()
        let land = null
        getSpaceSettings.mockReturnValue(new Promise((resolve) => { land = resolve }))
        render(<Probe />)
        expect(screen.getByText('waiting')).toBeTruthy()

        await vi.advanceTimersByTimeAsync(TIMING_LOAD_TIMEOUT_MS + 10)
        expect(screen.getByText(`ready ${SEQUENCES[0].endSec}`)).toBeTruthy()

        land({ algovrithm: { timing: { [FIRST]: { endSec: 30 } } } })
        await vi.advanceTimersByTimeAsync(50)
        expect(screen.getByText(`ready ${SEQUENCES[0].endSec}`)).toBeTruthy()
    })

    it('saves only what moved, and keeps the rest of the blob', async () => {
        getSpaceSettings.mockResolvedValue({ other: { keep: true } })
        putSpaceSettings.mockResolvedValue({})
        const handle = { save: null }
        function Saver() {
            const timing = useSavedTiming()
            React.useEffect(() => { handle.save = timing.save }, [timing.save])
            return <p>{timing.ready ? 'ready' : 'waiting'}</p>
        }
        render(<Saver />)
        await screen.findByText('ready')
        const save = handle.save

        const edited = SEQUENCES.map((row, index) => index === 0 ? { ...row, endSec: 7.7 } : row)
        const result = await save(edited)

        expect(result).toEqual({ changed: 1 })
        await waitFor(() => expect(putSpaceSettings).toHaveBeenCalledTimes(1))
        const [, settings] = putSpaceSettings.mock.calls[0]
        expect(settings.other).toEqual({ keep: true })
        expect(settings.algovrithm.timing).toEqual({ [FIRST]: { endSec: 7.7 } })
    })
})
