import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SyncLight from './SyncLight.jsx'
import SurfaceBar from '../components/SurfaceBar.jsx'

const hook = vi.hoisted(() => ({ value: { status: null, now: 0, refresh: () => {} } }))
vi.mock('./useSyncStatus.js', () => ({ default: () => hook.value }))
const api = vi.hoisted(() => ({
    issueJoinCode: vi.fn(),
    revokeJoinCode: vi.fn(),
    stopFollowing: vi.fn()
}))
vi.mock('./syncApi.js', () => api)
vi.mock('../utils/appNavigate.js', () => ({ appNavigate: vi.fn(), setAppNavigate: () => {} }))

const NOW = 1_800_000_000_000
const status = (over = {}, files = {}) => ({
    spaceId: 'moxir',
    now: NOW,
    follows: {
        host: { name: 'ponyo' }, status: 'following', hostAnswering: true, hostRefused: false, lastAnswerAt: NOW - 500, latencyMs: 120,
        lastEditAt: NOW - 4000, clashes: 0, clashTimes: [], lastError: null,
        files: { pending: 0, failed: 0, carried: 3, bytesPending: 0, ...files }, ...over
    },
    followers: [],
    code: null
})
const show = (value) => { hook.value = { status: value, now: NOW, refresh: vi.fn() } }

beforeEach(() => {
    api.issueJoinCode.mockReset()
    api.revokeJoinCode.mockReset()
    api.stopFollowing.mockReset()
    show(null)
})

describe('the sync light in the bar', () => {
    it('shows nothing when this space is not shared', () => {
        const { container } = render(<SyncLight space="moxir" />)
        expect(container.querySelector('.slight')).toBeNull()
        expect(document.querySelector('.spanel')).toBeNull()
    })

    it('says SYNCED · PONYO · 0.1 S with a green lamp, and tells the bar it is there', () => {
        show(status())
        const shown = vi.fn()
        render(<SyncLight space="moxir" onShown={shown} />)
        const chip = document.querySelector('.slight')
        expect(chip.textContent).toBe('SYNCED · PONYO · 0.1 S')
        expect(chip.className).toContain('slight--ok')
        expect(shown).toHaveBeenLastCalledWith(true)
    })

    it('never says synced while a file is still coming', () => {
        show(status({}, { pending: 2 }))
        render(<SyncLight space="moxir" />)
        const text = document.querySelector('.slight').textContent
        expect(text).toBe('SYNCING · PONYO · 2 FILES COMING')
        expect(text).not.toMatch(/SYNCED/)
        expect(document.querySelector('.slight').className).toContain('slight--warn')
    })

    it('says PONYO NOT ANSWERING · 2 MIN, and the panel says nothing is lost', () => {
        show(status({ hostAnswering: false, status: 'waiting', lastAnswerAt: NOW - 120_000 }))
        render(<SyncLight space="moxir" />)
        expect(document.querySelector('.slight').textContent).toBe('PONYO NOT ANSWERING · 2 MIN')
        fireEvent.click(document.querySelector('.slight'))
        expect(document.querySelector('.spanel').textContent).toContain('Edits made here wait and cross when ponyo is back. Nothing is lost; nothing needs doing.')
    })

    it('opens a panel with the sketch’s rows and its two buttons', () => {
        show(status({ clashTimes: [NOW - 1000] }))
        render(<SyncLight space="moxir" />)
        fireEvent.click(document.querySelector('.slight'))
        const panel = document.querySelector('.spanel')
        expect(panel.textContent).toContain('THIS SPACE IS ALSO ON')
        expect(panel.textContent).toContain('ponyo — host')
        expect(panel.textContent).toContain('live · last edit 4 s ago')
        expect(panel.textContent).toContain('files still coming')
        expect(panel.textContent).toContain("1 — host's version kept")
        expect([...panel.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Invite a machine', 'Stop following'])
    })

    it('Stop following asks first, then stops, and Keep following changes nothing', async () => {
        show(status())
        api.stopFollowing.mockResolvedValue({ ok: true })
        render(<SyncLight space="moxir" />)
        fireEvent.click(document.querySelector('.slight'))
        fireEvent.click(screen.getByText('Stop following'))
        expect(api.stopFollowing).not.toHaveBeenCalled()
        expect(document.querySelector('.spanel').textContent).toContain('Nothing here is deleted')
        fireEvent.click(screen.getByText('Keep following'))
        expect(api.stopFollowing).not.toHaveBeenCalled()
        fireEvent.click(screen.getByText('Stop following'))
        fireEvent.click(screen.getAllByText('Stop following').pop())
        await waitFor(() => expect(api.stopFollowing).toHaveBeenCalledWith('moxir'))
    })

    it('Invite a machine shows the four words, how long they work, and the address to type', async () => {
        show(status())
        api.issueJoinCode.mockResolvedValue({
            id: 'c1', code: 'AMBER · DESK · NINE · RIVER', words: ['amber', 'desk', 'nine', 'river'],
            expiresAt: NOW + 600_000, now: NOW, ttlSeconds: 600, machine: 'aylmo', addresses: ['http://192.168.1.9:3000'], lan: true
        })
        render(<SyncLight space="moxir" />)
        fireEvent.click(document.querySelector('.slight'))
        fireEvent.click(screen.getByText('Invite a machine'))
        await waitFor(() => expect(document.querySelector('.scode')).not.toBeNull())
        const panel = document.querySelector('.spanel').textContent
        expect(document.querySelector('.scode').textContent).toBe('AMBER · DESK · NINE · RIVER')
        expect(panel).toContain('On the other machine, open di.iiii → Join, and type')
        expect(panel).toContain('Works for 10 minutes · this space only · you can revoke it')
        expect(panel).toContain('http://192.168.1.9:3000')
        expect(api.issueJoinCode).toHaveBeenCalledWith('moxir')

        api.revokeJoinCode.mockResolvedValue({ ok: true })
        fireEvent.click(screen.getByText('Revoke this code'))
        await waitFor(() => expect(api.revokeJoinCode).toHaveBeenCalledWith('moxir', 'c1'))
        await waitFor(() => expect(document.querySelector('.scode')).toBeNull())
    })

    it('says so when no other machine can reach this one, instead of showing an address that cannot work', async () => {
        show(status())
        api.issueJoinCode.mockResolvedValue({ id: 'c1', code: 'A · B · C · D', expiresAt: NOW + 600_000, now: NOW, addresses: [], lan: false })
        render(<SyncLight space="moxir" />)
        fireEvent.click(document.querySelector('.slight'))
        fireEvent.click(screen.getByText('Invite a machine'))
        await waitFor(() => expect(document.querySelector('.scode')).not.toBeNull())
        expect(document.querySelector('.spanel').textContent).toContain('answers only on this machine')
    })

    it('Escape closes the panel', () => {
        show(status())
        render(<SyncLight space="moxir" />)
        fireEvent.click(document.querySelector('.slight'))
        expect(document.querySelector('.spanel')).not.toBeNull()
        act(() => { fireEvent.keyDown(window, { key: 'Escape' }) })
        expect(document.querySelector('.spanel')).toBeNull()
    })

    it('is part of the space bar: the bar carries it when there is a space, and says it has a second row', () => {
        show(status())
        render(<SurfaceBar space="moxir" spaceLabel="MOXIR" />)
        expect(document.querySelector('.sbar .sbar-sync .slight')).not.toBeNull()
        expect(document.querySelector('.sbar').className).toContain('sbar--sync')
    })

    it('a bar with no space has no light, and an unshared space leaves the bar as it was', () => {
        show(status())
        render(<SurfaceBar />)
        expect(document.querySelector('.slight')).toBeNull()
        cleanup()
        show(null)
        render(<SurfaceBar space="moxir" />)
        expect(document.querySelector('.slight')).toBeNull()
        expect(document.querySelector('.sbar').className).not.toContain('sbar--sync')
    })
})
