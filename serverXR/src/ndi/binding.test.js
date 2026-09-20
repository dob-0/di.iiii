// @vitest-environment node

// The struct layouts, checked against a real koffi. This needs NO NDI runtime — koffi
// computes sizes and offsets from the declarations alone — but koffi itself is an
// optionalDependency, so the whole file steps aside when it is not installed.
//
// The expected numbers are what a 64-bit C compiler makes of the SDK headers
// (Processing.NDI.structs.h / .Find.h / .Recv.h / .Send.h, MIT, mirrored in
// github.com/DistroAV/DistroAV → lib/ndi). If one of these ever moves, the binding is
// handing the library a struct it will read wrong — which is a crash, or worse, garbage.
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

let koffi = null
try { koffi = require('koffi') } catch { koffi = null }

// `describe.skipIf` still RUNS this body to collect the tests it is about to skip,
// so nothing here may touch koffi at collection time — on a machine where the
// optionalDependency did not install (the case this file exists to tolerate) that
// threw and failed the suite. Everything koffi-shaped is built inside the tests.
describe.skipIf(!koffi)('the NDI struct layouts', () => {
  const { defineNdiTypes, checkLayouts, EXPECTED_SIZES, NDI } = require('./binding.js')
  let cached = null
  const types = () => (cached ||= defineNdiTypes(koffi))

  it('matches the byte sizes the headers imply on a 64-bit build', () => {
    expect(() => checkLayouts(koffi, types())).not.toThrow()
    for (const [name, bytes] of Object.entries(EXPECTED_SIZES)) {
      expect(koffi.sizeof(types()[name]), name).toBe(bytes)
    }
  })

  it('puts every field of NDIlib_video_frame_v2_t where the header puts it', () => {
    // xres 0 · yres 4 · FourCC 8 · frame_rate_N 12 · frame_rate_D 16 ·
    // picture_aspect_ratio 20 · frame_format_type 24 (+4 pad) · timecode 32 ·
    // p_data 40 · line_stride_in_bytes 48 (+4 pad) · p_metadata 56 · timestamp 64 → 72
    const offsets = Object.fromEntries(Object.entries(types().VideoFrame.members).map(([k, v]) => [k, v.offset]))
    expect(offsets).toEqual({
      xres: 0, yres: 4, FourCC: 8, frame_rate_N: 12, frame_rate_D: 16,
      picture_aspect_ratio: 20, frame_format_type: 24, timecode: 32,
      p_data: 40, line_stride_in_bytes: 48, p_metadata: 56, timestamp: 64
    })
  })

  it('lays out the source and the two create structs as the headers do', () => {
    const at = (type) => Object.fromEntries(Object.entries(type.members).map(([k, v]) => [k, v.offset]))
    // The union of p_url_address / p_ip_address is ONE pointer, not two.
    expect(at(types().Source)).toEqual({ p_ndi_name: 0, p_url_address: 8 })
    // bool + 7 bytes of padding before the first pointer.
    expect(at(types().FindCreate)).toEqual({ show_local_sources: 0, p_groups: 8, p_extra_ips: 16 })
    // The embedded source occupies the first 16 bytes; the two enums are plain ints.
    expect(at(types().RecvCreate)).toEqual({ source_to_connect_to: 0, color_format: 16, bandwidth: 20, allow_video_fields: 24, p_ndi_recv_name: 32 })
  })

  it('reads a frame struct back out of memory we allocated, and frees it', () => {
    const ptr = koffi.alloc(types().VideoFrame, 1)
    const blank = koffi.decode(ptr, types().VideoFrame)
    expect(blank.xres).toBe(0)
    expect(blank.p_data).toBeNull()
    expect(() => koffi.free(ptr)).not.toThrow()
  })

  it('spells the FourCC codes the way the header macro does', () => {
    // NDI_LIB_FOURCC('R','G','B','A') — little-endian packing, so 'R' is the low byte.
    expect(NDI.FOURCC_RGBA).toBe(0x41424752)
    expect(NDI.FOURCC_RGBX).toBe(0x58424752)
    expect(NDI.FOURCC_BGRA).toBe(0x41524742)
    // The colour format we ask for, and the two bandwidths (Processing.NDI.Recv.h).
    expect(NDI.COLOR_RGBX_RGBA).toBe(2)
    expect(NDI.BANDWIDTH_HIGHEST).toBe(100)
    expect(NDI.BANDWIDTH_LOWEST).toBe(0)
  })
})
