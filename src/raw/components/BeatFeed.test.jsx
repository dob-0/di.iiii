import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import BeatFeed from './BeatFeed.jsx'

// The Beat's hands, against a MOCKED desk: showClock is what useShowClock
// returns (a reading of GET /light/api/clock and its measured offset), and
// sendTempo stands in for POST /light/api/fx. No network here.
const beatNode = (source) => ({ id: 'b', typeId: 'signal.beat', values: { bpm: 120, epoch: 0, role: 'master', source } })
const CLOCK_EPOCH = 1_700_000_000_000
const deskUp = { light: { up: true, bpm: 100, epoch: 1_700_000_004_000 }, offset: { offset: 40 } }
const deskDown = { light: { up: false, reachable: false }, offset: null }

// Tempo from is a setting on the node (configInputs); inputs carry only wires.
const mount = ({ inputs, showClock, source = 'own', clockEpoch = CLOCK_EPOCH }) => {
    let wall = CLOCK_EPOCH + 10_000
    const props = {
        node: beatNode(source),
        showClock,
        clockEpoch,
        onLiveOutput: vi.fn(),
        onTempo: vi.fn(),
        sendTempo: vi.fn(),
        wallNow: () => wall
    }
    const view = render(<BeatFeed {...props} inputs={inputs} />)
    const step = (next, ms = 0, more = {}) => {
        wall += ms
        Object.assign(props, more)
        view.rerender(<BeatFeed {...props} inputs={next} />)
    }
    return { props, step, wallAt: () => wall }
}

describe('BeatFeed', () => {
    it('reports the desk\'s clock in document time only when Tempo from is the Light desk', () => {
        const chosen = mount({ source: 'light', inputs: {}, showClock: deskUp })
        // localTimeline moves the desk's epoch by the offset; then wall → document ms
        expect(chosen.props.onLiveOutput).toHaveBeenLastCalledWith('b', 'light', { bpm: 100, epoch: 4000 - 40 })

        const own = mount({ source: 'own', inputs: {}, showClock: deskUp })
        expect(own.props.onLiveOutput).toHaveBeenCalledWith('b', 'light', null)
        expect(own.props.onLiveOutput).not.toHaveBeenCalledWith('b', 'light', expect.objectContaining({ bpm: 100 }))
    })

    it('a tap on a Beat that follows the desk is forwarded to the desk, not written into the node', () => {
        const { props, step, wallAt } = mount({ source: 'light', inputs: { tap: false }, showClock: deskUp })
        step({ tap: true })
        step({ tap: false }, 250)
        step({ tap: true }, 250)
        // two taps 500 ms apart: 120 bpm, this moment as the beat, in the desk's time (+ offset)
        expect(props.sendTempo).toHaveBeenCalledTimes(1)
        expect(props.sendTempo).toHaveBeenCalledWith({ bpm: 120, epoch: wallAt() + 40 })
        expect(props.onTempo).not.toHaveBeenCalled()
    })

    it('a tap on a Beat with its own tempo writes bpm and beat 0 into the node; the desk hears nothing', () => {
        const { props, step, wallAt } = mount({ source: 'own', inputs: { tap: 0 }, showClock: deskUp })
        step({ tap: 1 })
        step({ tap: 2 }, 400) // a rising count fires too
        expect(props.onTempo).toHaveBeenCalledTimes(1)
        expect(props.onTempo).toHaveBeenCalledWith('b', { bpm: 150, epoch: wallAt() - CLOCK_EPOCH })
        expect(props.sendTempo).not.toHaveBeenCalled()
    })

    it('Light desk chosen but none answers: the tap stays in the node', () => {
        const { props, step } = mount({ source: 'light', inputs: { tap: false }, showClock: deskDown })
        expect(props.onLiveOutput).toHaveBeenLastCalledWith('b', 'light', null)
        step({ tap: true })
        step({ tap: false }, 250)
        step({ tap: true }, 250)
        expect(props.onTempo).toHaveBeenCalledWith('b', expect.objectContaining({ bpm: 120 }))
        expect(props.sendTempo).not.toHaveBeenCalled()
    })

    it('Reset puts beat 0 on this moment: on the desk at its tempo, or in the node', () => {
        const desk = mount({ source: 'light', inputs: { reset: false }, showClock: deskUp })
        desk.step({ reset: true }, 100)
        expect(desk.props.sendTempo).toHaveBeenCalledWith({ bpm: 100, epoch: desk.wallAt() + 40 })

        const own = mount({ source: 'own', inputs: { reset: false }, showClock: null })
        own.step({ reset: true }, 100)
        expect(own.props.onTempo).toHaveBeenCalledWith('b', { epoch: own.wallAt() - CLOCK_EPOCH })
    })

    it('a wire cannot set Tempo from: only the node\'s setting asks the desk', () => {
        const wired = mount({ source: 'own', inputs: { source: 'light' }, showClock: deskUp })
        expect(wired.props.onLiveOutput).not.toHaveBeenCalledWith('b', 'light', expect.objectContaining({ bpm: 100 }))
    })

    it('a tap or Reset before clockEpoch is stamped is held, then written in document time once it is', () => {
        const { props, step, wallAt } = mount({ source: 'own', inputs: { tap: 0, reset: false }, showClock: null, clockEpoch: 0 })
        step({ tap: 1, reset: false })
        step({ tap: 2, reset: false }, 400)
        step({ tap: 2, reset: true }, 100)
        const resetWall = wallAt()
        // Nothing based on this window's performance.timeOrigin reaches the op log.
        expect(props.onTempo).not.toHaveBeenCalled()
        step({ tap: 2, reset: true }, 50, { clockEpoch: CLOCK_EPOCH })
        expect(props.onTempo).toHaveBeenCalledTimes(1)
        // the tapped tempo, and the later Reset's beat 0, both kept
        expect(props.onTempo).toHaveBeenCalledWith('b', { bpm: 150, epoch: resetWall - CLOCK_EPOCH })
    })
})
