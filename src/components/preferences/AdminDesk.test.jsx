import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

vi.mock('./AdminWindowBodies.jsx', () => ({
    default: ({ kind }) => <div data-testid={`body-${kind}`}>body {kind}</div>,
    windowMoreItems: () => []
}))
vi.mock('./useAdminTiles.js', () => ({
    default: () => ({ tiles: {}, report: () => {}, refresh: () => {} }),
    buildTiles: () => ({})
}))

import AdminDesk from './AdminDesk.jsx'
import { ModuleSection, Hint } from './PreferencesShared.jsx'

const data = { entries: [], managementButtons: [], objects: [], sync: {} }
const desk = (props = {}) => render(<AdminDesk data={data} monitorState="no" spaceId="main" connected {...props} />)

beforeEach(() => { window.localStorage.clear(); window.location.hash = ''; window.innerWidth = 1440; window.innerHeight = 1000 })
afterEach(() => cleanup())

describe('AdminDesk', () => {
    it('opens on a tile per section and no window; the Monitor tile is absent without a 200', () => {
        desk()
        expect(screen.getAllByRole('button', { name: /^(Spaces and users|Open call|Agents|Visitors|Status|Scene objects|Switches|Log|Build info|Machines):/ })).toHaveLength(10)
        expect(screen.queryByRole('button', { name: /^Monitor:/ })).toBeNull()
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('shows the Monitor tile after the server said 200', () => {
        desk({ monitorState: 'yes' })
        expect(screen.getByRole('button', { name: /^Monitor:/ })).toBeTruthy()
    })

    it('a tile opens its window in one click, a second tile opens a second one side by side', () => {
        desk()
        fireEvent.click(screen.getByRole('button', { name: /^Visitors:/ }))
        expect(screen.getByRole('dialog', { name: 'Visitors' })).toBeTruthy()
        expect(screen.getByTestId('body-visitors')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: /^Windows/ }))
        fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Log' }))
        expect(screen.getAllByRole('dialog').map((d) => d.getAttribute('aria-label')).sort()).toEqual(['Log', 'Visitors'])
    })

    it('/admin#section opens that window, and #monitor mounts nothing until the server said 200', () => {
        window.location.hash = '#agents'
        desk()
        expect(screen.getByRole('dialog', { name: 'Agents' })).toBeTruthy()
        cleanup()
        window.localStorage.clear()
        window.location.hash = '#monitor-full'
        desk({ monitorState: 'pending' })
        expect(screen.queryByTestId('body-monitor')).toBeNull()
        cleanup()
        window.localStorage.clear()
        desk({ monitorState: 'no' })
        expect(screen.queryByTestId('body-monitor')).toBeNull()
        expect(screen.getByRole('dialog', { name: 'Spaces and users' })).toBeTruthy()
        cleanup()
        window.localStorage.clear()
        desk({ monitorState: 'yes' })
        expect(screen.getByRole('dialog', { name: 'Monitor' })).toBeTruthy()
    })

    it('remembers its windows per device and puts them back', () => {
        const first = desk()
        fireEvent.click(screen.getByRole('button', { name: /^Machines:/ }))
        first.unmount()
        desk()
        expect(screen.getByRole('dialog', { name: 'Machines' })).toBeTruthy()
    })

    it('the keys do nothing while typing in the find box, and ? opens the key card otherwise', () => {
        desk()
        const find = screen.getByRole('searchbox', { name: 'Find a window' })
        fireEvent.keyDown(find, { key: '?' })
        expect(screen.queryByRole('dialog', { name: 'Keys' })).toBeNull()
        fireEvent.keyDown(window, { key: '?' })
        expect(screen.getByRole('dialog', { name: 'Keys' })).toBeTruthy()
    })

    it('Find opens the first match on Enter', () => {
        desk()
        const find = screen.getByRole('searchbox', { name: 'Find a window' })
        fireEvent.change(find, { target: { value: 'visit' } })
        fireEvent.keyDown(find, { key: 'Enter' })
        expect(screen.getByRole('dialog', { name: 'Visitors' })).toBeTruthy()
    })

    it('Desk closes every window and shows the tiles again', () => {
        desk()
        fireEvent.click(screen.getByRole('button', { name: /^Log:/ }))
        fireEvent.click(screen.getByRole('button', { name: 'Desk' }))
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('a phone shows one window at a time', () => {
        window.innerWidth = 390
        desk()
        fireEvent.click(screen.getByRole('button', { name: /^Log:/ }))
        fireEvent.click(screen.getByRole('button', { name: 'Back' }))
        fireEvent.click(screen.getByRole('button', { name: /^Machines:/ }))
        expect(screen.getAllByRole('dialog')).toHaveLength(1)
    })
})

describe('hints instead of sentences', () => {
    it('a long subtitle becomes a ? hint (tooltip, focusable, opens on tap); a short fact stays', () => {
        const sentence = 'Everything you can manage from here, in one place'
        render(<ModuleSection title="Box" subtitle={sentence}><i /></ModuleSection>)
        const hint = screen.getByRole('button', { name: 'What is this?' })
        expect(hint.getAttribute('title')).toBe(sentence)
        expect(screen.queryByText(sentence)).toBeNull()
        fireEvent.click(hint)
        expect(screen.getByRole('note').textContent).toBe(sentence)
        cleanup()
        render(<ModuleSection title="Box" subtitle="3 tracked"><i /></ModuleSection>)
        expect(screen.getByText('3 tracked')).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'What is this?' })).toBeNull()
    })

    it('every tile has a hint', () => {
        desk()
        const tile = screen.getByRole('button', { name: /^Visitors:/ }).closest('.admin-tile')
        expect(within(tile).getByRole('button', { name: 'About Visitors' }).getAttribute('title')).toMatch(/block/)
    })

    it('renders nothing for an empty hint', () => {
        const { container } = render(<Hint text="" />)
        expect(container.textContent).toBe('')
    })
})
