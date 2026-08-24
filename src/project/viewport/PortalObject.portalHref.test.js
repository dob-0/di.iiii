import { describe, it, expect } from 'vitest'
import { portalHref } from './PortalObject.jsx'

describe('portalHref', () => {
    // The reference component has always carried a projectId, but the jump used
    // only the space — so a hub whose doors pointed at rooms inside ONE space
    // sent every visitor back to the room they were already standing in.
    it('routes to the project when the reference names one', () => {
        expect(portalHref('dilijan', 'room-3')).toBe('/dilijan/room-3')
    })

    it('still routes to the space when no project is named', () => {
        expect(portalHref('dilijan', '')).toBe('/dilijan')
        expect(portalHref('dilijan', undefined)).toBe('/dilijan')
    })

    it('refuses to navigate without a space', () => {
        expect(portalHref('', 'room-3')).toBeNull()
        expect(portalHref(undefined, undefined)).toBeNull()
    })

    it('ignores surrounding whitespace rather than building a broken path', () => {
        expect(portalHref('  dilijan  ', '  room-1  ')).toBe('/dilijan/room-1')
        expect(portalHref('dilijan', '   ')).toBe('/dilijan')
    })
})
