// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const { outputPatch, outputFormEditing } = createRequire(import.meta.url)('./ui/outputPatch.js')

const live = { driver: 'enttec', serialPort: '/dev/ttyUSB0', mode: 'broadcast', targets: [], enabled: true, refreshHz: 40 }
// The page loaded earlier and still shows Art-Net: exactly tonight's stale form.
const stale = { driver: 'artnet', serialPort: '/dev/ttyUSB9', mode: 'unicast', targets: ['2.0.0.9'], enabled: false, refreshHz: 30 }

describe('outputPatch: the output form posts only what changed', () => {
  it('carries only the changed key', () => {
    expect(outputPatch(stale, live, 'serialPort', '/dev/ttyUSB1')).toEqual({ serialPort: '/dev/ttyUSB1' })
  })
  it('leaves every unchanged key out', () => {
    const p = outputPatch(stale, live, 'driver', 'artnet')
    expect(Object.keys(p)).toEqual(['driver'])
  })
  it('never sends a stale shown value', () => {
    const p = outputPatch(stale, live, 'enabled', false)
    expect(p).toEqual({ enabled: false })
    for (const k of ['driver', 'serialPort', 'mode', 'targets', 'refreshHz']) expect(p).not.toHaveProperty(k)
  })
  it('toggles enabled alone', () => {
    expect(outputPatch(live, { ...live, enabled: false }, 'enabled', true)).toEqual({ enabled: true })
  })
  it('edits targets alone', () => {
    expect(outputPatch(live, live, 'targets', ['2.0.0.10'])).toEqual({ targets: ['2.0.0.10'] })
  })
  it('a touched key travels even when equal to the shown or live value', () => {
    expect(outputPatch(stale, live, 'driver', 'enttec')).toEqual({ driver: 'enttec' })
    expect(outputPatch(live, live, 'targets', [])).toEqual({ targets: [] })
  })
  it('only touched keys travel when several are given', () => {
    const p = outputPatch(live, live, { mode: 'unicast', targets: [] })
    expect(p).toEqual({ mode: 'unicast', targets: [] })
    expect(p).not.toHaveProperty('driver')
  })
  it('ignores a key that is not an output setting', () => {
    expect(outputPatch(live, live, 'extra', [1])).toEqual({})
  })
  it('an untouched key never travels', () => {
    expect(Object.keys(outputPatch(stale, live, 'mode', 'broadcast'))).toEqual(['mode'])
  })
})

describe('outputFormEditing: the form stops following the live state while edited', () => {
  const el = (name, inForm = true, isInput = true) => ({
    name, closest: (s) => (inForm && s === '.outbox' ? {} : null), matches: () => isInput,
  })
  it('holds the mode radios while focus is in the form', () => {
    expect(outputFormEditing(el('mode'), false)).toBe(true)
    expect(outputFormEditing(el('targets'), false)).toBe(true)
  })
  it('holds them when a value is changed and not applied, even after blur', () => {
    expect(outputFormEditing(null, true)).toBe(true)
  })
  it('follows live when idle, outside the form, or on the driver radio', () => {
    expect(outputFormEditing(null, false)).toBe(false)
    expect(outputFormEditing(el('x', false), false)).toBe(false)
    expect(outputFormEditing(el('driver'), false)).toBe(false)
  })
})
