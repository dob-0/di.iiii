// The Wifi panel's three states, in jsdom: no server, no network. A code is drawn only while open.
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../services/apiClient.js', () => ({ apiFetch: vi.fn(() => Promise.resolve({ guest: null })) }))

import WifiPanel from './WifiPanel.jsx'

const PRIVATE = { open: false, name: 'dob-a3f9.l.di-studio.xyz', address: null, port: null, since: null }
const OPENED = { open: true, name: 'dob-a3f9.l.di-studio.xyz', address: '192.168.1.20', port: 443, since: 'now' }
const qr = () => document.querySelector('svg.qr-code')

describe('WifiPanel', () => {
    it('private: says the name, offers Open door, draws no code', async () => {
        render(<WifiPanel load={() => Promise.resolve(PRIVATE)} />)
        expect(await screen.findByText(/nothing listens on the wifi yet/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Open door' })).toBeInTheDocument()
        expect(qr()).toBeNull()
    })
    it('Open door opens it: the code, the address, the follow line and Close door', async () => {
        const open = vi.fn(() => Promise.resolve(OPENED))
        render(<WifiPanel load={() => Promise.resolve(PRIVATE)} open={open} />)
        fireEvent.click(await screen.findByRole('button', { name: 'Open door' }))
        expect(await screen.findByRole('button', { name: 'Close door' })).toBeInTheDocument()
        expect(open).toHaveBeenCalled()
        expect(qr().getAttribute('data-qr-value')).toBe('https://dob-a3f9.l.di-studio.xyz/')
        expect(screen.getByText('di follow <space> --from dob-a3f9')).toBeInTheDocument()
    })
    it('open with another port: the code holds the port', async () => {
        render(<WifiPanel load={() => Promise.resolve({ ...OPENED, port: 4001 })} />)
        await screen.findByRole('button', { name: 'Close door' })
        expect(qr().getAttribute('data-qr-value')).toBe('https://dob-a3f9.l.di-studio.xyz:4001/')
    })
    it('Close door closes it: back to private, no code', async () => {
        const close = vi.fn(() => Promise.resolve(PRIVATE))
        render(<WifiPanel load={() => Promise.resolve(OPENED)} close={close} />)
        fireEvent.click(await screen.findByRole('button', { name: 'Close door' }))
        expect(await screen.findByRole('button', { name: 'Open door' })).toBeInTheDocument()
        expect(qr()).toBeNull()
    })
    it('a refusal is said in words, and the state stays', async () => {
        const open = vi.fn(() => Promise.reject(Object.assign(new Error('x'), { data: { message: 'This machine is not on a network.' } })))
        render(<WifiPanel load={() => Promise.resolve(PRIVATE)} open={open} />)
        fireEvent.click(await screen.findByRole('button', { name: 'Open door' }))
        expect(await screen.findByRole('alert')).toHaveTextContent('not on a network')
        expect(screen.getByRole('button', { name: 'Open door' })).toBeInTheDocument()
    })
    it('no name yet: the older panel that names the missing setting', async () => {
        render(<WifiPanel load={() => Promise.resolve({ open: false, name: null })} />)
        expect(await screen.findByRole('heading', { name: 'Phones and headsets in this place' })).toBeInTheDocument()
    })
})
