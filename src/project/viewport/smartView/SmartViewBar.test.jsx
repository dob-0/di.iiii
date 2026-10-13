// @vitest-environment jsdom
// The view bar's studio dress: rectangles (0-2 px) and a 44 px target at phone width (review B5-3).
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import SmartViewBar from './SmartViewBar.jsx'

const presets = [{ id: 'a', label: 'Top', title: 'Top', key: '1' }]

describe('SmartViewBar studio variant', () => {
    it('has 2 px corners and is 44 px tall at phone width', () => {
        render(<SmartViewBar presets={presets} variant="studio" compact />)
        for (const b of screen.getAllByRole('button')) {
            expect(b.style.borderRadius).toBe('2px')
            expect(b.style.minHeight).toBe('44px')
        }
    })

    it('keeps the compact toolbar size on a desktop pane, still 2 px', () => {
        render(<SmartViewBar presets={presets} variant="studio" />)
        expect(screen.getAllByRole('button')[0].style.borderRadius).toBe('2px')
    })
})

// 2026-10-01 MOXIR show test: the bar sat at top:10 under the floating nav (z-index 10 at 0..38px), so every
// click on Floor / DJ / Top / Side / Rig / Crane / X-ray landed on the nav. jsdom does no layout; what we can
// hold is that the studio row is offset by the variable the studio shell feeds with the nav's / context bar's
// height, and that it can scroll sideways instead of running off a 390px phone.
describe('SmartViewBar studio variant clears what the studio draws over the pane', () => {
    it('is offset by --svl-top-clear (the nav) rather than pinned at 10px', () => {
        render(<SmartViewBar presets={presets} variant="studio" />)
        const style = screen.getByRole('toolbar').getAttribute('style') || ''
        expect(style).toMatch(/top:\s*calc\([^;]*var\(--svl-top-clear/)
        expect(style).not.toMatch(/top:\s*10px/)
    })

    it('drops under the split-controls row when the studio stacks them (--svl-ctrl-row)', () => {
        render(<SmartViewBar presets={presets} variant="studio" compact />)
        expect(screen.getByRole('toolbar').getAttribute('style')).toMatch(/--svl-ctrl-row/)
    })

    it('scrolls sideways instead of overflowing a phone', () => {
        render(<SmartViewBar presets={presets} variant="studio" compact />)
        const row = screen.getByRole('toolbar')
        expect(row.style.overflowX).toBe('auto')
        expect(row.style.maxWidth).toBeTruthy()
    })
})

// 2026-10-13: the owner could not find where to show the walls in the Studio — the viewer's page had the building
// switches, the Studio bar did not. With `onLayer` the bar carries Roof · Walls · Machines · Outside; `false` hides.
describe('SmartViewBar building switches', () => {
    it('draws the four layer switches only when onLayer is given, all shown by default', () => {
        const { unmount } = render(<SmartViewBar presets={presets} variant="studio" />)
        expect(screen.queryByText('Walls')).toBeNull()
        unmount()
        render(<SmartViewBar presets={presets} variant="studio" onLayer={() => {}} />)
        for (const label of ['Roof', 'Walls', 'Machines', 'Outside']) {
            expect(screen.getByText(label).getAttribute('aria-pressed')).toBe('true')
        }
    })

    it('a click asks to hide a shown layer and to show a hidden one', () => {
        const calls = []
        render(<SmartViewBar presets={presets} variant="studio" layers={{ walls: false }} onLayer={(id, shown) => calls.push([id, shown])} />)
        expect(screen.getByText('Walls').getAttribute('aria-pressed')).toBe('false')
        fireEvent.click(screen.getByText('Walls'))
        fireEvent.click(screen.getByText('Roof'))
        expect(calls).toEqual([['walls', true], ['roof', false]])
    })
})
