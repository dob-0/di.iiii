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

const at = (pathname, search = '') => getJamLocationState({ pathname, search })

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

    // The other address the same room is handed out on — the space card's
    // "Live" button, and what a stranger is actually given. Before this branch
    // it fell through to the generic published-space viewer: same document, a
    // read-only shell with no presence and no way to add anything. See
    // the "/open" row in docs/ai/known-fixes.md.
    it('answers at bare /open too — the same room, not a second one', () => {
        const state = at('/open')
        expect(isJamLocation(state)).toBe(true)
        expect(state.spaceId).toBe(JAM_SPACE_ID)
        expect(state.projectId).toBe(JAM_PROJECT_ID)
    })

    it('tolerates a trailing slash on the bare address', () => {
        expect(isJamLocation(at('/open/'))).toBe(true)
    })

    // ?preview=1 is the space card's own thumbnail embed (SpaceHub.jsx), which
    // wants the static published view scaled into a card, not a live surface
    // with open presence sockets. The card's "make it live" button re-embeds
    // the same /open with no ?preview and correctly gets the real jam.
    it('leaves the space card thumbnail alone', () => {
        expect(isJamLocation(at('/open', '?preview=1'))).toBe(false)
    })

    it('claims nothing else', () => {
        for (const path of [
            '/',
            '/open_jam/scene/extra',
            '/open/studio/projects/open-jam',
            '/open/studio',
            '/open/projects',
            '/open/preferences',
            '/open/mini',
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
