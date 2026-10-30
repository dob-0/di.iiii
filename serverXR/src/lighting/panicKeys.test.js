import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const { blackoutKeyIntent, midiBlackoutIntent, goLivePress, keepArmPrompt, armPrompt, driverChoice } =
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
