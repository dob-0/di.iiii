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
        // The joystick's own guard is `walking && isMobile`, one line up —
        // `walking` being `interactive && !orbit`, since view mode moves the
        // camera with a drag and has no joystick to answer.
        const guardLine = SOURCE
            .split('\n')
            .find((line) => line.includes('walking && isMobile &&'))
        expect(guardLine).toBeTruthy()
        expect(guardLine).not.toMatch(/showModeControls/)
    })

    it('ignores movement keys while somebody is typing', () => {
        // Two listeners, both on `window`: the movement keys and the fly key.
        const guarded = SOURCE.match(/if \(isTypingTarget\(e\.target\)\) return/g) || []
        expect(guarded.length).toBeGreaterThanOrEqual(2)
    })
})

describe('walk look: the view page drags, /build and Jam still lock', () => {
    const read = async (rel) => {
        const { readFileSync } = await import('node:fs')
        return readFileSync(new URL(rel, import.meta.url), 'utf8')
    }

    it('the view page asks for the drag look, one walk, and never a pointer lock', async () => {
        const viewer = await read('../project/components/PublicProjectViewer.jsx')
        const surface = await read('../project/components/PublicProjectSceneSurface.jsx')
        expect(viewer).toMatch(/<PublicProjectSceneSurface[\s\S]*?walkLook="drag"/)
        expect(surface).toMatch(/walkLook=\{walkLook\}/)
        const scene = await read('./LiveProjectScene.jsx')
        // the drag branch is the one reachable for 'drag': no lock request outside the 'lock' branch
        const lockAt = scene.indexOf("if (!isTouch && walkLook === 'lock')")
        const dragAt = scene.indexOf('} else if (!isTouch) {')
        expect(lockAt).toBeGreaterThan(-1)
        expect(dragAt).toBeGreaterThan(lockAt)
        const dragBranch = scene.slice(dragAt, scene.indexOf('// Mobile: floating joystick'))
        expect(dragBranch).not.toMatch(/requestPointerLock|pointerlockchange|exitPointerLock/)
        expect(dragBranch).toMatch(/passive: false/)
    })

    it('/build and Jam do not opt out: the default look is the pointer lock', async () => {
        const scene = await read('./LiveProjectScene.jsx')
        expect(scene).toMatch(/walkLook = 'lock'/)
        expect(scene.slice(0, scene.indexOf("} else if (!isTouch) {"))).toMatch(/requestPointerLock/)
        for (const rel of ['../rigbuild/BuildSurface.jsx', '../project/components/JamSurface.jsx']) {
            expect(await read(rel)).not.toMatch(/walkLook/)
        }
    })

    it('with the lock, Esc still opens the inspector one press after the browser releases it', async () => {
        const scene = await read('./LiveProjectScene.jsx')
        expect(scene).toMatch(/if \(locking && performance\.now\(\) - lockChangedAtRef\.current < 300\) return/)
        expect(scene).toMatch(/onLockChange=\{setIsLocked\}/)
        expect(scene).toMatch(/ESC · release/)
    })
})

describe('a decorative scene takes no pointer events', () => {
    // R3F spreads the caller's style AFTER its own pointer-events:auto, so the
    // Canvas style is the one place that can say none; a stylesheet cannot
    // beat the inline value without !important. Measured 2026-10-21 at
    // 1440x900: 66 % of the landing's first screen and 25 % of the wiki's moved
    // the page 0 px under a wheel.
    it('sets the Canvas pointerEvents from `interactive`', () => {
        const canvas = SOURCE.slice(SOURCE.indexOf('<Canvas'), SOURCE.indexOf('<XR store'))
        expect(canvas).toMatch(/pointerEvents:\s*interactive \? 'auto' : 'none'/)
    })
})
