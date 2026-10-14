import { describe, expect, it } from 'vitest'
import { REVISION } from 'three'
import { MEASURE_SCHEMA, UNITS, buildReport, cameraBlock, rendererInfo } from './measureReport.js'

const measurement = { ev100: 2.8364, ev100Source: 'scene', exposure: 3.5, operatorInputScale: 1 / 0.6, sceneScale: 0.02, sceneScaleSource: 'document', bounce: false }

describe('the JSON a reading is written as', () => {
    it('carries schema, kind, time, scene, camera, scale, units and the data', () => {
        const r = buildReport({ kind: 'lux', measurement, renderer: { three: REVISION }, scene: 't1-analytic', time: new Date('2026-10-09T08:00:00Z'), data: [{ E_lx: 305 }] })
        expect(r.schema).toBe(MEASURE_SCHEMA)
        expect(r.kind).toBe('lux')
        expect(r.time).toBe('2026-10-09T08:00:00.000Z')
        expect(r.scene).toBe('t1-analytic')
        expect(r.camera.ev100).toBe(2.8364)
        expect(r.camera.autoExposure).toBe('off')
        expect(r.camera.bloom).toBe('off')
        expect(r.camera.glareVeil).toBe('off')
        expect(r.sceneScale).toBe(0.02)
        expect(r.directOnly).toBe(true)
        expect(r.units).toBe(UNITS.lux)
        expect(r.units.E_lx).toMatch(/^lx/)
        expect(r.data[0].E_lx).toBe(305)
    })
    it('names the build, three.js and the GPU', () => {
        const ctx = { RENDERER: 1, VENDOR: 2, getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 3, UNMASKED_VENDOR_WEBGL: 4 }), getParameter: (p) => ({ 3: 'ANGLE (NVIDIA GeForce RTX 3080)', 4: 'Google Inc. (NVIDIA)' })[p] }
        const info = rendererInfo({ getContext: () => ctx })
        expect(info.three).toBe(REVISION)
        expect(info.gpu).toMatch(/RTX 3080/)
        expect(info.readback).toMatch(/before tone mapping/)
    })
    it('a camera block with no measurement is empty, not invented', () => {
        expect(cameraBlock(null).ev100).toBeNull()
    })
})
