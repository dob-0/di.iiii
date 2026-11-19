import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// jsdom cannot draw WebGL: the 3D chunk is a stub that lists the nodes it was given and reports picks.
vi.mock('./MonitorMap3D.jsx', () => ({
    default: ({ layout, selectedId, onPick, world }) => (
        <div data-stub-3d data-world={world ? 'on' : 'off'}>
            {layout.nodes.map((n) => (
                <button key={n.id} type="button" data-stub3d-node={n.id} aria-pressed={selectedId === n.id} onClick={() => onPick(n)}>{n.label}</button>
            ))}
        </div>
    )
}))

import SpacesMixed from './SpacesMixed.jsx'
import { buildSpacesWorld, personNodeId, spaceNodeId } from './spacesWorld.js'

const spaces = [{ id: 'a', label: 'Alpha', isPublic: true }, { id: 'b', label: 'Beta' }]
const users = [{ id: 'u1', displayName: 'Ana', role: 'editor', spaces: ['a'] }, { id: 'u2', displayName: 'Bo', role: 'viewer', spaces: ['b'] }]

const Host = ({ world }) => {
    const [sel, setSel] = React.useState(null)
    return <SpacesMixed world={world} selectedId={sel} onPick={(n) => setSel(n.id)} />
}

describe('Mixed view', () => {
    it('renders the three panes: 3D, 2D and the live list', async () => {
        const { container } = render(<Host world={buildSpacesWorld(spaces, users)} />)
        expect(container.querySelector('[data-mixed-pane="3d"]')).toBeTruthy()
        expect(container.querySelector('[data-mixed-pane="2d"] svg')).toBeTruthy()
        expect(container.querySelector('[data-mixed-pane="list"] .monitor-map-list')).toBeTruthy()
        expect(await screen.findByText('Alpha', { selector: '[data-stub3d-node]' })).toBeTruthy()
    })

    it('one shared selection: a pick in any pane lights the node in all three', async () => {
        const { container } = render(<Host world={buildSpacesWorld(spaces, users)} />)
        await screen.findByText('Alpha', { selector: '[data-stub3d-node]' })
        const id = personNodeId('u1')
        const inList = container.querySelector(`[data-mixed-pane="list"] [data-map-node="${id}"]`)
        fireEvent.click(inList)
        expect(container.querySelector(`[data-mixed-pane="list"] [data-map-node="${id}"]`).getAttribute('aria-pressed')).toBe('true')
        expect(container.querySelector(`[data-mixed-pane="2d"] [data-pointer-node="${id}"]`).getAttribute('aria-pressed')).toBe('true')
        expect(container.querySelector(`[data-stub3d-node="${id}"]`).getAttribute('aria-pressed')).toBe('true')
        // and a pick in 3D moves it everywhere
        const sid = spaceNodeId('b')
        fireEvent.click(container.querySelector(`[data-stub3d-node="${sid}"]`))
        expect(container.querySelector(`[data-mixed-pane="2d"] [data-pointer-node="${sid}"]`).getAttribute('aria-pressed')).toBe('true')
        expect(container.querySelector(`[data-mixed-pane="list"] [data-map-node="${sid}"]`).getAttribute('aria-pressed')).toBe('true')
        expect(container.querySelector(`[data-mixed-pane="2d"] [data-pointer-node="${id}"]`).getAttribute('aria-pressed')).toBe('false')
    })

    it('one poll: a new world shows in all three panes at once', async () => {
        const { container, rerender } = render(<Host world={buildSpacesWorld(spaces, users)} />)
        await screen.findByText('Alpha', { selector: '[data-stub3d-node]' })
        const next = buildSpacesWorld([{ id: 'a', label: 'Alpha renamed', isPublic: true }, spaces[1]], users.slice(0, 1))
        rerender(<Host world={next} />)
        await screen.findByText('Alpha renamed', { selector: '[data-stub3d-node]' })
        for (const pane of ['2d', 'list']) expect(container.querySelector(`[data-mixed-pane="${pane}"]`).textContent).toContain('Alpha renamed')
        expect(container.querySelector(`[data-map-node="${personNodeId('u2')}"]`)).toBeNull()
        expect(within(container.querySelector('[data-mixed-pane="list"]')).queryByText('Bo')).toBeNull()
    })

    it('3D and 2D are pointer-only: hidden from assistive tech, out of the tab order, one data-map-node per node (the list), plus a zoom hint', async () => {
        const { container } = render(<Host world={buildSpacesWorld(spaces, users)} />)
        await screen.findByText('Alpha', { selector: '[data-stub3d-node]' })
        for (const pane of ['3d', '2d']) expect(container.querySelector(`[data-mixed-pane="${pane}"]`).getAttribute('aria-hidden')).toBe('true')
        const twoD = container.querySelector('[data-mixed-pane="2d"]')
        expect(twoD.querySelectorAll('[data-map-node]').length).toBe(0)
        expect([...twoD.querySelectorAll('[tabindex]')].every((e) => e.getAttribute('tabindex') === '-1')).toBe(true)
        expect(twoD.querySelectorAll('button:not([tabindex="-1"])').length).toBe(0)
        expect(container.querySelectorAll(`[data-map-node="${spaceNodeId('a')}"]`).length).toBe(1)
        expect(container.querySelector('[data-mixed-hint]').textContent).toMatch(/Ctrl\/Cmd \+ scroll|full screen/)
    })

    it('stacks 3D, 2D, list in one column under 1100 px (390 px included) and sits side by side above', () => {
        const css = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../styles/preferences.css'), 'utf8')
        expect(css).toMatch(/\.spaces-mixed\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1\.1fr\) minmax\(0, 1fr\)/)
        const stacked = css.match(/@media \(max-width: 1099px\) \{[^@]*?\.spaces-mixed \{[^}]*\}/)
        expect(stacked && stacked[0]).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/)
        // DOM order is the stacking order
        const { container } = render(<Host world={buildSpacesWorld(spaces, users)} />)
        const order = [...container.querySelectorAll('[data-mixed-pane]')].map((p) => p.getAttribute('data-mixed-pane'))
        expect(order).toEqual(['3d', '2d', 'list'])
    })
})
