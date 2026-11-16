import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// jsdom cannot draw WebGL: the 3D chunk is a stub that proves it was asked for.
vi.mock('./MonitorMap3D.jsx', () => ({
    default: ({ layout, onPick, live }) => (
        <div data-testid="map3d" data-live={String(live)} data-count={layout.nodes.length}>
            <button type="button" data-testid="map3d-pick" onClick={() => onPick(layout.nodes[0])}>pick</button>
        </div>
    )
}))

import MonitorMap from './MonitorMap.jsx'
import { layoutMap, ASPECT } from './monitorMapLayout.js'

const map = () => ({
    nodes: [
        { id: 'tier:prod', kind: 'tier', label: 'prod', state: 'ok' },
        { id: 'tier:dev', kind: 'tier', label: 'dev', state: 'warn' },
        { id: 'machine:aylmo', kind: 'machine', label: 'aylmo', state: 'ok' },
        { id: 'machine:asuz', kind: 'machine', label: 'asuz', state: 'off' },
        { id: 'space:platina', kind: 'space', label: 'platina', state: 'warn' },
        { id: 'show:muth', kind: 'show', label: 'MUTH', state: 'ok' },
        { id: 'agent:a1', kind: 'agent', label: 'PC performance optimization', state: 'ok' },
        { id: 'repo:di', kind: 'repo', label: 'di.iiii', state: 'ok' }
    ],
    edges: [
        { from: 'machine:aylmo', to: 'tier:dev', kind: 'runs' },
        { from: 'tier:dev', to: 'space:platina', kind: 'serves' },
        { from: 'space:platina', to: 'show:muth', kind: 'holds' },
        { from: 'agent:a1', to: 'machine:aylmo', kind: 'works-on' }
    ]
})

beforeEach(() => { window.localStorage.clear() })
afterEach(() => { cleanup(); window.localStorage.clear() })

// 36 nodes shaped like the real map (many spaces, few machines): generated, never the real names
const synthetic = () => {
    const nodes = []
    const edges = []
    for (let i = 0; i < 3; i += 1) nodes.push({ id: `tier:t${i}`, kind: 'tier', label: `tier ${i}`, state: 'ok' })
    nodes.push({ id: 'machine:m0', kind: 'machine', label: 'machine 0', state: 'ok' })
    for (let i = 0; i < 29; i += 1) {
        nodes.push({ id: `space:s${i}`, kind: 'space', label: `space number ${i}`, state: i % 7 === 0 ? 'warn' : 'ok' })
        edges.push({ from: `tier:t${i % 3}`, to: `space:s${i}`, kind: 'holds' })
    }
    for (let i = 0; i < 2; i += 1) nodes.push({ id: `agent:a${i}`, kind: 'agent', label: `agent ${i}`, state: 'ok' })
    nodes.push({ id: 'repo:r0', kind: 'repo', label: 'repo', state: 'ok' })
    return { nodes, edges }
}

describe('layoutMap', () => {
    it('36 nodes: all placed apart, and the fit box holds every card tightly', () => {
        const m = synthetic()
        expect(m.nodes.length).toBe(36)
        const l = layoutMap(m)
        expect(l.pos.size).toBe(36)
        expect(new Set([...l.pos.values()].map((p) => `${p.x},${p.y}`)).size).toBe(36)
        for (const p of l.pos.values()) {
            expect(p.x).toBeGreaterThan(l.bounds.x)
            expect(p.x).toBeLessThan(l.bounds.x + l.bounds.w)
            expect(p.y).toBeGreaterThan(l.bounds.y)
            expect(p.y).toBeLessThan(l.bounds.y + l.bounds.h)
        }
        expect(l.bounds.w / l.bounds.h).toBeLessThan(2.2) // a map, not a ribbon: fills a desk stage
        expect(layoutMap(synthetic()).bounds).toEqual(l.bounds)
    })

    it('is stable: same input, same positions', () => {
        const a = layoutMap(map())
        const reversed = map()
        reversed.nodes.reverse()
        const b = layoutMap(reversed)
        for (const n of map().nodes) expect(b.pos.get(n.id)).toEqual(a.pos.get(n.id))
    })

    it('places every node and no two on one spot', () => {
        const big = { nodes: [], edges: [] }
        for (let i = 0; i < 40; i += 1) big.nodes.push({ id: `space:${i}`, kind: 'space', label: `s${i}`, state: 'ok' })
        for (let i = 0; i < 6; i += 1) big.nodes.push({ id: `machine:${i}`, kind: 'machine', label: `m${i}`, state: 'ok' })
        for (const m of [map(), big]) {
            const l = layoutMap(m)
            expect(l.pos.size).toBe(m.nodes.length)
            const spots = new Set([...l.pos.values()].map((p) => `${p.x},${p.y}`))
            expect(spots.size).toBe(m.nodes.length)
        }
    })

    it('rings: tiers inside machines inside the rest; 3D height by kind', () => {
        const l = layoutMap(map())
        const r = (id) => { const p = l.pos.get(id); return Math.hypot(p.x / ASPECT, p.y) }
        expect(r('tier:dev')).toBeLessThan(r('machine:aylmo'))
        expect(r('machine:aylmo')).toBeLessThan(r('space:platina'))
        expect(l.pos.get('tier:dev').h).toBeGreaterThan(l.pos.get('machine:aylmo').h)
        expect(l.pos.get('machine:aylmo').h).toBeGreaterThan(l.pos.get('space:platina').h)
    })

    it('drops edges to unknown nodes and copes with no map', () => {
        const m = map()
        m.edges.push({ from: 'ghost', to: 'tier:dev', kind: 'runs' })
        expect(layoutMap(m).edges.length).toBe(4)
        expect(layoutMap(undefined).pos.size).toBe(0)
    })
})

describe('MonitorMap views', () => {
    it('draws the 2D graph by default with one card per node', () => {
        render(<MonitorMap map={map()} onPick={() => {}} />)
        expect(document.querySelector('[data-monitor-map="graph"]')).toBeTruthy()
        expect(document.querySelectorAll('[data-map-node]').length).toBe(8)
        expect(document.querySelectorAll('.monitor-edge').length).toBe(3) // the holds line (space to show) is hidden until hover
    })

    it('toggle 2D / 3D / List switches and remembers per browser', async () => {
        const { unmount } = render(<MonitorMap map={map()} onPick={() => {}} />)
        fireEvent.click(document.querySelector('[data-map-view="3d"]'))
        expect(await screen.findByTestId('map3d')).toBeTruthy()
        expect(window.localStorage.getItem('di.monitor.map.view')).toBe('3d')
        unmount()
        render(<MonitorMap map={map()} onPick={() => {}} />)
        expect(await screen.findByTestId('map3d')).toBeTruthy()
        fireEvent.click(document.querySelector('[data-map-view="list"]'))
        expect(document.querySelector('[data-monitor-map="list"]')).toBeTruthy()
        expect(screen.queryByTestId('map3d')).toBeNull()
        expect(window.localStorage.getItem('di.monitor.map.view')).toBe('list')
    })

    it('a broken localStorage does not break the toggle', () => {
        const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
        render(<MonitorMap map={map()} onPick={() => {}} />)
        fireEvent.click(document.querySelector('[data-map-view="list"]'))
        expect(document.querySelector('[data-monitor-map="list"]')).toBeTruthy()
        spy.mockRestore()
    })

    it('List is the default under 600 px; a stored choice wins', () => {
        const { unmount } = render(<MonitorMap map={map()} onPick={() => {}} narrow />)
        expect(document.querySelector('[data-monitor-map="list"]')).toBeTruthy()
        expect(document.querySelector('svg')).toBeNull()
        unmount()
        window.localStorage.setItem('di.monitor.map.view', '2d')
        render(<MonitorMap map={map()} onPick={() => {}} narrow />)
        expect(document.querySelector('[data-monitor-map="graph"]')).toBeTruthy()
    })

    it('hover lights the node, its neighbours and edges, and dims the rest', () => {
        render(<MonitorMap map={map()} onPick={() => {}} />)
        fireEvent.mouseEnter(document.querySelector('[data-map-node="tier:dev"]'))
        const dim = [...document.querySelectorAll('[data-map-node].is-dim')].map((g) => g.getAttribute('data-map-node')).sort()
        expect(dim).toEqual(['agent:a1', 'machine:asuz', 'repo:di', 'show:muth', 'tier:prod'])
        expect(document.querySelector('[data-map-node="machine:aylmo"]').classList.contains('is-dim')).toBe(false)
        expect(document.querySelector('[data-map-node="space:platina"]').classList.contains('is-dim')).toBe(false)
        expect(document.querySelectorAll('.monitor-edge.is-lit').length).toBe(2)
        expect(document.querySelectorAll('.monitor-edge.is-dim').length).toBe(1)
        expect(document.querySelector('.monitor-tip')).toBeNull() // a short label is not cut: no tip
        fireEvent.mouseLeave(document.querySelector('[data-map-node="tier:dev"]'))
        expect(document.querySelectorAll('.is-dim').length).toBe(0)
        fireEvent.mouseEnter(document.querySelector('[data-map-node="agent:a1"]'))
        expect(document.querySelector('.monitor-tip')).toBeTruthy() // a cut label gets its full name
    })

    it('holds lines appear when their node is hovered', () => {
        render(<MonitorMap map={map()} onPick={() => {}} />)
        const before = document.querySelectorAll('.monitor-edge').length
        fireEvent.mouseEnter(document.querySelector('[data-map-node="space:platina"]'))
        expect(document.querySelectorAll('.monitor-edge').length).toBe(before + 1)
    })

    it('a family of spaces folds into one group node that opens on click, and the filter opens it', () => {
        const nodes = [{ id: 'tier:dev', kind: 'tier', label: 'dev', state: 'ok' }]
        const edges = []
        for (let i = 0; i < 10; i += 1) { nodes.push({ id: `space:dev:s${i}`, kind: 'space', label: `s${i}`, state: 'ok' }); edges.push({ from: 'tier:dev', to: `space:dev:s${i}`, kind: 'holds' }) }
        const picked = []
        const { rerender } = render(<MonitorMap map={{ nodes, edges }} onPick={(n) => picked.push(n.id)} />)
        expect(document.querySelectorAll('[data-map-node]').length).toBe(2)
        fireEvent.click(document.querySelector('[data-map-node^="group:"]'))
        expect(picked).toEqual([]) // a group opens, it is not a detail
        expect(document.querySelectorAll('[data-map-node]').length).toBe(11)
        expect(screen.getByText('Fold spaces')).toBeTruthy()
        fireEvent.click(screen.getByText('Fold spaces'))
        expect(document.querySelectorAll('[data-map-node]').length).toBe(2)
        rerender(<MonitorMap map={{ nodes, edges }} onPick={() => {}} query="s1" />)
        expect(document.querySelectorAll('[data-map-node]').length).toBe(11)
    })

    it('live edges move only while live', () => {
        const { rerender } = render(<MonitorMap map={map()} onPick={() => {}} />)
        expect(document.querySelectorAll('.monitor-edge.is-live').length).toBe(0)
        rerender(<MonitorMap map={map()} onPick={() => {}} live />)
        expect(document.querySelectorAll('.monitor-edge.is-live').length).toBe(2) // runs + serves
    })

    it('a click opens the node in 2D, List and 3D', async () => {
        const onPick = vi.fn()
        render(<MonitorMap map={map()} onPick={onPick} />)
        fireEvent.click(document.querySelector('[data-map-node="space:platina"]'))
        expect(onPick).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'space:platina' }))
        fireEvent.click(document.querySelector('[data-map-view="list"]'))
        fireEvent.click(document.querySelector('[data-map-node="machine:asuz"]'))
        expect(onPick).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'machine:asuz' }))
        fireEvent.click(document.querySelector('[data-map-view="3d"]'))
        fireEvent.click(await screen.findByTestId('map3d-pick'))
        expect(onPick).toHaveBeenCalledTimes(3)
    })

    it('sizes its stage from where it starts, never under 420 px', () => {
        render(<div className="monitor-page"><MonitorMap map={synthetic()} onPick={() => {}} /></div>)
        const h = parseInt(document.querySelector('.monitor-map').style.getPropertyValue('--monitor-map-h'), 10)
        expect(h).toBeGreaterThanOrEqual(420)
    })

    it('hands `live` to the 3D view and shows a note on an empty map', async () => {
        window.localStorage.setItem('di.monitor.map.view', '3d')
        const { unmount } = render(<MonitorMap map={map()} onPick={() => {}} live />)
        expect((await screen.findByTestId('map3d')).getAttribute('data-live')).toBe('true')
        unmount()
        render(<MonitorMap map={{ nodes: [], edges: [] }} onPick={() => {}} />)
        expect(screen.getByText(/Nothing on the map yet/)).toBeTruthy()
    })
})
