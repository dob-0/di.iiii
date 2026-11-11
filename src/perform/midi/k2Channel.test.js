import { describe, expect, it, vi } from 'vitest'
import { XONE_K2_LEDS } from './xoneK2.js'
import { ASK_MS, K2_WINDOW_CHANNEL, LOST_MS, SILENT_MS, applyEvents, controlNameOf, createK2Feed, createK2Publisher, emptyState, eventOf, lightsOf, stateFromSnapshot } from './k2Channel.js'

// An in-memory BroadcastChannel: every channel of a name hears the others, never itself.
const bus = () => {
    const all = new Set()
    const make = () => {
        const channel = {
            posted: [],
            onmessage: null,
            postMessage(data) { channel.posted.push(data); for (const other of all) if (other !== channel) other.onmessage?.({ data }) },
            close() { all.delete(channel) }
        }
        all.add(channel)
        return channel
    }
    return { make, all }
}
const frames = () => {
    const queue = []
    return { frame: (cb) => { queue.push(cb); return queue.length }, cancelFrame: () => { queue.length = 0 }, run: () => { const todo = queue.splice(0); todo.forEach((cb) => cb()) }, size: () => queue.length }
}
const snapshotParts = () => ({ controller: 'XONE:K2', consoleId: 'k2', consoleName: 'K2', labels: { 'fader 1': 'Layer 1 level' }, lines: {}, lights: {}, values: { 'fader 1': 5 }, held: {} })

describe('the controller window channel', () => {
    it('is named once', () => expect(K2_WINDOW_CHANNEL).toBe('di-k2-controller-window-v1'))

    it('answers a request with a snapshot and creates nothing before ensure()', () => {
        const { make, all } = bus()
        const made = vi.fn(make)
        const publisher = createK2Publisher({ source: snapshotParts, makeChannel: made })
        expect(made).not.toHaveBeenCalled()
        expect(publisher.hasChannel()).toBe(false)
        publisher.ensure()
        publisher.ensure()
        expect(made).toHaveBeenCalledTimes(1)
        const window = make()
        const heard = []
        window.onmessage = (event) => heard.push(event.data)
        window.postMessage({ type: 'ask' })
        expect(all.size).toBe(2)
        expect(heard[0]).toMatchObject({ type: 'snapshot', consoleId: 'k2', labels: { 'fader 1': 'Layer 1 level' } })
    })

    it('is silent without a listener: no frame, no message', () => {
        const { make } = bus()
        const clock = frames()
        const publisher = createK2Publisher({ source: snapshotParts, makeChannel: make, frame: clock.frame, cancelFrame: clock.cancelFrame })
        const listener = make()
        const heard = []
        listener.onmessage = (event) => heard.push(event.data)
        publisher.ensure()
        publisher.push({ control: 'fader 1', value: 3 })
        publisher.changed()
        expect(clock.size()).toBe(0)
        clock.run()
        expect(heard).toEqual([])
    })

    it('sends at most one events batch per frame, newest last, after a request', () => {
        const { make } = bus()
        const clock = frames()
        const publisher = createK2Publisher({ source: snapshotParts, makeChannel: make, frame: clock.frame, cancelFrame: clock.cancelFrame })
        publisher.ensure()
        const win = make()
        const heard = []
        win.onmessage = (event) => heard.push(event.data)
        win.postMessage({ type: 'ask' })
        heard.length = 0
        for (let value = 1; value <= 50; value += 1) publisher.push({ control: 'fader 1', value })
        publisher.changed()
        expect(clock.size()).toBe(1)
        expect(heard).toEqual([])
        clock.run()
        expect(heard.map((m) => m.type)).toEqual(['snapshot', 'events'])
        expect(heard[1].events).toHaveLength(50)
        expect(heard[1].events.at(-1)).toEqual({ control: 'fader 1', value: 50 })
        clock.run()
        expect(heard).toHaveLength(2)
    })

    it('stops on bye and when the window goes silent', () => {
        const { make } = bus()
        const clock = frames()
        let time = 1000
        const publisher = createK2Publisher({ source: snapshotParts, makeChannel: make, frame: clock.frame, cancelFrame: clock.cancelFrame, now: () => time })
        publisher.ensure()
        const win = make()
        win.postMessage({ type: 'ask' })
        expect(publisher.isListening()).toBe(true)
        win.postMessage({ type: 'bye' })
        expect(publisher.isListening()).toBe(false)
        win.postMessage({ type: 'ask' })
        time += SILENT_MS + 1
        publisher.push({ control: 'fader 1', value: 1 })
        expect(clock.size()).toBe(0)
        expect(publisher.isListening()).toBe(false)
    })

    it('maps device events to controls and events to state', () => {
        expect(controlNameOf({ kind: 'cc', number: 16 })).toBe('fader 1')
        expect(eventOf({ kind: 'cc', number: 16, value: 64 })).toEqual({ control: 'fader 1', value: 64 })
        expect(eventOf({ kind: 'note', number: 36, value: 127, press: true })).toEqual({ control: 'matrix A', value: 127, held: true })
        expect(eventOf({ kind: 'cc', number: 99, value: 1 })).toBeNull()
        let state = stateFromSnapshot(snapshotParts())
        expect(state.values['fader 1']).toBe(5)
        state = applyEvents(state, [{ control: 'fader 1', value: 90 }, { control: 'matrix A', value: 127, held: true }])
        expect(state.values['fader 1']).toBe(90)
        expect(state.held['matrix A']).toBe(true)
        expect(state.flash['fader 1']).toBe(true)
        state = applyEvents(state, [{ control: 'matrix A', value: 0, held: false }])
        expect(state.held['matrix A']).toBeUndefined()
        expect(emptyState()).toEqual({ values: {}, held: {}, flash: {} })
    })

    it('reads light colours from the LED picture the app already builds', () => {
        expect(lightsOf([])).toEqual({})
        const notes = XONE_K2_LEDS[36] // matrix A
        const lit = (colour) => ['red', 'amber', 'green'].map((name) => ({ note: notes[name], velocity: name === colour ? 127 : 0 }))
        expect(lightsOf(lit('green'))['matrix A']).toBe('green')
        expect(lightsOf(lit('red'))['matrix A']).toBe('red')
        expect(lightsOf(lit(null))['matrix A']).toBe('off')
        expect(lightsOf(lit('amber'))['matrix B']).toBeUndefined()
    })
})

describe('the window feed', () => {
    it('asks on open, goes live on a snapshot, says waiting when nothing answers, and finds the deck again', () => {
        const { make } = bus()
        let time = 0
        const timers = []
        const statuses = []
        const snaps = []
        const feed = createK2Feed({
            makeChannel: make,
            now: () => time,
            setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length - 1 },
            clearTimer: () => {},
            onStatus: (s) => statuses.push(s),
            onSnapshot: (s) => snaps.push(s)
        })
        const deck = make()
        const asked = []
        deck.onmessage = (event) => asked.push(event.data.type)
        feed.ask()
        expect(asked).toEqual(['ask'])
        const [wait, again] = timers
        expect(wait.ms).toBe(1000)
        wait.fn()
        expect(statuses).toEqual(['waiting'])
        time = 10
        deck.postMessage({ type: 'snapshot', consoleId: 'k2' })
        expect(statuses).toEqual(['waiting', 'live'])
        expect(snaps).toHaveLength(1)
        time = 10 + LOST_MS + 5
        again.fn()
        expect(statuses.at(-1)).toBe('waiting')
        expect(again.ms).toBe(ASK_MS)
        expect(asked.filter((t) => t === 'ask').length).toBeGreaterThanOrEqual(2)
        time += 1
        deck.postMessage({ type: 'snapshot', consoleId: 'k2' })
        expect(statuses.at(-1)).toBe('live')
    })
})
