import React from 'react'
import { render, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MonitorChats, { chatIssues, idleLabel } from './MonitorChats.jsx'
import { heroState } from './MonitorOverview.jsx'

const row = (id, group, over = {}) => ({ id, title: `Chat ${id}`, group, status: group === 'working' ? 'busy' : 'idle', says: '++ did a thing', asks: [], idleMinutes: 4, failed: false, host: 'aylmo', ...over })
const block = (rows, over = {}) => ({ ok: true, state: 'live', heardSecondsAgo: 3, counts: { ask: rows.filter((r) => r.group === 'ask').length, working: rows.filter((r) => r.group === 'working').length, idle: rows.filter((r) => r.group === 'idle').length, total: rows.length }, rows, truncated: 0, ...over })
const ASK = row('a', 'ask', { asks: ['!! Say done.'] })

describe('MonitorChats', () => {
    it('one card per chat in the order given, an ask card shows its ask without the line mark', () => {
        const { container } = render(<MonitorChats chats={block([ASK, row('w', 'working'), row('i', 'idle')])} />)
        expect([...container.querySelectorAll('[data-chat-id]')].map((n) => n.dataset.chatGroup)).toEqual(['ask', 'working', 'idle'])
        const card = container.querySelector('[data-chat-id="a"]')
        expect(card.textContent).toContain('Say done.')
        expect(card.textContent).not.toContain('!!')
        expect(container.querySelector('[data-chat-id="w"]').textContent).toContain('working now')
    })

    it('filter chips narrow the cards and show the counts', () => {
        const { container } = render(<MonitorChats chats={block([ASK, row('w', 'working'), row('i', 'idle')])} />)
        expect(container.querySelector('[data-chat-filter="ask"]').textContent).toContain('1')
        fireEvent.click(container.querySelector('[data-chat-filter="idle"]'))
        expect([...container.querySelectorAll('[data-chat-id]')].map((n) => n.dataset.chatId)).toEqual(['i'])
        expect(container.querySelector('[data-chat-filter="idle"]').getAttribute('aria-pressed')).toBe('true')
    })

    it('no data, an old list and a failed read each say so; none of them draws a card or "no asks"', () => {
        for (const [chats, key] of [[undefined, 'none'], [block([], { state: 'none', ok: false }), 'none'], [block([row('a', 'ask')], { state: 'stale', ok: false, heardSecondsAgo: 600 }), 'stale'], [block([], { state: 'failed', ok: false, error: 'timed out' }), 'failed']]) {
            const { container, unmount } = render(<MonitorChats chats={chats} />)
            expect(container.querySelector(`[data-chats-note="${key}"]`)).not.toBeNull()
            unmount()
        }
    })

    it('says how many chats are past the cap', () => {
        const { container } = render(<MonitorChats chats={block([ASK], { truncated: 20 })} />)
        expect(container.textContent).toContain('20 more chats not shown')
    })

    it('idle minutes read as words', () => {
        expect(idleLabel(0)).toBe('active just now')
        expect(idleLabel(8)).toBe('idle 8 min')
        expect(idleLabel(135)).toBe('idle 2 h 15 min')
        expect(idleLabel(null)).toBe('idle time unknown')
    })
})

describe('chats in the needs-you strip', () => {
    it('every asking chat is a row; more than four are counted, and the headline counts all', () => {
        const asking = ['1', '2', '3', '4', '5', '6'].map((n) => row(n, 'ask', { asks: ['?? Pick one'] }))
        const issues = chatIssues(block(asking))
        expect(issues).toHaveLength(5)
        expect(issues[0].text).toBe('Chat 1 asks you: Pick one')
        expect(issues[4]).toMatchObject({ count: 2, text: '2 more chats ask you' })
        expect(heroState({ tiers: { rows: [] }, panels: {}, chats: block(asking) }).headline).toMatch(/^6 things need you/)
    })

    it('a stale or failed list is a row, an empty live one is not', () => {
        expect(chatIssues(block([], { state: 'stale', ok: false, heardSecondsAgo: 600 }))[0].text).toMatch(/old \(heard 10 min ago\)/)
        expect(chatIssues(block([], { state: 'failed', ok: false, error: 'x' }))[0].text).toMatch(/could not be read: x/)
        expect(chatIssues(block([row('w', 'working')]))).toEqual([])
        expect(chatIssues(undefined)).toEqual([])
        expect(heroState({ tiers: { rows: [] }, panels: {}, chats: block([row('i', 'idle')]) }).headline).toBe('All well')
    })

    it('a tier down still leads over a chat that asks', () => {
        const s = heroState({ tiers: { rows: [{ id: 'dev', status: 502 }] }, panels: {}, chats: block([ASK]) })
        expect(s.tone).toBe('danger')
        expect(s.issues.map((i) => i.chat)).toContain('a')
    })

    it('a chat with a step list shows its bar, done of total and percent; left behind is red and has its own filter', () => {
        const steps = { done: 2, total: 5, open: ['Rehearse on r-di', 'Put it on the Mac', 'Third'] }
        const rows = [row('l', 'idle', { steps, leftBehind: true }), row('q', 'idle', { steps: { done: 5, total: 5, open: [] } }), row('n', 'idle')]
        const { container } = render(<MonitorChats chats={block(rows, { counts: { ask: 0, working: 0, idle: 3, left: 1, total: 3 } })} />)
        const card = container.querySelector('[data-chat-id="l"]')
        expect(card.querySelector('[data-chat-steps="2/5"]').textContent).toContain('2/5 · 40%')
        expect(card.textContent).toContain('open: Rehearse on r-di; Put it on the Mac…')
        expect(card.textContent).toContain('left behind')
        expect(card.className).toContain('tone-danger')
        expect(container.querySelector('[data-chat-id="q"]').className).not.toContain('tone-danger')
        expect(container.querySelector('[data-chat-id="n"] [data-chat-steps]')).toBeNull()
        expect(container.querySelector('[data-chat-filter="left"]').textContent).toContain('1')
        fireEvent.click(container.querySelector('[data-chat-filter="left"]'))
        expect([...container.querySelectorAll('[data-chat-id]')].map((n) => n.dataset.chatId)).toEqual(['l'])
    })
})
