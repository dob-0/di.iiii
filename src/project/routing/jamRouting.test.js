import { describe, expect, it } from 'vitest'
import {
    JAM_PROJECT_ID,
    JAM_SPACE_ID,
    buildJamEditorPath,
    buildJamScenePath,
    getJamLocationState,
    isJamLocation
} from './jamRouting.js'
import { getStudioLocationState } from '../../studio/utils/studioRouting.js'
import { RESERVED_APP_SEGMENTS } from '../../utils/spaceRouting.js'

const at = (pathname) => getJamLocationState({ pathname })

describe('the jam surface address', () => {
    it('answers at /open_jam/scene', () => {
        const state = at('/open_jam/scene')
        expect(isJamLocation(state)).toBe(true)
        expect(state.spaceId).toBe(JAM_SPACE_ID)
        expect(state.projectId).toBe(JAM_PROJECT_ID)
    })

    it('tolerates a trailing slash', () => {
        expect(isJamLocation(at('/open_jam/scene/'))).toBe(true)
    })

    // The scope line this branch was given: /open_jam keeps opening the full
    // editor, and the full editor stays reachable at its own address, whatever
    // happens to the short link.
    it('leaves /open_jam itself alone', () => {
        expect(isJamLocation(at('/open_jam'))).toBe(false)
        expect(getStudioLocationState({ pathname: '/open_jam' })).toMatchObject({
            isStudio: true,
            projectId: JAM_PROJECT_ID,
            spaceId: JAM_SPACE_ID
        })
    })

    it('claims nothing else', () => {
        for (const path of [
            '/',
            '/open',
            '/open_jam/scene/extra',
            '/open/studio/projects/open-jam',
            '/wcc/scene',
            '/scene',
            '/studio'
        ]) {
            expect(isJamLocation(at(path)), path).toBe(false)
        }
    })

    it('says no rather than guessing when there is no location at all', () => {
        expect(isJamLocation(getJamLocationState(null))).toBe(false)
    })
})

describe('the paths it hands out', () => {
    it('builds its own address', () => {
        expect(buildJamScenePath()).toBe('/open_jam/scene')
    })

    // The link a phone has never had. The "All tools" escape lives in the
    // desktop-only control cluster, so on the device the QR code targets there
    // was no route to the complete toolset at all.
    it('builds the way out to the full editor', () => {
        expect(buildJamEditorPath()).toBe('/open/studio/projects/open-jam')
        expect(isJamLocation(at(buildJamEditorPath()))).toBe(false)
    })

    it('sits under a segment that is already reserved, so nothing can shadow it', () => {
        // Why a sub-path of /open_jam and not a fresh top-level /jam: reserving
        // a new word means first proving no space and no project answers to it
        // on any live tier, which is a check this branch is not allowed to run.
        expect(RESERVED_APP_SEGMENTS).toContain('open_jam')
    })
})
