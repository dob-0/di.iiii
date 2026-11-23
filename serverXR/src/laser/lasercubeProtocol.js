// The LaserCube network protocol (Wicked Lasers LaserCube WiFi/LAN models, the Ultra MK2 among them)
// — what goes on the wire, as pure functions. No socket here.
//
// Source: the open protocol as the lasercube-core crate documents it (docs.rs/crate/lasercube-core,
// read 2026-10-05: src/lib.rs, cmds.rs, point.rs), and the same crate's SPECIFICATION.md
// (github.com/nannou-org/lasercube, MIT, read 2026-10-09) for the GET_FULL_INFO answer and the
// safety timeouts. Both are REVERSE-ENGINEERED from Wicked Lasers' own Python sample, not the
// maker's document: Wicked Lasers publishes no protocol. Every field below is as that spec reads it,
// unconfirmed on a real Ultra MK2 until the owed real cube test (its checklist: PROGRESS.md, "LaserCube drive finished", 2026-10-09).
//   UDP ports   45456 alive (pings) · 45457 commands · 45458 point data
//   commands    0x77 get full info · 0x78 enable the buffer-free answer on data · 0x80 output on/off
//               0x82 set the DAC rate (optional, off by default) · 0x8d clear the ring buffer
//               0x8a ask the ring buffer's free sample count · 0xa9 sample data
//   sample data [0xa9, 0x00, message number 0-255, frame number 0-255] then up to 140 points
//               (to stay under a typical MTU), each 10 bytes little-endian: x, y, r, g, b as u16
//               0…0xFFF; 0x800 is the centre of the field
//   answers     to 0x8a: bytes 2-3 the free count (u16 LE); to sample data (with 0x78 on): bytes 1-2
//               to 0x77: 64 bytes, read by parseFullInfo below
'use strict'

const PORT = Object.freeze({ ALIVE: 45456, CMD: 45457, DATA: 45458 })
const CMD = Object.freeze({ GET_FULL_INFO: 0x77, ENABLE_BUFFER_SIZE_RESPONSE: 0x78, SET_OUTPUT: 0x80, SET_RATE: 0x82, GET_BUFFER_FREE: 0x8a, CLEAR_RINGBUFFER: 0x8d, SAMPLE_DATA: 0xa9 })
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
 * CLEAR_RINGBUFFER (0x8d): drop every point the cube has queued. One byte, as Wicked Lasers' own
 * driver sends it (libLaserdockCore laserdocklib LaserDockNetworkDevice.cpp:22, 1007-1012); the TD
 * script defines it too. What the cube does with it while playing: UNVALIDATED on an Ultra MK2.
 */
const clearRingBuffer = () => Buffer.from([CMD.CLEAR_RINGBUFFER])
/**
 * SET_RATE (0x82): the cube's DAC rate, points a second, as a signed 32-bit little-endian number
 * after the command byte — as the TouchDesigner LaserCube script sends it (NairoDorian/
 * Laser-Cube-TouchDesigner LASER_CUBE_SCRIPT setRate: bytes([0x82]) + struct.pack('<l', rate)).
 * Sent only when laser.json asks for it (guards.sendSetRate); UNVALIDATED on an Ultra MK2.
 */
const setRate = (rate) => {
    const buf = Buffer.alloc(5)
    buf[0] = CMD.SET_RATE
    buf.writeInt32LE(Math.max(0, Math.min(0x7fffffff, Math.round(rate))), 1)
    return buf
}

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

const FULL_INFO_BYTES = 64
const FULL_INFO_MIN_BYTES = 38 // up to the model number; the name after it may be short
const CONNECTION_TYPES = Object.freeze({ 0: 'unknown', 1: 'USB', 2: 'Ethernet', 3: 'WiFi' })

/**
 * The cube's answer to GET_FULL_INFO (0x77), or null when the message is not one. The spec's table
 * (offsets in bytes; u16/u32 little-endian):
 *   0 echo 0x77 · 3 firmware major · 4 firmware minor · 5 status flags · 10 current DAC rate (u32)
 *   14 maximum DAC rate (u32) · 19 RX buffer free (u16) · 21 RX buffer size (u16) · 23 battery %
 *   24 temperature · 25 connection type · 26-31 serial number · 32-35 IP · 37 model number
 *   38… model name, NUL-terminated, never past byte 63
 * BYTE 5 IS A SET OF FLAGS, NOT A BOOLEAN (fixed 2026-10-14; before, any non-zero byte read as
 * "output enabled", so a disarmed cube reporting 2 — the interlock bit — showed outputEnabled=true).
 * Read as Wicked Lasers' own driver reads it (libLaserdockCore 3rdparty/laserdocklib/src/
 * LaserDockNetworkDevice.cpp:348-365, GPL-3.0, read 2026-10-14; the same in nannou's lasercube-core
 * status.rs:3-27, MIT): bit 0 output enabled; firmware ≥ 0.13: bit 1 interlock enabled, bit 2
 * temperature warning, bit 3 over-temperature, bits 4-7 packet errors; firmware ≤ 0.12: bit 3
 * interlock, bit 4 temperature warning, bit 5 over-temperature. The temperature (byte 24) is a SIGNED
 * byte in °C (LaserDockNetworkDevice.cpp:436, int8_t → TemperatureUpdated(degC)). Real cubes, read
 * 2026-10-14 (two Ultra MK2 7.5 W, firmware 1.17): the one armed then disarmed answered byte 5 = 2,
 * the one never armed 0; its answer starts 77 00 00 01 11 02, so firmware 1.17 sits at bytes 3-4 and
 * the flags at 5, as here (the TouchDesigner script's '<xxBB?5x' reads bytes 2-4, one byte early). Bit
 * 0 clear = output off: PROVEN by the maker's own parse. That bit 1 means "interlock enabled" is the
 * maker's name for it; why it is set only after an arm is NOT known (a latch? the interlock read only
 * once output was enabled?) — UNVALIDATED until a cube is read with its interlock open and closed. The connection type
 * is the table's offset 25 (the spec's prose says 26; Wicked's driver reads 25 too, :443).
 * MEASURED 2026-10-30 (studio Mac, LaserCube 7.5 W Ultra Mk2, firmware 1.17, Ethernet, ledger N1561/N1562): byte 5 read 2 BOTH
 * while the laser was dark and disarmed (20:44) AND while the owner saw the beam lit with the engine streaming (20:51-20:55).
 * So on firmware 1.17 bit 0 does not say "output on" and bit 1 is set either way: outputEnabled is reported as null (unknown)
 * with outputState saying why; the raw statusFlags stay. Never tell a person "output off" from this byte on that firmware.
 * Pure.
 */
/** The status byte's flags by firmware version (see parseFullInfo). Pure. */
const statusFlagsOf = (flags, major, minor) => {
    const v013 = major > 0 || minor >= 13
    return v013
        ? { interlockEnabled: (flags & 0x02) !== 0, temperatureWarning: (flags & 0x04) !== 0, overTemperature: (flags & 0x08) !== 0, packetErrors: (flags >> 4) & 0x0f }
        : { interlockEnabled: (flags & 0x08) !== 0, temperatureWarning: (flags & 0x10) !== 0, overTemperature: (flags & 0x20) !== 0, packetErrors: 0 }
}

// Firmware whose byte 5 was measured NOT to carry the output state (2026-10-30, see parseFullInfo).
const OUTPUT_NOT_REPORTED = new Set(['1.17'])

const parseFullInfo = (msg) => {
    if (!Buffer.isBuffer(msg) || msg.length < FULL_INFO_MIN_BYTES || msg[0] !== CMD.GET_FULL_INFO) return null
    const end = Math.min(msg.length, FULL_INFO_BYTES)
    let nameEnd = 38
    while (nameEnd < end && msg[nameEnd] !== 0) nameEnd += 1
    const modelName = msg.subarray(38, nameEnd).toString('latin1').replace(/[^\x20-\x7e]/g, '').trim()
    return {
        firmware: `${msg[3]}.${msg[4]}`,
        ...(OUTPUT_NOT_REPORTED.has(`${msg[3]}.${msg[4]}`)
            ? { outputEnabled: null, outputState: 'not reported by this firmware' }
            : { outputEnabled: (msg[5] & 0x01) !== 0 }),
        statusFlags: msg[5],
        ...statusFlagsOf(msg[5], msg[3], msg[4]),
        dacRate: msg.readUInt32LE(10),
        maxDacRate: msg.readUInt32LE(14),
        rxBufferFree: msg.readUInt16LE(19),
        rxBufferSize: msg.readUInt16LE(21),
        batteryPercent: msg[23],
        temperature: msg.readInt8(24),
        connectionType: CONNECTION_TYPES[msg[25]] || `unknown (${msg[25]})`,
        serial: msg.subarray(26, 32).toString('hex'),
        ip: [...msg.subarray(32, 36)].join('.'),
        modelNumber: msg[37],
        modelName
    }
}

module.exports = {
    PORT, CMD, MAX_POINTS_PER_MESSAGE, POINT_BYTES, MAX_VALUE, FULL_INFO_BYTES,
    toDeviceCoord, toDeviceColour, setOutput, setRate, clearRingBuffer, enableBufferSizeResponse, getBufferFree, getFullInfo,
    encodeSampleData, parseBufferFree, parseFullInfo, statusFlagsOf
}
