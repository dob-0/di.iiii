// @vitest-environment node
//
// Source-level guard for the four seams the jam surface opened in
// LiveProjectScene, in the same style as livePlayerRef.test.js next door and
// for the same reason: the component is a full R3F tree, standing it up in a
// test costs a WebGL context it will not get, and every invariant below is
// textual anyway.
//
// What is being guarded is not that the seams exist — it is that they stay
// OPTIONAL. Four surfaces already render this walker (the landing background,
// the WCC exhibition, Studio Hub's decor, and PublicProjectViewer's Walk/Fly),
// none of them pass any of these props, and every one of them must keep
// behaving exactly as it did. A default quietly flipped here changes all four
// at once and fails no other test.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SOURCE = readFileSync(path.join(HERE, 'LiveProjectScene.jsx'), 'utf8')

describe('the seams the jam surface uses stay optional', () => {
    it('a caller can hand over the document instead of a second fetch', () => {
        expect(SOURCE).toMatch(/document:\s*providedDocument\s*=\s*null/)
        // The fetch hook must actually be told to stand down, or the surface
        // pays for a duplicate GET and a duplicate SSE stream per phone.
        expect(SOURCE).toMatch(/useLiveProjectDocument\(providedDocument \? null : projectId\)/)
    })

    it('a caller can read where the walker is standing', () => {
        expect(SOURCE).toMatch(/walkerRef\s*=\s*null/)
        // The pose object itself, never a copy: it is mutated in place every
        // frame, so a snapshot handed out here would be stale on arrival.
        expect(SOURCE).toMatch(/walkerRef\.current = playerRef\.current/)
    })

    it('a caller can render its own three.js children inside the scene', () => {
        expect(SOURCE).toMatch(/sceneExtras\s*=\s*null/)
        expect(SOURCE).toMatch(/\{sceneExtras\}/)
    })

    it('a caller can suppress the Fly and XR-entry controls', () => {
        expect(SOURCE).toMatch(/showModeControls\s*=\s*true/)
    })

    it('never hides the joystick behind showModeControls — it is the only way a phone moves', () => {
        const joystickLine = SOURCE
            .split('\n')
            .find((line) => line.includes('<MobileJoystick'))
        expect(joystickLine).toBeTruthy()
        // The joystick's own guard is `interactive && isMobile`, one line up.
        const guardLine = SOURCE
            .split('\n')
            .find((line) => line.includes('interactive && isMobile && (') || line.includes('interactive && isMobile &&'))
        expect(guardLine).toBeTruthy()
        expect(guardLine).not.toMatch(/showModeControls/)
    })

    it('ignores movement keys while somebody is typing', () => {
        // Two listeners, both on `window`: the movement keys and the fly key.
        const guarded = SOURCE.match(/if \(isTypingTarget\(e\.target\)\) return/g) || []
        expect(guarded.length).toBeGreaterThanOrEqual(2)
    })
})
