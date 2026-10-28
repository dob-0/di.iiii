import { describe, expect, it } from 'vitest'
import { PATCH_COLUMNS } from '../../src/rigbuild/sheet.js'
import { COLUMNS } from './patch-sheet.mjs'

// One file, one header: both producers of patch.csv name the id column `object`
// (docs/ai/vocabulary.md: entity -> object).
describe('patch CSV header', () => {
    it.each([
        ['src/rigbuild/sheet.js', PATCH_COLUMNS],
        ['scripts/rigbuild/patch-sheet.mjs', COLUMNS]
    ])('%s ends in "object" and never says "entity"', (_name, columns) => {
        const labels = columns.map((c) => c.label)
        expect(labels.at(-1)).toBe('object')
        expect(labels).not.toContain('entity')
    })
})
