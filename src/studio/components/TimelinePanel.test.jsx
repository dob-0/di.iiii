import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TimelinePanel } from './StudioShellPanels.jsx'
import { getTimelinePreview, stopTimelinePreview } from '../utils/timelinePreview.js'

const entity = (timeline = null) => ({
    id: 'ent-1',
    type: 'box',
    name: 'Box Entity',
    components: {
        transform: { position: [1, 2, 3], rotation: [0, 0, 0], scale: [1, 1, 1] },
        appearance: { color: '#fff', opacity: 0.5 },
        ...(timeline ? { timeline } : {})
    }
})

const keyed = {
    duration: 4,
    loop: true,
    tracks: [{
        property: 'position',
        keys: [
            { t: 0, value: [0, 0, 0], easing: 'ease' },
            { t: 2, value: [4, 0, 0], easing: 'ease' }
        ]
    }]
}

describe('TimelinePanel', () => {
    beforeEach(() => stopTimelinePreview())

    it('records position/rotation/scale/opacity keys at the playhead', () => {
        const onTimelineChange = vi.fn()
        render(<TimelinePanel entity={entity()} onTimelineChange={onTimelineChange} />)
        fireEvent.click(screen.getByRole('button', { name: /Timeline/ }))
        fireEvent.click(screen.getByTitle(/Capture the current pose/))

        const next = onTimelineChange.mock.calls[0][0]
        expect(next.tracks.map((track) => track.property)).toEqual(['position', 'rotation', 'scale', 'opacity'])
        expect(next.tracks[0].keys).toEqual([{ t: 0, value: [1, 2, 3], easing: 'ease' }])
        expect(next.tracks[3].keys[0].value).toBe(0.5)
        expect(getTimelinePreview().entityId).toBe('ent-1')
    })

    it('shows key dots, deletes keys at the playhead, and gates play on keys', () => {
        const onTimelineChange = vi.fn()
        render(<TimelinePanel entity={entity(keyed)} onTimelineChange={onTimelineChange} />)
        // keyed timeline opens by default
        expect(screen.getByLabelText('Key at 2.00 seconds')).toBeInTheDocument()

        // playhead starts at 0 where a key exists — delete removes it
        fireEvent.click(screen.getByTitle('Delete the key at the playhead'))
        const next = onTimelineChange.mock.calls[0][0]
        expect(next.tracks[0].keys.map((key) => key.t)).toEqual([2])

        fireEvent.click(screen.getByTitle(/Play the timeline/))
        expect(getTimelinePreview()).toMatchObject({ entityId: 'ent-1', playing: true, duration: 4, loop: true })
    })

    it('without keys the play button is disabled and the hint shows', () => {
        render(<TimelinePanel entity={entity()} onTimelineChange={() => {}} />)
        fireEvent.click(screen.getByRole('button', { name: /Timeline/ }))
        expect(screen.getByTitle(/Play the timeline/)).toBeDisabled()
        expect(screen.getByText(/Two keys make motion/)).toBeInTheDocument()
    })
})
