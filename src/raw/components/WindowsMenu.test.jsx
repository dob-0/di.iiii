import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WindowsMenu from './WindowsMenu.jsx'
import { centreWindowFrame } from '../utils/windowLayout.js'

afterEach(cleanup)

const items = [{ id: 'a', label: 'VJ Deck', open: false }, { id: 'b', label: 'Out', open: true }]

describe('the Nodes Windows button', () => {
    it('lists every window with aria-checked; a hidden one is chosen by click', () => {
        const onChoose = vi.fn()
        render(<WindowsMenu items={items} onChoose={onChoose} onShowAll={vi.fn()} />)
        fireEvent.click(screen.getByRole('button', { name: /Windows/ }))
        expect(screen.getByRole('menuitemcheckbox', { name: /VJ Deck/ }).getAttribute('aria-checked')).toBe('false')
        expect(screen.getByRole('menuitemcheckbox', { name: /Out/ }).getAttribute('aria-checked')).toBe('true')
        fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /VJ Deck/ }))
        expect(onChoose).toHaveBeenCalledWith('a')
        expect(screen.queryByRole('menu')).toBe(null)
    })

    it('"Show all windows" calls back; it is off when nothing is hidden; Esc closes the menu', () => {
        const onShowAll = vi.fn()
        const { rerender } = render(<WindowsMenu items={items} onShowAll={onShowAll} />)
        fireEvent.click(screen.getByRole('button', { name: /Windows/ }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Show all windows' }))
        expect(onShowAll).toHaveBeenCalledTimes(1)
        rerender(<WindowsMenu items={[items[1]]} onShowAll={onShowAll} />)
        fireEvent.click(screen.getByRole('button', { name: /Windows/ }))
        expect(screen.getByRole('menuitem', { name: 'Show all windows' }).disabled).toBe(true)
        fireEvent.keyDown(window, { key: 'Escape' })
        expect(screen.queryByRole('menu')).toBe(null)
    })
})

describe('centreWindowFrame', () => {
    it('centres a screen window under the bar', () => {
        const f = centreWindowFrame({ frame: { x: -900, y: 5000, width: 400, height: 300 }, viewportWidth: 1400, viewportHeight: 900, workspaceTop: 60 })
        expect(f.x).toBe(500)
        expect(f.y).toBe(330)
    })
    it('brings a world window panned far away to the middle of the view', () => {
        const viewport = { panX: 3000, panY: -2000, zoom: 0.5, originLeft: 0, originTop: 0 }
        const f = centreWindowFrame({ frame: { x: 0, y: 0, width: 400, height: 300 }, space: 'world', viewport, viewportWidth: 1400, viewportHeight: 900, workspaceTop: 60 })
        // on screen: origin + x*zoom, so the window's centre lands at the view's centre
        const cx = viewport.panX + (f.x + f.width / 2) * viewport.zoom
        const cy = viewport.panY + (f.y + f.height / 2) * viewport.zoom
        expect(Math.abs(cx - 700)).toBeLessThanOrEqual(1)
        expect(Math.abs(cy - 480)).toBeLessThanOrEqual(1)
    })
})
