// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ScenePicker from './ScenePicker.jsx'
import { scenesOf } from '../utils/scenesOf.js'

const document = {
    mappingState: { cues: [
        { id: 'c1', name: 'the net (lasers only)', lightLook: 'rig-lasers', hold: 12 },
        { id: 'c2', name: 'the tent', lightLook: 'rig-tent', hold: 12 },
        { id: 'c3', name: 'no such look', lightLook: 'rig-missing', hold: 5 },
    ] },
    entities: [{ id: 'rig-show', components: { rigLooks: { looks: [
        { id: 'black', title: 'The black', intent: 'Nothing lit' },
        { id: 'lasers', title: 'Lasers only (full, previs)', intent: 'Only the lasers: the matrix over the dance floor, the hall dark.' },
        { id: 'tent', title: 'The tent', intent: 'The red tent alone: the two fans meet under the roof.' },
    ] } } }],
}

afterEach(() => cleanup())

describe('scenesOf: the cue list with each look\'s one-line intent', () => {
    it('keeps the cue order, strips the rig- prefix, carries title and intent; a cue without a look still lists', () => {
        const s = scenesOf(document)
        expect(s.map((x) => x.lookId)).toEqual(['lasers', 'tent', 'missing'])
        expect(s[0].intent).toMatch(/^Only the lasers/)
        expect(s[2].intent).toBe('')
        expect(scenesOf(null)).toEqual([])
    })
})

describe('ScenePicker: open by default in the Studio, picks a scene to see its light', () => {
    it('lists every scene with its intent, says which is on, and folds', () => {
        const onPick = vi.fn()
        render(<ScenePicker document={document} current={undefined} onPick={onPick} />)
        expect(screen.getByText('SCENES · 3')).toBeInTheDocument()
        expect(screen.getByText('the tent')).toBeInTheDocument()
        expect(screen.getByText(/The red tent alone/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Follow the show' }).getAttribute('aria-pressed')).toBe('true')
        fireEvent.click(screen.getByText('the tent'))
        expect(onPick).toHaveBeenCalledWith('tent')
        fireEvent.click(screen.getByRole('button', { name: 'Work light' }))
        expect(onPick).toHaveBeenCalledWith('')
        fireEvent.click(screen.getByRole('button', { name: 'fold' }))
        expect(screen.queryByText('the tent')).toBeNull()
    })
    it('marks the picked scene and renders nothing for a document without a show', () => {
        render(<ScenePicker document={document} current="tent" onPick={() => {}} />)
        expect(screen.getByText('the tent').closest('button').getAttribute('aria-pressed')).toBe('true')
        expect(screen.getByText('the net (lasers only)').closest('button').getAttribute('aria-pressed')).toBe('false')
        cleanup()
        const { container } = render(<ScenePicker document={{ entities: [] }} />)
        expect(container.innerHTML).toBe('')
    })
})
