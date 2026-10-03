'use strict'

// The LaserCube network protocol (Wicked Lasers LaserCube, Wi-Fi / Ethernet models):
// two UDP ports on the cube, commands on 45457, point data on 45458.
//
// Ported from TD_LASER_CUBE_WIFI_ETHERNET, the TouchDesigner script the owner ran
// against a real cube on 2026-10-03 (github.com/NairoDorian/Laser-Cube-TouchDesigner
// @34ca8845). Its notice, as the MIT licence asks:
//
//   Copyright (C) 2021 Dorian Picard
//   Based on work from: Sidney San Martín
//   Additional modifications: Tim Greiser
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy
//   of this software and associated documentation files (the "Software"), to deal
//   in the Software without restriction, including without limitation the rights
//   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//   copies of the Software, and to permit persons to whom the Software is
//   furnished to do so, subject to the following conditions:
//
//   The above copyright notice and this permission notice shall be included in
//   all copies or substantial portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
//   THE SOFTWARE.
//
// Only that script was read for this port — not Wicked Lasers' libLaserdockCore
// (GPL-3.0), which the script itself cites as its source of the protocol.

const CMD_PORT = 45457
const DATA_PORT = 45458

const CMD = Object.freeze({
  GET_FULL_INFO: 0x77,
  ENABLE_BUFFER_SIZE_RESPONSE_ON_DATA: 0x78,
  SET_OUTPUT: 0x80,
  SET_RATE: 0x82,
  GET_RINGBUFFER_EMPTY_SAMPLE_COUNT: 0x8a,
  CLEAR_RINGBUFFER: 0x8d,
  SAMPLE_DATA: 0xa9
})

// One data packet carries at most this many points (the script's value).
const POINTS_PER_PACKET = 146
// Every coordinate and colour goes out as a 12-bit unsigned value.
const MAX_VALUE = 4095

const getFullInfo = () => Buffer.from([CMD.GET_FULL_INFO])
const setOutput = (on) => Buffer.from([CMD.SET_OUTPUT, on ? 0x01 : 0x00])
const enableBufferSizeResponse = (on) => Buffer.from([CMD.ENABLE_BUFFER_SIZE_RESPONSE_ON_DATA, on ? 0x01 : 0x00])
const getBufferFree = () => Buffer.from([CMD.GET_RINGBUFFER_EMPTY_SAMPLE_COUNT])
const clearBuffer = () => Buffer.from([CMD.CLEAR_RINGBUFFER])
const setRate = (rate) => {
  const buf = Buffer.alloc(5)
  buf[0] = CMD.SET_RATE
  buf.writeInt32LE(Math.round(rate), 1)
  return buf
}

const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)
const clampSigned = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(-1, v)) : 0)

// A point as the renderer makes it — x, y in −1…1, r, g, b in 0…1 — to the cube's
// 12-bit words. Everything is clamped here, at the last step before the wire: the
// TouchDesigner script had no clamp, so one value out of range stopped every frame.
const toWords = (p) => [
  Math.round((clampSigned(p.x) + 1) * 0.5 * MAX_VALUE),
  Math.round((clampSigned(p.y) + 1) * 0.5 * MAX_VALUE),
  Math.round(clamp01(p.r) * MAX_VALUE),
  Math.round(clamp01(p.g) * MAX_VALUE),
  Math.round(clamp01(p.b) * MAX_VALUE)
]

// A frame of points to the data packets that carry it. message and frame numbers
// wrap at 255, as the script does.
function framePackets(points, frameNum) {
  const packets = []
  for (let start = 0, messageNum = 0; start < points.length; start += POINTS_PER_PACKET, messageNum++) {
    const chunk = points.slice(start, start + POINTS_PER_PACKET)
    const buf = Buffer.alloc(4 + chunk.length * 10)
    buf[0] = CMD.SAMPLE_DATA
    buf[1] = 0x00
    buf[2] = messageNum % 0xff
    buf[3] = frameNum % 0xff
    chunk.forEach((p, i) => {
      const words = toWords(p)
      for (let w = 0; w < 5; w++) buf.writeUInt16LE(words[w], 4 + i * 10 + w * 2)
    })
    packets.push(buf)
  }
  return packets
}

// The cube's answers. GET_FULL_INFO's layout is the script's struct
// '<xxBB?5xIIxHHBBB11xB26x' plus serial (26..31), IP (32..35) and name (38..).
function parseReply(msg) {
  if (!Buffer.isBuffer(msg) || msg.length < 1) return null
  if (msg[0] === CMD.GET_FULL_INFO && msg.length >= 38) {
    const battery = msg[23]
    return {
      kind: 'info',
      fwMajor: msg[2],
      fwMinor: msg[3],
      outputEnabled: msg[4] !== 0,
      dacRate: msg.readUInt32LE(10),
      maxDacRate: msg.readUInt32LE(14),
      bufferFree: msg.readUInt16LE(19),
      bufferSize: msg.readUInt16LE(21),
      // 255 = on mains power, the script's 'UP'
      battery: battery === 255 ? 'mains' : battery,
      temperature: msg[24],
      connectionType: msg[25],
      serial: [...msg.subarray(26, 32)].map((b) => b.toString(16).padStart(2, '0')).join(':'),
      ip: [...msg.subarray(32, 36)].join('.'),
      model: msg.length > 38 ? msg.subarray(38).toString('utf8').split('\0')[0] : ''
    }
  }
  if (msg[0] === CMD.GET_RINGBUFFER_EMPTY_SAMPLE_COUNT && msg.length >= 4) {
    return { kind: 'bufferFree', bufferFree: msg.readUInt16LE(2) }
  }
  return { kind: 'other', cmd: msg[0] }
}

module.exports = {
  CMD_PORT,
  DATA_PORT,
  CMD,
  POINTS_PER_PACKET,
  MAX_VALUE,
  getFullInfo,
  setOutput,
  enableBufferSizeResponse,
  getBufferFree,
  clearBuffer,
  setRate,
  toWords,
  framePackets,
  parseReply
}
