import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import MonitorTasks, { askText, plainError, TaskActions, groupOf } from './MonitorTasks.jsx'

const tasks = [
    { id: 'N1', who: 'owner', state: 'WAITING', text: 'cable', ageMin: 5, day: '11-19', time: '02:00' },
    { id: 'N2', who: 'agent', state: 'NEW', text: 'second thing', ageMin: 3000, day: '11-17', time: '02:00' }
]

describe('Tasks lane words', () => {
    it('drops the intake boilerplate from a row and never shows a web page as an error', () => {
        expect(askText('verbatim, not restated: so what else')).toBe('so what else')
        expect(askText('relayed, verbatim, not restated: cable')).toBe('cable')
        expect(plainError('<!DOCTYPE html><html><pre>Cannot GET /x</pre>')).toMatch(/no answer for the asks/)
        expect(plainError('HTTP 500')).toBe('HTTP 500')
    })
})

describe('Tasks lane', () => {
    it('groups by state, puts what waits on the owner first, counts, filters, opens a row', async () => {
        const onPick = vi.fn()
        const { rerender } = render(<MonitorTasks fetcher={async () => ({ ok: true, tasks, total: 2 })} onPick={onPick} refreshMs={1e9} />)
        await waitFor(() => expect(document.querySelector('[data-task="N1"]')).toBeTruthy())
        expect(document.querySelector('[data-task-group]').getAttribute('data-task-group')).toBe('waits')
        expect(document.querySelector('[data-tasks-count]').textContent).toMatch(/2 open in the last 3 days/)
        fireEvent.click(document.querySelector('[data-task="N2"]'))
        expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'N2' }))
        rerender(<MonitorTasks fetcher={async () => ({ ok: true, tasks, total: 2 })} onPick={onPick} refreshMs={1e9} query="second" />)
        await waitFor(() => expect(document.querySelector('[data-task="N1"]')).toBeNull())
        expect(groupOf(tasks[0])).toBe('waits')
    })
    it('says there is no ledger instead of an empty list', async () => {
        render(<MonitorTasks fetcher={async () => ({ ok: false, reason: 'no-ledger', message: 'No ledger on this machine.', tasks: [] })} onPick={() => {}} refreshMs={1e9} />)
        expect(await screen.findByText('No ledger on this machine.')).toBeTruthy()
    })
    it('Done needs proof; the save goes through the one door and shows the new row', async () => {
        const poster = vi.fn(async () => ({ ok: true, row: { id: 'N1.2', state: 'DONE' } }))
        render(<TaskActions task={tasks[0]} fetcher={async () => ({ history: [{ id: 'N1', at: 'x', state: 'NEW', said: 'said it', evidence: '' }] })} poster={poster} />)
        await screen.findByText('said it')
        fireEvent.click(document.querySelector('[data-task-action="done"]'))
        const send = document.querySelector('[data-task-send]')
        expect(send.disabled).toBe(true)
        fireEvent.change(document.querySelector('[data-task-evidence]'), { target: { value: 'tests green' } })
        expect(send.disabled).toBe(false)
        fireEvent.click(send)
        await screen.findByText(/Saved as N1.2: DONE/)
        expect(poster).toHaveBeenCalledWith({ id: 'N1', action: 'done', text: '', evidence: 'tests green' })
    })
})
