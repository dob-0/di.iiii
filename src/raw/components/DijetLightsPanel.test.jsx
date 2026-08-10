import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DijetLightsPanel, { hexToRgb } from './DijetLightsPanel.jsx'
import DijetSayPanel from './DijetSayPanel.jsx'
import { __resetLinks } from '../utils/dijetLink.js'

const lightsNode = { id: 'lights-1', typeId: 'device.dijet.lights', values: { host: '192.168.1.11' } }
const sayNode = { id: 'say-1', typeId: 'device.dijet.say', values: { host: '192.168.1.11' } }

let sockets = []
class FakeWS {
    constructor(url) { this.url = url; this.sent = []; this.readyState = 0; sockets.push(this) }
    send(data) { this.sent.push(JSON.parse(data)) }
    close() { this.readyState = 3; this.onclose?.() }
    openIt() { this.readyState = 1; this.onopen?.() }
}
const published = (topic) => sockets.flatMap((s) => s.sent).filter((m) => m.op === 'publish' && m.topic === topic)

beforeEach(() => { sockets = []; global.WebSocket = FakeWS; vi.useFakeTimers({ shouldAdvanceTime: true }) })
afterEach(() => { vi.useRealTimers(); __resetLinks(); delete global.WebSocket })

const connect = async () => {
    await waitFor(() => expect(sockets.length).toBeGreaterThan(0))
    await act(async () => { sockets[0].openIt() })
}

describe('hexToRgb', () => {
    it('parses a hex colour', () => expect(hexToRgb('#3fb950')).toEqual([63, 185, 80]))
    it('refuses anything else rather than sending garbage down the serial port', () => {
        expect(hexToRgb('not a colour')).toBeNull()
        expect(hexToRgb('#fff')).toBeNull()
        expect(hexToRgb(null)).toBeNull()
    })
})

describe('DijetLightsPanel', () => {
    it('sends the colour once, not once per render', async () => {
        const { rerender } = render(<DijetLightsPanel node={lightsNode} values={lightsNode.values} inputs={{ color: '#3fb950' }} />)
        await connect()
        await act(async () => { vi.advanceTimersByTime(50) })
        rerender(<DijetLightsPanel node={lightsNode} values={lightsNode.values} inputs={{ color: '#3fb950' }} />)
        await act(async () => { vi.advanceTimersByTime(50) })
        expect(published('/dijet/leds')).toHaveLength(1)
        expect(JSON.parse(published('/dijet/leds')[0].msg.data)).toEqual({ all: [63, 185, 80] })
    })

    // The lamps share a serial port with the motors, so a graph wired to an
    // audio level must not be able to flood the bus.
    it('rate-limits a fast-changing colour', async () => {
        const { rerender } = render(<DijetLightsPanel node={lightsNode} values={lightsNode.values} inputs={{ color: '#111111' }} />)
        await connect()
        await act(async () => { vi.advanceTimersByTime(10) })
        for (const c of ['#222222', '#333333', '#444444', '#555555']) {
            rerender(<DijetLightsPanel node={lightsNode} values={lightsNode.values} inputs={{ color: c }} />)
            await act(async () => { vi.advanceTimersByTime(20) })
        }
        expect(published('/dijet/leds').length).toBe(1)
    })

    it('an effect wins over a colour, and is one write however long it runs', async () => {
        render(<DijetLightsPanel node={lightsNode} values={lightsNode.values} inputs={{ color: '#3fb950', effect: 3 }} />)
        await connect()
        await act(async () => { vi.advanceTimersByTime(50) })
        const sent = JSON.parse(published('/dijet/leds')[0].msg.data)
        expect(sent.effect).toBe(3)
        expect(sent.all).toBeUndefined()
        expect(screen.getByText('breathe')).toBeInTheDocument()
    })

    it('beeps on a new duration and caps it', async () => {
        const { rerender } = render(<DijetLightsPanel node={lightsNode} values={lightsNode.values} inputs={{ beep: 200 }} />)
        await connect()
        await act(async () => { vi.advanceTimersByTime(20) })
        expect(published('/dijet/beep')[0].msg.data).toBe(200)
        rerender(<DijetLightsPanel node={lightsNode} values={lightsNode.values} inputs={{ beep: 999999 }} />)
        await act(async () => { vi.advanceTimersByTime(20) })
        expect(published('/dijet/beep').at(-1).msg.data).toBe(30000)
    })
})

describe('DijetSayPanel', () => {
    it('says nothing on mount — a node appearing must not make the robot talk', async () => {
        render(<DijetSayPanel node={sayNode} values={sayNode.values} inputs={{ text: 'hello', trigger: 7 }} />)
        await connect()
        await act(async () => { vi.advanceTimersByTime(50) })
        expect(published('/tts')).toHaveLength(0)
    })

    it('speaks when the trigger changes, not when the text does', async () => {
        const { rerender } = render(<DijetSayPanel node={sayNode} values={sayNode.values} inputs={{ text: 'one', trigger: 1 }} />)
        await connect()
        await act(async () => { vi.advanceTimersByTime(20) })
        // text churns, trigger does not: silence
        rerender(<DijetSayPanel node={sayNode} values={sayNode.values} inputs={{ text: 'two', trigger: 1 }} />)
        await act(async () => { vi.advanceTimersByTime(20) })
        expect(published('/tts')).toHaveLength(0)
        // trigger moves: it speaks the current text
        rerender(<DijetSayPanel node={sayNode} values={sayNode.values} inputs={{ text: 'two', trigger: 2 }} />)
        await act(async () => { vi.advanceTimersByTime(20) })
        expect(published('/tts')).toHaveLength(1)
        expect(published('/tts')[0].msg.data).toBe('two')
    })

    it('truncates to what the robot will accept', async () => {
        const long = 'x'.repeat(500)
        const { rerender } = render(<DijetSayPanel node={sayNode} values={sayNode.values} inputs={{ text: long, trigger: 1 }} />)
        await connect()
        await act(async () => { vi.advanceTimersByTime(20) })
        rerender(<DijetSayPanel node={sayNode} values={sayNode.values} inputs={{ text: long, trigger: 2 }} />)
        await act(async () => { vi.advanceTimersByTime(20) })
        expect(published('/tts')[0].msg.data).toHaveLength(300)
    })
})
