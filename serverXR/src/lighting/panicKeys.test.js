import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const { blackoutKeyIntent, midiBlackoutIntent, goLivePress, keepArmPrompt, armPrompt, driverChoice, driverPoll, createArm, ARM_MS } =
  createRequire(import.meta.url)('./ui/panicKeys.js')

describe('row 14: the B key is one-way', () => {
  it('ignores auto-repeat', () => expect(blackoutKeyIntent({ repeat: true }, { blackout: false })).toBe(null))
  it('never sends false, whatever the state says', () => {
    expect(blackoutKeyIntent({ repeat: false }, { blackout: true })).toEqual({ blackout: true })
    expect(blackoutKeyIntent({ repeat: false }, { blackout: false })).toEqual({ blackout: true })
  })
  it('does nothing before the first state', () => expect(blackoutKeyIntent({ repeat: false }, null)).toBe(null))
})

describe('row 15: go live needs two deliberate presses', () => {
  const off = { on: false, armedAt: null, lastPress: null }
  it('first press arms', () => expect(goLivePress(off, 1000, 1)).toBe('arm'))
  it('a second press within 4 s, after 400 ms, goes', () =>
    expect(goLivePress({ on: false, armedAt: 1000, lastPress: 1000 }, 2000, 1)).toBe('go'))
  it('a second press after the arm ran out arms again', () =>
    expect(goLivePress({ on: false, armedAt: 1000, lastPress: 1000 }, 6000, 1)).toBe('arm'))
  it('a bounce within 400 ms is ignored', () =>
    expect(goLivePress({ on: false, armedAt: 1000, lastPress: 1000 }, 1200, 1)).toBe('ignore'))
  it('a double click is ignored', () => expect(goLivePress(off, 1000, 2)).toBe('ignore'))
  it('the poll leaves the prompt alone while armed', () => {
    expect(keepArmPrompt(true)).toBe(true)
    expect(keepArmPrompt(false)).toBe(false)
  })
  it('the prompt names the driver and port', () => {
    expect(armPrompt('enttec', '/dev/ttyUSB0')).toContain('/dev/ttyUSB0')
    expect(armPrompt('artnet')).toContain('Art-Net')
  })
})

describe('row 16: the driver radios only choose', () => {
  it('an arrow-key change shows a button and applies nothing', () => {
    const c = driverChoice('artnet', 'enttec', true)
    expect(c).toMatchObject({ visible: true, label: 'Switch to Art-Net', confirm: true })
  })
  it('no button when the choice is the applied driver', () => expect(driverChoice('enttec', 'enttec', true).visible).toBe(false))
  it('no confirmation while output is off', () => expect(driverChoice('enttec', 'artnet', false).confirm).toBe(false))
})

describe('row 17: the armed MIDI blackout pad is one-way', () => {
  it('only ever blackout:true', () => expect(midiBlackoutIntent()).toEqual({ blackout: true }))
})

describe('row 16b: the live driver moving elsewhere ends the pending choice', () => {
  it('live changes to the pending value: cleared at once', () => expect(driverPoll('artnet', 'enttec', 'artnet')).toBe(null))
  it('live changes to another value: cleared, nothing said', () => expect(driverPoll('artnet', 'enttec', 'other')).toBe(null))
  it('live unchanged: the choice stays', () => expect(driverPoll('artnet', 'enttec', 'enttec')).toBe('artnet'))
  it('no choice stays no choice', () => expect(driverPoll(null, 'enttec', 'artnet')).toBe(null))
})

describe('row 15b: the go-live arm timer', () => {
  function fake() {
    let t = 0, id = 0; const q = new Map()
    return {
      timers: { set: (f, ms) => { q.set(++id, { f, at: t + ms }); return id }, clear: (h) => q.delete(h) },
      advance(ms) { t += ms; for (const [k, v] of [...q]) if (v.at <= t) { q.delete(k); v.f() } },
      pending: () => q.size,
    }
  }
  it('re-arm within 4 s keeps the new arm until its own 4 s', () => {
    const f = fake(); let expired = 0
    const a = createArm(f.timers, () => { expired++ })
    a.start(0); f.advance(3000); a.start(3000)
    f.advance(1500)   // old timer would have fired at 4000
    expect(a.state.armed).toBe(true); expect(expired).toBe(0)
    f.advance(ARM_MS - 1500); expect(a.state.armed).toBe(false); expect(expired).toBe(1)
  })
  it('output off/on cancels the arm and its timer', () => {
    const f = fake(); let expired = 0
    const a = createArm(f.timers, () => { expired++ })
    a.start(0); a.cancel()
    expect(a.state).toMatchObject({ armed: false, armedAt: null }); expect(f.pending()).toBe(0)
    f.advance(ARM_MS * 2); expect(expired).toBe(0)
  })
  it('a consumed arm leaves no timer behind', () => {
    const f = fake(); const a = createArm(f.timers, () => {})
    a.start(0); a.cancel(); expect(f.pending()).toBe(0)
  })
})
