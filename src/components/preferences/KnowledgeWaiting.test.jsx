import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// `waiting` comes from monitorKnowledge (PR #1294). Here it is made up on top of the real function, so the
// window is tested whichever of the two branches carries it.
vi.mock('./monitorKnowledge.js', async (importOriginal) => {
    const real = await importOriginal()
    return {
        ...real,
        monitorKnowledge: (snap) => ({
            ...real.monitorKnowledge(snap),
            waiting: snap?.__waiting || undefined
        })
    }
})
const { RequestsBody } = await import('./KnowledgeWindows.jsx')
const { buildTiles } = await import('./useAdminTiles.js')
const { monitorKnowledge } = await import('./monitorKnowledge.js')

const waiting = { rows: [
    { host: 'lap', at: '2026-11-16T06:12:00.000Z', session: 'abc12345', text: 'newer made-up words' },
    { host: 'lap', at: '2026-11-15T21:40:00.000Z', session: 'abc12345', text: 'older made-up words' }
], count: 2, hosts: ['lap'] }
const ledger = { rows: [{ id: 'N1', state: 'NEW', touched: '11-15 10:00', text: 'a ledger row', source: 'ledger' }] }
afterEach(() => cleanup())

describe('requests waiting for the ledger', () => {
    it('shows the group under the ledger rows, newest first, with the one line', () => {
        render(<RequestsBody snap={{ asks: ledger, __waiting: waiting }} />)
        expect(screen.getByText('aylmo’s ledger adds these when it is on.')).toBeTruthy()
        const rows = screen.getByTestId('waiting').querySelectorAll('li')
        expect(rows).toHaveLength(2)
        expect(rows[0].textContent).toMatch(/newer made-up words/)
        expect(rows[1].textContent).toMatch(/older made-up words/)
        expect(screen.getByText('N1')).toBeTruthy()
    })
    it('shows the group alone when the ledger has no rows', () => {
        render(<RequestsBody snap={{ asks: { rows: [] }, __waiting: waiting }} />)
        expect(screen.getByTestId('waiting')).toBeTruthy()
        expect(screen.queryByText(/ledger when it reports/)).toBeNull()
    })
    it('the tile counts open ledger rows plus waiting', () => {
        const k = monitorKnowledge({ asks: ledger, __waiting: waiting })
        expect(buildTiles({ knowledge: k }).requests.value).toBe(3)
        expect(buildTiles({ knowledge: monitorKnowledge({ asks: { rows: [] }, __waiting: waiting }) }).requests.value).toBe(2)
    })
})
