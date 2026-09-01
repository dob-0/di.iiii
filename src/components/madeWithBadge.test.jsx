import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MadeWithBadge, { isPlatformOwnSpace } from './MadeWithBadge.jsx'

// The badge links to `/`, and `/` renders the `main` space. Inside `main` that
// makes it a link to the room the visitor is already standing in — reported
// from the live room as "click di.iiii and it moves to /".
describe('MadeWithBadge', () => {
    const link = () => screen.queryByRole('link', { name: /build your own space/i })

    it('offers the way in from somebody else\'s space', () => {
        render(<MadeWithBadge spaceId="wcc" />)
        expect(link()).toHaveAttribute('href', '/')
    })

    it('still shows where no space is named, so no surface loses it by omission', () => {
        render(<MadeWithBadge />)
        expect(link()).toBeTruthy()
    })

    it('stays out of di.iiii\'s own front room, where it would be circular', () => {
        render(<MadeWithBadge spaceId="main" />)
        expect(link()).toBeNull()
    })

    it('matches the whole id, so a space merely starting with "main" still gets it', () => {
        expect(isPlatformOwnSpace('mainframe')).toBe(false)
        expect(isPlatformOwnSpace('main')).toBe(true)
    })
})
