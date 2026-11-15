import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../services/apiClient.js', () => ({ postMonitorAsk: vi.fn() }))

import { postMonitorAsk } from '../../services/apiClient.js'
import MonitorWorkspace, { dropSeen } from './MonitorWorkspace.jsx'

const row = (id, text) => ({ id, state: 'open', touched: new Date().toISOString(), text, source: 'page' })

describe('MonitorWorkspace asks', () => {
    beforeEach(() => { postMonitorAsk.mockReset() })

    it('dropSeen removes pending ids the server list has shown', () => {
        const p = [{ id: 'N5' }, { id: 'local-1' }]
        expect(dropSeen(p, [{ id: 'N5' }])).toEqual([{ id: 'local-1' }])
        expect(dropSeen(p, [])).toBe(p)
    })

    it('an ask the server showed and an agent then finished does not come back as open', async () => {
        postMonitorAsk.mockResolvedValue({ id: 'N9' })
        const view = (rows) => <MonitorWorkspace asks={{ ok: true, rows }} agents={{ rows: [] }} reports={[]} onPick={() => {}} />
        const { rerender } = render(view([]))
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'light the hall' } })
        await act(async () => { fireEvent.submit(screen.getByRole('textbox').closest('form')) })
        await waitFor(() => expect(screen.getByText('light the hall')).toBeTruthy())
        // the server's open list carries it
        rerender(view([row('N9', 'light the hall')]))
        expect(screen.getAllByText('light the hall').length).toBe(1)
        // an agent finishes it: the open list no longer holds it
        rerender(view([]))
        expect(screen.queryByText('light the hall')).toBeNull()
    })
})
