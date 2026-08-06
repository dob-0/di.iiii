import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Vector3Control from './Vector3Control.jsx'

// Regression guard: the Inspector panel scrolls (panels/inspector.css:
// `.panel-content { overflow: auto }`) and these axis inputs are narrow, so a
// wheel gesture aimed at scrolling the panel routinely passes over one. The
// handler used to react to every wheel event regardless of focus, silently
// nudging Position/Rotation/Scale/Dimensions just from scrolling past them.
describe('Vector3Control wheel adjust', () => {
    it('does not change the value on a wheel event while the field is not focused', () => {
        const onCommit = vi.fn()
        render(<Vector3Control label="Position" value={[1, 2, 3]} onCommit={onCommit} />)

        const xInput = screen.getAllByRole('textbox')[0]
        expect(document.activeElement).not.toBe(xInput)
        fireEvent.wheel(xInput, { deltaY: -100 })

        expect(onCommit).not.toHaveBeenCalled()
        expect(xInput.value).toBe('1.00')
    })

    it('adjusts the value on a wheel event once the field is focused', () => {
        const onCommit = vi.fn()
        render(<Vector3Control label="Position" value={[1, 2, 3]} onCommit={onCommit} />)

        const xInput = screen.getAllByRole('textbox')[0]
        xInput.focus()
        fireEvent.wheel(xInput, { deltaY: -100 })

        expect(onCommit).toHaveBeenCalled()
        const [nextValues] = onCommit.mock.calls[0]
        expect(nextValues[0]).toBeCloseTo(1.01)
    })
})
