import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import FixtureField from './FixtureField.jsx'
import StudioInspector from './StudioInspector.jsx'
import { getInspectorSections } from '../../project/entityRegistry.js'

const mirrorOf = (snapshot) => ({
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    probe: vi.fn(),
    watch: vi.fn(() => () => {})
})

const ABSENT = { present: false, fixtures: [], master: null, blackout: false }
const LIVE = {
    present: true,
    master: 255,
    blackout: false,
    fixtures: [
        { id: 'b', index: 2, name: 'Wash', x: 0, y: 0, colour: { r: 0, g: 0, b: 0 }, level: 0 },
        { id: 'a', index: 1, name: 'Back left', x: 0, y: 0, colour: { r: 0, g: 0, b: 0 }, level: 0 },
        { id: 'a2', index: 1, name: 'Back left twin', x: 0, y: 0, colour: { r: 0, g: 0, b: 0 }, level: 0 }
    ]
}

describe('the Fixture field', () => {
    it('is a plain number when there is no desk here, and clears to null', () => {
        const onChange = vi.fn()
        render(<FixtureField value={3} onChange={onChange} mirror={mirrorOf(ABSENT)} />)
        const input = screen.getByLabelText('Fixture')
        expect(input.tagName).toBe('INPUT')
        expect(input).toHaveAttribute('type', 'number')
        expect(input).toHaveValue(3)
        fireEvent.change(input, { target: { value: '5' } })
        expect(onChange).toHaveBeenLastCalledWith(5)
        fireEvent.change(input, { target: { value: '' } })
        expect(onChange).toHaveBeenLastCalledWith(null)
        fireEvent.change(input, { target: { value: '0' } })
        expect(onChange).toHaveBeenLastCalledWith(null)
    })

    it('is the desk\'s own list, index.name, sorted, one entry per number, when the desk is live', () => {
        const onChange = vi.fn()
        render(<FixtureField value={null} onChange={onChange} mirror={mirrorOf(LIVE)} />)
        const select = screen.getByLabelText('Fixture')
        expect(select.tagName).toBe('SELECT')
        expect([...select.options].map((o) => o.textContent)).toEqual(['— none —', '1.Back left', '2.Wash'])
        fireEvent.change(select, { target: { value: '2' } })
        expect(onChange).toHaveBeenLastCalledWith(2)
        fireEvent.change(select, { target: { value: '' } })
        expect(onChange).toHaveBeenLastCalledWith(null)
    })

    it('keeps a number the desk has not patched visible rather than silently showing none', () => {
        render(<FixtureField value={7} onChange={vi.fn()} mirror={mirrorOf(LIVE)} />)
        const select = screen.getByLabelText('Fixture')
        expect(select).toHaveValue('7')
        expect([...select.options].map((o) => o.textContent)).toContain('7. not patched')
    })

    it('reaches the inspector through the lamps\' Desk section and patches `fixture` alone', () => {
        const onSectionChange = vi.fn()
        const spot = { type: 'spotLight', components: { light: { color: '#ffffff', intensity: 2 } } }
        const inspector = (values) => (
            <StudioInspector
                title="Spot"
                sections={getInspectorSections(spot)}
                values={values}
                onSectionChange={onSectionChange}
                lightingMirror={mirrorOf(ABSENT)}
            />
        )
        const { rerender } = render(inspector(spot.components))
        fireEvent.change(screen.getByLabelText('Fixture'), { target: { value: '3' } })
        expect(onSectionChange).toHaveBeenCalledWith('fixture', { index: 3 })
        // The inspector is controlled: the document answers with the value, then it is cleared.
        rerender(inspector({ ...spot.components, fixture: { index: 3 } }))
        expect(screen.getByLabelText('Fixture')).toHaveValue(3)
        fireEvent.change(screen.getByLabelText('Fixture'), { target: { value: '' } })
        expect(onSectionChange).toHaveBeenLastCalledWith('fixture', { index: null })
    })

    it('an ambient light has no Desk section — it is not a lamp on a bar', () => {
        const ids = (type) => getInspectorSections({ type }).map((s) => s.id)
        expect(ids('ambientLight')).not.toContain('fixture')
        for (const type of ['pointLight', 'spotLight', 'directionalLight']) expect(ids(type)).toContain('fixture')
        expect(ids('box')).not.toContain('fixture')
    })
})
