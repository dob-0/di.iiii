// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const { outputPatch } = createRequire(import.meta.url)('./ui/outputPatch.js')

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
  it('a change equal to the live value is an empty patch', () => {
    expect(outputPatch(stale, live, 'driver', 'enttec')).toEqual({})
    expect(outputPatch(live, live, 'targets', [])).toEqual({})
  })
  it('several changed keys keep only those that differ', () => {
    expect(outputPatch(live, live, { mode: 'unicast', targets: [] })).toEqual({ mode: 'unicast' })
  })
  it('ignores a key that is not an output setting', () => {
    expect(outputPatch(live, live, 'extra', [1])).toEqual({})
  })
})
