import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import StudioControlCluster from './StudioControlCluster.jsx'
import { WIKI_ARTICLES } from '../../wiki/wikiContent.js'

const base = {
    spaceName: 'rig-mirror-test',
    projectName: 'room',
    editMode: 'navigate',
    onSetEditMode: () => {},
    gizmoMode: 'translate',
    onSetGizmoMode: () => {},
    openPanels: new Set(),
    onTogglePanel: () => {}
}

describe('the Lights button', () => {
    // Labelled "Lights", not "Rig": the wiki's "The rig" already names the
    // unrelated multi-machine feature (machines in one room finding each
    // other), and this button sat one click away from it in the same panel.
    it('is not drawn when there is no lighting here (every hosted di.iiii)', () => {
        render(<StudioControlCluster {...base} />)
        expect(screen.getByText('Hide UI')).toBeInTheDocument()
        expect(screen.queryByText('Lights')).toBeNull()
    })

    it('is drawn when there is, off by default, and toggles', () => {
        const onToggleRigMirror = vi.fn()
        const { rerender } = render(<StudioControlCluster {...base} onToggleRigMirror={onToggleRigMirror} />)
        const button = screen.getByText('Lights')
        expect(button).toHaveAttribute('title', 'Show the real lighting rig in the room')
        expect(button).toHaveAttribute('aria-pressed', 'false')
        expect(button.className).not.toMatch(/active/)
        fireEvent.click(button)
        expect(onToggleRigMirror).toHaveBeenCalledTimes(1)

        rerender(<StudioControlCluster {...base} onToggleRigMirror={onToggleRigMirror} rigMirrorOn />)
        expect(screen.getByText('Lights')).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByText('Lights').className).toMatch(/active/)
    })

    it('stays out of the simple jam view', () => {
        render(<StudioControlCluster {...base} minimal onToggleRigMirror={() => {}} />)
        expect(screen.queryByText('Lights')).toBeNull()
    })
})

describe('Send positions to the desk', () => {
    it('is drawn only while Lights is on, and only when there is somewhere to send to', () => {
        const onSendRigPositions = vi.fn()
        const { rerender } = render(<StudioControlCluster {...base} onToggleRigMirror={() => {}} onSendRigPositions={onSendRigPositions} />)
        expect(screen.queryByText('Send positions to the desk')).toBeNull()

        rerender(<StudioControlCluster {...base} onToggleRigMirror={() => {}} onSendRigPositions={onSendRigPositions} rigMirrorOn />)
        fireEvent.click(screen.getByText('Send positions to the desk'))
        expect(onSendRigPositions).toHaveBeenCalledTimes(1)

        rerender(<StudioControlCluster {...base} rigMirrorOn onSendRigPositions={onSendRigPositions} />)
        expect(screen.queryByText('Send positions to the desk')).toBeNull()
    })

    it('shows the desk\'s one-line answer beside the button, and nothing when there is none', () => {
        const { rerender } = render(<StudioControlCluster {...base} onToggleRigMirror={() => {}} onSendRigPositions={() => {}} rigMirrorOn rigPositionsNote="2 lamps moved" />)
        expect(screen.getByRole('status')).toHaveTextContent('2 lamps moved')
        rerender(<StudioControlCluster {...base} onToggleRigMirror={() => {}} onSendRigPositions={() => {}} rigMirrorOn rigPositionsNote="" />)
        expect(screen.queryByRole('status')).toBeNull()
    })
})

// The wiki kept calling the button "Rig" after it was renamed "Lights" — the rename's
// own note said the article was updated, and it was not. The article names the button
// the cluster draws, or this says so.
describe('the wiki names the button as the cluster draws it', () => {
    it('lighting-desk says Lights, never Rig button', () => {
        const article = WIKI_ARTICLES.find((a) => a.id === 'lighting-desk')
        const text = article.body.map((b) => (typeof b === 'string' ? b : JSON.stringify(b))).join('\n')
        expect(text).toContain('Lights button')
        expect(text).not.toMatch(/\bRig button\b/)
        expect(text).toContain('Send positions to the desk')
    })
})
