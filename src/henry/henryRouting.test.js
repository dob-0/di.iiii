import { describe, expect, it } from 'vitest'
import { HENRY_LABEL, HENRY_PATH, HENRY_SPACE_ID, isHenrySegment } from './henryRouting.js'

describe('henry routing', () => {
    it('keeps the id, the path and the label as one string', () => {
        expect(HENRY_PATH).toBe(`/${HENRY_SPACE_ID}`)
        expect(HENRY_LABEL).toBe(HENRY_SPACE_ID)
    })

    it('is a legal server space id', () => {
        expect(HENRY_SPACE_ID).toMatch(/^[a-z0-9-]{1,48}$/)
    })

    it('matches the segment however it was typed', () => {
        expect(isHenrySegment('henry')).toBe(true)
        expect(isHenrySegment('Henry')).toBe(true)
        expect(isHenrySegment('HENRY')).toBe(true)
    })

    it('does not match anything else', () => {
        expect(isHenrySegment('')).toBe(false)
        expect(isHenrySegment('wcc')).toBe(false)
        expect(isHenrySegment('henrys')).toBe(false)
        expect(isHenrySegment('algovrithm')).toBe(false)
    })
})
