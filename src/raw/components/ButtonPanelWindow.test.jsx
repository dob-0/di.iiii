import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ButtonPanelWindow from './ButtonPanelWindow.jsx'

const node = { id: 'go-1', typeId: 'view.button', label: 'Go', values: { presses: 2 } }

describe('ButtonPanelWindow', () => {
    it('a press counts through the op and holds through the side channel', () => {
        const onPress = vi.fn()
        const onHeld = vi.fn()
        render(<ButtonPanelWindow node={node} onPress={onPress} onHeld={onHeld} />)
        const button = screen.getByRole('button', { name: 'Go' })
        fireEvent.pointerDown(button)
        expect(onPress).toHaveBeenCalledWith('go-1')
        expect(onHeld).toHaveBeenCalledWith('go-1', true)
        fireEvent.pointerUp(button)
        expect(onHeld).toHaveBeenLastCalledWith('go-1', false)
        expect(screen.getByText('2 presses')).toBeTruthy()
    })

    it('without a writer the button is disabled, never a dead-looking live one', () => {
        render(<ButtonPanelWindow node={node} />)
        expect(screen.getByRole('button', { name: 'Go' }).disabled).toBe(true)
    })
})
