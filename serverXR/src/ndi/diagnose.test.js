// @vitest-environment node

// The defect these guard: a receiver that had resolved a source and then never got a
// frame reported `state: "connecting", detail: ""` for ever. Met 2026-09-20 on the
// two-machine rig — di.iiii on `win` discovered both of aylmo's TouchDesigner senders
// across the network, `/ndi/api/still` answered 504 every time, and `stats` said
// nothing at all about why. No number of retries could tell the operator whether the
// sender was unreachable or simply silent.
//
// Every message below must name the source AND the address, because the address is
// chosen by the SENDER (whichever of its interfaces it likes) and is the first thing
// to check on a rig with more than one network.
import { describe, expect, it } from 'vitest'
import { noPictureDetail, stalledDetail, NO_PICTURE_AFTER_MS } from './diagnose.js'

const SOURCE = 'AYLMO (td_out_windows)'
const ADDRESS = '192.168.15.53:5961'

describe('what a silent NDI receiver says about itself', () => {
  it('says nothing before the threshold — a slow fallback is not a fault', () => {
    // Measured on win against NDI 6.3.2.0: a wrong url makes the runtime fall back to
    // resolving the name itself, and the first frame still lands at ~4.03 s.
    expect(NO_PICTURE_AFTER_MS).toBeGreaterThan(4030)
    expect(noPictureDetail({ connections: 0, waitedMs: 4100, source: SOURCE, address: ADDRESS })).toBeNull()
    expect(noPictureDetail({ connections: 1, waitedMs: 0, source: SOURCE, address: ADDRESS })).toBeNull()
  })

  it('never leaves "connecting" without a reason once the threshold passes', () => {
    for (const connections of [0, 1, null]) {
      const detail = noPictureDetail({ connections, waitedMs: NO_PICTURE_AFTER_MS, source: SOURCE, address: ADDRESS })
      expect(detail, `connections=${connections}`).toBeTruthy()
      expect(detail).toContain(SOURCE)
      expect(detail).toContain(ADDRESS)
    }
  })

  it('separates "never reached the sender" from "reached it, no video"', () => {
    const never = noPictureDetail({ connections: 0, waitedMs: 6000, source: SOURCE, address: ADDRESS })
    const silent = noPictureDetail({ connections: 1, waitedMs: 6000, source: SOURCE, address: ADDRESS })
    expect(never).not.toEqual(silent)
    // The one the two-machine rig hits: discovered, dialled, never answered.
    expect(never).toMatch(/no connection/)
    expect(never).toMatch(/firewall/)
    expect(never).toMatch(/route/)
    // The other one must NOT send a person hunting a firewall that is already open.
    expect(silent).toMatch(/connected to/)
    expect(silent).not.toMatch(/firewall/)
  })

  it('admits it cannot say when the runtime has no such entry point', () => {
    const detail = noPictureDetail({ connections: null, waitedMs: 6000, source: SOURCE, address: ADDRESS })
    expect(detail).toMatch(/cannot say/)
    expect(detail).not.toMatch(/firewall/)
  })

  it('reports the wait in whole seconds, and works with no address known', () => {
    expect(noPictureDetail({ connections: 0, waitedMs: 15000, source: SOURCE })).toContain('after 15 s')
    expect(noPictureDetail({ connections: 0, waitedMs: 15000, source: SOURCE })).toContain(`"${SOURCE}"`)
  })

  it('tells a lost connection from a sender that has merely gone quiet', () => {
    expect(stalledDetail({ connections: 0, silentMs: 3000, source: SOURCE, address: ADDRESS })).toMatch(/was lost/)
    expect(stalledDetail({ connections: 1, silentMs: 3000, source: SOURCE, address: ADDRESS })).toMatch(/still open/)
    // An old runtime with no count must not claim the connection was lost.
    expect(stalledDetail({ connections: null, silentMs: 3000, source: SOURCE, address: ADDRESS })).toMatch(/still open/)
  })
})
