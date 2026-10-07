import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../services/serverSpaces.js', () => ({
    listSpaceDomains: vi.fn(),
    addSpaceDomain: vi.fn(),
    checkSpaceDomain: vi.fn(),
    removeSpaceDomain: vi.fn()
}))

import SpaceDomainPanel from './SpaceDomainPanel.jsx'
import { listSpaceDomains, addSpaceDomain, removeSpaceDomain } from '../../services/serverSpaces.js'

const PUBLIC = { id: 'taronx', isPublic: true }
const PENDING = {
    hostname: 'yokozo.xyz',
    state: 'pending',
    live: false,
    records: [{ type: 'CNAME', name: 'yokozo.xyz', value: 'domains.diiii.xyz' }],
    lastError: null
}

beforeEach(() => { vi.clearAllMocks() })

describe('SpaceDomainPanel', () => {
    it('shows a pending domain with the record still to add', async () => {
        listSpaceDomains.mockResolvedValue({ domains: [PENDING], connected: true })
        render(<SpaceDomainPanel space={PUBLIC} onClose={() => {}} />)
        expect(await screen.findByText('yokozo.xyz', { selector: 'strong' })).toBeTruthy()
        expect(screen.getByText('Waiting for DNS')).toBeTruthy()
        expect(screen.getByText('domains.diiii.xyz')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Check now' })).toBeTruthy()
    })

    it('shows a live domain as a link and owes nothing', async () => {
        listSpaceDomains.mockResolvedValue({ domains: [{ ...PENDING, state: 'active', live: true }], connected: true })
        render(<SpaceDomainPanel space={PUBLIC} onClose={() => {}} />)
        expect(await screen.findByText('Live')).toBeTruthy()
        expect(screen.getByRole('link', { name: 'https://yokozo.xyz' }).getAttribute('href')).toBe('https://yokozo.xyz/')
        expect(screen.queryByText('domains.diiii.xyz')).toBe(null)
        expect(screen.queryByRole('button', { name: 'Check now' })).toBe(null)
    })

    it('adds a domain the owner types', async () => {
        listSpaceDomains.mockResolvedValue({ domains: [], connected: true })
        addSpaceDomain.mockResolvedValue(PENDING)
        render(<SpaceDomainPanel space={PUBLIC} onClose={() => {}} />)
        fireEvent.change(await screen.findByLabelText('Domain'), { target: { value: ' yokozo.xyz ' } })
        fireEvent.click(screen.getByRole('button', { name: 'Add domain' }))
        await waitFor(() => expect(addSpaceDomain).toHaveBeenCalledWith('taronx', 'yokozo.xyz'))
        expect(await screen.findByText('Waiting for DNS')).toBeTruthy()
    })

    it('says the server’s reason when a domain is refused', async () => {
        listSpaceDomains.mockResolvedValue({ domains: [], connected: true })
        const refusal = Object.assign(new Error('platform_hostname'), { data: { message: 'dev.diiii.xyz is one of di.iiii’s own addresses.' } })
        addSpaceDomain.mockRejectedValue(refusal)
        render(<SpaceDomainPanel space={PUBLIC} onClose={() => {}} />)
        fireEvent.change(await screen.findByLabelText('Domain'), { target: { value: 'dev.diiii.xyz' } })
        fireEvent.click(screen.getByRole('button', { name: 'Add domain' }))
        expect(await screen.findByText('dev.diiii.xyz is one of di.iiii’s own addresses.')).toBeTruthy()
    })

    it('removes a domain', async () => {
        listSpaceDomains.mockResolvedValue({ domains: [PENDING], connected: true })
        removeSpaceDomain.mockResolvedValue({ removed: 'yokozo.xyz' })
        render(<SpaceDomainPanel space={PUBLIC} onClose={() => {}} />)
        fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))
        await waitFor(() => expect(screen.queryByText('yokozo.xyz', { selector: 'strong' })).toBe(null))
        expect(removeSpaceDomain).toHaveBeenCalledWith('taronx', 'yokozo.xyz')
    })

    it('asks for a public space before offering to add', async () => {
        listSpaceDomains.mockResolvedValue({ domains: [], connected: true })
        render(<SpaceDomainPanel space={{ id: 'taronx', isPublic: false }} onClose={() => {}} />)
        expect(await screen.findByText(/Make the space public first/)).toBeTruthy()
        expect(screen.queryByLabelText('Domain')).toBe(null)
    })
})
