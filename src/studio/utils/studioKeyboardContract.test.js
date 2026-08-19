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

    it('the help dialog still promises select-all and deselect-all', () => {
        const guide = read('utils/studioGuide.js')
        expect(guide).toMatch(/Select all/i)
        expect(guide).toMatch(/Deselect all/i)
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
})
