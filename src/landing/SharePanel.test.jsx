// The Share panel's three states, in jsdom: no server, no network. A code is drawn only while shared.
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../services/apiClient.js', () => ({ apiFetch: vi.fn(() => Promise.resolve({ guest: null })) }))

import SharePanel from './SharePanel.jsx'

const PRIVATE = { shared: false, name: 'dob-a3f9.di-studio.xyz', address: null, port: null, since: null }
const SHARED = { shared: true, name: 'dob-a3f9.di-studio.xyz', address: '192.168.1.20', port: 443, since: 'now' }
const qr = () => document.querySelector('svg.qr-code')

describe('SharePanel', () => {
    it('private: says the name, offers Share, draws no code', async () => {
        render(<SharePanel load={() => Promise.resolve(PRIVATE)} />)
        expect(await screen.findByText(/nothing listens on the wifi yet/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
        expect(qr()).toBeNull()
    })
    it('Share opens it: the code, the address, the follow line and Unshare', async () => {
        const open = vi.fn(() => Promise.resolve(SHARED))
        render(<SharePanel load={() => Promise.resolve(PRIVATE)} open={open} />)
        fireEvent.click(await screen.findByRole('button', { name: 'Share' }))
        expect(await screen.findByRole('button', { name: 'Unshare' })).toBeInTheDocument()
        expect(open).toHaveBeenCalled()
        expect(qr().getAttribute('data-qr-value')).toBe('https://dob-a3f9.di-studio.xyz/')
        expect(screen.getByText('di follow <space> --from dob-a3f9')).toBeInTheDocument()
    })
    it('shared with another port: the code holds the port', async () => {
        render(<SharePanel load={() => Promise.resolve({ ...SHARED, port: 4001 })} />)
        await screen.findByRole('button', { name: 'Unshare' })
        expect(qr().getAttribute('data-qr-value')).toBe('https://dob-a3f9.di-studio.xyz:4001/')
    })
    it('Unshare closes it: back to private, no code', async () => {
        const close = vi.fn(() => Promise.resolve(PRIVATE))
        render(<SharePanel load={() => Promise.resolve(SHARED)} close={close} />)
        fireEvent.click(await screen.findByRole('button', { name: 'Unshare' }))
        expect(await screen.findByRole('button', { name: 'Share' })).toBeInTheDocument()
        expect(qr()).toBeNull()
    })
    it('a refusal is said in words, and the state stays', async () => {
        const open = vi.fn(() => Promise.reject(Object.assign(new Error('x'), { data: { message: 'This machine is not on a network.' } })))
        render(<SharePanel load={() => Promise.resolve(PRIVATE)} open={open} />)
        fireEvent.click(await screen.findByRole('button', { name: 'Share' }))
        expect(await screen.findByRole('alert')).toHaveTextContent('not on a network')
        expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
    })
    it('no name yet: the older panel that names the missing setting', async () => {
        render(<SharePanel load={() => Promise.resolve({ shared: false, name: null })} />)
        expect(await screen.findByRole('heading', { name: 'Phones and headsets in this place' })).toBeInTheDocument()
    })
})
