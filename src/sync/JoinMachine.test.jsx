import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import JoinMachine from './JoinMachine.jsx'

const api = vi.hoisted(() => ({ previewJoin: vi.fn(), joinWithCode: vi.fn() }))
vi.mock('./syncApi.js', () => api)

const type = (label, value) => fireEvent.change(screen.getByPlaceholderText(label), { target: { value } })
const FOUND = { ok: true, spaceId: 'moxir', label: 'MOXIR', projects: 16, hostName: 'aylmo', localExists: false }

beforeEach(() => { api.previewJoin.mockReset(); api.joinWithCode.mockReset() })

describe('Join — four words and an address', () => {
    it('Find stays off until there are four words and an address', () => {
        render(<JoinMachine />)
        const find = screen.getByText('Find')
        expect(find.disabled).toBe(true)
        type('192.168.1.9:3000', '192.168.1.9:3000')
        type('AMBER · DESK · NINE · RIVER', 'amber desk nine')
        expect(find.disabled).toBe(true)
        type('AMBER · DESK · NINE · RIVER', 'AMBER · DESK · NINE · RIVER')
        expect(find.disabled).toBe(false)
    })

    it('shows what it found before anything is spent, then joins on the second step', async () => {
        api.previewJoin.mockResolvedValue(FOUND)
        api.joinWithCode.mockResolvedValue({ ok: true, spaceId: 'moxir', label: 'MOXIR', hostName: 'aylmo', merged: false })
        const joined = vi.fn()
        render(<JoinMachine onJoined={joined} />)
        type('192.168.1.9:3000', '192.168.1.9:3000')
        type('AMBER · DESK · NINE · RIVER', 'AMBER · DESK · NINE · RIVER')
        fireEvent.click(screen.getByText('Find'))
        await waitFor(() => expect(screen.getByText('found')).toBeTruthy())
        expect(document.body.textContent).toContain('aylmo · space MOXIR · 16 projects')
        expect(api.joinWithCode).not.toHaveBeenCalled()

        fireEvent.click(screen.getByText('Join — copy it here and keep it in step'))
        await waitFor(() => expect(joined).toHaveBeenCalled())
        expect(api.joinWithCode).toHaveBeenCalledWith({ address: '192.168.1.9:3000', code: 'AMBER · DESK · NINE · RIVER', into: false })
        expect(document.body.textContent).toContain('Joined MOXIR from aylmo')
        expect(screen.getByText('Open it').getAttribute('href')).toBe('/moxir')
    })

    it('will not join over a space of the same name until the person says merge', async () => {
        api.previewJoin.mockResolvedValue({ ...FOUND, localExists: true })
        api.joinWithCode.mockResolvedValue({ ok: true, spaceId: 'moxir', label: 'MOXIR', merged: true })
        render(<JoinMachine />)
        type('192.168.1.9:3000', 'x.local')
        type('AMBER · DESK · NINE · RIVER', 'a b c d')
        fireEvent.click(screen.getByText('Find'))
        const join = await screen.findByText('Join — copy it here and keep it in step')
        expect(join.disabled).toBe(true)
        fireEvent.click(screen.getByRole('checkbox'))
        expect(join.disabled).toBe(false)
        fireEvent.click(join)
        await waitFor(() => expect(api.joinWithCode).toHaveBeenCalledWith({ address: 'x.local', code: 'a b c d', into: true }))
    })

    it('says the server’s own words for a code that is wrong, used or ended', async () => {
        api.previewJoin.mockRejectedValue(Object.assign(new Error('That code is not valid — it may have been used, or it ran out after ten minutes. Ask for a new one.'), { reason: 'invalid-code' }))
        render(<JoinMachine />)
        type('192.168.1.9:3000', '10.0.0.5:3000')
        type('AMBER · DESK · NINE · RIVER', 'a b c d')
        fireEvent.click(screen.getByText('Find'))
        const alert = await screen.findByRole('alert')
        expect(alert.textContent).toContain('ran out after ten minutes')
        expect(screen.queryByText('found')).toBeNull()
    })
})
