import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { decideIdentify, parseWidgetParams } = require('./identify.js')

// A GET_WIDGET_PARAMS reply: 0x7E, label 3, length 5, firmware LSB/MSB, break, MAB, rate.
const reply = Buffer.from([0x7e, 3, 5, 0, 1, 4, 9, 10, 40, 0xe7])
const ftdi = { vid: '0403', pid: '6001' }
const node = { vid: '1a86', pid: '7523' }

describe('light desk Identify decides by the protocol answer', () => {
  it('FTDI original + valid reply is an ENTTEC DMX USB Pro', () => {
    expect(decideIdentify({ port: '/dev/ttyUSB0', device: ftdi, reply }).label).toBe('ENTTEC DMX USB Pro (0403:6001)')
  })
  it('1a86 + valid reply is our vizzz node, not "not ENTTEC"', () => {
    const r = decideIdentify({ port: '/dev/ttyUSB0', device: node, reply })
    expect(r.answered).toBe(true)
    expect(r.label).toBe('ENTTEC protocol · vizzz node (1a86:7523)')
    expect(r.label).not.toMatch(/not ENTTEC/)
  })
  it('1a86 + no reply says no answer on the port', () => {
    const r = decideIdentify({ port: '/dev/ttyUSB0', device: node, reply: null })
    expect(r).toEqual({ answered: false, label: 'no answer on /dev/ttyUSB0' })
  })
  it('garbage is no answer', () => {
    expect(decideIdentify({ port: 'COM3', device: ftdi, reply: Buffer.from('hello world') }).answered).toBe(false)
    expect(parseWidgetParams(Buffer.from([0x7e, 3, 5, 0, 1, 2]))).toBe(null)
  })
  it('a reply after noise still counts', () => {
    expect(parseWidgetParams(Buffer.concat([Buffer.from([1, 2, 3]), reply])).firmware).toBe('4.1')
  })
  it('a port the live output holds is not probed and the text says so', () => {
    const r = decideIdentify({ port: '/dev/ttyUSB0', device: node, held: true })
    expect(r.answered).toBe(null)
    expect(r.label).toMatch(/in use by the live output/)
  })
})

describe('light desk title and wire line', () => {
  const dir = __dirname
  const html = fs.readFileSync(path.join(dir, 'ui/index.html'), 'utf8')
  const js = fs.readFileSync(path.join(dir, 'ui/app.js'), 'utf8')
  const wireName = new Function(js.match(/function wireName\([\s\S]*?\n\}\n/)[0] + '\nreturn wireName;')()
  it('no longer hard-codes "Art-Net Desk"', () => {
    expect(html).not.toMatch(/Art-Net Desk/)
    expect(js).not.toMatch(/Art-Net Desk/)
    expect(html).toMatch(/<title>Light<\/title>/)
  })
  it('the wire line follows the driver', () => {
    expect(wireName('enttec', '/dev/ttyUSB0')).toBe('ENTTEC on /dev/ttyUSB0')
    expect(wireName('sacn')).toBe('sACN')
    expect(wireName('artnet')).toBe('Art-Net')
    expect(wireName(undefined)).toBe('Art-Net')
  })
})
