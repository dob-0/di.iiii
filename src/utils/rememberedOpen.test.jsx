// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import useRememberedOpen, { readOpen } from './rememberedOpen.js'

function Panel() {
    const [open, toggle] = useRememberedOpen('t')
    return <div><button onClick={toggle}>chip</button>{open ? <p>panel</p> : null}</div>
}
beforeEach(() => window.localStorage.clear())
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('the scene is the page: a panel starts closed, a click opens it, the choice is this viewer\'s', () => {
    it('starts closed on a first visit', () => {
        render(<Panel />)
        expect(screen.queryByText('panel')).toBeNull()
        expect(readOpen('t')).toBe(false)
    })
    it('a click opens it and a second visit finds it open; closing forgets', () => {
        const first = render(<Panel />)
        fireEvent.click(screen.getByText('chip'))
        expect(screen.getByText('panel')).toBeTruthy()
        first.unmount()
        render(<Panel />)
        expect(screen.getByText('panel')).toBeTruthy()
        fireEvent.click(screen.getByText('chip'))
        expect(screen.queryByText('panel')).toBeNull()
        expect(readOpen('t')).toBe(false)
    })
    it('with storage blocked it still opens and closes, and never throws', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
        render(<Panel />)
        expect(screen.queryByText('panel')).toBeNull()
        fireEvent.click(screen.getByText('chip'))
        expect(screen.getByText('panel')).toBeTruthy()
    })
})

describe('a work tool asked open (opened = true): starts open, a fold is this viewer\'s', () => {
    function Tool() {
        const [open, toggle] = useRememberedOpen('w', true)
        return <div><button onClick={toggle}>chip</button>{open ? <p>tool</p> : null}</div>
    }
    it('starts open, a fold is remembered, opening again stores nothing', () => {
        const first = render(<Tool />)
        expect(screen.getByText('tool')).toBeTruthy()
        fireEvent.click(screen.getByText('chip'))
        expect(window.localStorage.getItem('di.panel.w')).toBe('0')
        first.unmount()
        render(<Tool />)
        expect(screen.queryByText('tool')).toBeNull()
        fireEvent.click(screen.getByText('chip'))
        expect(window.localStorage.getItem('di.panel.w')).toBeNull()
        expect(readOpen('w', true)).toBe(true)
    })
})
