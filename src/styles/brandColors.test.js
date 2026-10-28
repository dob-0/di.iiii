// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DI_CYAN, DI_SUCCESS, DI_SURFACE, DI_SURFACE_2, overSurface } from './brandColors.js'

const base = readFileSync(new URL('./base.css', import.meta.url), 'utf8')
const token = (name) => base.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim().toLowerCase()

describe('the house colours in JS', () => {
    it('are the tokens base.css declares', () => {
        expect(DI_CYAN).toBe(token('di-cyan'))
        expect(DI_SUCCESS).toBe(token('di-success'))
        expect(DI_SURFACE).toBe(token('di-surface'))
        expect(DI_SURFACE_2).toBe(token('di-surface-2'))
    })

    it('lays a colour over the ground', () => {
        expect(overSurface(DI_CYAN, 1)).toBe(DI_CYAN)
        expect(overSurface(DI_CYAN, 0)).toBe(DI_SURFACE)
        expect(overSurface('#ffffff', 0.5, '#000000')).toBe('#808080')
    })
})
