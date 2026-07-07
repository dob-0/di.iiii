import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import GizmoModeButtons from './GizmoModeButtons.jsx'

describe('GizmoModeButtons', () => {
    // Regression guard: these icons once shipped as double-encoded UTF-8
    // ('âœ¢' instead of '✢'), rendering as mojibake in every Inspector session.
    it('renders the intended single-codepoint gizmo glyphs, not mojibake', () => {
        render(<GizmoModeButtons gizmoMode="translate" setGizmoMode={vi.fn()} />)

        for (const glyph of ['✢', '⟳', '⇲']) {
            expect(screen.getByText(glyph)).toBeInTheDocument()
        }
        expect(document.body.textContent).not.toMatch(/â/)
    })
})
