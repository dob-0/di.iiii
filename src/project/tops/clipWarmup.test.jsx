import { describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { deckClipUrls, useClipWarmup } from './clipWarmup.js'

const deck = (...clips) => ({ nodes: [{ id: 'd', values: { deck: { layers: [{ clips }] } } }] })
const asset = (name) => ({ kind: 'asset', asset: name })

describe('deckClipUrls', () => {
    it('lists unique addresses in deck order, only asset clips', () => {
        const document = {
            nodes: [
                { values: { deck: { layers: [{ clips: [asset('a'), { kind: 'top', asset: 'x' }, asset('b')] }, { clips: [asset('a'), asset('c'), asset('')] }] } } },
                { values: { deck: { layers: [{ clips: [asset('d')] }] } } }
            ]
        }
        expect(deckClipUrls(document, (name) => (name ? '/u/' + name : ''))).toEqual(['/u/a', '/u/b', '/u/c', '/u/d'])
    })

    it('tolerates odd shapes', () => {
        const resolve = (name) => name
        expect(deckClipUrls(null, resolve)).toEqual([])
        expect(deckClipUrls({ nodes: 'x' }, resolve)).toEqual([])
        const odd = [null, {}, { values: { deck: { layers: 'no' } } }, { values: { deck: { layers: [null, {}, { clips: 'no' }, { clips: [null, 3, asset('ok')] }] } } }]
        expect(deckClipUrls({ nodes: odd }, resolve)).toEqual(['ok'])
    })
})

function Probe({ document, enabled = true, acquire }) {
    useClipWarmup(document, { spaceId: '', projectId: null, enabled, acquire })
    return null
}

const fakeAcquire = () => {
    const log = []
    let active = 0
    let maxActive = 0
    const acquire = vi.fn((url) => {
        active += 1
        maxActive = Math.max(maxActive, active)
        log.push('acquire ' + url)
        return {
            promise: Promise.resolve('blob:x'),
            release: () => { active -= 1; log.push('release ' + url) }
        }
    })
    return { acquire, log, max: () => maxActive }
}

const wait = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms))

describe('useClipWarmup', () => {
    it('warms every clip one at a time and releases each', async () => {
        const f = fakeAcquire()
        render(<Probe document={deck(asset('https://x.test/w1.mp4'), asset('https://x.test/w2.mp4'))} acquire={f.acquire} />)
        await waitFor(() => expect(f.log).toHaveLength(4))
        expect(f.log).toEqual([
            'acquire https://x.test/w1.mp4', 'release https://x.test/w1.mp4',
            'acquire https://x.test/w2.mp4', 'release https://x.test/w2.mp4'
        ])
        expect(f.max()).toBe(1)
    })

    it('does not warm an address twice, and picks up a clip added later', async () => {
        const f = fakeAcquire()
        const { rerender } = render(<Probe document={deck(asset('https://x.test/t1.mp4'))} acquire={f.acquire} />)
        await waitFor(() => expect(f.acquire).toHaveBeenCalledTimes(1))
        await wait()
        rerender(<Probe document={deck(asset('https://x.test/t1.mp4'), asset('https://x.test/t2.mp4'))} acquire={f.acquire} />)
        await waitFor(() => expect(f.acquire).toHaveBeenCalledTimes(2))
        expect(f.acquire.mock.calls.map((call) => call[0])).toEqual(['https://x.test/t1.mp4', 'https://x.test/t2.mp4'])
        rerender(<Probe document={deck(asset('https://x.test/t1.mp4'), asset('https://x.test/t2.mp4'))} acquire={f.acquire} />)
        await wait()
        expect(f.acquire).toHaveBeenCalledTimes(2)
    })

    it('skips blob and data addresses', async () => {
        const f = fakeAcquire()
        render(<Probe document={deck(asset('blob:abc'), asset('data:video/mp4;base64,AA'), asset('https://x.test/s1.mp4'))} acquire={f.acquire} />)
        await waitFor(() => expect(f.acquire).toHaveBeenCalledTimes(1))
        expect(f.acquire).toHaveBeenCalledWith('https://x.test/s1.mp4')
    })

    it('retries a failed fetch, then keeps it warmed', async () => {
        const f = fakeAcquire()
        let calls = 0
        const acquire = vi.fn((url) => {
            const handle = f.acquire(url)
            calls += 1
            return { ...handle, promise: Promise.resolve(calls === 1 ? null : 'blob:x') }
        })
        const doc = deck(asset('https://x.test/r1.mp4'))
        const { rerender } = render(<Probe document={doc} acquire={acquire} />)
        await waitFor(() => expect(acquire).toHaveBeenCalledTimes(2), { timeout: 3000 })
        await wait(50)
        rerender(<Probe document={deck(asset('https://x.test/r1.mp4'), asset('https://x.test/r2.mp4'))} acquire={acquire} />)
        await waitFor(() => expect(acquire).toHaveBeenCalledTimes(3), { timeout: 3000 })
        await wait(50)
        expect(acquire.mock.calls.map((call) => call[0])).toEqual(['https://x.test/r1.mp4', 'https://x.test/r1.mp4', 'https://x.test/r2.mp4'])
    })

    it('gives up on an address after 3 tries', async () => {
        const release = vi.fn()
        const acquire = vi.fn(() => ({ promise: Promise.resolve(null), release }))
        render(<Probe document={deck(asset('https://x.test/f1.mp4'))} acquire={acquire} />)
        await waitFor(() => expect(acquire).toHaveBeenCalledTimes(3), { timeout: 4000 })
        await wait(800)
        expect(acquire).toHaveBeenCalledTimes(3)
        expect(release).toHaveBeenCalledTimes(3)
    })

    it('survives a rejected promise and still releases', async () => {
        const release = vi.fn()
        const acquire = vi.fn(() => ({ promise: Promise.reject(new Error('502')), release }))
        render(<Probe document={deck(asset('https://x.test/j1.mp4'))} acquire={acquire} />)
        await waitFor(() => expect(acquire).toHaveBeenCalledTimes(3), { timeout: 4000 })
        await wait(800)
        expect(acquire).toHaveBeenCalledTimes(3)
        expect(release).toHaveBeenCalledTimes(3)
    })

    it('warms nothing when disabled', async () => {
        const f = fakeAcquire()
        render(<Probe document={deck(asset('https://x.test/n1.mp4'))} enabled={false} acquire={f.acquire} />)
        await wait()
        expect(f.acquire).not.toHaveBeenCalled()
    })
})
