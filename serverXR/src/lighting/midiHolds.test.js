// @vitest-environment node
//
// PR #1397 round 4, the page half: the software strobe is a lease the page renews (R3-I2), ARM and a release let go of every
// lease, and an ACTIVATOR press flips it whatever its length (R3-I4). ui/app.js is a browser script: each function is cut out
// of its source and run with stubbed globals (the same way midiArm.test.js does).
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const SRC = fs.readFileSync(path.join(__dirname, 'ui/app.js'), 'utf8')
const grab = (name) => {
  const m = SRC.match(new RegExp('(?:async )?function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}\\n'))
  if (!m) throw new Error('app.js has no function ' + name)
  return m[0]
}

function page() {
  const sent = [], applied = []
  const body = `
    let midiArmed = true, midiLearnRow = null, midiWizardOn = false, midiSceneLearn = null;
    let midiLiveWait = false, midiFlushing = false, midiFlushTimer = null;
    const midiPending = new Map(), midiHeld = new Map(), midiLive = { strobeU: 0.5 };
    const S = { fixtures: [{ id: 'm1', profile: 'mover', universe: 0, address: 1 }], profiles: { mover: { channels: ['pan', 'tilt', 'dimmer', 'r', 'g', 'b'] } } };
    const window = { deskMidiPatch: P };
    const midiTargets = [{ key: 'grp:left:on', kind: 'note', apply: () => L.applied.push('flip') }];
    const midiKeyFor = (type, ch, num) => (num === 10 ? 'grp:left:on' : null);
    const midiHit = () => {}, buildMidiTargets = () => {};
    ${['midiSend', 'midiBlind', 'midiHoldUp', 'midiStrobeDown', 'midiReleaseAll', 'midiRelease', 'midiHandle'].map(grab).join('\n')}
    function midiFlush() {}
    return { midiStrobeDown, midiHoldUp, midiReleaseAll, midiRelease, midiHandle, pending: midiPending, held: midiHeld };`
  const P = require('./ui/midiPatch.js')
  const L = { applied }
  const api = new Function('P', 'L', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', body)(P, L, setTimeout, clearTimeout, setInterval, clearInterval)
  return { api, L }
}
afterEach(() => { vi.useRealTimers() })

describe('R3-I2: the software strobe is a lease the page renews', () => {
  it('a hit sends flash:true at once and again every second, and the release stops the renewals', () => {
    vi.useFakeTimers()
    const { api } = page()
    api.midiStrobeDown('hit:strobe-all', 'all')
    const fxOf = () => api.pending.get('hold:fx:hit:strobe-all')
    expect(fxOf().body).toMatchObject({ mode: 'strobe', flash: true, ids: ['m1'] })
    api.pending.delete('hold:fx:hit:strobe-all')
    vi.advanceTimersByTime(2100)
    expect(fxOf().body.flash).toBe(true)          // renewed
    api.midiHoldUp('hit:strobe-all')
    expect(fxOf().body).toMatchObject({ mode: 'rig' })
    api.pending.delete('hold:fx:hit:strobe-all')
    vi.advanceTimersByTime(5000)
    expect(fxOf()).toBeUndefined()                // nothing renews a released hit
  })
  it('the page closing (midiReleaseAll) sends the clear-all first', () => {
    const { api } = page()
    api.midiReleaseAll()
    expect([...api.pending.values()][0]).toMatchObject({ route: 'api/fx', body: { clearFlash: true } })
  })
})

describe('R3-I4: an ACTIVATOR press flips it, short or long', () => {
  it('note-on flips once; the note-off of a 50 ms, 300 ms, 600 ms or 1500 ms press never flips it back', () => {
    for (const ms of [50, 300, 599, 600, 601, 1500]) {
      vi.useFakeTimers()
      const { api, L } = page()
      api.midiHandle('note', 0, 10, 1)
      vi.advanceTimersByTime(ms)
      api.midiRelease(0, 10)
      expect(L.applied, 'press of ' + ms + ' ms').toEqual(['flip'])
      vi.useRealTimers()
    }
  })
  it('two presses are two flips', () => {
    const { api, L } = page()
    api.midiHandle('note', 0, 10, 1); api.midiRelease(0, 10)
    api.midiHandle('note', 0, 10, 1); api.midiRelease(0, 10)
    expect(L.applied).toEqual(['flip', 'flip'])
  })
})
