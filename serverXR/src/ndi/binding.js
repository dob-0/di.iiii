// The NDI® C API, declared for koffi. CHILD PROCESS ONLY — worker.js and devSender.js
// are the only callers; serverXR itself never requires this file's native half.
//
// Every layout below is transcribed from the NDI SDK's public headers, which carry an
// MIT licence of their own ("applies to this file ONLY and not to the SDK as a whole"),
// as mirrored in DistroAV: https://github.com/DistroAV/DistroAV/tree/master/lib/ndi
// (read 2026-09-20, headers copyright 2023-2026 Vizrt NDI AB). Each block names its file.
// The library itself is never shipped — see library.js and docs/architecture/NDI.md.
//
// Two rules that keep the layouts honest under koffi 3 (pointers are BigInt):
//   · a pointer the library OWNS and wants back (p_data, p_metadata of a received
//     frame) is declared `void *`, never `const char *` — koffi would decode a string
//     and hand back a different pointer on the way in;
//   · the received video frame lives in memory WE allocate once (koffi.alloc) and is
//     handed back to recv_free_video_v2 byte-for-byte; we only ever decode a copy.

const FOURCC = (a, b, c, d) => (a.charCodeAt(0) | (b.charCodeAt(0) << 8) | (c.charCodeAt(0) << 16) | (d.charCodeAt(0) << 24)) >>> 0

// Processing.NDI.structs.h — NDIlib_frame_type_e, NDIlib_FourCC_video_type_e,
// NDIlib_frame_format_type_e; Processing.NDI.Recv.h — bandwidth + colour format enums.
const NDI = {
  FRAME_NONE: 0,
  FRAME_VIDEO: 1,
  FRAME_AUDIO: 2,
  FRAME_METADATA: 3,
  FRAME_ERROR: 4,
  FRAME_STATUS_CHANGE: 100,
  FOURCC_RGBA: FOURCC('R', 'G', 'B', 'A'),
  FOURCC_RGBX: FOURCC('R', 'G', 'B', 'X'),
  FOURCC_BGRA: FOURCC('B', 'G', 'R', 'A'),
  FOURCC_BGRX: FOURCC('B', 'G', 'R', 'X'),
  FORMAT_PROGRESSIVE: 1,
  BANDWIDTH_LOWEST: 0,
  BANDWIDTH_HIGHEST: 100,
  COLOR_RGBX_RGBA: 2,
  // static const int64_t NDIlib_send_timecode_synthesize = INT64_MAX (structs.h)
  TIMECODE_SYNTHESIZE: 0x7fffffffffffffffn
}

let typesFor = null

// Pure type declarations — no library needed, so the layout test can run wherever
// koffi is installed. koffi type names are global, so this runs once per process.
function defineNdiTypes(koffi) {
  if (typesFor && typesFor.koffi === koffi) return typesFor.types

  // Processing.NDI.structs.h:
  //   typedef struct NDIlib_source_t {
  //     const char* p_ndi_name;
  //     union { const char* p_url_address; const char* p_ip_address; };
  //   }
  // The union is two spellings of one pointer → a single pointer member. 16 bytes.
  const Source = koffi.struct('NDIlib_source_t', {
    p_ndi_name: 'const char *',
    p_url_address: 'const char *'
  })

  // Processing.NDI.Find.h:
  //   typedef struct NDIlib_find_create_t {
  //     bool show_local_sources; const char* p_groups; const char* p_extra_ips; }
  // bool + 7 padding, then two pointers. 24 bytes.
  const FindCreate = koffi.struct('NDIlib_find_create_t', {
    show_local_sources: 'bool',
    p_groups: 'const char *',
    p_extra_ips: 'const char *'
  })

  // Processing.NDI.Recv.h:
  //   typedef struct NDIlib_recv_create_v3_t {
  //     NDIlib_source_t source_to_connect_to;       // 16
  //     NDIlib_recv_color_format_e color_format;    // int (enum, max 0x7fffffff)
  //     NDIlib_recv_bandwidth_e bandwidth;          // int (has a NEGATIVE member: -10)
  //     bool allow_video_fields;                    // + 7 padding
  //     const char* p_ndi_recv_name; }              // 40 bytes
  const RecvCreate = koffi.struct('NDIlib_recv_create_v3_t', {
    source_to_connect_to: Source,
    color_format: 'int',
    bandwidth: 'int',
    allow_video_fields: 'bool',
    p_ndi_recv_name: 'const char *'
  })

  // Processing.NDI.structs.h:
  //   typedef struct NDIlib_video_frame_v2_t {
  //     int xres, yres;                                  //  0, 4
  //     NDIlib_FourCC_video_type_e FourCC;               //  8   (uint32 by value)
  //     int frame_rate_N, frame_rate_D;                  // 12, 16
  //     float picture_aspect_ratio;                      // 20
  //     NDIlib_frame_format_type_e frame_format_type;    // 24   (+4 padding)
  //     int64_t timecode;                                // 32
  //     uint8_t* p_data;                                 // 40
  //     union { int line_stride_in_bytes; int data_size_in_bytes; };  // 48 (+4 padding)
  //     const char* p_metadata;                          // 56   ("Present in >= v2.5")
  //     int64_t timestamp; }                             // 64   → 72 bytes
  // The union is two names for one int → a single int member.
  const VideoFrame = koffi.struct('NDIlib_video_frame_v2_t', {
    xres: 'int',
    yres: 'int',
    FourCC: 'uint32_t',
    frame_rate_N: 'int',
    frame_rate_D: 'int',
    picture_aspect_ratio: 'float',
    frame_format_type: 'int',
    timecode: 'int64_t',
    p_data: 'void *',
    line_stride_in_bytes: 'int',
    p_metadata: 'void *',
    timestamp: 'int64_t'
  })

  // Processing.NDI.Send.h (devSender.js only):
  //   typedef struct NDIlib_send_create_t {
  //     const char* p_ndi_name; const char* p_groups; bool clock_video, clock_audio; }
  const SendCreate = koffi.struct('NDIlib_send_create_t', {
    p_ndi_name: 'const char *',
    p_groups: 'const char *',
    clock_video: 'bool',
    clock_audio: 'bool'
  })

  const types = { Source, FindCreate, RecvCreate, VideoFrame, SendCreate }
  typesFor = { koffi, types }
  return types
}

// What a 64-bit C compiler makes of the headers above. Checked at bind time: a layout
// that drifted must refuse to run rather than hand the library a wrong-sized struct.
const EXPECTED_SIZES = { Source: 16, FindCreate: 24, RecvCreate: 40, VideoFrame: 72, SendCreate: 24 }

function checkLayouts(koffi, types) {
  if (koffi.sizeof('void *') !== 8) throw new Error('NDI binding is written for 64-bit processes only')
  for (const [name, bytes] of Object.entries(EXPECTED_SIZES)) {
    const actual = koffi.sizeof(types[name])
    if (actual !== bytes) throw new Error(`NDI struct ${name} is ${actual} bytes, the header says ${bytes}`)
  }
}

// lib: a koffi library handle from library.js → loadNdi().
function bindNdi(koffi, lib, { send = false } = {}) {
  const types = defineNdiTypes(koffi)
  checkLayouts(koffi, types)

  // Instances are opaque (struct NDIlib_*_instance_type*): plain `void *` here.
  const fn = {
    // Processing.NDI.Lib.h
    initialize: lib.func('bool NDIlib_initialize(void)'),
    destroy: lib.func('void NDIlib_destroy(void)'),
    version: lib.func('const char *NDIlib_version(void)'),
    // Processing.NDI.Find.h
    findCreate: lib.func('void *NDIlib_find_create_v2(const NDIlib_find_create_t *p_create_settings)'),
    findDestroy: lib.func('void NDIlib_find_destroy(void *p_instance)'),
    findWait: lib.func('bool NDIlib_find_wait_for_sources(void *p_instance, uint32_t timeout_in_ms)'),
    findGetCurrent: lib.func('void *NDIlib_find_get_current_sources(void *p_instance, _Out_ uint32_t *p_no_sources)'),
    // Processing.NDI.Recv.h — audio and metadata are passed NULL: video only.
    recvCreate: lib.func('void *NDIlib_recv_create_v3(const NDIlib_recv_create_v3_t *p_create_settings)'),
    recvDestroy: lib.func('void NDIlib_recv_destroy(void *p_instance)'),
    recvConnect: lib.func('void NDIlib_recv_connect(void *p_instance, const NDIlib_source_t *p_src)'),
    recvCapture: lib.func('int NDIlib_recv_capture_v3(void *p_instance, void *p_video_data, void *p_audio_data, void *p_metadata, uint32_t timeout_in_ms)'),
    recvFreeVideo: lib.func('void NDIlib_recv_free_video_v2(void *p_instance, void *p_video_data)')
  }
  if (send) {
    // Processing.NDI.Send.h
    fn.sendCreate = lib.func('void *NDIlib_send_create(const NDIlib_send_create_t *p_create_settings)')
    fn.sendDestroy = lib.func('void NDIlib_send_destroy(void *p_instance)')
    fn.sendVideo = lib.func('void NDIlib_send_send_video_v2(void *p_instance, const NDIlib_video_frame_v2_t *p_video_data)')
  }

  const sourceSize = koffi.sizeof(types.Source)

  return {
    koffi,
    types,
    fn,
    NDI,
    // The finder's current list as plain objects. The pointer is only valid until the
    // next call on this finder, so strings are copied out here and nowhere else.
    readSources(finder) {
      const count = [0]
      const ptr = fn.findGetCurrent(finder, count)
      const out = []
      if (!ptr) return out
      for (let i = 0; i < count[0]; i += 1) {
        const s = koffi.decode(ptr, i * sourceSize, types.Source)
        if (s.p_ndi_name) out.push({ name: s.p_ndi_name, address: s.p_url_address || '' })
      }
      return out
    }
  }
}

module.exports = { bindNdi, defineNdiTypes, checkLayouts, EXPECTED_SIZES, NDI }
