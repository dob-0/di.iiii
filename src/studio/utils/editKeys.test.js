import { describe, expect, it } from 'vitest'
import { isTypingTarget, undoRedoFromKey } from './editKeys.js'

describe('undoRedoFromKey', () => {
    it('Ctrl+Z undoes, Cmd+Z undoes', () => {
        expect(undoRedoFromKey({ key: 'z', code: 'KeyZ', ctrlKey: true })).toBe('undo')
        expect(undoRedoFromKey({ key: 'z', code: 'KeyZ', metaKey: true })).toBe('undo')
    })
    it('Ctrl+Shift+Z redoes although Shift makes the key a capital Z', () => {
        expect(undoRedoFromKey({ key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true })).toBe('redo')
    })
    it('Ctrl+Y redoes', () => {
        expect(undoRedoFromKey({ key: 'y', code: 'KeyY', ctrlKey: true })).toBe('redo')
    })
    it('works on the Armenian phonetic layout (the key prints զ)', () => {
        expect(undoRedoFromKey({ key: 'զ', code: 'KeyZ', ctrlKey: true })).toBe('undo')
        expect(undoRedoFromKey({ key: 'Զ', code: 'KeyZ', ctrlKey: true, shiftKey: true })).toBe('redo')
    })
    it('ignores a bare Z, Alt combinations and other keys', () => {
        expect(undoRedoFromKey({ key: 'z', code: 'KeyZ' })).toBe(null)
        expect(undoRedoFromKey({ key: 'z', code: 'KeyZ', ctrlKey: true, altKey: true })).toBe(null)
        expect(undoRedoFromKey({ key: 'x', code: 'KeyX', ctrlKey: true })).toBe(null)
        expect(undoRedoFromKey(null)).toBe(null)
    })
})

describe('isTypingTarget', () => {
    it('fields and editable text own their keys', () => {
        expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true)
        expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true)
        expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
        expect(isTypingTarget({ tagName: 'CANVAS' })).toBe(false)
        expect(isTypingTarget(null)).toBe(false)
    })
})

import { lockFromKey } from './editKeys.js'

describe('lockFromKey (L = lock selection, Alt+L = unlock all)', () => {
    const ev = (o) => ({ key: '', code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o })
    it('L locks, by letter and by key place (Armenian layout)', () => {
        expect(lockFromKey(ev({ key: 'l', code: 'KeyL' }))).toBe('lock')
        expect(lockFromKey(ev({ key: 'L', code: 'KeyL' }))).toBe('lock')
        expect(lockFromKey(ev({ key: 'լ', code: 'KeyL' }))).toBe('lock')
    })
    it('Alt+L unlocks all (Alt may change event.key, the place stays)', () => {
        expect(lockFromKey(ev({ key: 'l', code: 'KeyL', altKey: true }))).toBe('unlock-all')
        expect(lockFromKey(ev({ key: '¬', code: 'KeyL', altKey: true }))).toBe('unlock-all')
    })
    it('never with Ctrl or Cmd (Ctrl+L is the browser address bar), nor other keys', () => {
        expect(lockFromKey(ev({ key: 'l', code: 'KeyL', ctrlKey: true }))).toBeNull()
        expect(lockFromKey(ev({ key: 'l', code: 'KeyL', metaKey: true }))).toBeNull()
        expect(lockFromKey(ev({ key: 'k', code: 'KeyK' }))).toBeNull()
    })
})
