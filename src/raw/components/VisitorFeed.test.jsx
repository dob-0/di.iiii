import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import VisitorFeed from './VisitorFeed.jsx'
import { VISITOR_STORAGE_KEY, resetVisitorMemoryForTests } from '../utils/visitorFacts.js'

const node = { id: 'v1', typeId: 'device.visitor', values: {} }

beforeEach(() => {
    resetVisitorMemoryForTests()
    window.localStorage.removeItem(VISITOR_STORAGE_KEY)
})
afterEach(() => vi.restoreAllMocks())

describe('VisitorFeed', () => {
    it('publishes the screen and the memory on mount, again on resize, clears on unmount', () => {
        const onVisitor = vi.fn()
        const view = render(<VisitorFeed node={node} onVisitor={onVisitor} />)
        const first = onVisitor.mock.calls[0]
        expect(first[0]).toBe('v1')
        expect(first[1]).toMatchObject({ width: window.innerWidth, height: window.innerHeight, name: '' })
        expect(typeof first[1].visitorId).toBe('string')
        expect(first[1].visitorId.length).toBeGreaterThan(0)
        expect(first[1].hue).toBeGreaterThanOrEqual(0)
        expect(first[1].hue).toBeLessThan(1)

        const calls = onVisitor.mock.calls.length
        act(() => { window.dispatchEvent(new Event('resize')) })
        expect(onVisitor.mock.calls.length).toBe(calls + 1)
        view.unmount()
        expect(onVisitor).toHaveBeenLastCalledWith('v1', null)
    })

    it('a wired New name is published and kept in this browser', () => {
        const onVisitor = vi.fn()
        const view = render(<VisitorFeed node={node} onVisitor={onVisitor} />)
        view.rerender(<VisitorFeed node={node} newName="Ani" onVisitor={onVisitor} />)
        expect(onVisitor.mock.calls.at(-1)[1].name).toBe('Ani')
        expect(JSON.parse(window.localStorage.getItem(VISITOR_STORAGE_KEY)).name).toBe('Ani')
    })

    it('storage that throws: still publishes every fact, with an Id', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError') })
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
        const onVisitor = vi.fn()
        expect(() => render(<VisitorFeed node={node} newName="Ani" onVisitor={onVisitor} />)).not.toThrow()
        const facts = onVisitor.mock.calls.at(-1)[1]
        expect(facts).toMatchObject({ name: 'Ani', portrait: window.innerHeight > window.innerWidth })
        expect(facts.visitorId.length).toBeGreaterThan(0)
    })
})
