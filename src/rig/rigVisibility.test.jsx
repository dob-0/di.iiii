import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { describeRigRows, readRigVisibility } from './rigVisibility.js'

// The desk reads machines from the machine link; stand it in with one machine
// so the panel renders its body, and answer /api/rig/visibility per test.
let rigAnswer = null
vi.mock('../project/tops/useMachinePresence.js', () => ({
    useMachinePresence: () => ({ machine: { id: 'm1', name: 'ponyo' }, machines: [{ id: 'm1', name: 'ponyo', self: true, devices: [], pages: 1 }], link: null })
}))
vi.mock('../services/apiClient.js', () => ({
    apiFetch: vi.fn(async () => {
        if (rigAnswer instanceof Error) throw rigAnswer
        return rigAnswer
    })
}))

const { default: DeskPanelWindow } = await import('../raw/components/DeskPanelWindow.jsx')

const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { status })

afterEach(() => { cleanup(); rigAnswer = null })

describe('readRigVisibility', () => {
    it('reads the answer, a 403 as refused, and anything else as nothing to say', async () => {
        expect(await readRigVisibility({ fetchImpl: async () => ({ visible: true }) })).toEqual({ state: 'answer', visibility: { visible: true } })
        expect(await readRigVisibility({ fetchImpl: async () => { throw httpError(403) } })).toEqual({ state: 'refused' })
        expect(await readRigVisibility({ fetchImpl: async () => { throw httpError(404) } })).toEqual({ state: 'none' })
        expect(await readRigVisibility({ fetchImpl: async () => { throw new Error('offline') } })).toEqual({ state: 'none' })
        expect(await readRigVisibility({ fetchImpl: async () => ({ something: 'else' }) })).toEqual({ state: 'none' })
    })
})

describe('describeRigRows', () => {
    it('private: the honest row, and what it heard', () => {
        const rows = describeRigRows({ state: 'answer', visibility: { visible: false, nearby: [{ id: 'a', name: 'aylmo', address: '192.168.88.231', open: true }] } })
        expect(rows.map((r) => r.text)).toEqual([
            'this machine is private — other di.iiii on the network can\'t see it · di up --lan',
            '1 other di.iiii on this network: 192.168.88.231 (aylmo)'
        ])
    })

    it('open: one row per private copy heard, and nothing at all when there is none', () => {
        expect(describeRigRows({ state: 'answer', visibility: { visible: true, nearby: [] } })).toEqual([])
        const rows = describeRigRows({ state: 'answer', visibility: { visible: true, nearby: [{ id: 'p', name: 'ponyo', address: '192.168.88.125', open: false }] } })
        expect(rows.map((r) => r.text)).toEqual(['a di.iiii at 192.168.88.125 (ponyo) is on this network but private'])
    })

    it('refused: the page is on another machine and the copy serving it is private', () => {
        expect(describeRigRows({ state: 'refused' })[0].text).toMatch(/serving this page is private/)
    })

    it('a hosted tier or an older server says nothing', () => {
        expect(describeRigRows({ state: 'none' })).toEqual([])
        expect(describeRigRows(null)).toEqual([])
    })
})

describe('the desk shows it', () => {
    it('a private copy: the row sits above the machines, in the hint style', async () => {
        rigAnswer = { visible: false, reason: 'loopback', discovery: 'off', nearby: [] }
        const { container } = render(<DeskPanelWindow spaceId="stage" />)
        await waitFor(() => expect(container.querySelector('[data-rig-visibility="private"]')).not.toBeNull())
        const row = container.querySelector('[data-rig-visibility="private"]')
        expect(row.className).toBe('raw-desk-hint')
        expect(row.textContent).toBe('this machine is private — other di.iiii on the network can\'t see it · di up --lan')
    })

    it('an open copy that heard a private one names it', async () => {
        rigAnswer = { visible: true, nearby: [{ id: 'p', name: 'ponyo', address: '192.168.88.125', open: false }] }
        const { findByText } = render(<DeskPanelWindow spaceId="stage" />)
        expect(await findByText('a di.iiii at 192.168.88.125 (ponyo) is on this network but private')).toBeTruthy()
    })

    it('a hosted tier (404): no row', async () => {
        rigAnswer = httpError(404)
        const { container } = render(<DeskPanelWindow spaceId="stage" />)
        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(container.querySelector('[data-rig-visibility]')).toBeNull()
    })
})
