import { describe, expect, it } from 'vitest'
import { isTypingTarget } from './walkKeyboard.js'

// Walk mode listens for WASD / arrows / space on `window`, and the space key
// is preventDefault-ed so it can be the jump key. Until the jam surface there
// was never a text field over a walkable scene, so nothing had ever noticed.
// Put one there and the two collide totally: typing "was" walks you backwards
// and sideways, and no caption can contain a space.

describe('is the person typing?', () => {
    it('recognises the fields a person writes in', () => {
        for (const tag of ['input', 'textarea', 'select']) {
            expect(isTypingTarget(document.createElement(tag)), tag).toBe(true)
        }
    })

    it('recognises an editable element', () => {
        const editable = document.createElement('div')
        editable.contentEditable = 'true'
        // jsdom does not implement isContentEditable off the attribute.
        Object.defineProperty(editable, 'isContentEditable', { value: true })
        expect(isTypingTarget(editable)).toBe(true)
    })

    it('leaves ordinary keystrokes alone, so the walker still walks', () => {
        expect(isTypingTarget(document.createElement('div'))).toBe(false)
        expect(isTypingTarget(document.createElement('canvas'))).toBe(false)
        expect(isTypingTarget(document.body)).toBe(false)
    })

    it('survives an event with no usable target', () => {
        expect(isTypingTarget(null)).toBe(false)
        expect(isTypingTarget(undefined)).toBe(false)
        expect(isTypingTarget(window)).toBe(false)
    })
})
