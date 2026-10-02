import { describe, expect, it } from 'vitest'
import { getNodeCardLines, getNodeInputs, getNodeOutputs } from '../nodeRegistry.js'
import {
    cardContentHeight, cardContentLayout, cardHeight, CARD_CONTENT_GROUP_HEIGHT, CARD_CONTENT_LINE_HEIGHT,
    CARD_CONTENT_MAX_WRAP, CARD_CONTENT_ROW_GAP, HEADER_HEIGHT
} from '../../raw/utils/cardGeometry.js'
import { countWrappedLines } from '../../raw/utils/textWrap.js'

// Owner 2026-10-02: a List card read "7 rows · 3 groups" and a Text card read
// "Content" — every card had to be opened to know what was in it. The card
// now shows its content under the ports; these guard what it shows and that
// the box it reserves is exactly the lines it draws.
const list = (values) => ({ id: 'n', typeId: 'view.list', values })
const text = (content) => ({ id: 't', typeId: 'view.text', values: { content } })

describe('getNodeCardLines', () => {
    it('shows a list\'s rows under their group headings, in group order', () => {
        const out = getNodeCardLines(list({
            groups: ['Bar', 'Studio'],
            items: [{ text: 'projector', group: 'Studio' }, { text: 'laptop', group: 'Bar' }]
        }))
        expect(out.lines).toEqual([
            { kind: 'group', text: 'Bar' }, { kind: 'row', text: 'laptop' },
            { kind: 'group', text: 'Studio' }, { kind: 'row', text: 'projector' }
        ])
        expect(out.more).toBe(0)
    })

    it('skips empty groups and blank rows', () => {
        const out = getNodeCardLines(list({
            groups: ['A', 'B'],
            items: [{ text: 'one', group: 'B' }, { text: '  ', group: 'A' }]
        }))
        expect(out.lines.map((l) => l.text)).toEqual(['B', 'one'])
    })

    it('keeps a row whose group no longer exists', () => {
        const out = getNodeCardLines(list({ groups: ['A'], items: [{ text: 'lost', group: 'Gone' }] }))
        expect(out.lines).toEqual([{ kind: 'row', text: 'lost' }])
    })

    it('stops at 12 lines, never ends on a bare heading, and counts the rest', () => {
        const items = [
            ...Array.from({ length: 10 }, (_, i) => ({ text: `a${i}`, group: 'A' })),
            ...Array.from({ length: 5 }, (_, i) => ({ text: `b${i}`, group: 'B' }))
        ]
        const out = getNodeCardLines(list({ groups: ['A', 'B'], items }))
        expect(out.lines.length).toBeLessThanOrEqual(12)
        expect(out.lines.at(-1).kind).toBe('row')
        const rowsShown = out.lines.filter((l) => l.kind === 'row').length
        expect(rowsShown + out.more).toBe(15)
    })

    it('is null for an empty list, so the card keeps its "empty" line', () => {
        expect(getNodeCardLines(list({ groups: ['A'], items: [] }))).toBeNull()
    })

    it('shows a text\'s first lines, at most 6', () => {
        const out = getNodeCardLines(text('one\n\ntwo\n3\n4\n5\n6\n7'))
        expect(out.lines.map((l) => l.text)).toEqual(['one', 'two', '3', '4', '5', '6'])
        expect(out.more).toBe(1)
    })

    it('is null for other types and for empty text', () => {
        expect(getNodeCardLines({ id: 'x', typeId: 'value.number', values: {} })).toBeNull()
        expect(getNodeCardLines(text('  '))).toBeNull()
    })
})

describe('cardContentHeight', () => {
    const ONE = CARD_CONTENT_LINE_HEIGHT + CARD_CONTENT_ROW_GAP
    it('reserves one line height per short line, plus the "+ N more" line', () => {
        const n = text('a\nb\nc\nd\ne\nf\ng')
        expect(cardContentHeight(n)).toBe(6 * ONE + CARD_CONTENT_GROUP_HEIGHT + 8)
    })

    // Owner 2026-10-02 on the NOPA To do card: "text in a row is invisible,
    // it goes out of the window" — every row was cut to one line. A long row
    // now takes the lines it needs (up to CARD_CONTENT_MAX_WRAP), and the card
    // reserves them, so nothing is drawn over the next card or a port.
    it('wraps a long row and reserves its lines', () => {
        const todo = list({ groups: ['People'], items: [{ group: 'People', text: 'Dima (tech): load-in time Sat, take-down time Sun, fee, needs from us' }] })
        const layout = cardContentLayout(todo)
        const row = layout.lines.find((l) => l.kind === 'row')
        expect(row.wraps).toBeGreaterThan(1)
        expect(row.height).toBe(row.wraps * CARD_CONTENT_LINE_HEIGHT + CARD_CONTENT_ROW_GAP)
        expect(cardContentHeight(todo)).toBe(CARD_CONTENT_GROUP_HEIGHT + row.height + 8)
    })

    it('caps a row at CARD_CONTENT_MAX_WRAP lines', () => {
        const long = text('word '.repeat(200))
        expect(cardContentLayout(long).lines[0].wraps).toBe(CARD_CONTENT_MAX_WRAP)
    })

    it('adds nothing to a card with no content', () => {
        const empty = text('')
        expect(cardContentHeight(empty)).toBe(0)
        expect(cardHeight(text('a'))).toBe(cardHeight(empty) + CARD_CONTENT_LINE_HEIGHT + CARD_CONTENT_ROW_GAP + 8)
    })

    // The Gear card opened with a blank port row above its rows: a portless
    // card with content starts its lines right under the header.
    // Counted from the type's real ports, so the rule holds whether List has
    // ports or not (PR #730 gives it Rows + Count).
    it('gives a portless card with content no empty port row', () => {
        const gear = list({ groups: ['A'], items: [{ text: 'one', group: 'A' }] })
        const ports = Math.max(getNodeInputs(gear).length, getNodeOutputs(gear).length)
        expect(cardHeight(gear)).toBe(HEADER_HEIGHT + ports * 22 + cardContentHeight(gear) + 8)
        const empty = list({ groups: ['A'], items: [] })
        expect(cardHeight(empty)).toBe(HEADER_HEIGHT + Math.max(ports, 1) * 22 + 8)
    })
})

// Without a canvas (jsdom) the count uses an average glyph of 0.56 em, so at
// 10 px a 56 px line holds 10 characters. The break rule is the CSS one for
// white-space: normal + overflow-wrap: anywhere.
describe('countWrappedLines', () => {
    const opts = { width: 56, font: '10px Inter', fontSize: 10 }
    it('breaks between words', () => {
        expect(countWrappedLines('aaaa bbbb', opts)).toBe(1)
        expect(countWrappedLines('aaaa bbbb cccc', opts)).toBe(2)
    })
    it('breaks inside a word wider than the line', () => {
        expect(countWrappedLines('x'.repeat(25), opts)).toBe(3)
        expect(countWrappedLines(`ab ${'x'.repeat(25)}`, opts)).toBe(4)
    })
    it('counts an empty text as one line', () => {
        expect(countWrappedLines('   ', opts)).toBe(1)
    })
})
