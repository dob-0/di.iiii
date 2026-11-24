import { describe, expect, it } from 'vitest'
import { normalizeEntity } from './projectSchema.js'
import { getInspectorSections } from '../project/entityRegistry.js'

const appearanceOf = (type, appearance) => normalizeEntity({ id: 'e', type, components: { appearance } }).components.appearance

describe('model tint (appearance.tint)', () => {
    it('stays absent on old documents, so nothing existing changes look', () => {
        expect('tint' in appearanceOf('model', { color: '#ff3399', opacity: 1 })).toBe(false)
        expect('tint' in normalizeEntity({ id: 'e', type: 'model' }).components.appearance).toBe(false)
    })

    it('keeps an explicit on/off as a boolean', () => {
        expect(appearanceOf('model', { tint: true }).tint).toBe(true)
        expect(appearanceOf('model', { tint: false }).tint).toBe(false)
        expect(appearanceOf('model', { tint: 'yes' }).tint).toBe(false)
    })

    it('is only a model field', () => {
        expect('tint' in appearanceOf('box', { tint: true })).toBe(false)
    })

    it('the Studio inspector offers it for models, in Appearance, as "Tint the model"', () => {
        const appearance = getInspectorSections({ type: 'model' }).find((section) => section.id === 'appearance')
        expect(appearance.fields).toContainEqual(expect.objectContaining({ label: 'Tint the model', component: 'appearance', path: ['tint'], type: 'checkbox' }))
        expect(appearance.fields.some((field) => field.label === 'Colour')).toBe(true)
    })
})
