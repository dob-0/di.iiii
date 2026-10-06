import { describe, expect, it } from 'vitest'

import { getTouchLocationState, isTouchLocation, touchDeskPath } from './touchRouting.js'

describe('/{space}/touch/{project}', () => {
    it('is recognised: three segments, "touch" in the middle', () => {
        expect(getTouchLocationState({ pathname: '/moxir/touch/moxir-hall-known-full' })).toEqual({ isTouch: true, spaceId: 'moxir', projectId: 'moxir-hall-known-full' })
        expect(isTouchLocation(getTouchLocationState({ pathname: '/moxir/touch/x/' }))).toBe(true)
    })
    it('is not a project or another route', () => {
        for (const pathname of ['/moxir/touch', '/moxir/touch/a/b', '/moxir/p/touch', '/touch/moxir/x', '/']) {
            expect(isTouchLocation(getTouchLocationState({ pathname }))).toBe(false)
        }
    })
    it('forwards to the desk\'s Touch tab for that project', () => {
        expect(touchDeskPath('moxir', 'moxir-hall-known-full')).toBe('/light/?space=moxir&project=moxir-hall-known-full#touch')
    })
})
