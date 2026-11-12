import { describe, expect, it, vi } from 'vitest'
import { BODY_STATUS_TEXT, confidenceToBytes, createBodyMatte } from './bodyMatte.js'
import { EFFECT_TYPE_IDS, addEffect, createDeck, effectMainParams, expandDeck, layerEffectMixNodeId, layerEffectNodeId, setClip, setEffectOn, stackOf, trigger } from './vjDeck.js'
import { TOP_OPERATORS, resolveTopParams } from './topOperators.js'
import { checkShader } from './topEngine.js'

const playing = () => trigger(setClip(createDeck({ layers: 1, columns: 1 }), 0, 0, { kind: 'asset', asset: 'a1' }), 0, 0)
const expand = (deck) => expandDeck({ id: 'D', type: 'vj.deck', values: { deck } }, [])
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('Body effect registry', () => {
    it('is offered with soft, drift, echo as its first three knobs', () => {
        expect(EFFECT_TYPE_IDS).toContain('top.matte')
        expect(TOP_OPERATORS['top.matte'].label).toBe('Body')
        expect(effectMainParams('top.matte').slice(0, 3).map((p) => p.name)).toEqual(['soft', 'drift', 'echo'])
        expect(effectMainParams('top.matte').map((p) => p.name)).toEqual(['soft', 'drift', 'echo', 'colour', 'back', 'shade', 'fill', 'invert'])
    })

    it('keeps defaults that give a clean black body on a colour, flat, still, no echo', () => {
        const v = resolveTopParams('top.matte', {})
        expect(v).toMatchObject({ colour: '#000000', shade: 0, fill: 1, drift: 0, echo: 0, invert: 0 })
        expect(v.back).not.toBe('#000000')
    })

    it('declares one uniform per param and compiles', () => {
        const operator = TOP_OPERATORS['top.matte']
        const declared = [...operator.fragment.matchAll(/uniform\s+(?:float|vec3)\s+p_(\w+)\s*;/g)].map((m) => m[1]).sort()
        expect(declared).toEqual(operator.params.map((p) => p.name).sort())
        expect(checkShader(operator.fragment)).toBeNull()
    })

    it('clamps its params', () => {
        for (const p of TOP_OPERATORS['top.matte'].params.filter((q) => !q.colour)) {
            expect(resolveTopParams('top.matte', { [p.name]: 1e9 })[p.name]).toBe(p.max)
            expect(resolveTopParams('top.matte', { [p.name]: -1e9 })[p.name]).toBe(p.min)
        }
    })

    it('reads the layer source before the other effects (wire b), and costs nothing when off', () => {
        let deck = addEffect(playing(), 0, 'top.level')
        deck = addEffect(deck, 0, 'top.matte')
        const fx = stackOf(deck, 0)
        const matte = fx.find((e) => e.type === 'top.matte')
        const level = fx.find((e) => e.type === 'top.level')
        const { wires, nodes } = expand(deck)
        const id = layerEffectNodeId('D', 0, matte.id)
        const into = wires.filter((w) => w.to === id)
        expect(into.map((w) => w.port).sort()).toEqual(['a', 'b'])
        expect(into.find((w) => w.port === 'a').from).toBe(layerEffectMixNodeId('D', 0, level.id))
        expect(into.find((w) => w.port === 'b').from).toMatch(/clip/i)
        const off = expand(setEffectOn(deck, 0, matte.id, false))
        expect(off.nodes.some((n) => n.type === 'top.matte')).toBe(false)
        expect(nodes.some((n) => n.type === 'top.matte')).toBe(true)
    })

    it('leaves the other effects unchanged: no other operator asks for a second wire', () => {
        const deck = addEffect(playing(), 0, 'top.silhouette')
        const silhouette = stackOf(deck, 0)[0]
        expect(expand(deck).wires.filter((w) => w.to === layerEffectNodeId('D', 0, silhouette.id)).map((w) => w.port)).toEqual(['a'])
    })
})

describe('confidenceToBytes', () => {
    it('maps 0..1 to 0..255 and clamps', () => {
        expect([...confidenceToBytes(new Float32Array([-1, 0, 0.5, 1, 7]))]).toEqual([0, 0, 128, 255, 255])
    })
})

describe('body matte service', () => {
    const mask = (value) => ({ confidenceMasks: [{ width: 2, height: 1, getAsFloat32Array: () => new Float32Array([value, 1]) }], close: vi.fn() })

    it('does nothing until something asks for it, and reports idle', () => {
        const load = vi.fn()
        const service = createBodyMatte({ loadSegmenter: load })
        expect(service.status()).toBe('idle')
        expect(service.statusText()).toBe('')
        expect(load).not.toHaveBeenCalled()
    })

    it('load failure gives no mask and the plain status, never a throw', async () => {
        const service = createBodyMatte({ loadSegmenter: () => Promise.reject(new Error('404')) })
        service.acquire('a')
        expect(service.statusText()).toBe(BODY_STATUS_TEXT.loading)
        expect(service.run({})).toBeNull()
        await tick(); await tick()
        expect(service.status()).toBe('error')
        expect(service.statusText()).toBe('body model not available')
        expect(service.run({})).toBeNull()
    })

    it('loads once for many holders, runs, and closes when the last lets go', async () => {
        const close = vi.fn()
        const segmentForVideo = vi.fn(() => mask(0.25))
        const load = vi.fn(async () => ({ segmentForVideo, close }))
        const service = createBodyMatte({ loadSegmenter: load })
        service.acquire('a'); service.acquire('b')
        await tick(); await tick()
        expect(load).toHaveBeenCalledTimes(1)
        expect(service.status()).toBe('ready')
        const out = service.run({})
        expect([...out.bytes]).toEqual([64, 255])
        service.run({}); service.run({})
        const stamps = segmentForVideo.mock.calls.map((c) => c[1])
        expect(stamps).toEqual([...stamps].sort((x, y) => x - y))
        expect(new Set(stamps).size).toBe(stamps.length)
        service.release('a')
        expect(close).not.toHaveBeenCalled()
        service.release('b')
        expect(close).toHaveBeenCalledTimes(1)
        expect(service.status()).toBe('idle')
        expect(service.run({})).toBeNull()
    })

    it('a failed model run gives no mask instead of throwing', async () => {
        const service = createBodyMatte({ loadSegmenter: async () => ({ segmentForVideo: () => { throw new Error('gpu lost') }, close() {} }) })
        service.acquire('a')
        await tick(); await tick()
        expect(service.run({})).toBeNull()
    })

    it('an effect switched on after a failure tries again', async () => {
        let n = 0
        const service = createBodyMatte({ loadSegmenter: async () => { n += 1; if (n === 1) throw new Error('x'); return { segmentForVideo: () => mask(1), close() {} } } })
        service.acquire('a'); await tick(); await tick()
        expect(service.status()).toBe('error')
        service.release('a'); service.acquire('a'); await tick(); await tick()
        expect(service.status()).toBe('ready')
    })
})
