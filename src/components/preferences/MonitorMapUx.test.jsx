import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./MonitorMap3D.jsx', () => ({
    default: ({ fullscreen }) => <div data-testid="map3d" data-fullscreen={String(fullscreen)} />
}))

import MonitorMap, { wheelZooms } from './MonitorMap.jsx'
import { SectionNav } from './PreferencesShared.jsx'

const map = {
    nodes: [
        { id: 'tier:dev', kind: 'tier', label: 'dev', state: 'ok' },
        { id: 'machine:studio-mac', kind: 'machine', label: 'studio-mac', state: 'ok' }
    ],
    edges: [{ from: 'machine:studio-mac', to: 'tier:dev', kind: 'runs' }]
}
beforeEach(() => { window.localStorage.clear(); window.localStorage.setItem('di.monitor.map.view', '2d') })
afterEach(() => { cleanup(); window.localStorage.clear(); document.body.style.overflow = '' })

describe('map: when the wheel zooms', () => {
    it('plain wheel scrolls an embedded map; Ctrl, Cmd (a pinch), full screen or a map that fills its screen zoom', () => {
        expect(wheelZooms({ ctrlKey: false, metaKey: false }, false)).toBe(false)
        expect(wheelZooms({ ctrlKey: true }, false)).toBe(true)
        expect(wheelZooms({ metaKey: true }, false)).toBe(true)
        expect(wheelZooms({}, true)).toBe(true)
        expect(wheelZooms({}, false, true)).toBe(true)
    })
    it('a plain wheel over an embedded 2D map is not cancelled, so the page scrolls', () => {
        const { container } = render(<MonitorMap map={map} selectedId={null} onPick={() => {}} narrow={false} />)
        const svg = container.querySelector('svg.monitor-map-svg')
        const plain = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })
        svg.dispatchEvent(plain)
        expect(plain.defaultPrevented).toBe(false)
    })
    it('a plain wheel over the Monitor map (kinds) zooms it and the page does not scroll under it', () => {
        const { container } = render(<MonitorMap map={map} selectedId={null} onPick={() => {}} narrow={false} kinds />)
        const svg = container.querySelector('svg.monitor-map-svg')
        const before = svg.getAttribute('viewBox')
        const plain = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })
        svg.dispatchEvent(plain)
        expect(plain.defaultPrevented).toBe(true)
        return Promise.resolve().then(() => expect(svg.getAttribute('viewBox')).not.toBe(before))
    })
})

describe('map: full screen', () => {
    it('toggles, locks the page behind, passes the flag to 3D, and Esc leaves', () => {
        window.localStorage.setItem('di.monitor.map.view', '3d')
        const { container } = render(<MonitorMap map={map} selectedId={null} onPick={() => {}} narrow={false} />)
        const root = container.querySelector('.monitor-map')
        fireEvent.click(container.querySelector('[data-map-fullscreen]'))
        expect(root.className).toContain('is-fullscreen')
        expect(document.body.style.overflow).toBe('hidden')
        return screen.findByTestId('map3d').then((el) => {
            expect(el.dataset.fullscreen).toBe('true')
            fireEvent.keyDown(window, { key: 'Escape' })
            expect(root.className).not.toContain('is-fullscreen')
            expect(document.body.style.overflow).toBe('')
        })
    })
})

describe('map: full screen does not strand the List view', () => {
    it('choosing List leaves full screen', () => {
        const { container } = render(<MonitorMap map={map} selectedId={null} onPick={() => {}} narrow={false} />)
        const root = container.querySelector('.monitor-map')
        fireEvent.click(container.querySelector('[data-map-fullscreen]'))
        expect(root.className).toContain('is-fullscreen')
        fireEvent.click(container.querySelector('[data-map-view="list"]'))
        expect(root.className).not.toContain('is-fullscreen')
    })
})

describe('map: nodes can be moved in 2D', () => {
    it('dragging a node moves it, is not a pick, is remembered, and Reset puts it back', () => {
        window.localStorage.setItem('di.monitor.map.pos', JSON.stringify({ 'machine:gone': { x: 1, y: 1 } }))
        const onPick = vi.fn()
        const { container } = render(<MonitorMap map={map} selectedId={null} onPick={onPick} narrow={false} />)
        const node = () => container.querySelector('[data-map-node="machine:studio-mac"]')
        const before = node().getAttribute('transform')
        fireEvent.pointerDown(node(), { pointerId: 1, button: 0, clientX: 100, clientY: 100 })
        fireEvent.pointerMove(node(), { pointerId: 1, clientX: 160, clientY: 140 })
        fireEvent.pointerUp(node(), { pointerId: 1, clientX: 160, clientY: 140 })
        expect(JSON.parse(window.localStorage.getItem('di.monitor.map.pos'))['machine:gone']).toBeUndefined()
        fireEvent.click(node())
        expect(node().getAttribute('transform')).not.toBe(before)
        expect(onPick).not.toHaveBeenCalled()
        expect(JSON.parse(window.localStorage.getItem('di.monitor.map.pos'))['machine:studio-mac']).toBeTruthy()
        fireEvent.click(container.querySelector('[data-map-tool="reset"]'))
        expect(node().getAttribute('transform')).toBe(before)
    })
})

describe('admin menu on a phone', () => {
    it('one row names the section; a tap opens every section; a pick closes it', () => {
        const sections = [{ key: 'a', label: 'Alpha' }, { key: 'b', label: 'Beta' }]
        const onSelect = vi.fn()
        const { container } = render(<SectionNav sections={sections} activeKey="a" onSelect={onSelect} />)
        const toggle = container.querySelector('[data-nav-toggle]')
        const nav = container.querySelector('nav')
        expect(toggle.textContent).toContain('Alpha')
        expect(nav.dataset.open).toBe('false')
        fireEvent.click(toggle)
        expect(nav.dataset.open).toBe('true')
        fireEvent.click(screen.getByText('Beta'))
        expect(onSelect).toHaveBeenCalledWith('b')
        expect(nav.dataset.open).toBe('false')
    })
})
