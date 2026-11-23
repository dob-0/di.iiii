import { describe, expect, it } from 'vitest'
import { feedSize, feedSubtitle, markOf, plainText, readFeed } from './monitorFeedText.js'

describe('readFeed: a feed is rows, not a text dump (owner 11-24)', () => {
    it('a markdown note: title, sections, bullets; emphasis stripped', () => {
        const f = readFeed(['# Left open — 22 Nov 15:52', '## Closed tonight', '- 26 work folders **removed**', '- 4 saved', '## Still open', '- `ch3d` edits'])
        expect(f.title).toBe('Left open — 22 Nov 15:52')
        expect(f.sections.map((s) => s.title)).toEqual(['Closed tonight', 'Still open'])
        expect(f.sections[0].items[0].title).toBe('26 work folders removed')
        expect(f.sections[1].items[0].title).toBe('ch3d edits')
        expect(feedSize(f)).toBe(3)
    })
    it('a chat feed: the count line is the summary; time leads; the legend mark gives the tone and the ask is the detail', () => {
        const f = readFeed(['01:48 · 1 of 6 chats ask you', '23 Nov 22:33 · Hyprland crash investigation · !! Press Ctrl+Alt+F1'])
        expect(f.summary).toBe('01:48 · 1 of 6 chats ask you')
        expect(f.sections[0].items[0]).toMatchObject({ lead: '23 Nov 22:33', title: 'Hyprland crash investigation', detail: 'Press Ctrl+Alt+F1', tone: 'danger', mark: 'needs you' })
    })
    it('an indented line is the detail of the row above', () => {
        const f = readFeed(['Admin monitoring UI', '    you 01:52 · look here'])
        expect(f.sections[0].items).toHaveLength(1)
        expect(f.sections[0].items[0].detail).toBe('you 01:52 · look here')
    })
    it('a fixed-width table becomes a table, its last column whole', () => {
        const f = readFeed(['id       touched     who   state          the ask', 'N6452    11-24 02:01 agent NEW            we need the full kit', 'N6451    11-24 02:00 agent IN PROGRESS    why not aylmo'])
        expect(f.table.columns).toEqual(['id', 'touched', 'who', 'state', 'the ask'])
        expect(f.table.rows[1]).toEqual(['N6451', '11-24 02:00', 'agent', 'IN PROGRESS', 'why not aylmo'])
    })
    it('marks and plain text', () => {
        expect(markOf('++ done')).toMatchObject({ tone: 'success', at: 0 })
        expect(markOf('nothing here')).toBeNull()
        expect(plainText('**a** `b`')).toBe('a b')
        expect(feedSize(readFeed([]))).toBe(0)
    })
    it('the title line drops the feed name it repeats', () => {
        expect(feedSubtitle('Left open — 22 Nov 15:52', 'Left open')).toBe('22 Nov 15:52')
        expect(feedSubtitle('Other', 'Left open')).toBe('Other')
    })
    it('a line that does not line up under a table stays as a note: no line is ever dropped (review 11-24)', () => {
        const rows = ['N1     OPEN    one', 'N2     OPEN    two', 'N3     OPEN    three', 'N4     OPEN    four']
        const feed = readFeed(['ID     STATE   ASK', ...rows, 'active 9 (shown 4) · rest: ledger-open'])
        expect(feed.table.rows).toHaveLength(4)
        expect(feed.table.notes).toEqual(['active 9 (shown 4) · rest: ledger-open'])
    })
    it('a status line with a dot separator is never read as a table header', () => {
        expect(readFeed(['02:04 · Chats     6      open', '  a     b      c']).table).toBe(null)
    })
})
