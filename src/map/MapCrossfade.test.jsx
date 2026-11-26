import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import MapCrossfade from './MapCrossfade.jsx'

// Each layer records its onReady so a test can say "this one has loaded".
let ready = {}
const renderItem = (item, onReady) => {
    ready[item.name] = onReady
    return <span data-name={item.name}>{item.name}</span>
}

const view = (item, fade = 1) => <MapCrossfade item={item} fade={fade} renderItem={renderItem} />
const layers = (container) => Array.from(container.querySelectorAll('.map-crossfade-layer'))
const advance = (ms) => act(() => { vi.advanceTimersByTime(ms) })

beforeEach(() => {
    ready = {}
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
})

describe('MapCrossfade', () => {
    it('mounts the first item loading at opacity 0, then shows it when it is ready', () => {
        const { container } = render(view({ key: 'a', name: 'A' }))
        expect(layers(container)).toHaveLength(1)
        expect(layers(container)[0].dataset.phase).toBe('loading')
        expect(layers(container)[0].style.opacity).toBe('0')

        act(() => ready.A())
        expect(layers(container)[0].dataset.phase).toBe('shown')
        expect(layers(container)[0].style.opacity).toBe('1')
    })

    it('keeps the old layer up while the new one loads, and removes it after the fade', () => {
        const { container, rerender } = render(view({ key: 'a', name: 'A' }, 2))
        act(() => ready.A())

        rerender(view({ key: 'b', name: 'B' }, 2))
        let now = layers(container)
        expect(now).toHaveLength(2)
        expect(now[0].dataset.phase).toBe('shown')
        expect(now[0].style.opacity).toBe('1')
        expect(now[1].dataset.phase).toBe('loading')
        expect(now[1].style.opacity).toBe('0')

        act(() => ready.B())
        now = layers(container)
        expect(now).toHaveLength(2)
        expect(now[1].dataset.phase).toBe('shown')

        advance(2059)
        expect(layers(container)).toHaveLength(2)
        advance(1)
        now = layers(container)
        expect(now).toHaveLength(1)
        expect(now[0].textContent).toBe('B')
    })

    it('reveals a layer that never says it is ready after 4000 ms', () => {
        const { container } = render(view({ key: 'a', name: 'A' }))
        advance(3999)
        expect(layers(container)[0].dataset.phase).toBe('loading')
        advance(1)
        expect(layers(container)[0].dataset.phase).toBe('shown')
        expect(layers(container)[0].style.opacity).toBe('1')
    })

    it('fades the layer out for a null item and removes it after the fade', () => {
        const { container, rerender } = render(view({ key: 'a', name: 'A' }, 1))
        act(() => ready.A())

        rerender(view(null, 1))
        expect(layers(container)).toHaveLength(1)
        expect(layers(container)[0].dataset.phase).toBe('leaving')
        expect(layers(container)[0].style.opacity).toBe('0')

        advance(1060)
        expect(layers(container)).toHaveLength(0)
    })

    it('does not make a new layer for a renamed item with the same key', () => {
        const { container, rerender } = render(view({ key: 'a', name: 'A' }))
        act(() => ready.A())
        rerender(view({ key: 'a', name: 'Renamed' }))
        expect(layers(container)).toHaveLength(1)
        expect(layers(container)[0].dataset.phase).toBe('shown')
        expect(layers(container)[0].textContent).toBe('Renamed')
    })
})
