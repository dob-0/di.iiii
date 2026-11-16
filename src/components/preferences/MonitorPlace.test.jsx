import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../services/apiClient.js', () => ({
    getMonitor: vi.fn(),
    monitorStreamUrl: () => '/api/monitor/stream',
    postMonitorAsk: vi.fn()
}))

import { getMonitor } from '../../services/apiClient.js'
import MonitorSection from './MonitorSection.jsx'

// made-up data: two tiers (prod behind dev, so one thing needs him), a failed service, one busy agent
const snapshot = () => ({
    generatedAt: new Date().toISOString(),
    host: 'hostA',
    configured: true,
    panels: {
        machines: { ok: true, online: 1, total: 2, rows: [
            { id: 'm1', name: 'box-one', os: 'linux', ip: '10.0.0.1', online: true, lastSeen: null, tx: 1, rx: 1 },
            { id: 'm2', name: 'box-two', os: 'linux', ip: '10.0.0.2', online: false, lastSeen: null, tx: 0, rx: 0 }
        ] },
        network: { ok: true, up: 1, total: 1, rows: [{ id: 'p1', name: 'probe one', url: 'https://one.example', status: 200, ms: 10, ok: true }] },
        agents: { ok: true, live: 1, busy: 1, total: 1, rows: [
            { account: 'a', sessionId: 'aaaaaaaa-1', title: 'Fake builder', status: 'busy', kind: 'interactive', branch: 'feat/x', cwd: '/w', model: 'm', lastActivity: new Date().toISOString() }
        ] },
        services: { ok: true, running: 1, failed: 1, rows: [{ unit: 'one.service', active: 'failed', sub: 'failed', description: 'made up' }] },
        connected: { ok: true, live: 0, total: 0, rows: [] },
        rules: { ok: true, count: 3, rows: [] },
        presence: { ok: true, people: 0, places: 0, rows: [] },
        pullRequests: { ok: true, open: 1, drafts: 0, rows: [{ number: 7, title: 'Fake PR', branch: 'feat/y', draft: false, updatedAt: new Date().toISOString(), url: 'https://example.invalid/7' }] }
    },
    tiers: { ok: true, rows: [
        { id: 'prod', url: 'https://prod.example', status: 'ok', ms: 90, commit: 'aaaaaaa1111', builtAt: '2026-11-10T00:00:00Z', behindDev: 12 },
        { id: 'dev', source: 'self', url: 'https://dev.example', status: 'ok', ms: 120, commit: 'bbbbbbb2222', builtAt: new Date().toISOString(), behindDev: 0 }
    ] },
    reports: [{ host: 'hostB', reportedAt: new Date().toISOString(), stale: false, panels: { agents: { live: 1 } } }],
    spaces: { ok: true, rows: [] },
    asks: { ok: true, rows: [] },
    map: {
        nodes: [
            { id: 'machine:hostA', kind: 'machine', label: 'hostA', state: 'ok' },
            { id: 'tier:dev', kind: 'tier', label: 'dev', state: 'ok' },
            { id: 'space:demo', kind: 'space', label: 'demo', state: 'ok' }
        ],
        edges: [{ from: 'machine:hostA', to: 'tier:dev', kind: 'runs' }, { from: 'tier:dev', to: 'space:demo', kind: 'holds' }]
    }
})

class FakeEventSource {
    constructor() { this.readyState = 1 }
    addEventListener() {}
    removeEventListener() {}
    close() {}
}

const wait = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })

describe('Monitor, one place', () => {
    beforeEach(() => {
        getMonitor.mockReset()
        getMonitor.mockResolvedValue(snapshot())
        vi.stubGlobal('EventSource', FakeEventSource)
        try { window.localStorage.clear() } catch { /* none */ }
        window.history.replaceState(null, '', '/')
    })
    afterEach(() => { vi.unstubAllGlobals() })

    const open = async (props = {}) => {
        render(<MonitorSection {...props} />)
        await waitFor(() => screen.getByLabelText('Vital signs'))
        await wait(10)
    }

    it('"place" is the default: a rail, the stage and the ask line, no tabs', async () => {
        await open()
        expect(document.querySelector('[data-monitor-layout="place"]')).toBeTruthy()
        expect(document.querySelector('[data-box="rail"]')).toBeTruthy()
        expect(document.querySelector('[data-box="stage"] [data-monitor-map]')).toBeTruthy()
        expect(document.querySelector('[data-box="askline"] textarea')).toBeTruthy()
        expect(document.querySelector('[data-monitor-tab]')).toBeNull()
        // the worst need sits in the rail with its action
        expect(document.querySelector('[data-box="rail"] [data-needs="rows"] .mp-alert-go')).toBeTruthy()
        // the dock has the agent
        expect(document.querySelector('[data-box="dock"]').textContent).toContain('Fake builder')
    })

    it('a knowledge node opens its Work list in the panel, and Back closes the panel', async () => {
        await open()
        const know = document.querySelector('[data-map-node^="know:"]')
        expect(know).toBeTruthy()
        fireEvent.click(know)
        await wait(30)
        const panel = document.querySelector('[data-box="panel"]')
        expect(panel).toBeTruthy()
        expect(panel.querySelector('[data-work]')).toBeTruthy()
        expect(document.querySelector('[data-monitor-tab]')).toBeNull()
        await act(async () => { window.history.back(); await new Promise((r) => setTimeout(r, 60)) })
        expect(document.querySelector('[data-box="panel"]')).toBeNull()
    })

    it('a rail chip opens its list in the panel and the x closes it', async () => {
        await open()
        fireEvent.click(document.querySelector('[data-box="rail"] [data-vital-id="prs"]'))
        await wait(20)
        expect(document.querySelector('[data-box="panel"] [data-panel="prs"]')).toBeTruthy()
        fireEvent.click(screen.getByLabelText('Close panel'))
        await wait(20)
        expect(document.querySelector('[data-box="panel"]')).toBeNull()
    })

    it('a map node opens its detail in the panel, Esc closes it', async () => {
        await open()
        fireEvent.click(document.querySelector('[data-map-node="space:demo"]'))
        expect(screen.getByText('Inspector — demo')).toBeTruthy()
        fireEvent.keyDown(window, { key: 'Escape' })
        await wait(20)
        expect(document.querySelector('[data-box="panel"]')).toBeNull()
    })

    it('the toggle in the rail switches to tabs and back, and remembers the choice', async () => {
        await open()
        fireEvent.click(document.querySelector('[data-layout-toggle="tabs"]'))
        await waitFor(() => expect(document.querySelector('[data-monitor-tab="map"]')).toBeTruthy())
        expect(document.querySelector('[data-monitor-layout="place"]')).toBeNull()
        expect(window.localStorage.getItem('di.monitor.layout')).toBe('tabs')
        fireEvent.click(document.querySelector('[data-layout-toggle="place"]'))
        await waitFor(() => expect(document.querySelector('[data-monitor-layout="place"]')).toBeTruthy())
        expect(window.localStorage.getItem('di.monitor.layout')).toBe('place')
    })

    it('starts in tabs when the stored choice says so, and the layout prop overrides it', async () => {
        window.localStorage.setItem('di.monitor.layout', 'tabs')
        const first = render(<MonitorSection />)
        await waitFor(() => expect(document.querySelector('[data-monitor-tab="map"]')).toBeTruthy())
        first.unmount()
        render(<MonitorSection layout="place" />)
        await waitFor(() => expect(document.querySelector('[data-monitor-layout="place"]')).toBeTruthy())
    })

    it('falls back to "place" when storage throws', async () => {
        const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
        const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
        await open()
        expect(document.querySelector('[data-monitor-layout="place"]')).toBeTruthy()
        fireEvent.click(document.querySelector('[data-layout-toggle="tabs"]'))
        await waitFor(() => expect(document.querySelector('[data-monitor-tab="map"]')).toBeTruthy())
        get.mockRestore(); set.mockRestore()
    })
})
