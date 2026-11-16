import React from 'react'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../services/apiClient.js', () => ({
    getMonitor: vi.fn(),
    monitorStreamUrl: () => '/api/monitor/stream',
    postMonitorAsk: vi.fn()
}))

import { getMonitor, postMonitorAsk } from '../../services/apiClient.js'
import MonitorSection, { formatBytes, nextBackoff, timeAgo } from './MonitorSection.jsx'
import { tierState } from './MonitorOverview.jsx'

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

// the contract's new fields (tiers, spaces, asks, reports, map)
const contract = (over = {}) => ({
    ...snapshot(),
    reports: [
        { host: 'r-di', reportedAt: new Date().toISOString(), stale: false, panels: { agents: { live: 2 } } },
        { host: 'asuz', reportedAt: '2026-11-15T00:00:00Z', stale: true, panels: {} }
    ],
    tiers: { ok: true, rows: [
        { id: 'prod', url: 'https://diiii.xyz', status: 'ok', ms: 90, commit: 'aaaaaaa1111', builtAt: '2026-11-10T00:00:00Z', behindDev: 12 },
        { id: 'dev', source: 'self', url: 'https://dev.diiii.xyz', status: 'ok', ms: 120, commit: 'bbbbbbb2222', builtAt: new Date().toISOString(), behindDev: 0 },
        { id: 'local:aylmo', url: 'http://diiii.localhost', status: 'ok', ms: 8, commit: 'ccccccc3333', builtAt: new Date().toISOString(), behindDev: 0 },
        { id: 'local:r-di', url: 'http://r-di', status: 'ok', ms: 30, commit: 'bbbbbbb2222', builtAt: new Date().toISOString(), behindDev: 0 }
    ] },
    spaces: { ok: true, rows: [
        { tier: 'dev', slug: 'platina', visibility: 'private' }, { tier: 'dev', slug: 'docs', visibility: 'public' }, { tier: 'prod', slug: 'docs', visibility: 'public' }
    ] },
    asks: { ok: true, rows: [
        { id: 'N1', state: 'open', touched: '2026-11-15T10:00:00Z', text: 'older ask', source: 'ledger' },
        { id: 'N2', state: 'open', touched: '2026-11-16T10:00:00Z', text: 'newest ask', source: 'page' }
    ] },
    map: {
        nodes: [
            { id: 'machine:aylmo', kind: 'machine', label: 'aylmo', state: 'ok' },
            { id: 'machine:asuz', kind: 'machine', label: 'asuz', state: 'off' },
            { id: 'tier:dev', kind: 'tier', label: 'dev', state: 'ok' },
            { id: 'space:platina', kind: 'space', label: 'platina', state: 'warn' },
            { id: 'show:muth', kind: 'show', label: 'MUTH', state: 'ok' },
            { id: 'agent:a1', kind: 'agent', label: 'Build the monitor', state: 'ok' }
        ],
        edges: [
            { from: 'machine:aylmo', to: 'tier:dev', kind: 'runs' },
            { from: 'tier:dev', to: 'space:platina', kind: 'holds' },
            { from: 'space:platina', to: 'show:muth', kind: 'holds' },
            { from: 'agent:a1', to: 'machine:aylmo', kind: 'works-on' }
        ]
    },
    ...over
})

class FakeEventSource {
    static instances = []
    static CLOSED = 2
    constructor(url) { this.url = url; this.listeners = {}; this.closed = false; this.readyState = 1; FakeEventSource.instances.push(this) }
    addEventListener(t, f) { this.listeners[t] = f }
    removeEventListener(t) { delete this.listeners[t] }
    close() { this.closed = true }
    emit(data) { this.listeners.snapshot?.({ data: JSON.stringify(data) }) }
    beat() { this.listeners.heartbeat?.({ data: JSON.stringify({ at: new Date().toISOString() }) }) }
}

describe('MonitorSection', () => {
    beforeEach(() => { getMonitor.mockReset() })
    afterEach(() => { vi.useRealTimers() })

    it('shows its data under StrictMode (mount, unmount, mount again)', async () => {
        getMonitor.mockResolvedValue(snapshot())
        render(<React.StrictMode><MonitorSection /></React.StrictMode>)
        await waitFor(() => expect(screen.getByText('Build the monitor')).toBeTruthy())
        expect(screen.queryByText(/Reading the monitor/)).toBeNull()
    })

    it('shows every panel and greys only the broken one', async () => {
        getMonitor.mockResolvedValue(snapshot())
        render(<MonitorSection />)
        await waitFor(() => expect(screen.getByText('Build the monitor')).toBeTruthy())
        expect(screen.getByText('Platina lights')).toBeTruthy()
        fireEvent.click(document.querySelector('[data-monitor-tab="lists"]'))
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
        fireEvent.click(document.querySelector('[data-monitor-tab="lists"]'))
        fireEvent.click(document.querySelector('[data-fold="off"]')) // the off machines are folded
        const twins = document.querySelectorAll('[data-monitor-id="m:100.1.1.2"],[data-monitor-id="m:100.1.1.9"]')
        expect(twins.length).toBe(2)
        fireEvent.click(twins[1])
        expect(twins[1].getAttribute('aria-pressed')).toBe('true')
        expect(twins[0].getAttribute('aria-pressed')).toBe('false')
        expect(screen.getByText('100.1.1.9')).toBeTruthy()
        // the same name on two devices shows the system, never two identical rows
        expect(screen.getByText(/^r-di · linux/)).toBeTruthy()
        expect(screen.getByText(/^r-di · windows/)).toBeTruthy()
        expect(spy.mock.calls.some((c) => String(c[0]).includes('same key'))).toBe(false)
        spy.mockRestore()
    })

    it('lists connected things and the people in each space, with names in the inspector', async () => {
        getMonitor.mockResolvedValue(snapshot())
        render(<MonitorSection />)
        await waitFor(() => screen.getByText('Build the monitor'))
        fireEvent.click(document.querySelector('[data-monitor-tab="lists"]'))
        expect(screen.getByText('3 people in 1 space')).toBeTruthy()
        expect(screen.getAllByText('Show gear').length).toBeGreaterThan(0) // the chip and the list block
        expect(screen.queryByText(/Things connected/)).toBeNull()
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

describe('MonitorSection overview, map, workspace and live', () => {
    beforeEach(() => { getMonitor.mockReset(); postMonitorAsk.mockReset(); FakeEventSource.instances = [] })
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); delete window.matchMedia })

    it('the vital strip shows each tier and paints drift in the warning colour', async () => {
        getMonitor.mockResolvedValue(contract())
        render(<MonitorSection />)
        await waitFor(() => screen.getByLabelText('Vital signs'))
        const tone = (id) => document.querySelector(`[data-tier-id="${id}"]`).getAttribute('data-tier-tone')
        expect(tone('prod')).toBe('warning') // 12 behind dev
        expect(tone('dev')).toBe('success')
        expect(tone('local:aylmo')).toBe('warning') // not on dev's commit
        expect(tone('local:r-di')).toBe('success')
        // the number lives once, in Needs you; the chip keeps only its state
        expect(document.querySelector('[data-tier-id="prod"]').textContent).not.toMatch(/12/)
        expect(document.querySelector('.monitor-needs').textContent).toMatch(/12 commits behind/)
        expect(screen.getByText('✓ bbbbbbb', { selector: '[data-tier-id="dev"] *' })).toBeTruthy()
    })

    it('overview marks an unanswering tier as down', async () => {
        const c = contract()
        c.tiers.rows[0].status = 502
        getMonitor.mockResolvedValue(c)
        render(<MonitorSection />)
        await waitFor(() => screen.getByLabelText('Vital signs'))
        expect(document.querySelector('[data-tier-id="prod"]').getAttribute('data-tier-tone')).toBe('danger')
    })

    it('map draws the nodes and a click opens the inspector', async () => {
        getMonitor.mockResolvedValue(contract())
        render(<MonitorSection />)
        await waitFor(() => screen.getByLabelText('Vital signs'))
        fireEvent.click(document.querySelector('[data-monitor-tab="map"]'))
        expect(document.querySelector('.monitor-page').classList.contains('is-map')).toBe(true)
        expect(document.querySelector('.monitor-vital [data-tier-id]')).toBeTruthy() // the strip stays on every tab
        expect(document.querySelector('[data-monitor-map="graph"]')).toBeTruthy()
        expect(document.querySelectorAll('[data-map-node]').length).toBe(6)
        expect(document.querySelectorAll('.monitor-edge').length).toBe(4) // runs, works-on and the 2 holds (every node shows its link to its tier)
        fireEvent.click(document.querySelector('[data-map-node="space:platina"]'))
        expect(screen.getByText('Inspector — platina')).toBeTruthy()
        expect(screen.getByText('warn')).toBeTruthy()
        expect(within(document.querySelector('.monitor-inspector')).getByText('MUTH')).toBeTruthy() // its neighbour, from the edges (holds are in the drawer)
    })

    it('map falls back to a grouped list at phone width', async () => {
        window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: () => {}, removeEventListener: () => {} })
        getMonitor.mockResolvedValue(contract())
        render(<MonitorSection />)
        await waitFor(() => screen.getByLabelText('Vital signs'))
        fireEvent.click(document.querySelector('[data-monitor-tab="map"]'))
        expect(document.querySelector('[data-monitor-map="list"]')).toBeTruthy()
        expect(document.querySelector('svg')).toBeNull()
        fireEvent.click(document.querySelector('[data-map-node="machine:asuz"]'))
        expect(screen.getByText('Inspector — asuz')).toBeTruthy()
    })

    it('Now lists asks newest first and busy agents first; reports are in Lists', async () => {
        getMonitor.mockResolvedValue(contract())
        render(<MonitorSection />)
        await waitFor(() => screen.getByLabelText('Vital signs'))
        const ids = [...document.querySelectorAll('[data-ask-id]')].map((n) => n.getAttribute('data-ask-id'))
        expect(ids).toEqual(['N2', 'N1'])
        const lanes = [...document.querySelectorAll('[data-lane-id]')].map((n) => n.getAttribute('data-lane-id'))
        expect(lanes[0]).toBe('aaaaaaaa-1') // busy first
        fireEvent.click(document.querySelector('[data-monitor-tab="lists"]')) // machine reports are a list
        expect(document.querySelector('[data-report-host="asuz"]').textContent).toMatch(/stale/)
    })

    it('sending an ask shows it at once, then the stream carries it', async () => {
        vi.stubGlobal('EventSource', FakeEventSource)
        let resolveAsk
        postMonitorAsk.mockReturnValue(new Promise((r) => { resolveAsk = r }))
        getMonitor.mockResolvedValue(contract())
        render(<MonitorSection />)
        await waitFor(() => screen.getByLabelText('Vital signs'))
        fireEvent.change(screen.getByLabelText('Send an ask'), { target: { value: 'light the hall' } })
        fireEvent.click(screen.getByText('Send ask'))
        expect(screen.getByText('light the hall')).toBeTruthy() // before the server answered
        expect(postMonitorAsk).toHaveBeenCalledWith('light the hall')
        await act(async () => { resolveAsk({ id: 'N3' }) })
        const next = contract()
        next.asks.rows.push({ id: 'N3', state: 'open', touched: new Date().toISOString(), text: 'light the hall', source: 'page' })
        await act(async () => { FakeEventSource.instances[0].emit(next) })
        expect(screen.getAllByText('light the hall').length).toBe(1) // no duplicate
        expect(document.querySelector('[data-ask-id="N3"]')).toBeTruthy()
    })

    it('a refused ask is marked and says why', async () => {
        postMonitorAsk.mockRejectedValue(new Error('403 forbidden'))
        getMonitor.mockResolvedValue(contract())
        render(<MonitorSection />)
        await waitFor(() => screen.getByLabelText('Vital signs'))
        fireEvent.change(screen.getByLabelText('Send an ask'), { target: { value: 'x' } })
        fireEvent.click(screen.getByText('Send ask'))
        await waitFor(() => expect(screen.getByText(/Not sent: 403 forbidden/)).toBeTruthy())
    })

    it('subscribes to the stream, shows its snapshots and stops polling', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        vi.stubGlobal('EventSource', FakeEventSource)
        getMonitor.mockResolvedValue(snapshot())
        render(<MonitorSection />)
        await waitFor(() => screen.getByText('Build the monitor'))
        const es = FakeEventSource.instances[0]
        expect(es.url).toBe('/api/monitor/stream')
        const next = snapshot()
        next.panels.agents.rows[0].title = 'Streamed title'
        await act(async () => { es.emit(next) })
        expect(screen.getByText('Streamed title')).toBeTruthy()
        expect(document.querySelector('.monitor-live-mark').className).toMatch(/tone-live/)
        const calls = getMonitor.mock.calls.length
        await act(async () => { await vi.advanceTimersByTimeAsync(16000) })
        expect(getMonitor.mock.calls.length).toBe(calls)
    })

    it('falls back to polling when the stream fails', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        vi.stubGlobal('EventSource', FakeEventSource)
        getMonitor.mockResolvedValue(snapshot())
        render(<MonitorSection />)
        await waitFor(() => screen.getByText('Build the monitor'))
        const es = FakeEventSource.instances[0]
        await act(async () => { es.emit(snapshot()) })
        es.readyState = 2 // CLOSED: the browser gave up (an HTTP refusal)
        await act(async () => { es.onerror() })
        expect(es.closed).toBe(true)
        const calls = getMonitor.mock.calls.length
        await act(async () => { await vi.advanceTimersByTimeAsync(5100) })
        expect(getMonitor.mock.calls.length).toBeGreaterThan(calls)
        expect(document.querySelector('.monitor-live-mark').className).toMatch(/tone-warning/)
    })

    it('a CLOSED stream is reopened with a backoff (3 s doubling, cap 30 s, reset on open); polling meanwhile', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        vi.stubGlobal('EventSource', FakeEventSource)
        getMonitor.mockResolvedValue(snapshot())
        render(<MonitorSection />)
        await waitFor(() => screen.getByText('Build the monitor'))
        const closeLatest = async () => { const es = FakeEventSource.instances.at(-1); es.readyState = 2; await act(async () => { es.onerror() }); return es }
        const first = await closeLatest()
        expect(first.closed).toBe(true)
        expect(document.querySelector('.monitor-live-mark').className).toMatch(/tone-warning/)
        await act(async () => { await vi.advanceTimersByTimeAsync(2900) })
        expect(FakeEventSource.instances.length).toBe(1)
        await act(async () => { await vi.advanceTimersByTimeAsync(200) })
        expect(FakeEventSource.instances.length).toBe(2) // after 3 s
        await closeLatest()
        await act(async () => { await vi.advanceTimersByTimeAsync(5900) })
        expect(FakeEventSource.instances.length).toBe(2)
        await act(async () => { await vi.advanceTimersByTimeAsync(200) })
        expect(FakeEventSource.instances.length).toBe(3) // after 6 s
        const third = FakeEventSource.instances[2]
        await act(async () => { third.onopen() })
        await act(async () => { third.emit(snapshot()) })
        expect(document.querySelector('.monitor-live-mark').className).toMatch(/tone-live/)
        await closeLatest() // delay was reset by the open: 3 s again
        await act(async () => { await vi.advanceTimersByTimeAsync(3100) })
        expect(FakeEventSource.instances.length).toBe(4)
        expect(nextBackoff(3000)).toBe(6000)
        expect(nextBackoff(20000)).toBe(30000)
        expect(nextBackoff(30000)).toBe(30000)
    })

    it('a pending reconnect is cleaned up on Pause and on unmount', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        vi.stubGlobal('EventSource', FakeEventSource)
        getMonitor.mockResolvedValue(snapshot())
        const { unmount } = render(<MonitorSection />)
        await waitFor(() => screen.getByText('Build the monitor'))
        const es = FakeEventSource.instances[0]
        es.readyState = 2
        await act(async () => { es.onerror() })
        fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
        await act(async () => { await vi.advanceTimersByTimeAsync(40000) })
        expect(FakeEventSource.instances.length).toBe(1)
        fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
        expect(FakeEventSource.instances.length).toBe(2)
        const e2 = FakeEventSource.instances[1]
        e2.readyState = 2
        await act(async () => { e2.onerror() })
        unmount()
        await act(async () => { await vi.advanceTimersByTimeAsync(40000) })
        expect(FakeEventSource.instances.length).toBe(2)
    })

    it('a dropped stream is left to reconnect: polling meanwhile, live again on the next snapshot', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        vi.stubGlobal('EventSource', FakeEventSource)
        getMonitor.mockResolvedValue(snapshot())
        render(<MonitorSection />)
        await waitFor(() => screen.getByText('Build the monitor'))
        const es = FakeEventSource.instances[0]
        await act(async () => { es.emit(snapshot()) })
        expect(document.querySelector('.monitor-live-mark').className).toMatch(/tone-live/)
        es.readyState = 0 // CONNECTING: the server ended it on purpose, retry 3000 is running
        await act(async () => { es.onerror() })
        expect(es.closed).toBe(false)
        expect(FakeEventSource.instances.length).toBe(1)
        expect(document.querySelector('.monitor-live-mark').className).toMatch(/tone-warning/)
        const calls = getMonitor.mock.calls.length
        await act(async () => { await vi.advanceTimersByTimeAsync(5100) })
        expect(getMonitor.mock.calls.length).toBeGreaterThan(calls)
        es.readyState = 1
        await act(async () => { es.emit(snapshot()) })
        expect(document.querySelector('.monitor-live-mark').className).toMatch(/tone-live/)
    })

    it('"updated" is when the page last heard from the server, snapshot or heartbeat, not the snapshot\'s own time', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        vi.stubGlobal('EventSource', FakeEventSource)
        // built two hours ago, but just delivered
        getMonitor.mockResolvedValue(snapshot({ generatedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString() }))
        render(<MonitorSection />)
        await waitFor(() => screen.getByText('Build the monitor'))
        expect(screen.getByText(/heard (just now|\d+ s ago)/)).toBeTruthy()
        const es = FakeEventSource.instances[0]
        await act(async () => { es.emit(snapshot({ generatedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString() })) })
        await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60 * 1000) })
        expect(screen.getByText(/heard [45] min ago/)).toBeTruthy() // 5 min, the clock ticks each second
        await act(async () => { es.beat() })
        expect(screen.getByText(/heard (just now|\d+ s ago)/)).toBeTruthy()
    })

    it('renders the new views under StrictMode', async () => {
        vi.stubGlobal('EventSource', FakeEventSource)
        getMonitor.mockResolvedValue(contract())
        render(<React.StrictMode><MonitorSection /></React.StrictMode>)
        await waitFor(() => screen.getByLabelText('Vital signs'))
        expect(screen.getByText('newest ask')).toBeTruthy()
        expect(FakeEventSource.instances.filter((e) => !e.closed).length).toBe(1)
    })
})

describe('vital strip when a tier is down', () => {
    it('prod down: dev stays calm, prod is red; no tier rows at all draws no tier chip and does not crash', async () => {
        const c = contract()
        c.tiers.ok = false
        c.tiers.rows[0] = { ...c.tiers.rows[0], status: 0, ms: 3000, commit: null }
        getMonitor.mockResolvedValue(c)
        render(<MonitorSection />)
        await waitFor(() => screen.getByLabelText('Vital signs'))
        expect(document.querySelector('[data-tier-id="dev"]').getAttribute('data-tier-tone')).toBe('success')
        const prod = document.querySelector('[data-tier-id="prod"]')
        expect(prod.getAttribute('data-tier-tone')).toBe('danger')
        expect(prod.textContent).toMatch(/not answering/)
        expect(document.querySelector('.monitor-needs').textContent).toMatch(/prod is not answering/)
    })

    it('no tier rows: no tier chip, the rest of the strip still shows', async () => {
        const c = contract()
        c.tiers = { ok: false, rows: [], error: 'no probe' }
        getMonitor.mockResolvedValue(c)
        render(<MonitorSection />)
        await waitFor(() => screen.getByLabelText('Vital signs'))
        expect(document.querySelector('[data-tier-id]')).toBeNull()
        expect(document.querySelector('[data-count-id="machines"]')).toBeTruthy()
    })

    it('other tiers count PUBLIC spaces only, said in the drawer; the tier itself counts all', async () => {
        getMonitor.mockResolvedValue(contract())
        render(<MonitorSection />)
        await waitFor(() => screen.getByLabelText('Vital signs'))
        fireEvent.click(document.querySelector('[data-tier-id="prod"]'))
        expect(within(document.querySelector('.monitor-drawer')).getByText('1 public')).toBeTruthy()
        fireEvent.click(document.querySelector('[data-tier-id="dev"]'))
        expect(within(document.querySelector('.monitor-drawer')).getByText('2')).toBeTruthy()
    })

    it('a failed ask read says nothing invented', async () => {
        const c = contract()
        c.asks = { ok: false, rows: [] }
        getMonitor.mockResolvedValue(c)
        render(<MonitorSection />)
        await waitFor(() => screen.getByLabelText('Vital signs'))
        expect(screen.getByText('Asks unavailable here')).toBeTruthy()
        expect(screen.queryByText(/undefined/)).toBeNull()
    })
})

describe('tierState', () => {
    it('both commits known and different, with no git count: amber on any tier, prod included', () => {
        expect(tierState({ id: 'prod', status: 200, commit: 'aaa', behindDev: null }, 'bbb')).toEqual({ tone: 'warning', note: 'not on dev’s commit' })
        expect(tierState({ id: 'prod', status: 200, commit: 'bbb', behindDev: null }, 'bbb').note).toBe('with dev')
        expect(tierState({ id: 'prod', status: 200, commit: 'aaa', behindDev: 3 }, 'bbb').note).toBe('3 behind dev')
    })

    it('a machine that only reports is judged by its report, never "not answering"', () => {
        expect(tierState({ id: 'local:x', source: 'report', status: null, state: 'ok', commit: 'bbb' }, 'bbb').tone).toBe('success')
        expect(tierState({ id: 'local:x', source: 'report', status: null, state: 'warn', commit: 'bbb' }, 'bbb').tone).toBe('danger')
    })

    it('never says "with dev" for a tier whose commit is unknown', () => {
        expect(tierState({ id: 'local:studio-mac', status: 200, commit: null, behindDev: null }, 'abc')).toEqual({ tone: 'warning', note: 'not a release build', quiet: true })
        expect(tierState({ id: 'local:aylmo', status: 200, commit: 'abc', behindDev: 0 }, 'abc').note).toBe('with dev')
        expect(tierState({ id: 'dev', status: 200, commit: 'abc', behindDev: 0 }, 'abc').note).toBe('newest')
        // a hosted tier with no commit is still an action, said as it is
        expect(tierState({ id: 'prod', status: 200, commit: null, behindDev: null }, 'abc')).toEqual({ tone: 'warning', note: 'commit unknown', quiet: false })
    })
})

describe('MonitorSection look: full screen, status line, tiles, feed, drawer, keys', () => {
    beforeEach(() => {
        getMonitor.mockReset(); postMonitorAsk.mockReset(); FakeEventSource.instances = []
        try { window.localStorage.clear() } catch { /* none */ }
        window.history.replaceState(null, '', '/')
    })
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); delete window.matchMedia })
    const open = async (data = contract()) => {
        getMonitor.mockResolvedValue(data)
        render(<MonitorSection />)
        await waitFor(() => screen.getByLabelText('Vital signs'))
    }
    const page = () => document.querySelector('.monitor-page')

    it('Full screen button and Esc turn the page over the admin frame and back, remembered per browser', async () => {
        await open()
        expect(page().getAttribute('data-monitor-full')).toBe('off')
        fireEvent.click(screen.getByText('Full screen'))
        expect(page().getAttribute('data-monitor-full')).toBe('on')
        expect(page().classList.contains('is-full')).toBe(true)
        expect(window.localStorage.getItem('di.monitor.full')).toBe('1')
        // the full screen is a history entry that carries #monitor-full (Back leaves it), pushed one tick after the click
        await waitFor(() => expect(window.location.hash).toBe('#monitor-full'))
        fireEvent.keyDown(window, { key: 'Escape' })
        expect(page().getAttribute('data-monitor-full')).toBe('off')
        expect(window.localStorage.getItem('di.monitor.full')).toBe('0')
        await waitFor(() => expect(window.location.hash).not.toBe('#monitor-full'))
    })

    it('Back leaves full screen, then the inspector, and the page stays', async () => {
        await open()
        fireEvent.click(screen.getByText('Full screen'))
        await waitFor(() => expect(window.location.hash).toBe('#monitor-full'))
        await act(async () => { window.history.back(); await new Promise((r) => setTimeout(r, 50)) })
        expect(page().getAttribute('data-monitor-full')).toBe('off')
        expect(page()).toBeTruthy()
    })

    it('starts in full screen from #monitor-full or from what the browser remembered', async () => {
        window.history.replaceState(null, '', '/#monitor-full')
        await open()
        expect(page().getAttribute('data-monitor-full')).toBe('on')
    })

    it('keys: 1 2 3 switch tabs, f toggles full screen, ? shows the card, none while typing', async () => {
        await open()
        fireEvent.keyDown(window, { key: '2' })
        expect(document.querySelector('[data-monitor-tab="map"]').getAttribute('aria-selected')).toBe('true')
        fireEvent.keyDown(window, { key: '3' })
        expect(document.querySelector('[data-monitor-tab="lists"]').getAttribute('aria-selected')).toBe('true')
        fireEvent.keyDown(window, { key: 'r' }) // r reads the server again; Refresh left the bar
        await waitFor(() => expect(getMonitor.mock.calls.length).toBeGreaterThan(1))
        expect(screen.queryByText('Refresh')).toBeNull()
        fireEvent.keyDown(window, { key: 'f' })
        expect(page().getAttribute('data-monitor-full')).toBe('on')
        fireEvent.keyDown(window, { key: '?' })
        expect(screen.getByRole('dialog', { name: 'Keys' })).toBeTruthy()
        fireEvent.keyDown(window, { key: 'Escape' })
        expect(screen.queryByRole('dialog', { name: 'Keys' })).toBeNull()
        // typing in the filter: the letters are text, not commands
        const filter = screen.getByLabelText('Filter every panel')
        filter.focus()
        fireEvent.keyDown(filter, { key: 'f' })
        fireEvent.keyDown(filter, { key: '1' })
        expect(page().getAttribute('data-monitor-full')).toBe('on')
        expect(document.querySelector('[data-monitor-tab="lists"]').getAttribute('aria-selected')).toBe('true')
        fireEvent.keyDown(window, { key: '/' })
        expect(document.activeElement).toBe(filter)
    })

    it('Needs you: one row per item, worst first, each with what, why and ONE action that opens the drawer', async () => {
        await open()
        const rows = [...document.querySelectorAll('[data-need-id]')]
        expect(rows.map((r) => r.getAttribute('data-need-id'))).toEqual(['service:broken.service', 'probe:https://prod.example', 'tier:prod', 'tier:local:aylmo']) // danger first
        const prod = document.querySelector('[data-need-id="tier:prod"]')
        expect(prod.querySelector('.monitor-need-what').textContent).toBe('prod is behind dev')
        expect(prod.querySelector('.monitor-need-why').textContent).toMatch(/12 commits behind/)
        expect(prod.querySelectorAll('button').length).toBe(1)
        expect(document.querySelector('.monitor-drawer')).toBeNull()
        fireEvent.click(prod.querySelector('button')) // one click from the need to its detail
        const drawer = document.querySelector('.monitor-drawer')
        expect(within(drawer).getByText('Inspector — prod')).toBeTruthy()
        expect(within(drawer).getByText('Dev commit')).toBeTruthy()
        expect(within(drawer).getByText('12 commits')).toBeTruthy()
    })

    it('Needs you says one calm line when nothing needs him', async () => {
        const calm = contract()
        calm.tiers.rows = calm.tiers.rows.filter((r) => r.id !== 'prod' && r.id !== 'local:aylmo')
        calm.panels.services.failed = 0
        calm.panels.services.rows = calm.panels.services.rows.filter((r) => r.active !== 'failed')
        calm.panels.network.rows = calm.panels.network.rows.map((r) => ({ ...r, ok: true, status: 200 }))
        await open(calm)
        expect(document.querySelector('.monitor-needs').textContent).toMatch(/^All well · checked \d+ s ago$/)
        expect(document.querySelector('[data-need-id]')).toBeNull()
    })

    it('a count shown in Needs you is not repeated as a headline: 12 appears once', async () => {
        await open()
        expect(document.body.textContent.match(/12 commits behind/g).length).toBe(1)
        expect(document.querySelector('[data-tier-id="prod"]').textContent).not.toMatch(/\d/)
    })

    it('the strip is one row of chips that read in plain words', async () => {
        await open()
        const strip = document.querySelector('.monitor-vital')
        expect(strip.textContent).toMatch(/Machines2 of 3/)
        expect(strip.textContent).toMatch(/Show gear1 of 2 ready/)
        expect(strip.textContent).toMatch(/Services2 of 3 running|Services.*running/)
        expect(strip.textContent).not.toMatch(/Things connected|workspace|lane/i)
        expect(document.querySelector('[data-tier-id="local:aylmo"]').textContent).toMatch(/this machine/)
    })

    it('a chip opens its list in the drawer, and a row of it opens its own detail', async () => {
        await open()
        fireEvent.click(document.querySelector('[data-count-id="machines"]'))
        const drawer = document.querySelector('.monitor-drawer')
        expect(within(drawer).getByText('Inspector — Machines')).toBeTruthy()
        expect(drawer.querySelectorAll('.monitor-dot').length).toBe(3)
        expect(drawer.querySelectorAll('.monitor-dot.tone-success').length).toBe(2)
        fireEvent.click(drawer.querySelector('[data-vital-row]'))
        expect(within(document.querySelector('.monitor-drawer')).getByText('Address')).toBeTruthy()
    })

    it('a tier chip opens the drawer; Esc and the cross close it; no empty inspector box', async () => {
        await open()
        expect(document.querySelector('.monitor-drawer')).toBeNull()
        fireEvent.click(document.querySelector('[data-tier-id="prod"]'))
        const drawer = document.querySelector('.monitor-drawer')
        expect(drawer).toBeTruthy()
        expect(within(drawer).getByText('Inspector — prod')).toBeTruthy()
        expect(within(drawer).getByText('12 behind dev')).toBeTruthy()
        fireEvent.keyDown(window, { key: 'Escape' })
        expect(document.querySelector('.monitor-drawer')).toBeNull()
        fireEvent.click(document.querySelector('[data-tier-id="dev"]'))
        fireEvent.click(screen.getByLabelText('Close inspector'))
        expect(document.querySelector('.monitor-drawer')).toBeNull()
    })

    it('Activity shows live changes on top and earlier items from the snapshot below, never empty', async () => {
        vi.stubGlobal('EventSource', FakeEventSource)
        await open()
        expect(screen.getByText(/Nothing new since you opened/)).toBeTruthy()
        expect(document.querySelectorAll('[data-activity="earlier"] .monitor-event').length).toBeGreaterThan(0)
        const next = contract()
        next.panels.agents.rows[0].status = 'idle'
        next.asks.rows.push({ id: 'N3', state: 'open', touched: new Date().toISOString(), text: 'light the hall', source: 'page' })
        await act(async () => { FakeEventSource.instances[0].emit(next) })
        const items = [...document.querySelectorAll('[data-activity="live"] .monitor-event-text')].map((n) => n.textContent)
        expect(items).toContain("agent 'Build the monitor' busy → idle")
        expect(items).toContain('new ask: light the hall')
        expect(items.length).toBe(2)
    })

    it('Enter sends the ask, Shift+Enter is a new line', async () => {
        postMonitorAsk.mockResolvedValue({ id: 'N9' })
        await open()
        const box = screen.getByLabelText('Send an ask')
        fireEvent.change(box, { target: { value: 'line one' } })
        fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })
        expect(postMonitorAsk).not.toHaveBeenCalled()
        fireEvent.keyDown(box, { key: 'Enter' })
        expect(postMonitorAsk).toHaveBeenCalledWith('line one')
        expect(screen.getByText('line one')).toBeTruthy()
    })

    it('reports show a freshness bar', async () => {
        await open()
        fireEvent.click(document.querySelector('[data-monitor-tab="lists"]'))
        expect(document.querySelector('[data-report-host="r-di"] .monitor-fresh i').style.width).not.toBe('0%')
        expect(document.querySelector('[data-report-host="asuz"] .monitor-fresh i').style.width).toBe('0%')
    })
})
