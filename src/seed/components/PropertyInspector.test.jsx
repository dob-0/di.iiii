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

    it('filters asset picker options to the field asset kind', () => {
        render(
            <PropertyInspector
                title="Image"
                sections={[
                    {
                        id: 'values',
                        label: 'Ports',
                        fields: [
                            { label: 'Source', path: ['src'], type: 'asset', portType: 'texture', assetKind: 'image' }
                        ]
                    }
                ]}
                values={{ values: { src: '' } }}
                assetOptions={[
                    { id: 'img-1', name: 'poster.webp', mimeType: 'image/webp' },
                    { id: 'vid-1', name: 'clip.mp4', mimeType: 'video/mp4' }
                ]}
                onSectionChange={() => {}}
            />
        )

        expect(screen.getByRole('option', { name: 'poster.webp' })).toBeTruthy()
        expect(screen.queryByRole('option', { name: 'clip.mp4' })).toBeNull()
    })

    // Universal code panel (product decision 2026-07-19): the Code section has
    // its own distinct id/label from the Ports section but must route back to
    // the same node.values object via component: 'values' on both the section
    // and its field — this is the actual mechanism under test, not the field's
    // own rendering (already covered generically by the textarea case above).
    it('routes the Code section\'s edits into the same values patch as the Ports section, alongside existing values', () => {
        const onSectionChange = vi.fn()
        render(
            <PropertyInspector
                title="Cube"
                subtitle="geom.cube"
                sections={[
                    { id: 'values', label: 'Ports', fields: [{ label: 'Color', path: ['color'], type: 'color', portType: 'color' }] },
                    { id: 'code', label: 'Code', component: 'values', fields: [{ label: 'Body', path: ['__code'], type: 'textarea', portType: 'string', component: 'values' }] }
                ]}
                values={{ values: { color: '#5fa8ff' } }}
                onSectionChange={onSectionChange}
            />
        )

        const codeTextarea = screen.getByText('Body').parentElement.querySelector('textarea')
        fireEvent.change(codeTextarea, { target: { value: 'some code' } })
        // Merged patch preserves the untouched Ports field (color) alongside
        // the new __code value — proof it wrote into the shared values object.
        expect(onSectionChange).toHaveBeenCalledWith('values', { color: '#5fa8ff', __code: 'some code' })
    })
})
