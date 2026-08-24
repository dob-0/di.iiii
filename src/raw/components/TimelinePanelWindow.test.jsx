import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TimelinePanelWindow from './TimelinePanelWindow.jsx'

// The 2026-08-18 node truth audit found a complete clip editor — drag, trim,
// razor, ripple, retime, gap analysis — that nothing in the product could
// reach: no way existed to CREATE a clip. These tests pin the add-clip button
// that makes the built thing real.

const makeNode = (clips = []) => ({
    id: 'tl-1',
    typeId: 'view.timeline',
    label: 'Timeline',
    values: { clips, fps: 60 }
})

describe('TimelinePanelWindow add clip', () => {
    it('adds a one-second clip at the playhead and selects it', () => {
        const onChange = vi.fn()
        render(<TimelinePanelWindow node={makeNode()} onChange={onChange} />)
        fireEvent.click(screen.getByText('add clip'))
        expect(onChange).toHaveBeenCalledTimes(1)
        const clips = onChange.mock.calls[0][0]
        expect(clips).toHaveLength(1)
        expect(clips[0]).toMatchObject({ at: 0, dur: 60 })
    })

    it('never reuses an existing clip id', () => {
        const onChange = vi.fn()
        const existing = [
            { id: 'clip-1', at: 0, dur: 60 },
            { id: 'clip-2', at: 60, dur: 60 }
        ]
        render(<TimelinePanelWindow node={makeNode(existing)} onChange={onChange} />)
        fireEvent.click(screen.getByText('add clip'))
        const clips = onChange.mock.calls[0][0]
        const ids = clips.map((clip) => clip.id)
        expect(new Set(ids).size).toBe(ids.length)
        expect(clips).toHaveLength(3)
    })

    it('is disabled when the panel is read-only', () => {
        render(<TimelinePanelWindow node={makeNode()} />)
        expect(screen.getByText('add clip')).toBeDisabled()
    })
})

describe('TimelinePanelWindow transport', () => {
    it('Play anchors the run to the document clock through node.values', () => {
        const onTransport = vi.fn()
        render(<TimelinePanelWindow node={makeNode()} onChange={vi.fn()} onTransport={onTransport} clockNow={5000} />)
        fireEvent.click(screen.getByRole('button', { name: 'Play' }))
        expect(onTransport).toHaveBeenCalledWith({ playing: true, playFromFrame: 0, playStartClockMs: 5000 })
    })

    it('Pause writes the derived frame back as the standing head', () => {
        const onTransport = vi.fn()
        const playingNode = {
            ...makeNode(),
            values: { clips: [], fps: 60, playing: true, playFromFrame: 60, playStartClockMs: 1000 }
        }
        // 2 seconds after the press at 60fps: the head stands at 180
        render(<TimelinePanelWindow node={playingNode} onChange={vi.fn()} onTransport={onTransport} clockNow={3000} />)
        fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
        expect(onTransport).toHaveBeenCalledWith({ playing: false, playheadFrame: 180 })
    })

    it('offers no transport at all without a writer', () => {
        render(<TimelinePanelWindow node={makeNode()} />)
        expect(screen.queryByRole('button', { name: 'Play' })).toBeNull()
    })
})
