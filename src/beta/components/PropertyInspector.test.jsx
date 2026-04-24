import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PropertyInspector from './PropertyInspector.jsx'

describe('PropertyInspector', () => {
    it('renders a color field for a port-driven section and emits a merged values patch', () => {
        const onSectionChange = vi.fn()
        render(
            <PropertyInspector
                title="Cube"
                subtitle="geom.cube"
                sections={[
                    {
                        id: 'values',
                        label: 'Ports',
                        fields: [
                            { label: 'Color', path: ['color'], type: 'color', portType: 'color' }
                        ]
                    }
                ]}
                values={{ values: { color: '#5fa8ff' } }}
                onSectionChange={onSectionChange}
            />
        )

        const colorInput = screen.getByDisplayValue('#5fa8ff')
        fireEvent.input(colorInput, { target: { value: '#ff0000' } })
        expect(onSectionChange).toHaveBeenCalledWith('values', { color: '#ff0000' })
    })

    it('renders a vec3 field as three number inputs and emits an array patch', () => {
        const onSectionChange = vi.fn()
        render(
            <PropertyInspector
                title="Cube"
                sections={[
                    {
                        id: 'values',
                        label: 'Ports',
                        fields: [
                            { label: 'Position', path: ['position'], type: 'vec3', portType: 'vec3' }
                        ]
                    }
                ]}
                values={{ values: { position: [0, 0, 0] } }}
                onSectionChange={onSectionChange}
            />
        )

        const numberInputs = screen.getAllByRole('spinbutton')
        expect(numberInputs).toHaveLength(3)
        fireEvent.change(numberInputs[1], { target: { value: '2.5' } })
        expect(onSectionChange).toHaveBeenCalledWith('values', { position: [0, 2.5, 0] })
    })

    it('renders a connection pill for geometry/texture/signal ports', () => {
        render(
            <PropertyInspector
                title="Node"
                sections={[
                    {
                        id: 'values',
                        label: 'Ports',
                        fields: [
                            { label: 'Mesh', path: ['mesh'], type: 'connection', portType: 'geometry' }
                        ]
                    }
                ]}
                values={{ values: { mesh: null } }}
                onSectionChange={() => {}}
            />
        )

        expect(screen.getByText('—')).toBeTruthy()
    })
})
