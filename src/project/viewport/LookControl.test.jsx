import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import LookControl from './LookControl.jsx'
import { FORM_LIGHT_DEFAULT, getViewLook, resetViewLookForTests, setViewLook } from './viewLook.js'

beforeEach(() => { window.localStorage.clear(); resetViewLookForTests() })

describe('LookControl', () => {
    it('shows Current with no slider, 44 px tall, 2 px radius', () => {
        render(<LookControl />)
        const button = screen.getByRole('button', { name: 'Current' })
        expect(button.getAttribute('aria-pressed')).toBe('false')
        expect(button.style.minHeight).toBe('44px')
        expect(button.style.borderRadius).toBe('2px')
        expect(button.title).toMatch(/^Current: the room as it was drawn/)
        expect(screen.queryByLabelText('Form light')).toBeNull()
    })
    it('Form shows the Light slider, and both write the shared store', () => {
        render(<LookControl />)
        fireEvent.click(screen.getByRole('button', { name: 'Current' }))
        expect(getViewLook().look).toBe('form')
        const slider = screen.getByLabelText('Form light')
        expect(Number(slider.value)).toBe(FORM_LIGHT_DEFAULT)
        fireEvent.change(slider, { target: { value: '0.2' } })
        expect(getViewLook().light).toBe(0.2)
    })
    it('two controls (orbit viewer, walk chrome) follow the one store', () => {
        render(<><LookControl /><LookControl /></>)
        act(() => setViewLook('form'))
        expect(screen.getAllByRole('button', { name: 'Form' })).toHaveLength(2)
    })
})
