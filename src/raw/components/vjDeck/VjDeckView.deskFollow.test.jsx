import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import VjDeckView, { FOLLOW_ECHO_MS, FOLLOW_POLL_MS } from './VjDeckView.jsx'
import { createDeck, setClip, setColumnCue } from '../../../project/tops/vjDeck.js'

// Light -> deck. The desk is a stubbed fetch answering the summary; nothing here reaches a real
// desk, and nothing POSTs.
const cues = [
    { id: 'cue-a', name: 'Alpha', lightLook: 'look-a' },
    { id: 'cue-b', name: 'Beta', lightLook: 'look-b' },
    { id: 'cue-c', name: 'Gamma', lightLook: 'look-c' }
]
let desk
let fetchSpy
beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    window.localStorage.clear()
    desk = { lookId: 'look-a', layerFiredAt: 1, cueIndex: 0, cueFiredAt: 1 }
    fetchSpy = vi.fn((url, init) => {
        if (init?.method === 'POST') return Promise.reject(new Error('a test must never POST'))
        if (!/api\/summary/.test(String(url))) return Promise.reject(new Error('no desk here'))
        const seen = { ...desk } // the desk's answer is the one at the moment of asking
        return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: () => Promise.resolve({ layers: [{ lookId: seen.lookId, firedAt: seen.layerFiredAt }], cues: { index: seen.cueIndex, name: 'x', firedAt: seen.cueFiredAt } })
        })
    })
    vi.stubGlobal('fetch', fetchSpy)
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); window.localStorage.clear() })

const makeDeck = (assigned = {}) => {
    let deck = createDeck({ layers: 2, columns: 4 })
    for (let column = 0; column < 4; column += 1) deck = setClip(deck, 0, column, { kind: 'input', input: 'in1' })
    for (const [column, id] of Object.entries(assigned)) deck = setColumnCue(deck, Number(column), id)
    return deck
}
function Host({ deck, onFireCue }) {
    const [node, setNode] = useState({ id: 'deck-1', typeId: 'vj.deck', values: { deck } })
    return (
        <VjDeckView node={node} projectId="proj" spaceId="sp" cues={cues} onFireCue={onFireCue}
            onPatchValues={(patch) => setNode((n) => ({ ...n, values: { ...n.values, ...patch } }))} />
    )
}
const switchOn = () => fireEvent.click(screen.getByRole('button', { name: /Lights follow/ }))
const tick = async (ms = FOLLOW_POLL_MS) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }
const reads = () => fetchSpy.mock.calls.filter(([url]) => /api\/summary/.test(String(url))).length
const status = () => document.querySelector('.vj-deck-follow-status')?.textContent
const slotOn = (column) => screen.getByLabelText(new RegExp(`Layer 1, slot ${column}\\b`)).getAttribute('aria-pressed')

describe('Lights follow, desk to deck', () => {
    it('a cue fired on the desk plays its column, and onFireCue is NOT called', async () => {
        const onFireCue = vi.fn(() => Promise.resolve(true))
        render(<Host deck={makeDeck({ 0: 'cue-a', 2: 'cue-c' })} onFireCue={onFireCue} />)
        switchOn()
        await tick(0) // baseline
        expect(slotOn(3)).toBe('false')
        desk = { lookId: 'look-c', layerFiredAt: 2, cueIndex: 2, cueFiredAt: 2 }
        await tick()
        expect(slotOn(3)).toBe('true')
        expect(status()).toBe('Desk fired Gamma: column 3')
        expect(onFireCue).toHaveBeenCalledTimes(0)
        expect(fetchSpy.mock.calls.filter(([url]) => /api\/summary/.test(String(url))).every(([url]) => String(url).includes('space/sp/api/summary'))).toBe(true)
    })

    it('a cue the deck fired, echoed back inside 1.5 s, does not relaunch', async () => {
        const onFireCue = vi.fn(() => Promise.resolve(true))
        render(<Host deck={makeDeck({ 0: 'cue-a', 1: 'cue-b' })} onFireCue={onFireCue} />)
        switchOn()
        await tick(0)
        fireEvent.click(screen.getByRole('button', { name: 'Play column 2' }))
        expect(onFireCue).toHaveBeenCalledTimes(1)
        expect(status()).toBe('Fired Beta')
        // the desk answers with the cue the deck just fired: an echo, so no launch and no new status
        desk = { lookId: 'look-b', layerFiredAt: 6, cueIndex: 1, cueFiredAt: 6 }
        await tick()
        expect(status()).toBe('Fired Beta')
        expect(onFireCue).toHaveBeenCalledTimes(1)
    })

    it('the same cue from the desk after 1.5 s is the desk acting, and it launches', async () => {
        const onFireCue = vi.fn(() => Promise.resolve(true))
        render(<Host deck={makeDeck({ 0: 'cue-a', 1: 'cue-b' })} onFireCue={onFireCue} />)
        switchOn()
        await tick(0)
        fireEvent.click(screen.getByRole('button', { name: 'Play column 2' }))
        await tick(FOLLOW_ECHO_MS + 100)
        fireEvent.click(screen.getByRole('button', { name: 'Play column 1' }))
        desk = { lookId: 'look-b', layerFiredAt: 9, cueIndex: 1, cueFiredAt: 9 }
        await tick()
        expect(slotOn(2)).toBe('true')
        expect(status()).toBe('Desk fired Beta: column 2')
        expect(onFireCue).toHaveBeenCalledTimes(2) // the two presses, no more
    })

    it('with Lights follow off there are 0 reads, and toggling off stops the reads', async () => {
        render(<Host deck={makeDeck({ 0: 'cue-a' })} onFireCue={vi.fn()} />)
        await tick(2000)
        expect(reads()).toBe(0)
        switchOn()
        await tick(FOLLOW_POLL_MS * 2)
        expect(reads()).toBeGreaterThan(0)
        switchOn()
        const before = reads()
        await tick(2000)
        expect(reads()).toBe(before)
    })

    it('a hidden page reads 0 times', async () => {
        const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
        render(<Host deck={makeDeck({ 0: 'cue-a' })} onFireCue={vi.fn()} />)
        switchOn()
        await tick(2000)
        expect(reads()).toBe(0)
        spy.mockRestore()
    })

    it('a look with no cue says no column for that look, and nothing launches', async () => {
        render(<Host deck={makeDeck({ 0: 'cue-a' })} onFireCue={vi.fn()} />)
        switchOn()
        await tick(0)
        desk = { lookId: 'look-zzz', layerFiredAt: 3, cueIndex: null, cueFiredAt: null }
        await tick()
        expect(status()).toBe('no column for look-zzz')
        expect(slotOn(1)).toBe('false')
    })

    it('a look whose cue sits in no column says no column for the cue', async () => {
        render(<Host deck={makeDeck({ 0: 'cue-a' })} onFireCue={vi.fn()} />)
        switchOn()
        await tick(0)
        desk = { lookId: 'look-b', layerFiredAt: 3, cueIndex: 1, cueFiredAt: 3 }
        await tick()
        expect(status()).toBe('no column for Beta')
    })
})
