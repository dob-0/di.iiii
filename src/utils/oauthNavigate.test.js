import { describe, expect, it, vi } from 'vitest'
import { startOAuth } from './oauthNavigate.js'

describe('starting OAuth from a frame', () => {
    it('navigates the window itself when not framed', () => {
        const open = vi.fn(), go = vi.fn()
        expect(startOAuth('/o', { framed: false, open, go })).toBe(false)
        expect(go).toHaveBeenCalledWith('/o')
        expect(open).not.toHaveBeenCalled()
    })
    it('opens a tab when framed — GitHub and Google refuse to render inside a frame', () => {
        const open = vi.fn(() => ({})), go = vi.fn()
        expect(startOAuth('/o', { framed: true, open, go })).toBe(true)
        expect(open).toHaveBeenCalledWith('/o')
        expect(go).not.toHaveBeenCalled()
    })
    it('falls back to navigating when the tab is blocked', () => {
        const open = vi.fn(() => null), go = vi.fn()
        expect(startOAuth('/o', { framed: true, open, go })).toBe(false)
        expect(go).toHaveBeenCalledWith('/o')
    })
})
