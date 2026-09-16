// @vitest-environment node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const require = createRequire(import.meta.url)
const { createSinks, registerBuiltinCues, wireLighting, isSafeShowPageUrl } = require('./sinks')

describe('blackout', () => {
  it('starts off, flips on setBlackout, and remembers who asked', () => {
    const sinks = createSinks({ logger: { warn: () => {} } })
    expect(sinks.isBlackout()).toBe(false)
    sinks.setBlackout(true, { id: 'm1', name: 'aylmo' })
    expect(sinks.isBlackout()).toBe(true)
  })

  it('emits blackout only on an actual change', () => {
    const sinks = createSinks()
    const seen = []
    sinks.onBlackout((payload) => seen.push(payload))
    sinks.setBlackout(true, { id: 'm1', name: 'aylmo' })
    sinks.setBlackout(true, { id: 'm2', name: 'asuz' }) // no-op: already on
    sinks.setBlackout(false)
    expect(seen).toEqual([
      { on: true, from: { id: 'm1', name: 'aylmo' } },
      { on: false, from: null }
    ])
  })

  it('onBlackout returns an unsubscribe', () => {
    const sinks = createSinks()
    const fn = vi.fn()
    const unsubscribe = sinks.onBlackout(fn)
    unsubscribe()
    sinks.setBlackout(true)
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('cues', () => {
  it('unknown cue name is not an error', async () => {
    const sinks = createSinks()
    const result = await sinks.runCue({ id: 'c1', name: 'nope', args: {} })
    expect(result).toEqual({ accepted: false, reason: 'unknown-cue' })
  })

  it('registers and runs a cue, returning its result', async () => {
    const sinks = createSinks()
    sinks.registerCue('open-door', async (args) => ({ door: args.id }), { describe: 'opens a door' })
    const result = await sinks.runCue({ id: 'c1', name: 'open-door', args: { id: 'front' } })
    expect(result).toEqual({ accepted: true, result: { door: 'front' } })
    expect(sinks.cues()).toEqual([{ name: 'open-door', describe: 'opens a door' }])
  })

  it('the same id within 60s is a duplicate, even for a different cue name', async () => {
    const sinks = createSinks()
    sinks.registerCue('a', () => ({}))
    sinks.registerCue('b', () => ({}))
    await sinks.runCue({ id: 'dup', name: 'a', args: {} })
    const second = await sinks.runCue({ id: 'dup', name: 'b', args: {} })
    expect(second).toEqual({ accepted: false, reason: 'duplicate' })
  })

  it('a handler throwing a badArgs error is bad-args, not logged as a fault', async () => {
    const warn = vi.fn()
    const sinks = createSinks({ logger: { warn } })
    sinks.registerCue('picky', () => {
      const err = new Error('missing field')
      err.badArgs = true
      throw err
    })
    const result = await sinks.runCue({ id: 'c1', name: 'picky', args: {} })
    expect(result).toEqual({ accepted: false, reason: 'bad-args' })
    expect(warn).not.toHaveBeenCalled()
  })

  it('a handler throwing anything else is not-allowed, and logged once', async () => {
    const warn = vi.fn()
    const sinks = createSinks({ logger: { warn } })
    sinks.registerCue('locked', () => { throw new Error('wrong mode') })
    const result = await sinks.runCue({ id: 'c1', name: 'locked', args: {} })
    expect(result).toEqual({ accepted: false, reason: 'not-allowed' })
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('never throws, even for a malformed cue object', async () => {
    const sinks = createSinks()
    await expect(sinks.runCue(null)).resolves.toEqual({ accepted: false, reason: 'unknown-cue' })
    await expect(sinks.runCue({})).resolves.toEqual({ accepted: false, reason: 'unknown-cue' })
  })
})

describe('registerBuiltinCues', () => {
  it('ping answers { at }', async () => {
    const sinks = createSinks()
    registerBuiltinCues(sinks)
    const result = await sinks.runCue({ id: 'c1', name: 'ping', args: {} })
    expect(result.accepted).toBe(true)
    expect(typeof result.result.at).toBe('number')
  })

  it('reload emits a cue event and accepts', async () => {
    const sinks = createSinks()
    registerBuiltinCues(sinks)
    const seen = []
    sinks.events.on('cue', (payload) => seen.push(payload))
    const result = await sinks.runCue({ id: 'c1', name: 'reload', args: {}, from: { id: 'm1', name: 'aylmo' } })
    expect(result.accepted).toBe(true)
    expect(seen).toEqual([{ name: 'reload', args: {}, from: { id: 'm1', name: 'aylmo' } }])
  })

  it('show-page accepts a path and emits it', async () => {
    const sinks = createSinks()
    registerBuiltinCues(sinks)
    const seen = []
    sinks.events.on('cue', (payload) => seen.push(payload))
    const result = await sinks.runCue({ id: 'c1', name: 'show-page', args: { url: '/atlas' } })
    expect(result.accepted).toBe(true)
    expect(seen).toEqual([{ name: 'show-page', args: { url: '/atlas' }, from: null }])
  })

  it('show-page rejects an absolute URL with a scheme', async () => {
    const sinks = createSinks({ logger: { warn: () => {} } })
    registerBuiltinCues(sinks)
    const result = await sinks.runCue({ id: 'c1', name: 'show-page', args: { url: 'https://evil.example/x' } })
    expect(result).toEqual({ accepted: false, reason: 'bad-args' })
  })

  it('show-page rejects a protocol-relative URL', async () => {
    const sinks = createSinks()
    registerBuiltinCues(sinks)
    const result = await sinks.runCue({ id: 'c1', name: 'show-page', args: { url: '//evil.example/x' } })
    expect(result).toEqual({ accepted: false, reason: 'bad-args' })
  })

  it('show-page rejects javascript:', async () => {
    const sinks = createSinks()
    registerBuiltinCues(sinks)
    const result = await sinks.runCue({ id: 'c1', name: 'show-page', args: { url: 'javascript:alert(1)' } })
    expect(result).toEqual({ accepted: false, reason: 'bad-args' })
  })

  it('show-page rejects a backslash smuggling a protocol-relative URL', async () => {
    const sinks = createSinks()
    registerBuiltinCues(sinks)
    const result = await sinks.runCue({ id: 'c1', name: 'show-page', args: { url: '/\\evil.example' } })
    expect(result).toEqual({ accepted: false, reason: 'bad-args' })
  })

  it('show-page rejects a missing/non-string url', async () => {
    const sinks = createSinks()
    registerBuiltinCues(sinks)
    const result = await sinks.runCue({ id: 'c1', name: 'show-page', args: {} })
    expect(result).toEqual({ accepted: false, reason: 'bad-args' })
  })

  it('show-page accepts a same-origin-safe relative path', () => {
    expect(isSafeShowPageUrl('atlas/index.html')).toBe(true)
    expect(isSafeShowPageUrl('/atlas')).toBe(true)
  })
})

describe('wireLighting', () => {
  function fakeDesk() {
    return {
      state: { blackout: false },
      engine: { cancelFade: vi.fn() },
      writeShow: vi.fn()
    }
  }

  let scratchDir
  let dataDirWithShow

  beforeEach(() => {
    scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-sinks-test-'))
    dataDirWithShow = scratchDir
    fs.mkdirSync(path.join(dataDirWithShow, 'lighting'), { recursive: true })
    fs.writeFileSync(path.join(dataDirWithShow, 'lighting', 'show.json'), '{}')
  })

  afterEach(() => {
    fs.rmSync(scratchDir, { recursive: true, force: true })
  })

  it('does nothing when lighting is missing or has no getDesk', () => {
    const sinks = createSinks()
    expect(() => wireLighting(sinks, null)).not.toThrow()
    expect(() => wireLighting(sinks, {})).not.toThrow()
  })

  it('never calls getDesk when no desk exists yet and no show is saved on disk', () => {
    const sinks = createSinks()
    const getDesk = vi.fn(() => fakeDesk())
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-sinks-empty-'))
    wireLighting(sinks, { getDesk }, { dataDir: emptyDir })
    sinks.setBlackout(true)
    sinks.setBlackout(false)
    expect(getDesk).not.toHaveBeenCalled()
    fs.rmSync(emptyDir, { recursive: true, force: true })
  })

  it('mirrors blackout onto the desk once a saved show exists on disk', () => {
    const sinks = createSinks()
    const desk = fakeDesk()
    const getDesk = vi.fn(() => desk)
    wireLighting(sinks, { getDesk }, { dataDir: dataDirWithShow })
    sinks.setBlackout(true, { id: 'm1', name: 'aylmo' })
    expect(getDesk).toHaveBeenCalledTimes(1)
    expect(desk.state.blackout).toBe(true)
    expect(desk.engine.cancelFade).toHaveBeenCalledTimes(1)
    expect(desk.writeShow).toHaveBeenCalledTimes(1)

    sinks.setBlackout(false)
    expect(desk.state.blackout).toBe(false)
    expect(desk.engine.cancelFade).toHaveBeenCalledTimes(2)
  })

  it('once it has created the desk itself, keeps mirroring even without checking disk again', () => {
    const sinks = createSinks()
    const desk = fakeDesk()
    const getDesk = vi.fn(() => desk)
    wireLighting(sinks, { getDesk }, { dataDir: dataDirWithShow })
    sinks.setBlackout(true)
    sinks.setBlackout(false)
    sinks.setBlackout(true)
    expect(getDesk).toHaveBeenCalledTimes(3)
    expect(desk.state.blackout).toBe(true)
  })

  it('a getDesk() that throws is swallowed, never propagated to the blackout caller', () => {
    const sinks = createSinks()
    const getDesk = vi.fn(() => { throw new Error('no engine') })
    wireLighting(sinks, { getDesk }, { dataDir: dataDirWithShow })
    expect(() => sinks.setBlackout(true)).not.toThrow()
  })
})
