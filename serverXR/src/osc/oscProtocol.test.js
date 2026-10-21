// @vitest-environment node
// The OSC 1.0 codec against the specification's own examples (opensoundcontrol.org,
// "The Open Sound Control 1.0 Specification", section "Examples" and the atomic types).
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const osc = require('./oscProtocol.js')

const hex = (s) => Buffer.from(s.replace(/\s+/g, ''), 'hex')

describe('OSC-string (spec, Atomic Data Types)', () => {
  it('pads "OSC" to 4 bytes and "data" to 8, exactly as the spec draws them', () => {
    expect(osc.encodeString('OSC')).toEqual(hex('4f534300'))
    expect(osc.encodeString('data')).toEqual(hex('64617461 00000000'))
  })
})

describe('the spec\'s two message examples', () => {
  // "/oscillator/4/frequency" ,f 440.0
  const FREQUENCY = hex(`
    2f6f7363 696c6c61 746f722f 342f6672
    65717565 6e637900 2c660000 43dc0000`)
  // "/foo" ,iisff 1000 -1 "hello" 1.234 5.678
  const FOO = hex(`
    2f666f6f 00000000 2c696973 66660000
    000003e8 ffffffff 68656c6c 6f000000
    3f9df3b6 40b5b22d`)

  it('encodes /oscillator/4/frequency 440.0 byte for byte', () => {
    expect(osc.encodeMessage('/oscillator/4/frequency', [440])).toEqual(FREQUENCY)
  })

  it('encodes /foo 1000 -1 "hello" 1.234 5.678 byte for byte', () => {
    const args = [{ type: 'i', value: 1000 }, { type: 'i', value: -1 }, 'hello', 1.234, 5.678]
    expect(osc.encodeMessage('/foo', args)).toEqual(FOO)
  })

  it('decodes both back to their addresses, tags and values', () => {
    const a = osc.decodePacket(FREQUENCY)
    expect(a).toEqual({ address: '/oscillator/4/frequency', args: [{ type: 'f', value: 440 }] })
    const b = osc.decodePacket(FOO)
    expect(b.address).toBe('/foo')
    expect(b.args.map((x) => x.type).join('')).toBe('iisff')
    expect(b.args[0].value).toBe(1000)
    expect(b.args[1].value).toBe(-1)
    expect(b.args[2].value).toBe('hello')
    // float32 on the wire: equal to 1.234 to float32 precision, not to float64
    expect(b.args[3].value).toBeCloseTo(1.234, 6)
    expect(b.args[4].value).toBeCloseTo(5.678, 6)
  })
})

describe('arguments', () => {
  it('round-trips a blob with its padding, and the no-byte tags T F N I', () => {
    const buf = osc.encodeMessage('/b', [Buffer.from([1, 2, 3, 4, 5]), true, false, null, Infinity])
    expect(buf.length % 4).toBe(0)
    const m = osc.decodePacket(buf)
    expect(m.args.map((a) => a.type).join('')).toBe('bTFNI')
    expect([...m.args[0].value]).toEqual([1, 2, 3, 4, 5])
    expect(m.args.slice(1).map((a) => a.value)).toEqual([true, false, null, Infinity])
  })

  it('sends numbers as int32 when asked, rounding', () => {
    const m = osc.decodePacket(osc.encodeMessage('/n', [2.6], { numbers: 'int' }))
    expect(m.args).toEqual([{ type: 'i', value: 3 }])
  })

  it('decodes int64 and float64, the nonstandard tags senders use', () => {
    const buf = osc.encodeMessage('/w', [{ type: 'h', value: 5n }, { type: 'd', value: 0.1 }])
    expect(osc.decodePacket(buf).args).toEqual([{ type: 'h', value: 5 }, { type: 'd', value: 0.1 }])
  })

  it('reads a message with no type tag string as having no arguments (spec: be robust)', () => {
    expect(osc.decodePacket(osc.encodeString('/old'))).toEqual({ address: '/old', args: [] })
  })
})

describe('refusals — a malformed packet throws, it never yields made-up values', () => {
  it('refuses a packet that is not a multiple of 4 bytes', () => {
    expect(() => osc.decodePacket(Buffer.from('/ab'))).toThrow(/multiple of 4/)
  })
  it('refuses an unknown type tag rather than guessing its size', () => {
    const buf = Buffer.concat([osc.encodeString('/x'), osc.encodeString(',q'), Buffer.alloc(4)])
    expect(() => osc.decodePacket(buf)).toThrow(/'q'/)
  })
  it('refuses an argument that runs past the end', () => {
    const buf = Buffer.concat([osc.encodeString('/x'), osc.encodeString(',ii'), Buffer.alloc(4)])
    expect(() => osc.decodePacket(buf)).toThrow(/runs past/)
  })
  it('refuses a blob whose size is larger than the packet', () => {
    const size = Buffer.alloc(4); size.writeInt32BE(400, 0)
    const buf = Buffer.concat([osc.encodeString('/x'), osc.encodeString(',b'), size])
    expect(() => osc.decodePacket(buf)).toThrow(/blob/)
  })
  it('will not encode an address without a leading slash, or with a space', () => {
    expect(() => osc.encodeMessage('foo', [1])).toThrow(/not an OSC address/)
    expect(() => osc.encodeMessage('/a b', [1])).toThrow(/not an OSC address/)
  })
})

describe('bundles (spec, OSC Bundles)', () => {
  it('opens a bundle and a bundle inside it, keeping the order and the "immediately" tag', () => {
    const inner = osc.encodeBundle([osc.encodeMessage('/b', [2])])
    const buf = osc.encodeBundle([osc.encodeMessage('/a', [1]), inner])
    const packet = osc.decodePacket(buf)
    expect(packet.bundle).toBe(true)
    expect(packet.timeTag.immediately).toBe(true)
    expect(osc.messagesOf(packet).map((m) => [m.address, m.args[0].value])).toEqual([['/a', 1], ['/b', 2]])
  })
  it('refuses an element whose size runs past the bundle', () => {
    const buf = osc.encodeBundle([osc.encodeMessage('/a', [1])])
    buf.writeInt32BE(64, 16)
    expect(() => osc.decodePacket(buf)).toThrow(/bad size/)
  })
})

describe('address pattern matching (spec, Pattern Matching)', () => {
  const cases = [
    ['/fader/1', '/fader/1', true],
    ['/fader/?', '/fader/7', true],
    ['/fader/?', '/fader/12', false],
    ['/fader/*', '/fader/12', true],
    ['/fader/*', '/fader/12/x', false], // * stays inside one part
    ['/*/1', '/knob/1', true],
    ['/fader/[1-3]', '/fader/2', true],
    ['/fader/[1-3]', '/fader/4', false],
    ['/fader/[!1-3]', '/fader/4', true],
    ['/fader/[abc]', '/fader/b', true],
    ['/fader/[-a]', '/fader/-', true], // a - at the start is itself
    ['/{fader,knob}/1', '/knob/1', true],
    ['/{fader,knob}/1', '/slider/1', false],
    ['/layer*/clip?/connect', '/layer12/clip3/connect', true],
    ['', '/anything/at/all', true],
  ]
  it.each(cases)('%s against %s → %s', (pattern, address, want) => {
    expect(osc.matchAddress(pattern, address)).toBe(want)
  })
  it('does not blow up on a pathological * pattern (linear backtracking)', () => {
    const t0 = Date.now()
    expect(osc.matchAddress(`/${'*a'.repeat(30)}b`, `/${'a'.repeat(60)}`)).toBe(false)
    expect(Date.now() - t0).toBeLessThan(200)
  })
})
