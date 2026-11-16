import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HelpersList, HooksBody, RequestsBody, RulesBody, SkillsBody } from './KnowledgeWindows.jsx'
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
const skills = { ok: true, count: 3, counts: { user: 1, repo: 1, plugin: 1 }, rows: [
    { name: 'skill-u', description: 'user skill text', scope: 'user' },
    { name: 'skill-r', description: 'repo skill text', scope: 'repo' },
    { name: 'skill-p', description: 'plugin skill text', scope: 'plugin' }
] }
const snap = {
    host: 'box.local',
    panels: { agents: { rows: [], helpers: [{ parent: 'abc12345', label: 'helper x', since: '2026-11-16T02:01:00Z', busy: true }] }, rules, hooks, skills },
    reports: [{ host: 'two', stale: false, panels: { rules, hooks, skills } }],
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
        expect(t.skills.value).toBe(3)
        expect(t.agents.chips.find((c) => c.label === 'Helpers').value).toBe(1)
        const keys = (monitorAllowed) => availableKinds({ monitorAllowed }).map((k) => k.key)
        expect(keys(false)).not.toEqual(expect.arrayContaining(['rules']))
        expect(keys(false)).not.toEqual(expect.arrayContaining(['skills']))
        expect(keys(true)).toEqual(expect.arrayContaining(['rules', 'hooks', 'skills', 'requests']))
    })
    it('skills: scope chips filter, the description opens in a drawer on click', () => {
        render(<SkillsBody snap={snap} />)
        expect(screen.getAllByRole('listitem')).toHaveLength(3)
        fireEvent.click(screen.getByRole('button', { name: /1 repo/ }))
        expect(screen.getAllByRole('listitem')).toHaveLength(1)
        fireEvent.click(screen.getByText('skill-r'))
        expect(screen.getByRole('complementary', { name: 'skill-r' }).textContent).toMatch(/repo skill text/)
        cleanup()
        render(<SkillsBody snap={{ panels: {} }} />)
        expect(screen.getByText('No skills reported yet.')).toBeTruthy()
    })
    it('requests: a group of the owner’s words waiting for the ledger, newest first, counted in the tile', () => {
        const waiting = { rows: [
            { host: 'lap', at: '2026-11-16T06:12:00.000Z', session: 'abc12345', text: 'newer words' },
            { host: 'lap', at: '2026-11-15T21:40:00.000Z', session: 'abc12345', text: 'older words' }
        ], count: 2, hosts: ['lap'] }
        const k = monitorKnowledge(snap)
        expect(buildTiles({ knowledge: { ...k, waiting } }).requests.value).toBe(3)
        // monitorKnowledge may not carry `waiting` yet: the window guards it
        expect(() => render(<RequestsBody snap={{ ...snap, asks: { rows: [] } }} />)).not.toThrow()
    })
})
