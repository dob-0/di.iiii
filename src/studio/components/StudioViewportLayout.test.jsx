import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import StudioViewportLayout from './StudioViewportLayout.jsx'

vi.mock('./StudioPresentationSurface.jsx', () => ({
    default: ({ cameraView, controlsRef }) => {
        // Simulate CameraControls mounting and attaching to the pane's ref
        if (controlsRef && !controlsRef.current) {
            controlsRef.current = { setLookAt: vi.fn(), fitToBox: vi.fn() }
        }
        return <output data-testid="camera-view">{JSON.stringify(cameraView)}</output>
    }
}))

vi.mock('./StudioGraphSurface.jsx', () => ({
    default: ({ document }) => <output data-testid="graph-surface">{document?.projectMeta?.id || 'no-doc'}</output>
}))

const singlePane = { type: 'view', id: 'root' }
const graphPane = { type: 'view', id: 'root', viewType: 'graph' }

describe('StudioViewportLayout camera wiring', () => {
    // Regression guard: StudioEditor's controlsRef was a plain useRef that no
    // pane ever attached to — save-view, frame-selected, click placement, XR
    // restore, and saved-view-on-load all silently read null. Panes must
    // register their live camera-controls ref into shared.paneControlsRef.
    it('registers the pane camera-controls ref into shared.paneControlsRef', () => {
        const paneControlsRef = { current: null }
        render(
            <StudioViewportLayout
                layout={singlePane}
                onSplit={vi.fn()}
                onClose={vi.fn()}
                onSetRatio={vi.fn()}
                shared={{ paneControlsRef }}
            />
        )
        expect(paneControlsRef.current).not.toBeNull()
        expect(typeof paneControlsRef.current.current.setLookAt).toBe('function')
    })

    it('opens the perspective view on the saved view when one exists', () => {
        const initialCameraView = { position: [9, 9, 9], target: [1, 2, 3] }
        render(
            <StudioViewportLayout
                layout={singlePane}
                onSplit={vi.fn()}
                onClose={vi.fn()}
                onSetRatio={vi.fn()}
                shared={{ initialCameraView }}
            />
        )
        const view = JSON.parse(screen.getByTestId('camera-view').textContent)
        expect(view.position).toEqual([9, 9, 9])
        expect(view.target).toEqual([1, 2, 3])
    })

    it('falls back to the perspective preset without a saved view', () => {
        render(
            <StudioViewportLayout
                layout={singlePane}
                onSplit={vi.fn()}
                onClose={vi.fn()}
                onSetRatio={vi.fn()}
                shared={{}}
            />
        )
        const view = JSON.parse(screen.getByTestId('camera-view').textContent)
        expect(view.position).toEqual([4, 3, 6.5])
    })
})

describe('StudioViewportLayout node-graph pane (dev-only preview)', () => {
    it('renders the 3D viewport for a leaf with no viewType (default/unaffected)', () => {
        render(
            <StudioViewportLayout
                layout={singlePane}
                onSplit={vi.fn()}
                onClose={vi.fn()}
                onSetRatio={vi.fn()}
                shared={{}}
            />
        )
        expect(screen.getByTestId('camera-view')).toBeInTheDocument()
        expect(screen.queryByTestId('graph-surface')).not.toBeInTheDocument()
    })

    it('renders StudioGraphSurface for a viewType: "graph" leaf, not the 3D viewport', () => {
        render(
            <StudioViewportLayout
                layout={graphPane}
                onSplit={vi.fn()}
                onClose={vi.fn()}
                onSetRatio={vi.fn()}
                shared={{ document: { projectMeta: { id: 'proj-1' } } }}
            />
        )
        expect(screen.getByTestId('graph-surface')).toHaveTextContent('proj-1')
        expect(screen.queryByTestId('camera-view')).not.toBeInTheDocument()
    })
})

// 2026-10-01 MOXIR show test: the pane's H / V / N / W split buttons sat at opacity 0 + pointer-events none
// until the pane was hovered (so never on touch; elementFromPoint at their spot returned the canvas), and on
// a phone / tablet the fixed .smb-topbar covered the pane's top edge. jsdom does no layout: the stylesheet
// is read as text, and the measuring hook is driven with a faked bar rect.
describe('StudioViewportLayout split controls stay reachable', () => {
    it('stylesheet: the controls are visible and clickable at rest, not hover-only', async () => {
        const fs = await import('node:fs')
        const path = await import('node:path')
        const { cwd } = await import('node:process')
        const css = fs.readFileSync(path.join(cwd(), 'src/studio/styles/studio.css'), 'utf8')
        const block = css.match(/\.svl-pane-controls\s*\{[^}]*\}/)?.[0] ?? ''
        expect(block).not.toMatch(/opacity:\s*0\s*;/)
        expect(block).not.toMatch(/pointer-events:\s*none/)
        expect(css).toMatch(/\.svl-root\[data-stacked\]\s+\.svl-ctrl-btn\s*\{[^}]*min-height:\s*44px/)
    })

    it('sets --svl-top-clear from the phone context bar so the pane clears it', () => {
        const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
            const bottom = this.classList?.contains('smb-topbar') ? 163 : 0
            return { top: 0, bottom, left: 0, right: 390, width: 390, height: bottom, x: 0, y: 0 }
        })
        const { container } = render(
            <>
                <div className="smb-topbar" />
                <StudioViewportLayout layout={singlePane} onSplit={vi.fn()} onClose={vi.fn()} onSetRatio={vi.fn()} shared={{}} />
            </>
        )
        const root = container.querySelector('.svl-root')
        expect(root.style.getPropertyValue('--svl-top-clear')).toBe('163px')
        expect(root.dataset.stacked).toBe('true')
        rect.mockRestore()
    })

    it('leaves the variable alone when there is no phone context bar (desktop)', () => {
        const { container } = render(
            <StudioViewportLayout layout={singlePane} onSplit={vi.fn()} onClose={vi.fn()} onSetRatio={vi.fn()} shared={{}} />
        )
        const root = container.querySelector('.svl-root')
        expect(root.style.getPropertyValue('--svl-top-clear')).toBe('')
        expect(root.dataset.stacked).toBeUndefined()
    })
})
