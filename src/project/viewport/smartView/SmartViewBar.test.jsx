// @vitest-environment jsdom
// The view bar's studio dress: rectangles (0-2 px) and a 44 px target at phone width (review B5-3).
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
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
