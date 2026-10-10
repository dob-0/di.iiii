// The LaserCube network protocol (Wicked Lasers LaserCube WiFi/LAN models, the Ultra MK2 among them)
// — what goes on the wire, as pure functions. No socket here.
//
// Source: the open protocol as the lasercube-core crate documents it (docs.rs/crate/lasercube-core,
// read 2026-10-05: src/lib.rs, cmds.rs, point.rs):
//   UDP ports   45456 alive (pings) · 45457 commands · 45458 point data
//   commands    0x77 get full info · 0x78 enable the buffer-free answer on data · 0x80 output on/off
//               0x8a ask the ring buffer's free sample count · 0xa9 sample data
//   sample data [0xa9, 0x00, message number 0-255, frame number 0-255] then up to 140 points
//               (to stay under a typical MTU), each 10 bytes little-endian: x, y, r, g, b as u16
//               0…0xFFF; 0x800 is the centre of the field
//   answers     to 0x8a: bytes 2-3 the free count (u16 LE); to sample data (with 0x78 on): bytes 1-2
'use strict'

const PORT = Object.freeze({ ALIVE: 45456, CMD: 45457, DATA: 45458 })
const CMD = Object.freeze({ GET_FULL_INFO: 0x77, ENABLE_BUFFER_SIZE_RESPONSE: 0x78, SET_OUTPUT: 0x80, GET_BUFFER_FREE: 0x8a, SAMPLE_DATA: 0xa9 })
const MAX_POINTS_PER_MESSAGE = 140
const POINT_BYTES = 10
const MAX_VALUE = 0xfff

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** -1…1 (the frame's x/y) → 0…0xFFF, 0 at 0x800. */
const toDeviceCoord = (v) => Math.round(((Math.max(-1, Math.min(1, v)) + 1) / 2) * MAX_VALUE)
/** 0…1 (the frame's colour) → 0…0xFFF. */
const toDeviceColour = (v) => Math.round(clamp01(v) * MAX_VALUE)

const setOutput = (on) => Buffer.from([CMD.SET_OUTPUT, on ? 1 : 0])
const enableBufferSizeResponse = (on) => Buffer.from([CMD.ENABLE_BUFFER_SIZE_RESPONSE, on ? 1 : 0])
const getBufferFree = () => Buffer.from([CMD.GET_BUFFER_FREE])
const getFullInfo = () => Buffer.from([CMD.GET_FULL_INFO])

/**
 * One sample-data message: at most MAX_POINTS_PER_MESSAGE points of the frame ([x, y, r, g, b]).
 * @returns {Buffer}
 */
const encodeSampleData = (points, messageNum, frameNum) => {
    const list = points.slice(0, MAX_POINTS_PER_MESSAGE)
    const buf = Buffer.alloc(4 + list.length * POINT_BYTES)
    buf[0] = CMD.SAMPLE_DATA
    buf[1] = 0
    buf[2] = messageNum & 0xff
    buf[3] = frameNum & 0xff
    list.forEach(([x, y, r, g, b], i) => {
        const o = 4 + i * POINT_BYTES
        buf.writeUInt16LE(toDeviceCoord(x), o)
        buf.writeUInt16LE(toDeviceCoord(y), o + 2)
        buf.writeUInt16LE(toDeviceColour(r), o + 4)
        buf.writeUInt16LE(toDeviceColour(g), o + 6)
        buf.writeUInt16LE(toDeviceColour(b), o + 8)
    })
    return buf
}

/** The free sample count a cube answered with, or null when the message is not such an answer. */
const parseBufferFree = (msg) => {
    if (!Buffer.isBuffer(msg) || msg.length < 3) return null
    if (msg[0] === CMD.GET_BUFFER_FREE && msg.length >= 4) return msg.readUInt16LE(2)
    if (msg[0] === CMD.SAMPLE_DATA) return msg.readUInt16LE(1)
    return null
}

module.exports = {
    PORT, CMD, MAX_POINTS_PER_MESSAGE, POINT_BYTES, MAX_VALUE,
    toDeviceCoord, toDeviceColour, setOutput, enableBufferSizeResponse, getBufferFree, getFullInfo,
    encodeSampleData, parseBufferFree
}
