import { describe, it, expect, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import useDocumentTitle from './useDocumentTitle.js'

function Titled({ title }) {
    useDocumentTitle(title)
    return null
}

describe('useDocumentTitle', () => {
    beforeEach(() => {
        document.title = 'di.iiii — public spaces on the open web'
        cleanup()
    })

    it('sets the tab title', () => {
        render(<Titled title="Sign in — di.iiii" />)
        expect(document.title).toBe('Sign in — di.iiii')
    })

    it('restores the previous title on unmount', () => {
        const { unmount } = render(<Titled title="Sign in — di.iiii" />)
        unmount()
        expect(document.title).toBe('di.iiii — public spaces on the open web')
    })

    it('a falsy title leaves the page title untouched', () => {
        render(<Titled title={null} />)
        expect(document.title).toBe('di.iiii — public spaces on the open web')
    })

    it('updates the title again when it changes without unmounting', () => {
        const { rerender } = render(<Titled title="A — di.iiii" />)
        expect(document.title).toBe('A — di.iiii')
        rerender(<Titled title="B — di.iiii" />)
        expect(document.title).toBe('B — di.iiii')
    })
})
