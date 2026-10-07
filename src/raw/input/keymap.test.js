import { describe, expect, it } from 'vitest'
import { KEYMAP, KEYMAP_BY_ID, isTypingTarget, keyHint, matchesCombo, matchesKeyId } from './keymap.js'
import { helpKeyRows } from '../utils/rawGuide.js'

const key = (k, mods = {}) => ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods })

describe('the keymap table', () => {
    it('ids are unique and every row says what it does', () => {
        expect(new Set(KEYMAP.map((r) => r.id)).size).toBe(KEYMAP.length)
        for (const row of KEYMAP) {
            expect(row.does, row.id).toBeTruthy()
            expect(row.keys.length || row.mouse, row.id).toBeTruthy()
        }
    })

    it('no combo is bound twice', () => {
        const all = KEYMAP.flatMap((r) => r.keys)
        expect(new Set(all).size).toBe(all.length)
    })

    it('Tab is never bound — it is how a keyboard leaves the canvas (WCAG 2.1.2)', () => {
        expect(KEYMAP.flatMap((r) => r.keys)).not.toContain('Tab')
    })

    it('the help dialog keys list is written from the table, row for row', () => {
        expect(helpKeyRows().map(([does]) => does)).toEqual(KEYMAP.map((r) => r.does))
    })
})

describe('matchesCombo', () => {
    it('Ctrl means Ctrl or Cmd, and Shift must match', () => {
        expect(matchesCombo(key('d', { ctrlKey: true }), 'Ctrl+D')).toBe(true)
        expect(matchesCombo(key('d', { metaKey: true }), 'Ctrl+D')).toBe(true)
        expect(matchesCombo(key('d'), 'Ctrl+D')).toBe(false)
        expect(matchesCombo(key('Z', { ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+Z')).toBe(true)
        expect(matchesCombo(key('z', { ctrlKey: true, shiftKey: true }), 'Ctrl+Z')).toBe(false)
    })

    it('a bare letter does not fire with Ctrl held (that chord stays with the browser)', () => {
        expect(matchesCombo(key('h'), 'H')).toBe(true)
        expect(matchesCombo(key('h', { ctrlKey: true }), 'H')).toBe(false)
    })

    it('characters that need Shift to type match by the character', () => {
        expect(matchesCombo(key('?', { shiftKey: true }), '?')).toBe(true)
    })

    it('matchesKeyId reads the row', () => {
        expect(matchesKeyId(key('F2'), 'rename')).toBe(true)
        expect(matchesKeyId(key('n'), 'rename')).toBe(true)
        expect(keyHint('fitAll')).toBe('H')
        expect(KEYMAP_BY_ID.leave.mouse).toMatch(/Back/)
    })

    it('typing targets are left alone', () => {
        expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true)
        expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
        expect(isTypingTarget({ tagName: 'DIV' })).toBe(false)
    })
})
