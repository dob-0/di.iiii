import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../services/apiClient.js', () => ({ getMonitor: vi.fn() }))

import { getMonitor } from '../../services/apiClient.js'
import MonitorSection, { formatBytes, timeAgo } from './MonitorSection.jsx'

const snapshot = (over = {}) => ({
    generatedAt: new Date().toISOString(),
    host: 'aylmo',
    configured: true,
    panels: {
        machines: { ok: true, online: 2, total: 3, rows: [
            { id: '100.1.1.1', name: 'aylmo', os: 'linux', ip: '100.1.1.1', online: true, self: true, lastSeen: null, tx: 2048, rx: 1024 },
            { id: '100.1.1.2', name: 'r-di', os: 'linux', ip: '100.1.1.2', online: true, lastSeen: null, tx: 0, rx: 0 },
            { id: '100.1.1.3', name: 'asuz', os: 'linux', ip: '100.1.1.3', online: false, lastSeen: '2026-10-01T00:00:00Z', tx: 0, rx: 0 }
        ] },
        network: { ok: true, up: 1, total: 2, rows: [
            { id: 'https://dev.example', name: 'dev tier', url: 'https://dev.example', status: 200, ms: 120, ok: true },
            { id: 'https://prod.example', name: 'prod tier', url: 'https://prod.example', status: 0, ms: 3000, ok: false, error: 'timeout' }
        ] },
        agents: { ok: true, live: 2, busy: 1, total: 9, accounts: ['.claude', '.claude-di'], rows: [
            { account: '.claude', sessionId: 'aaaaaaaa-1', title: 'Build the monitor', status: 'busy', kind: 'interactive', branch: 'feat/monitor', cwd: '/w', model: 'm', lastActivity: new Date().toISOString() },
            { account: '.claude-di', sessionId: 'bbbbbbbb-2', title: 'Platina lights', status: 'idle', kind: 'interactive', branch: null, cwd: '/w2', model: 'm', lastActivity: new Date().toISOString() }
        ] },
        services: { ok: true, running: 3, failed: 1, rows: [
            { unit: 'di-server.service', active: 'active', sub: 'running', description: 'di server' },
            { unit: 'broken.service', active: 'failed', sub: 'failed', description: 'broken thing' }
        ] },
        connected: { ok: true, live: 1, total: 2, rows: [
            { id: 'laser', title: 'Lasers', state: 'idle', detail: '0/6 cubes connected · safe' },
            { id: 'osc', title: 'OSC', state: 'ok', detail: '1 listener' }
        ] },
        presence: { ok: true, people: 3, places: 1, rows: [
            { id: 'space:platina', kind: 'space', target: 'platina', people: [
                { name: 'Emilya', since: new Date().toISOString() }, { name: 'Kiara', since: null }, { name: 'guest', since: null }
            ] }
        ] },
        pullRequests: { ok: false, error: 'gh not installed', rows: [] },
        tasks: { ok: true, configured: 1, rows: [{ id: 't', title: 'Open asks', ok: true, lines: ['N1 fix lights', 'N2 deploy'] }] },
        shows: { ok: true, configured: 0, rows: [] },
        ...over
    }
})

describe('MonitorSection', () => {
    beforeEach(() => { getMonitor.mockReset() })
    afterEach(() => { vi.useRealTimers() })

    it('shows every panel and greys only the broken one', async () => {
        getMonitor.mockResolvedValue(snapshot())
        render(<MonitorSection />)
        await waitFor(() => expect(screen.getByText('2/3')).toBeTruthy())
        expect(screen.getByText('Build the monitor')).toBeTruthy()
        expect(screen.getByText('Platina lights')).toBeTruthy()
        expect(screen.getByText(/gh not installed/)).toBeTruthy()
        expect(screen.getByText(/N1 fix lights/)).toBeTruthy()
        // failed services sort first
        const ids = [...document.querySelectorAll('[data-monitor-id^="s:"]')].map((n) => n.getAttribute('data-monitor-id'))
        expect(ids[0]).toBe('s:broken.service')
    })

    it('filters every panel and opens the inspector', async () => {
        getMonitor.mockResolvedValue(snapshot())
        render(<MonitorSection />)
        await waitFor(() => screen.getByText('Build the monitor'))
        fireEvent.change(screen.getByLabelText('Filter every panel'), { target: { value: 'platina' } })
        expect(screen.queryByText('Build the monitor')).toBeNull()
        fireEvent.click(screen.getByText('Platina lights'))
        expect(screen.getByText('Account')).toBeTruthy()
        expect(screen.getByText('/w2')).toBeTruthy()
    })

    it('two machines with the same host name both show and select on their own', async () => {
        const snap = snapshot()
        snap.panels.machines.rows.push({ id: '100.1.1.9', name: 'r-di', os: 'windows', ip: '100.1.1.9', online: false, lastSeen: null, tx: 0, rx: 0 })
        getMonitor.mockResolvedValue(snap)
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        render(<MonitorSection />)
        await waitFor(() => screen.getByText('Build the monitor'))
        const twins = document.querySelectorAll('[data-monitor-id="m:100.1.1.2"],[data-monitor-id="m:100.1.1.9"]')
        expect(twins.length).toBe(2)
        fireEvent.click(twins[1])
        expect(twins[1].getAttribute('aria-pressed')).toBe('true')
        expect(twins[0].getAttribute('aria-pressed')).toBe('false')
        expect(screen.getByText('100.1.1.9')).toBeTruthy()
        expect(spy.mock.calls.some((c) => String(c[0]).includes('same key'))).toBe(false)
        spy.mockRestore()
    })

    it('lists connected things and the people in each space, with names in the inspector', async () => {
        getMonitor.mockResolvedValue(snapshot())
        render(<MonitorSection />)
        await waitFor(() => screen.getByText('Lasers'))
        expect(screen.getByText('People now · 1 place')).toBeTruthy()
        expect(screen.getByText('3')).toBeTruthy()
        expect(screen.getByText(/0\/6 cubes connected/)).toBeTruthy()
        fireEvent.click(screen.getByText('space platina'))
        expect(screen.getByText('Emilya')).toBeTruthy()
        expect(screen.getByText('Kiara')).toBeTruthy()
    })

    it('says plainly when the server refuses (not local, not admin)', async () => {
        getMonitor.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }))
        render(<MonitorSection />)
        await waitFor(() => expect(screen.getByText(/runs on a local di/)).toBeTruthy())
    })

    it('flashes a row whose state changed between two polls', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        getMonitor.mockResolvedValueOnce(snapshot())
        render(<MonitorSection />)
        await waitFor(() => screen.getByText('Build the monitor'))
        const next = snapshot()
        next.panels.agents.rows[0].status = 'idle'
        getMonitor.mockResolvedValue(next)
        await act(async () => { await vi.advanceTimersByTimeAsync(5100) })
        await waitFor(() => expect(document.querySelector('[data-monitor-id="a:aaaaaaaa-1"]').className).toMatch(/is-changed/))
    })

    it('pause stops polling', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        getMonitor.mockResolvedValue(snapshot())
        render(<MonitorSection />)
        await waitFor(() => screen.getByText('Build the monitor'))
        fireEvent.click(screen.getByText('Pause'))
        const calls = getMonitor.mock.calls.length
        await act(async () => { await vi.advanceTimersByTimeAsync(16000) })
        expect(getMonitor.mock.calls.length).toBe(calls)
    })

    it('formats time and bytes', () => {
        expect(timeAgo(null)).toBe('never')
        expect(timeAgo(new Date(Date.now() - 125000).toISOString())).toBe('2m')
        expect(formatBytes(0)).toBe('—')
        expect(formatBytes(1536)).toBe('2 KB')
        expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 GB')
    })
})
