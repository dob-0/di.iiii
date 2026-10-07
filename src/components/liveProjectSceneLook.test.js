// @vitest-environment node
// Source-level guard (same style as liveProjectSceneSeams.test.js): walk mode takes the Look.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SOURCE = readFileSync(path.join(HERE, 'LiveProjectScene.jsx'), 'utf8')

describe('walk mode takes the Look', () => {
    it('mounts FormLight in the Canvas, skipped when the scene has its own authored environment', () => {
        expect(SOURCE).toMatch(/<FormLight skip=\{Boolean\(worldState\.environmentAssetId\)\} \/>/)
        expect(SOURCE.indexOf('<FormLight')).toBeGreaterThan(SOURCE.indexOf('<Canvas'))
        expect(SOURCE.indexOf('<FormLight')).toBeLessThan(SOURCE.indexOf('</Canvas>'))
    })
    it('draws the shared LookControl in the walk chrome, only while walking', () => {
        expect(SOURCE).toMatch(/\{walking && showModeControls && \(\s*<LookControl /)
    })
})
