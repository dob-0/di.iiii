import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import KeyboardFeed from './KeyboardFeed.jsx'

const node = { id: 'k1', typeId: 'device.keyboard', values: { key: 'Space' } }

describe('KeyboardFeed', () => {
    it('publishes the chosen key, held is one event, typing in fields is ignored', () => {
        const onKeyState = vi.fn()
        render(<KeyboardFeed node={node} onKeyState={onKeyState} />)
        fireEvent.keyDown(window, { code: 'Space', key: ' ' })
        expect(onKeyState).toHaveBeenCalledWith('k1', true, 1)
        fireEvent.keyDown(window, { code: 'Space', key: ' ', repeat: true })
        expect(onKeyState).toHaveBeenCalledTimes(1)
        fireEvent.keyUp(window, { code: 'Space', key: ' ' })
        expect(onKeyState).toHaveBeenLastCalledWith('k1', false, 1)
        fireEvent.keyDown(window, { code: 'KeyQ', key: 'q' })
        expect(onKeyState).toHaveBeenCalledTimes(2)

        const input = document.createElement('input')
        document.body.appendChild(input)
        fireEvent.keyDown(input, { code: 'Space', key: ' ' })
        expect(onKeyState).toHaveBeenCalledTimes(2)
        input.remove()
    })

    it('single letters match case-insensitively', () => {
        const onKeyState = vi.fn()
        render(<KeyboardFeed node={{ ...node, values: { key: 'g' } }} onKeyState={onKeyState} />)
        fireEvent.keyDown(window, { code: 'KeyG', key: 'G' })
        expect(onKeyState).toHaveBeenCalledWith('k1', true, 1)
    })
})
