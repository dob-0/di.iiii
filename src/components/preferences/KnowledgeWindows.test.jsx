import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HelpersList, HooksBody, RequestsBody, RulesBody } from './KnowledgeWindows.jsx'
import { buildTiles } from './useAdminTiles.js'
import { availableKinds } from './adminWindows.js'
import { monitorKnowledge } from './monitorKnowledge.js'

// Made-up data only: no real rule text, hook command, id or address.
const rules = { ok: true, count: 3, rows: [
    { title: 'Rule A', date: '2026-01-01', lines: 2, text: 'body a' },
    { title: 'Rule B', date: null, lines: 1, text: 'body b' },
    { title: 'Rule C', date: '2026-03-03', lines: 1, text: 'body c' }
] }
const hooks = { ok: true, count: 2, events: { Stop: 1, PreToolUse: 1 }, rows: [
    { scope: 'user', event: 'Stop', matcher: null, name: 'tool one' },
    { scope: 'repo', event: 'PreToolUse', matcher: 'Bash', name: 'tool two' }
] }
const snap = {
    host: 'box.local',
    panels: { agents: { rows: [], helpers: [{ parent: 'abc12345', label: 'helper x', since: '2026-11-16T02:01:00Z', busy: true }] }, rules, hooks },
    reports: [{ host: 'two', stale: false, panels: { rules, hooks } }],
    asks: { rows: [{ id: 'N1', state: 'NEW', touched: '11-15 10:00', text: 'a request text', source: 'ledger' }] }
}
afterEach(() => cleanup())

describe('knowledge windows', () => {
    it('rules: newest first by default, a toggle for file order, body in a drawer, same on N machines', () => {
        render(<RulesBody snap={snap} />)
        expect(screen.getByText('same on 2 machines')).toBeTruthy()
        const titles = () => screen.getAllByRole('button', { pressed: false }).map((b) => b.textContent).filter((t) => /^Rule/.test(t))
        expect(titles()[0]).toMatch(/^Rule C/)
        fireEvent.click(screen.getByRole('button', { name: 'Newest first' }))
        expect(titles()[0]).toMatch(/^Rule A/)
        fireEvent.click(screen.getByText('Rule B'))
        expect(screen.getByRole('complementary', { name: 'Rule B' }).textContent).toMatch(/body b/)
    })
    it('hooks: grouped by event with name, matcher and scope', () => {
        render(<HooksBody snap={snap} />)
        expect(screen.getByText('Stop')).toBeTruthy()
        expect(screen.getByText('PreToolUse')).toBeTruthy()
        expect(screen.getByText('tool two').closest('li').textContent).toMatch(/Bash.*repo/)
    })
    it('requests: ledger rows, and one line when there are none', () => {
        render(<RequestsBody snap={snap} />)
        expect(screen.getByText('N1')).toBeTruthy()
        cleanup()
        render(<RequestsBody snap={{ asks: { rows: [] } }} />)
        expect(screen.getByText(/ledger when it reports/)).toBeTruthy()
    })
    it('waits without a snapshot, says so when the server is unreachable', () => {
        render(<RulesBody snap={null} error="x" />)
        expect(screen.getByText('Cannot reach the server')).toBeTruthy()
    })
    it('helpers: label, busy square, nothing at all when none', () => {
        render(<HelpersList snap={snap} />)
        expect(screen.getByTestId('helpers').textContent).toMatch(/helper x/)
        cleanup()
        const { container } = render(<HelpersList snap={{ panels: {} }} />)
        expect(container.textContent).toBe('')
    })
    it('tiles carry the live numbers; the three kinds exist only after the server said 200', () => {
        const t = buildTiles({ knowledge: monitorKnowledge(snap) })
        expect([t.rules.value, t.hooks.value, t.requests.value]).toEqual([3, 2, 1])
        expect(t.agents.chips.find((c) => c.label === 'Helpers').value).toBe(1)
        const keys = (monitorAllowed) => availableKinds({ monitorAllowed }).map((k) => k.key)
        expect(keys(false)).not.toEqual(expect.arrayContaining(['rules']))
        expect(keys(true)).toEqual(expect.arrayContaining(['rules', 'hooks', 'requests']))
    })
})
