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
        expect(open).toHaveBeenCalledWith(`${window.location.origin}/moxir/v2-9?render=show`, '_blank', 'noopener')
    })

    it('opens the permanent address when the project has no slug', () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        const previewUrl = buildStudioPreviewUrl({ spaceId: 'moxir', projectId: 'moxir-v2-9' })
        render(<StudioControlCluster {...base} previewUrl={previewUrl} />)
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
        expect(open).toHaveBeenCalledWith(`${window.location.origin}/moxir/p/moxir-v2-9?render=show`, '_blank', 'noopener')
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

// 2026-10-13: "objects move around their anchor point, no way to move an object in the world frame" — the gizmo ran in
// local space. World is the default (Blender's Global); the Local button switches the gizmo to the object's own axes.
describe('the Local axes button', () => {
    it('is off by default (world axes) and asks for local on a click', () => {
        const onSetGizmoSpace = vi.fn()
        render(<StudioControlCluster {...base} editMode="edit" gizmoMode="translate" onSetGizmoSpace={onSetGizmoSpace} />)
        const local = screen.getByRole('button', { name: /^Local$/ })
        expect(local.getAttribute('aria-pressed')).toBe('false')
        fireEvent.click(local)
        expect(onSetGizmoSpace).toHaveBeenCalledWith('local')
    })

    it('shows pressed and asks for world again when local is on', () => {
        const onSetGizmoSpace = vi.fn()
        render(<StudioControlCluster {...base} editMode="edit" gizmoMode="translate" gizmoSpace="local" onSetGizmoSpace={onSetGizmoSpace} />)
        const local = screen.getByRole('button', { name: /^Local$/ })
        expect(local.getAttribute('aria-pressed')).toBe('true')
        fireEvent.click(local)
        expect(onSetGizmoSpace).toHaveBeenCalledWith('world')
    })
})

// Owner 2026-10-13 20:2x: "can the Studio too have the buttons Walk / Fly?" — the visitor page has them; the Studio had Fly only on Shift+`.
describe('the Walk and Fly buttons', () => {
    it('are in the Tools section, after Select, and not pressed while nobody walks', () => {
        render(<StudioControlCluster {...base} onWalk={() => {}} />)
        const select = screen.getByRole('button', { name: 'Select' })
        const walk = screen.getByRole('button', { name: 'Walk' })
        const fly = screen.getByRole('button', { name: 'Fly' })
        expect(select.nextElementSibling).toBe(walk)
        expect(walk.nextElementSibling).toBe(fly)
        expect(walk.closest('.scc-section').querySelector('.scc-section-label')).toHaveTextContent('Tools')
        for (const b of [walk, fly]) { expect(b.className).toBe('scc-btn '); expect(b).toHaveAttribute('aria-pressed', 'false') }
        expect(walk).toHaveAttribute('data-walk-mode', 'walk')
        expect(fly).toHaveAttribute('data-walk-mode', 'fly')
    })
    it('a click asks for that mode', () => {
        const onWalk = vi.fn()
        render(<StudioControlCluster {...base} onWalk={onWalk} />)
        fireEvent.click(screen.getByRole('button', { name: 'Walk' }))
        fireEvent.click(screen.getByRole('button', { name: 'Fly' }))
        expect(onWalk.mock.calls).toEqual([['walk'], ['fly']])
    })
    it('the running mode is pressed, the other is not', () => {
        const { rerender } = render(<StudioControlCluster {...base} onWalk={() => {}} walkMode="walk" />)
        expect(screen.getByRole('button', { name: 'Walk' })).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByRole('button', { name: 'Walk' }).className).toContain('active')
        expect(screen.getByRole('button', { name: 'Fly' })).toHaveAttribute('aria-pressed', 'false')
        rerender(<StudioControlCluster {...base} onWalk={() => {}} walkMode="fly" />)
        expect(screen.getByRole('button', { name: 'Fly' })).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByRole('button', { name: 'Walk' })).toHaveAttribute('aria-pressed', 'false')
    })
    it('are not drawn without onWalk', () => {
        render(<StudioControlCluster {...base} />)
        expect(screen.queryByRole('button', { name: 'Walk' })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Fly' })).toBeNull()
    })
})
