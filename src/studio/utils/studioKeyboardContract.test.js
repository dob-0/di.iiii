// @vitest-environment node
//
// Source-level guards for two Studio keyboard bindings that the shipped help
// dialog advertises but the code had made unreachable. Both live inside large
// components with window-level listeners whose ordering (StudioShell is
// StudioEditor's child, so its effect registers first and its
// stopImmediatePropagation wins) is the actual defect — that ordering is not
// reproducible in isolation, but the offending source patterns are exact.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(path.join(STUDIO, rel), 'utf8')

describe('Studio keyboard contract', () => {
    // Audit batch 2: StudioShell's pre-modal axis branch included 'a' and
    // consumed it with preventDefault + stopImmediatePropagation, killing
    // StudioEditor's select-all handler on the same window target. With
    // nothing selected, A did nothing at all; with a selection it started an
    // all-axis transform; Alt+A (deselect all) was swallowed too — while
    // studioGuide.js still advertised both.
    it('StudioShell does not arm a modal transform on bare A', () => {
        const shell = read('components/StudioShell.jsx')
        const armingLists = shell.match(/\[\s*'x',\s*'y',\s*'z'(?:,\s*'a')?\s*\]/g) || []
        expect(armingLists.length).toBeGreaterThan(0)
        for (const list of armingLists) {
            expect(list).not.toContain("'a'")
        }
    })

    // 2026-10-13: Alt+G/R/S clear the transform (Blender). StudioShell's G/R/S branch registers first and
    // starts a grab, so without an Alt guard Alt+G would start a move AND clear the location.
    it('Alt+G/R/S clear the transform and never start a grab', () => {
        const shell = read('components/StudioShell.jsx')
        expect(shell).toMatch(/if \(!e\.shiftKey && !e\.ctrlKey && !e\.metaKey && !e\.altKey\) \{\s*const modeForKey/)
        const editor = read('components/StudioEditor.jsx')
        expect(editor).toMatch(/clearFromKey\(event\)/)
        expect(read('utils/studioGuide.js')).toMatch(/\['Alt\+G \/ Alt\+R \/ Alt\+S'/)
    })

    it('the help dialog still promises select-all and deselect-all', () => {
        const guide = read('utils/studioGuide.js')
        expect(guide).toMatch(/Select all/i)
        expect(guide).toMatch(/Deselect all/i)
    })

    it('the help lists the lock keys and StudioEditor routes them through the one lock batch', () => {
        const guide = read('utils/studioGuide.js')
        expect(guide).toMatch(/\['L', 'Lock the selection/)
        expect(guide).toMatch(/\['Alt\+L', 'Unlock all/)
        const editor = read('components/StudioEditor.jsx')
        expect(editor).toMatch(/lockFromKey\(event\)/)
        expect(editor).toMatch(/handleSetEntitiesLocked\(selectedEntities\.map/)
    })

    it('StudioEditor still implements select-all behind the freed-up key', () => {
        const editor = read('components/StudioEditor.jsx')
        expect(editor).toMatch(/if \(!meta && \(key === 'a' \|\| key === 'A'\)\)/)
    })

    // Audit batch 2: every sibling binding that shares a key with a browser
    // shortcut guards on !meta — frame-selected did not, so Ctrl/Cmd+F
    // (find-in-page, page-preventable in Chrome and Firefox) was suppressed
    // and the camera jumped instead.
    it('frame-selected does not hijack Ctrl/Cmd+F', () => {
        const editor = read('components/StudioEditor.jsx')
        expect(editor).toMatch(/if \(!meta && \(event\.key === 'f' \|\| event\.key === 'F' \|\| event\.key === '\.'\)\)/)
    })

    // View keys: the handler goes through resolveViewKey (event.code) and the help
    // dialog lists the numpad rows plus the no-numpad route.
    it('StudioEditor routes view keys through resolveViewKey and frames real extents', () => {
        const editor = read('components/StudioEditor.jsx')
        expect(editor).toMatch(/resolveViewKey\(event\)/)
        expect(editor).not.toMatch(/getPointsBoundingSphere/)
    })

    it('the help dialog lists the numpad views and the no-numpad alternative', () => {
        const guide = read('utils/studioGuide.js')
        expect(guide).toMatch(/Numpad 1 \/ 3 \/ 7/)
        expect(guide).toMatch(/Shift\+1 \/ 3 \/ 7/)
        expect(guide).toMatch(/Home/)
    })

    it('the viewport offers every view command as a labelled button', () => {
        const viewport = read('components/StudioViewport.jsx')
        expect(viewport).toMatch(/aria-label="View commands"/)
        expect(viewport).toMatch(/minHeight: 44/)
    })

    // The bar's gate was `setEditMode && controlsRef`, and no caller passes setEditMode: the bar
    // never mounted anywhere (brief 2026-10-13 item 2). It mounts on an explicit `viewBar` now.
    it('the view bar mounts on its own prop, not on setEditMode', () => {
        const viewport = read('components/StudioViewport.jsx')
        expect(viewport).toMatch(/\{viewBar && controlsRef && \(/)
        expect(viewport).not.toMatch(/setEditMode && controlsRef/)
    })

    // 2026-10-13 (found by reading, while adding Walk / Fly): the walk listens on document in the capture phase but let keys go on
    // to StudioShell's window listener, so E (fly up) and Tab also toggled Navigate/Edit and H hid the panels mid-walk. The walk is
    // modal (Blender): every key stops at it. And the help names the buttons and Tab, and Shift+` still starts Fly.
    it('the walk keeps its keys, the help names Walk / Fly and Tab, and Shift+` starts Fly', () => {
        const walk = read('navigation/useWalkNavigation.js')
        expect(walk).toMatch(/if \(!walk\) return\s*\n(\s*\/\/.*\n)*\s*e\.stop(Immediate)?Propagation\(\)/) // immediate: also the window's other capture listeners (the standard move, 2026-10-13)
        expect(walk).toMatch(/if \(isWalkToggle\(e\)\) \{ e\.preventDefault\(\); if \(walk\) end\(\); else begin\('fly'\)/)
        const guide = read('utils/studioGuide.js')
        expect(guide).toMatch(/\['Walk \/ Fly buttons'/)
        expect(guide).toMatch(/\['Tab \(walking\)', 'Switch Walk ↔ Fly/)
        const shell = read('components/StudioShell.jsx')
        expect(shell).toMatch(/onWalk=\{requestWalk\}/)
    })
})
