import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as browser from './waves.js'
import { readTwinPair } from '../../scripts/laser/waves-twin.mjs'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const lightingDir = path.join(here, '../../serverXR/src/lighting')
const server = require(path.join(lightingDir, 'waves.js'))
const lfo = require(path.join(lightingDir, 'lfo.js'))

describe('the waves (serverXR/src/lighting/waves.js and its browser twin)', () => {
    it('the browser twin is the generated one, byte for byte', () => {
        const { expected, actual } = readTwinPair()
        expect(actual).toBe(expected)
    })

    it('the twins agree on every wave, bias and seed over 55 000 samples', () => {
        let compared = 0
        for (const wave of [...server.WAVES, 'triangle', 'ramp', 'unknown']) {
            for (let i = 0; i < 1000; i++) {
                const total = i * 0.0137 - 3
                for (const bias of [0, -0.6, 0.35, 1, -1]) {
                    expect(browser.waveUnit(wave, total, 991, bias)).toBe(server.waveUnit(wave, total, 991, bias))
                    compared++
                }
            }
        }
        expect(compared).toBe(55000)
    })

    it('the light desk directory still reaches nothing outside itself (standalone.js runs it alone)', () => {
        const outside = []
        for (const file of fs.readdirSync(lightingDir).filter((name) => name.endsWith('.js'))) {
            const source = fs.readFileSync(path.join(lightingDir, file), 'utf8')
            for (const match of source.matchAll(/require\('(\.\.\/[^']+)'\)/g)) outside.push(`${file}: ${match[1]}`)
        }
        expect(outside).toEqual([])
    })

    it('the desk LFO draws its shapes through the shared module (random = hold, per cycle)', () => {
        const seed = server.seedOf('lf-test')
        // 0.5 s period, at exact milliseconds on the 25 ms frame grid
        expect(lfo.lfoWave('sine', 125, 500, 0, seed)).toBe(server.waveUnit('sine', 0.25, seed))
        expect(lfo.lfoWave('random', 100, 500, 0, seed)).toBe(server.waveUnit('hold', 0, seed))
        expect(lfo.lfoWave('random', 600, 500, 0, seed)).toBe(server.waveUnit('hold', 1, seed))
    })

    it('values at exact cycle positions, 0..1', () => {
        const at = (wave, total, bias = 0) => server.waveUnit(wave, total, 7, bias)
        expect(at('sine', 0)).toBe(0.5)
        expect(at('sine', 0.25)).toBe(1)
        expect(at('tri', 0)).toBe(0)
        expect(at('triangle', 0.5)).toBe(1)
        expect(at('ramp', 0.25)).toBe(0.25)
        expect(at('square', 0.49)).toBe(1)
        expect(at('square', 0.5)).toBe(0)
        expect(at('pulse', 0.05)).toBe(1)
        expect(at('pulse', 0.1)).toBe(0)
        // hold: one value for the whole cycle; glide starts on it and walks to the next
        expect(at('hold', 3.01)).toBe(at('hold', 3.99))
        expect(at('glide', 3)).toBe(at('hold', 3))
        expect(at('glide', 3.5)).toBeCloseTo((at('hold', 3) + at('hold', 4)) / 2, 12)
    })

    it('bias leans the cycle: the half-way point moves to (1 + bias) / 2', () => {
        expect(server.biasCycle(0.75, 0.5)).toBe(0.5)
        expect(server.biasCycle(0.375, 0.5)).toBe(0.25)
        expect(server.waveUnit('tri', 0.75, 0, 0.5)).toBe(1)
        // bias 1: a triangle becomes a rising ramp; -1 a falling one
        expect(server.waveUnit('tri', 0.4, 0, 1)).toBeCloseTo(0.4, 12)
        expect(server.waveUnit('tri', 0.4, 0, -1)).toBeCloseTo(0.6, 12)
        // square: bias is the duty
        expect(server.waveUnit('square', 0.7, 0, 0.5)).toBe(1)
        expect(server.waveUnit('square', 0.8, 0, 0.5)).toBe(0)
    })
})
