import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StudioControlCluster from './StudioControlCluster.jsx'
import { buildStudioPreviewUrl } from '../utils/previewUrl.js'

const base = {
    spaceName: 'MOXIR',
    projectName: 'v2.9',
    editMode: 'navigate',
    onSetEditMode: () => {},
    gizmoMode: 'translate',
    onSetGizmoMode: () => {},
    openPanels: new Set(),
    onTogglePanel: () => {},
    onShowHelp: () => {}
}

afterEach(() => vi.restoreAllMocks())

// Owner 2026-10-13 16:3x: "from studio I can't find the button to go to the preview". "↗ View live" is drawn
// only on the space's live project and opens the SPACE; a project being edited had no way across.
describe('the Preview button', () => {
    it('is not drawn while the Studio does not know the project\'s address', () => {
        render(<StudioControlCluster {...base} />)
        expect(screen.getByRole('button', { name: '? Help' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Preview' })).toBeNull()
    })

    it('is in the Display section, right after ? Help, and says what it does', () => {
        render(<StudioControlCluster {...base} previewUrl="http://diiii.localhost/moxir/v2-9" />)
        const help = screen.getByRole('button', { name: '? Help' })
        const preview = screen.getByRole('button', { name: 'Preview' })
        expect(help.nextElementSibling).toBe(preview)
        expect(preview.className).toBe('scc-btn')
        expect(preview.closest('.scc-section').querySelector('.scc-section-label')).toHaveTextContent('Display')
        expect(preview).toHaveAttribute('title', 'Preview — the scene as visitors see it (new tab)')
    })

    it('opens this project\'s VIEW page in a new tab, for a given space and slug', () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        const previewUrl = buildStudioPreviewUrl({ spaceSlug: 'moxir', spaceId: 'moxir', projectSlug: 'v2-9', projectId: 'moxir-v2-9' })
        render(<StudioControlCluster {...base} previewUrl={previewUrl} />)
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
        expect(open).toHaveBeenCalledTimes(1)
        expect(open).toHaveBeenCalledWith(`${window.location.origin}/moxir/v2-9`, '_blank', 'noopener')
    })

    it('opens the permanent address when the project has no slug', () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        const previewUrl = buildStudioPreviewUrl({ spaceId: 'moxir', projectId: 'moxir-v2-9' })
        render(<StudioControlCluster {...base} previewUrl={previewUrl} />)
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
        expect(open).toHaveBeenCalledWith(`${window.location.origin}/moxir/p/moxir-v2-9`, '_blank', 'noopener')
    })

    it('is there in the simple jam view too: a preview is not power-user chrome', () => {
        render(<StudioControlCluster {...base} minimal previewUrl="http://diiii.localhost/open/open-jam" />)
        expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument()
    })

    it('leaves View live as it was: only on the space\'s live project, and it still opens the space', () => {
        const onViewLive = vi.fn()
        const { rerender } = render(<StudioControlCluster {...base} previewUrl="http://diiii.localhost/moxir/v2-9" onViewLive={onViewLive} />)
        expect(screen.queryByRole('button', { name: '↗ View live' })).toBeNull()
        rerender(<StudioControlCluster {...base} previewUrl="http://diiii.localhost/moxir/v2-9" onViewLive={onViewLive} canViewLive />)
        fireEvent.click(screen.getByRole('button', { name: '↗ View live' }))
        expect(onViewLive).toHaveBeenCalledTimes(1)
    })
})
