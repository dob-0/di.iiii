// @vitest-environment jsdom
// The Studio's Views section (StudioShellPanels.jsx): every view with its live/work switch, hide a built-in,
// remove an added one, add the current camera. Rows come from viewData.viewRows, as useProjectViews hands them.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ViewsSection } from './StudioShellPanels.jsx'
import { viewRows } from '../../project/viewport/smartView/viewData.js'

const views = (raw, production = null) => ({
    rows: viewRows(raw),
    production,
    setLive: vi.fn(),
    setHidden: vi.fn(),
    remove: vi.fn(),
    onAddCurrent: vi.fn(() => 'door')
})
const open = () => fireEvent.click(screen.getByRole('button', { name: /Views \(/ }))

describe('the Studio’s Views section', () => {
    it('a new project lists the six views, two of them live', () => {
        render(<ViewsSection views={views(undefined)} />)
        expect(screen.getByRole('button', { name: /^Views \(2 live\)/ })).toBeTruthy()
        open()
        expect(document.querySelectorAll('[data-view-row]')).toHaveLength(6)
        expect([...document.querySelectorAll('[data-view-row][data-live="true"]')].map((r) => r.dataset.viewRow)).toEqual(['floor', 'top'])
    })
    it('marks a view live, hides a built-in, removes an added view, adds this camera', () => {
        const v = views([{ id: 'floor', live: true }, { id: 'door', label: 'Door', position: [0, 1, 0], target: [0, 1, -1], live: false }])
        render(<ViewsSection views={v} />)
        open()
        fireEvent.click(document.querySelector('[data-view-row="dj"] input[type="checkbox"]'))
        expect(v.setLive).toHaveBeenCalledWith('dj', true)
        fireEvent.click(screen.getByRole('button', { name: 'Hide Crane' }))
        expect(v.setHidden).toHaveBeenCalledWith('crane', true)
        fireEvent.click(screen.getByRole('button', { name: 'Remove Door' }))
        expect(v.remove).toHaveBeenCalledWith('door')
        fireEvent.change(screen.getByLabelText('New view from this camera'), { target: { value: 'Balcony' } })
        fireEvent.click(screen.getByRole('button', { name: 'Add this camera' }))
        expect(v.onAddCurrent).toHaveBeenCalledWith('Balcony')
    })
    it('a hidden built-in offers to come back; a production says its list is shared', () => {
        render(<ViewsSection views={views([{ id: 'side', hidden: true, live: false }], { title: 'Show 2030', versions: 3 })} />)
        open()
        expect(screen.getByRole('button', { name: 'Show Side' })).toBeTruthy()
        expect(screen.getByText(/Shared by every version of Show 2030 \(3\)/)).toBeTruthy()
    })
})
