import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SceneEntityErrorBoundary from './SceneEntityErrorBoundary.jsx'

function Bomb({ shouldThrow }) {
    if (shouldThrow) throw new Error('boom')
    return <div>ok entity</div>
}

// Regression test for audit finding #20: no React error boundary existed
// anywhere in the app — a single unexpected synchronous throw during
// render would unmount everything up to the nearest boundary, which was
// the app root, blanking the whole viewport for every object, not just the
// bad one. This proves the boundary contains the failure to just its own
// subtree (renders nothing instead of propagating) and that a sibling
// rendered separately is unaffected — the actual scene-mount sites wrap
// each entity in its own boundary, so one bad entity never takes others
// down with it.
describe('SceneEntityErrorBoundary', () => {
    it('renders children normally when nothing throws', () => {
        render(
            <SceneEntityErrorBoundary resetKey="a">
                <Bomb shouldThrow={false} />
            </SceneEntityErrorBoundary>
        )
        expect(screen.getByText('ok entity')).toBeInTheDocument()
    })

    it('catches a synchronous render throw and renders nothing instead of propagating', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        expect(() => {
            render(
                <SceneEntityErrorBoundary resetKey="a">
                    <Bomb shouldThrow />
                </SceneEntityErrorBoundary>
            )
        }).not.toThrow()
        consoleError.mockRestore()
    })

    it('does not take down an unrelated sibling boundary', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        render(
            <>
                <SceneEntityErrorBoundary resetKey="bad">
                    <Bomb shouldThrow />
                </SceneEntityErrorBoundary>
                <SceneEntityErrorBoundary resetKey="good">
                    <Bomb shouldThrow={false} />
                </SceneEntityErrorBoundary>
            </>
        )
        expect(screen.getByText('ok entity')).toBeInTheDocument()
        consoleError.mockRestore()
    })

    it('gives a changed resetKey a fresh chance to render instead of staying blanked', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        const { rerender } = render(
            <SceneEntityErrorBoundary resetKey="v1">
                <Bomb shouldThrow />
            </SceneEntityErrorBoundary>
        )
        expect(screen.queryByText('ok entity')).not.toBeInTheDocument()

        rerender(
            <SceneEntityErrorBoundary resetKey="v2">
                <Bomb shouldThrow={false} />
            </SceneEntityErrorBoundary>
        )
        expect(screen.getByText('ok entity')).toBeInTheDocument()
        consoleError.mockRestore()
    })
})
