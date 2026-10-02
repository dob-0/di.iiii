import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 2026-10-02 (/moxir console): three.js deprecated PCFSoftShadowMap and falls back to PCFShadowMap with a
// warning, about 60 per room load. react-three-fiber's `shadows={true}` asks for PCFSoft too, so every
// Canvas names 'percentage' (PCFShadowMap): the same shadows on screen, no warning.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name)
    if (d.isDirectory()) return d.name === 'node_modules' ? [] : files(p)
    return /\.(jsx?|tsx?)$/.test(d.name) && !/\.test\./.test(d.name) ? [p] : []
})

describe('shadow map type', () => {
    const sources = files(root).map((f) => [path.relative(root, f), fs.readFileSync(f, 'utf8')])
    it('nothing in src asks for the deprecated PCFSoftShadowMap', () => {
        expect(sources.filter(([, s]) => s.includes('PCFSoftShadowMap')).map(([f]) => f)).toEqual([])
    })
    it('no Canvas passes a bare boolean shadows prop (r3f maps true to PCFSoft)', () => {
        const bare = /(?<=\s)shadows(?:\s*\n|\s*>|=\{[^}?]*\})/
        const canvases = sources.filter(([, s]) => s.includes('<Canvas'))
        expect(canvases.filter(([, s]) => bare.test(s)).map(([f]) => f)).toEqual([])
    })
})
