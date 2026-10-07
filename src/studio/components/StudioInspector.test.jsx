import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import StudioInspector from './StudioInspector.jsx'
import { MATERIAL_PRESETS } from '../../project/entityRegistry.js'

const sections = [{
    id: 'appearance',
    label: 'Appearance',
    fields: [
        { label: 'Color', component: 'appearance', path: ['color'], type: 'color' },
        { label: 'Preset', component: 'appearance', type: 'presets', options: MATERIAL_PRESETS }
    ]
}]

const values = {
    appearance: { color: '#ff4400', opacity: 1, roughness: 1, metalness: 0, emissive: '#000000', emissiveIntensity: 1, textureAssetId: null }
}

describe('StudioInspector material presets', () => {
    it('clicking a preset patches the whole appearance in one change', () => {
        const onSectionChange = vi.fn()
        render(<StudioInspector title="Box" sections={sections} values={values} onSectionChange={onSectionChange} />)

        fireEvent.click(screen.getByRole('button', { name: 'Glass' }))

        expect(onSectionChange).toHaveBeenCalledTimes(1)
        const [component, patch] = onSectionChange.mock.calls[0]
        expect(component).toBe('appearance')
        expect(patch).toMatchObject({ roughness: 0.05, metalness: 0, opacity: 0.35 })
        expect(patch.color).toBe('#ff4400')
    })

    it('Glow derives its emissive tint from the entity color', () => {
        const onSectionChange = vi.fn()
        render(<StudioInspector title="Box" sections={sections} values={values} onSectionChange={onSectionChange} />)

        fireEvent.click(screen.getByRole('button', { name: 'Glow' }))

        const [, patch] = onSectionChange.mock.calls[0]
        expect(patch.emissive).toBe('#ff4400')
        expect(patch.emissiveIntensity).toBe(2.5)
    })
})

// A plane's Screen section: one picker listing the project's mapping surfaces
// by name. Choosing one writes `components.surface.surfaceId`; "none" clears it
// (the schema drops the empty component).
describe('StudioInspector surface picker', () => {
    const screenSections = [{
        id: 'surface',
        label: 'Screen',
        fields: [{ label: 'Surface', component: 'surface', path: ['surfaceId'], type: 'mappingSurface' }]
    }]
    const surfaceOptions = [{ value: 'srf-a', label: 'Wall left' }, { value: 'srf-b', label: 'Floor' }]

    it('lists the project\'s surfaces by name and writes the chosen id', () => {
        const onSectionChange = vi.fn()
        const { container } = render(<StudioInspector title="Plane" sections={screenSections} values={{}} surfaceOptions={surfaceOptions} onSectionChange={onSectionChange} />)
        expect(screen.getByText('Surface')).toBeTruthy()
        const select = container.querySelector('select.insp-select')
        expect([...select.options].map((o) => o.textContent)).toEqual(['— none —', 'Wall left', 'Floor'])
        fireEvent.change(select, { target: { value: 'srf-b' } })
        expect(onSectionChange).toHaveBeenCalledWith('surface', { surfaceId: 'srf-b' })
    })

    it('clears with "none" and keeps a since-deleted surface selectable under its id', () => {
        const onSectionChange = vi.fn()
        const { container } = render(<StudioInspector title="Plane" sections={screenSections} values={{ surface: { surfaceId: 'srf-gone' } }} surfaceOptions={surfaceOptions} onSectionChange={onSectionChange} />)
        const select = container.querySelector('select.insp-select')
        expect(select.value).toBe('srf-gone')
        fireEvent.change(select, { target: { value: '' } })
        expect(onSectionChange).toHaveBeenCalledWith('surface', { surfaceId: null })
    })
})

describe('StudioInspector number display (P10)', () => {
    const numSections = [{ id: 'transform', label: 'Transform', fields: [{ label: 'Position', component: 'transform', path: ['position', 0], type: 'number', step: 0.1 }] }]
    it('shows a long stored value rounded and does not write it back unless edited', () => {
        const onSectionChange = vi.fn()
        const { container } = render(<StudioInspector title="Box" sections={numSections} values={{ transform: { position: [0.5844327123, 0, 0] } }} onSectionChange={onSectionChange} />)
        const input = container.querySelector('input[type="number"]')
        expect(input.value).toBe('0.5844')
        fireEvent.focus(input)
        fireEvent.blur(input)
        expect(onSectionChange).not.toHaveBeenCalled()
        fireEvent.focus(input)
        fireEvent.change(input, { target: { value: '0.75' } })
        expect(onSectionChange).toHaveBeenCalledTimes(1)
    })
})
