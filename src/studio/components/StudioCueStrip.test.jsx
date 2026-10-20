import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import StudioCueStrip from './StudioCueStrip.jsx'
import StudioControlCluster from './StudioControlCluster.jsx'

const CUES = [
    { id: 'cue-open', name: 'Open', key: '1', fade: 1, hold: 0, surfaces: {} },
    { id: 'cue-black', name: '', key: '2', fade: 0, hold: 0, surfaces: {} }
]

describe('the cue strip', () => {
    it('lists the cues by name and fires the one that is tapped', () => {
        const onFire = vi.fn()
        render(<StudioCueStrip cues={CUES} onFire={onFire} buttonClassName="scc-btn" />)

        fireEvent.click(screen.getByRole('button', { name: /Open/ }))

        expect(onFire).toHaveBeenCalledWith(CUES[0])
    })

    // A cue with no name is still a cue somebody has to be able to take. Its
    // position in the list is the only name it has.
    it('names an unnamed cue by its place in the list', () => {
        render(<StudioCueStrip cues={CUES} onFire={() => {}} />)
        expect(screen.getByRole('button', { name: /Cue 2/ })).toBeTruthy()
    })

    it('marks the cue that is up without drawing a second one bright', () => {
        render(<StudioCueStrip cues={CUES} liveCueId="cue-black" onFire={() => {}} />)
        expect(screen.getByRole('button', { name: /Cue 2/ }).getAttribute('aria-pressed')).toBe('true')
        expect(screen.getByRole('button', { name: /Open/ }).getAttribute('aria-pressed')).toBe('false')
    })

    it('draws nothing at all for a project with no cues', () => {
        const { container } = render(<StudioCueStrip cues={[]} onFire={() => {}} />)
        expect(container.firstChild).toBe(null)
    })
})

const cluster = {
    spaceName: 'stage',
    projectName: 'wall',
    editMode: 'navigate',
    onSetEditMode: () => {},
    gizmoMode: 'translate',
    onSetGizmoMode: () => {},
    openPanels: new Set(),
    onTogglePanel: () => {}
}

describe('the cue strip inside the control cluster', () => {
    // Owner 2026-10-12 06:30, editing a show's lamps: "the cue things is not necessary, remove that" — firing a cue from the
    // editing panel changed the shared show for everyone watching. The strip itself stays (phone bar, jam mode).
    it('is NOT in the cluster any more, even for a project with cues', () => {
        const onFireCue = vi.fn()
        render(<StudioControlCluster {...cluster} onOpenProjection={() => {}} cues={CUES} onFireCue={onFireCue} />)
        expect(screen.queryByRole('group', { name: 'Cues' })).toBe(null)
        expect(screen.queryByRole('button', { name: /^Open$/ })).toBe(null)
        expect(onFireCue).not.toHaveBeenCalled()
    })

    // The cluster is every project's chrome. A project that has never been on
    // a wall must not grow a row for a show it does not have.
    it('is not drawn for a project with no cues', () => {
        render(<StudioControlCluster {...cluster} cues={[]} onFireCue={() => {}} />)
        expect(screen.queryByRole('group', { name: 'Cues' })).toBe(null)
    })
})
