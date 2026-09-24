import { fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ScrubNumberInput, {
    clampValue,
    computeDragValue,
    computeStepValue,
    getEffectiveStep,
    getModifierMultiplier,
    getStepDecimals,
    roundTo
} from './ScrubNumberInput.jsx'

describe('ScrubNumberInput pure math', () => {
    it('getEffectiveStep: uses the given step when finite and positive', () => {
        expect(getEffectiveStep(0.25, 3)).toBe(0.25)
        expect(getEffectiveStep(0, 3)).toBe(0.01) // 0 is not a usable step
        expect(getEffectiveStep(-1, 3)).toBe(0.01)
    })

    it('getEffectiveStep: falls back to a magnitude-based default when absent', () => {
        expect(getEffectiveStep(undefined, 3)).toBe(0.01) // |v| < 10
        expect(getEffectiveStep(undefined, -9.9)).toBe(0.01)
        expect(getEffectiveStep(undefined, 42)).toBe(0.1) // |v| >= 10
    })

    it('getStepDecimals reads decimal places off the step', () => {
        expect(getStepDecimals(0.01)).toBe(2)
        expect(getStepDecimals(0.1)).toBe(1)
        expect(getStepDecimals(1)).toBe(0)
        expect(getStepDecimals(NaN)).toBe(2)
    })

    it('roundTo avoids floating-point garbage', () => {
        expect(roundTo(0.1 + 0.2, 2)).toBe(0.3)
        expect(roundTo(0.30000000004, 2)).toBe(0.3)
    })

    it('clampValue clamps only against finite bounds', () => {
        expect(clampValue(5, 0, 10)).toBe(5)
        expect(clampValue(-5, 0, 10)).toBe(0)
        expect(clampValue(50, 0, 10)).toBe(10)
        expect(clampValue(50, undefined, undefined)).toBe(50)
    })

    it('getModifierMultiplier: shift is x10, alt/ctrl is x0.1, neither is x1', () => {
        expect(getModifierMultiplier({})).toBe(1)
        expect(getModifierMultiplier({ shiftKey: true })).toBe(10)
        expect(getModifierMultiplier({ altKey: true })).toBe(0.1)
        expect(getModifierMultiplier({ ctrlKey: true })).toBe(0.1)
    })

    it('computeDragValue: 1px = 1 step at the default rate, scaled by modifiers, clamped', () => {
        expect(computeDragValue({ startValue: 0, deltaX: 3, step: undefined })).toBeCloseTo(0.03, 5)
        expect(computeDragValue({ startValue: 0, deltaX: 3, step: undefined, shiftKey: true })).toBeCloseTo(0.3, 5)
        expect(computeDragValue({ startValue: 0, deltaX: 3, step: undefined, altKey: true })).toBeCloseTo(0.003, 5)
        expect(computeDragValue({ startValue: 9.98, deltaX: 100, step: undefined, max: 10 })).toBe(10)
        expect(computeDragValue({ startValue: 0, deltaX: -100, step: 1, min: -5 })).toBe(-5)
    })

    it('computeStepValue: moves one step per call in the given direction, clamped', () => {
        expect(computeStepValue({ currentValue: 5, direction: 1, step: 0.5 })).toBe(5.5)
        expect(computeStepValue({ currentValue: 5, direction: -1, step: 0.5 })).toBe(4.5)
        expect(computeStepValue({ currentValue: 5, direction: 1, step: 0.5, shiftKey: true })).toBe(10)
        expect(computeStepValue({ currentValue: 9.8, direction: 1, step: 0.5, max: 10 })).toBe(10)
    })
})

describe('ScrubNumberInput component', () => {
    let rafCallbacks

    beforeEach(() => {
        rafCallbacks = []
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
            rafCallbacks.push(cb)
            return rafCallbacks.length
        })
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    const flushFrame = () => {
        const cb = rafCallbacks[rafCallbacks.length - 1]
        rafCallbacks = []
        cb?.()
    }

    it('renders the canonical value as a spinbutton', () => {
        const { getByRole } = render(<ScrubNumberInput value={3.5} onChange={() => {}} />)
        const input = getByRole('spinbutton')
        expect(input.value).toBe('3.5')
        expect(input.getAttribute('aria-valuenow')).toBe('3.5')
    })

    it('a small movement under the 3px threshold is a click, not a drag: it enters text editing and fires no onChange', () => {
        const onChange = vi.fn()
        const { getByRole } = render(<ScrubNumberInput value={5} onChange={onChange} />)
        const input = getByRole('spinbutton')

        fireEvent.pointerDown(input, { button: 0, clientX: 0, clientY: 0, pointerId: 1 })
        fireEvent.pointerMove(window, { clientX: 2, clientY: 0 })
        fireEvent.pointerUp(window)

        expect(onChange).not.toHaveBeenCalled()
        expect(document.activeElement).toBe(input)
        expect(input.value).toBe('5') // draft opened on the canonical value, selected for retyping
    })

    it('a horizontal drag past the threshold scrubs the value, committing at most once per animation frame', () => {
        const onChange = vi.fn()
        const { getByRole } = render(<ScrubNumberInput value={5} onChange={onChange} />)
        const input = getByRole('spinbutton')
        input.setPointerCapture = vi.fn()

        fireEvent.pointerDown(input, { button: 0, clientX: 0, clientY: 0, pointerId: 1 })
        fireEvent.pointerMove(window, { clientX: 5, clientY: 0 }) // past 3px threshold, starts dragging
        fireEvent.pointerMove(window, { clientX: 8, clientY: 0 })
        fireEvent.pointerMove(window, { clientX: 12, clientY: 0 })

        expect(onChange).not.toHaveBeenCalled() // nothing flushed yet
        expect(input.setPointerCapture).toHaveBeenCalledWith(1)

        flushFrame()
        expect(onChange).toHaveBeenCalledTimes(1)
        expect(onChange.mock.calls[0][0]).toBeCloseTo(5.12, 5) // 5 + 12 * 0.01

        fireEvent.pointerUp(window)
        expect(document.activeElement).not.toBe(input) // a real drag does not open text editing
    })

    it('a vertical-first drag hands the gesture back to the page instead of scrubbing', () => {
        const onChange = vi.fn()
        const { getByRole } = render(<ScrubNumberInput value={5} onChange={onChange} />)
        const input = getByRole('spinbutton')

        fireEvent.pointerDown(input, { button: 0, clientX: 0, clientY: 0, pointerId: 1 })
        fireEvent.pointerMove(window, { clientX: 1, clientY: 20 }) // vertical dominant, past threshold
        fireEvent.pointerMove(window, { clientX: 40, clientY: 20 }) // would have scrubbed, but tracking stopped
        flushFrame()

        expect(onChange).not.toHaveBeenCalled()
    })

    it('the middle button drags without entering text editing on release', () => {
        const onChange = vi.fn()
        const { getByRole } = render(<ScrubNumberInput value={5} onChange={onChange} />)
        const input = getByRole('spinbutton')

        fireEvent.pointerDown(input, { button: 1, clientX: 0, clientY: 0, pointerId: 1 })
        fireEvent.pointerUp(window) // released with no movement
        expect(document.activeElement).not.toBe(input)
        expect(onChange).not.toHaveBeenCalled()
    })

    it('ArrowUp/ArrowRight increase and ArrowDown/ArrowLeft decrease by step, scaled by Shift/Alt', () => {
        const onChange = vi.fn()
        const { getByRole } = render(<ScrubNumberInput value={5} onChange={onChange} />)
        const input = getByRole('spinbutton')
        input.focus()

        fireEvent.keyDown(input, { key: 'ArrowUp' })
        expect(onChange).toHaveBeenLastCalledWith(5.01)

        // Shift steps by x10 (0.1) AND rounds to Shift's coarser decimals
        // (one fewer than the base step) — 5.01 - 0.1 = 4.91, rounded to 1
        // decimal place is 4.9.
        fireEvent.keyDown(input, { key: 'ArrowLeft', shiftKey: true })
        expect(onChange).toHaveBeenLastCalledWith(4.9)

        // Alt/Ctrl steps by x0.1 (0.001) with one extra decimal of precision.
        fireEvent.keyDown(input, { key: 'ArrowRight', altKey: true })
        expect(onChange).toHaveBeenLastCalledWith(4.901)
    })

    it('clamps arrow-key stepping to min/max', () => {
        const onChange = vi.fn()
        const { getByRole } = render(<ScrubNumberInput value={9.995} min={0} max={10} step={0.01} onChange={onChange} />)
        const input = getByRole('spinbutton')
        input.focus()
        fireEvent.keyDown(input, { key: 'ArrowUp' })
        expect(onChange).toHaveBeenLastCalledWith(10)
    })

    it('Enter commits the typed value and blurs', () => {
        const onChange = vi.fn()
        const { getByRole } = render(<ScrubNumberInput value={5} onChange={onChange} />)
        const input = getByRole('spinbutton')
        input.focus()
        fireEvent.change(input, { target: { value: '42' } })
        expect(onChange).toHaveBeenLastCalledWith(42)
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(document.activeElement).not.toBe(input)
    })

    it('Escape reverts to the value the field had when editing started', () => {
        const onChange = vi.fn()
        const { getByRole } = render(<ScrubNumberInput value={5} onChange={onChange} />)
        const input = getByRole('spinbutton')
        input.focus()
        fireEvent.change(input, { target: { value: '99' } })
        expect(onChange).toHaveBeenLastCalledWith(99)
        fireEvent.keyDown(input, { key: 'Escape' })
        expect(onChange).toHaveBeenLastCalledWith(5)
        expect(document.activeElement).not.toBe(input)
    })

    it('never commits an emptied field mid-typing (Number("") is 0)', () => {
        const onChange = vi.fn()
        const { getByRole } = render(<ScrubNumberInput value={5} onChange={onChange} />)
        const input = getByRole('spinbutton')
        input.focus()
        fireEvent.change(input, { target: { value: '' } })
        expect(onChange).not.toHaveBeenCalled()
    })

    it('mouse wheel over a focused field steps the value; an unfocused field is left alone', () => {
        const onChange = vi.fn()
        const { getByRole } = render(<ScrubNumberInput value={5} onChange={onChange} />)
        const input = getByRole('spinbutton')

        fireEvent.wheel(input, { deltaY: -100 })
        expect(onChange).not.toHaveBeenCalled() // not focused: page must still scroll

        input.focus()
        fireEvent.wheel(input, { deltaY: -100 })
        expect(onChange).toHaveBeenLastCalledWith(5.01)

        // Shift rounds to its coarser decimals: 5.01 - 0.1 = 4.91 -> 4.9.
        fireEvent.wheel(input, { deltaY: 100, shiftKey: true })
        expect(onChange).toHaveBeenLastCalledWith(4.9)
    })

    it('a disabled (wired) field ignores drag, keyboard and wheel', () => {
        const onChange = vi.fn()
        const { getByRole } = render(<ScrubNumberInput value={5} onChange={onChange} disabled />)
        const input = getByRole('spinbutton')
        expect(input.disabled).toBe(true)

        fireEvent.pointerDown(input, { button: 0, clientX: 0, clientY: 0, pointerId: 1 })
        fireEvent.pointerMove(window, { clientX: 20, clientY: 0 })
        fireEvent.pointerUp(window)
        flushFrame()
        fireEvent.wheel(input, { deltaY: -100 })

        expect(onChange).not.toHaveBeenCalled()
    })

    it('does not throw when setPointerCapture is unavailable (jsdom has no native implementation)', () => {
        const onChange = vi.fn()
        const { getByRole } = render(<ScrubNumberInput value={5} onChange={onChange} />)
        const input = getByRole('spinbutton')
        expect(input.setPointerCapture).toBeUndefined()

        expect(() => {
            fireEvent.pointerDown(input, { button: 0, clientX: 0, clientY: 0, pointerId: 1 })
            fireEvent.pointerMove(window, { clientX: 20, clientY: 0 })
            fireEvent.pointerUp(window)
            flushFrame()
        }).not.toThrow()
    })
})
