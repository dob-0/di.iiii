// @vitest-environment node
//
// The laser lane against a fake LaserCube: two real UDP sockets on 127.0.0.1 that
// answer like the cube (protocol.js) and record every packet. What is proven here is
// the lane's side of the wire — what it sends, when, and when it refuses to. What the
// real cube does with it is the on-site test (docs/architecture/LASER.md).

import dgram from 'node:dgram'
import { afterEach, describe, expect, it } from 'vitest'
import protocol from './protocol.js'
import shapes from './shapes.js'
import laneModule from './lane.js'

const { createLaserLane, HEARTBEAT_TIMEOUT_MS } = laneModule
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

function infoReply({ bufferFree = 6000, bufferSize = 6000, outputEnabled = false } = {}) {
  const buf = Buffer.alloc(64)
  buf[0] = protocol.CMD.GET_FULL_INFO
  buf[2] = 0; buf[3] = 23
  buf[4] = outputEnabled ? 1 : 0
  buf.writeUInt32LE(30000, 10)
  buf.writeUInt32LE(35000, 14)
  buf.writeUInt16LE(bufferFree, 19)
  buf.writeUInt16LE(bufferSize, 21)
  buf[23] = 255
  buf[24] = 31
  Buffer.from([1, 2, 3, 4, 5, 6]).copy(buf, 26)
  Buffer.from([127, 0, 0, 1]).copy(buf, 32)
  Buffer.from('LaserCube 2W\0').copy(buf, 38)
  return buf
}

async function fakeCube({ answer = true } = {}) {
  const cmd = dgram.createSocket('udp4')
  const data = dgram.createSocket('udp4')
  const got = { cmd: [], data: [] }
  cmd.on('message', (msg, rinfo) => {
    got.cmd.push(msg)
    if (!answer) return
    if (msg[0] === protocol.CMD.GET_FULL_INFO) cmd.send(infoReply(), rinfo.port, rinfo.address)
    if (msg[0] === protocol.CMD.GET_RINGBUFFER_EMPTY_SAMPLE_COUNT) {
      const r = Buffer.alloc(4); r[0] = protocol.CMD.GET_RINGBUFFER_EMPTY_SAMPLE_COUNT; r.writeUInt16LE(6000, 2)
      cmd.send(r, rinfo.port, rinfo.address)
    }
  })
  data.on('message', (msg) => got.data.push(msg))
  await new Promise((r) => cmd.bind(0, '127.0.0.1', r))
  await new Promise((r) => data.bind(0, '127.0.0.1', r))
  return {
    got,
    cmdPort: cmd.address().port,
    dataPort: data.address().port,
    close: () => { cmd.close(); data.close() }
  }
}

const cmds = (got, code) => got.cmd.filter((m) => m[0] === code)

let cleanup = []
afterEach(() => { cleanup.forEach((f) => f()); cleanup = [] })

async function rig(opts) {
  const cube = await fakeCube(opts)
  let clock = 1_000_000
  const lane = createLaserLane({
    cmdPort: cube.cmdPort,
    dataPort: cube.dataPort,
    now: () => clock,
    setIntervalImpl: () => 1, // ticks are driven by hand
    clearIntervalImpl: () => {}
  })
  lane.update({ ip: '127.0.0.1' })
  cleanup.push(() => { lane.close(); cube.close() })
  const step = async (ms = 17) => { clock += ms; lane.tick(); await wait(15) }
  return { cube, lane, step, advance: (ms) => { clock += ms } }
}

describe('protocol', () => {
  it('clamps every value into the 12-bit range, never past it', () => {
    expect(protocol.toWords({ x: -1, y: 1, r: 0, g: 0.5, b: 1 })).toEqual([0, 4095, 0, 2048, 4095])
    expect(protocol.toWords({ x: -7, y: 9, r: -1, g: 2, b: NaN })).toEqual([0, 4095, 0, 4095, 0])
  })

  it('splits a 500-point frame into 146-point packets with the script\'s header', () => {
    const points = Array.from({ length: 500 }, () => ({ x: 0, y: 0, r: 0, g: 0, b: 0 }))
    const packets = protocol.framePackets(points, 300)
    expect(packets.map((p) => (p.length - 4) / 10)).toEqual([146, 146, 146, 62])
    expect([...packets[1].subarray(0, 4)]).toEqual([0xa9, 0x00, 1, 300 % 255])
  })

  it('reads the cube\'s info reply', () => {
    const info = protocol.parseReply(infoReply({ bufferFree: 1234 }))
    expect(info).toMatchObject({ kind: 'info', fwMinor: 23, bufferFree: 1234, bufferSize: 6000, battery: 'mains', temperature: 31, ip: '127.0.0.1', model: 'LaserCube 2W', serial: '01:02:03:04:05:06' })
  })
})

describe('shapes', () => {
  const inRange = (p) => Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && [p.r, p.g, p.b].every((c) => c >= 0 && c <= 1)

  it('renders exactly the point budget, every point in range, for every shape', () => {
    for (const shape of shapes.SHAPES) {
      const frame = shapes.renderFrame({ shape, size: 0.8, intensity: 1 }, 1.3, 500)
      expect(frame).toHaveLength(500)
      expect(frame.every(inRange)).toBe(true)
      expect(frame.some((p) => p.g > 0)).toBe(true)
    }
  })

  it('draws a dot as nothing: size 0 is blank, never a still beam', () => {
    const frame = shapes.renderFrame({ shape: 'circle', size: 0, intensity: 1 }, 0, 500)
    expect(frame.every((p) => p.r === 0 && p.g === 0 && p.b === 0)).toBe(true)
  })

  it('travels back blank on an open shape', () => {
    const frame = shapes.renderFrame({ shape: 'line', size: 1, intensity: 1, color: '#ffffff' }, 0, 300)
    expect(frame.slice(-50).every((p) => p.r === 0 && p.g === 0 && p.b === 0)).toBe(true)
  })

  it('blanks what is pushed past the edge instead of piling it there', () => {
    const frame = shapes.renderFrame({ shape: 'circle', size: 1, x: 0.8, intensity: 1 }, 0, 500)
    expect(frame.filter((p) => p.x > 0.999 && p.g > 0)).toHaveLength(0)
  })

  it('takes junk from a wire and keeps to safe values', () => {
    const look = shapes.normalizeLook({ shape: 'rm -rf', size: 9, intensity: -2, sides: 1000, color: 'red' })
    expect(look).toMatchObject({ shape: 'circle', size: 1, intensity: 0, sides: 12 })
    expect(look.color).toEqual([0, 1, 0])
  })
})

describe('the lane, against a fake cube', () => {
  it('sends no points while off — the default', async () => {
    const { cube, step } = await rig()
    for (let i = 0; i < 10; i++) await step()
    expect(cube.got.data).toHaveLength(0)
  })

  it('switches on, waits for the cube to answer, then sends frames', async () => {
    const { cube, lane, step } = await rig()
    lane.update({ on: true, look: { shape: 'circle', intensity: 0.5 } })
    await wait(20)
    for (let i = 0; i < 8; i++) await step()
    expect(cmds(cube.got, protocol.CMD.SET_OUTPUT).at(-1)[1]).toBe(1)
    expect(cube.got.data.length).toBeGreaterThan(0)
    expect(lane.status()).toMatchObject({ on: true, answering: true })
    expect(lane.status().info.model).toBe('LaserCube 2W')
  })

  it('OFF tells the cube to disable output and clear its buffer, and the points stop', async () => {
    const { cube, lane, step } = await rig()
    lane.update({ on: true })
    await wait(20)
    for (let i = 0; i < 5; i++) await step()
    lane.update({ on: false })
    await wait(20)
    const sent = cube.got.data.length
    expect(cmds(cube.got, protocol.CMD.SET_OUTPUT).at(-1)[1]).toBe(0)
    expect(cmds(cube.got, protocol.CMD.CLEAR_RINGBUFFER).length).toBeGreaterThan(0)
    for (let i = 0; i < 5; i++) await step()
    expect(cube.got.data.length).toBe(sent)
  })

  it('switches itself off when the page goes quiet (the dead-man)', async () => {
    const { cube, lane, step, advance } = await rig()
    lane.update({ on: true })
    await wait(20)
    await step()
    advance(HEARTBEAT_TIMEOUT_MS + 10)
    await step()
    expect(lane.status()).toMatchObject({ on: false })
    expect(lane.status().offReason).toMatch(/no word from the page/)
    expect(cmds(cube.got, protocol.CMD.SET_OUTPUT).at(-1)[1]).toBe(0)
  })

  it('sends nothing to a cube that does not answer, and says so', async () => {
    const { cube, lane, step } = await rig({ answer: false })
    lane.update({ on: true })
    for (let i = 0; i < 6; i++) await step()
    expect(cube.got.data).toHaveLength(0)
    expect(lane.status()).toMatchObject({ on: true, answering: false })
  })

  it('refuses an address that is not IPv4 and a rate out of range', async () => {
    const { lane } = await rig()
    expect(() => lane.update({ ip: 'cube.local; rm' })).toThrow(/not an IPv4/)
    expect(() => lane.update({ rate: 999999 })).toThrow(/rate must be/)
  })

  it('closing switches the cube off', async () => {
    const { cube, lane } = await rig()
    lane.update({ on: true })
    await wait(20)
    lane.close()
    await wait(20)
    expect(cmds(cube.got, protocol.CMD.SET_OUTPUT).at(-1)[1]).toBe(0)
  })
})
