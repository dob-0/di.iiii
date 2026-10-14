// The phones-and-headsets panel on the local home. A page test in jsdom: no
// WebGL, no server. What it guards is the promise on the panel — a QR code is
// drawn only for a real https address this machine answers on, and every
// other state says why in words and names the setting or command.
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../studio/components/SpaceHub.jsx', () => ({ default: () => <div data-testid="space-hub" /> }))
vi.mock('../services/serverSpaces.js', () => ({ listServerSpaces: () => Promise.resolve([]) }))
const apiFetch = vi.hoisted(() => vi.fn())
vi.mock('../services/apiClient.js', () => ({ apiFetch }))

import GuestAddressPanel from './GuestAddressPanel.jsx'
import LocalHome from './LocalHome.jsx'

const base = {
    lan: true,
    lanAddresses: ['192.168.1.20'],
    guests: false,
    setting: '~/.di/tls/cert.pem (its key beside it, ~/.di/tls/key.pem)',
    command: 'di up --lan',
    guestsCommand: 'di up --lan --guests',
    pointsAt: [],
    pointsHere: null,
    lookupError: null
}
const READY = { ...base, state: 'ready', name: 'local.thedi.studio', address: 'https://local.thedi.studio/', pointsAt: ['192.168.1.20'], pointsHere: true }

const show = (guest) => render(<GuestAddressPanel load={() => Promise.resolve(guest)} />)
const qr = () => document.querySelector('svg.qr-code')

describe('GuestAddressPanel', () => {
    it('ready: the address, its QR code, and who it is for', async () => {
        show(READY)
        expect(await screen.findByRole('link', { name: 'https://local.thedi.studio/' })).toHaveAttribute('href', 'https://local.thedi.studio/')
        expect(qr()).not.toBeNull()
        expect(qr().getAttribute('data-qr-value')).toBe('https://local.thedi.studio/')
        expect(screen.getByText(/phone, a headset or a guest’s laptop in this place/)).toBeInTheDocument()
        expect(screen.getByText(/points at 192\.168\.1\.20, this machine/)).toBeInTheDocument()
        // auth off: said, with the command that turns guests into guests
        expect(screen.getByText('di up --lan --guests')).toBeInTheDocument()
    })

    it('ready with auth on: no auth-off warning', async () => {
        show({ ...READY, guests: true })
        await screen.findByRole('link', { name: 'https://local.thedi.studio/' })
        expect(screen.queryByText(/Auth is off/)).toBeNull()
    })

    it('no certificate: no address, no code, the setting named', async () => {
        show({ ...base, state: 'no-certificate', address: null, name: null })
        expect(await screen.findByText(/no HTTPS name/)).toBeInTheDocument()
        expect(screen.getByText(base.setting)).toBeInTheDocument()
        expect(qr()).toBeNull()
        expect(screen.queryByRole('link')).toBeNull()
    })

    it('wildcard: says the name covers no one machine', async () => {
        show({ ...base, state: 'wildcard', address: null, name: '*.thedi.studio' })
        expect(await screen.findByText('*.thedi.studio')).toBeInTheDocument()
        expect(qr()).toBeNull()
    })

    it('loopback-only start: the address, no code, and the command', async () => {
        show({ ...READY, state: 'not-on-network', lan: false, pointsHere: null, pointsAt: [] })
        expect(await screen.findByText(/Phones cannot reach this machine/)).toBeInTheDocument()
        expect(screen.getByText('di up --lan')).toBeInTheDocument()
        expect(qr()).toBeNull()
    })

    it('a name that points elsewhere gets no code', async () => {
        show({ ...READY, pointsHere: false, pointsAt: ['127.0.0.1'] })
        expect(await screen.findByText(/points at 127\.0\.0\.1, not at this machine/)).toBeInTheDocument()
        expect(qr()).toBeNull()
    })

    it('an older di that has no route says so', async () => {
        render(<GuestAddressPanel load={() => Promise.reject(Object.assign(new Error('nf'), { status: 404 }))} />)
        expect(await screen.findByText(/older than this page/)).toBeInTheDocument()
        expect(qr()).toBeNull()
    })

    it('asks the server at /api/guest-address by default', async () => {
        apiFetch.mockResolvedValueOnce({ guest: READY })
        render(<GuestAddressPanel />)
        await screen.findByRole('link', { name: 'https://local.thedi.studio/' })
        expect(apiFetch).toHaveBeenCalledWith('/api/guest-address')
    })
})

describe('LocalHome: the door to the panel', () => {
    it('closed at first; the bar button opens and closes it', async () => {
        apiFetch.mockResolvedValue({ guest: READY })
        render(<LocalHome />)
        const door = screen.getByRole('button', { name: /Phones & headsets/ })
        expect(door).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByRole('heading', { name: 'Phones and headsets in this place' })).toBeNull()
        fireEvent.click(door)
        expect(await screen.findByRole('heading', { name: 'Phones and headsets in this place' })).toBeInTheDocument()
        expect(await screen.findByRole('link', { name: 'https://local.thedi.studio/' })).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Close' }))
        expect(screen.queryByRole('heading', { name: 'Phones and headsets in this place' })).toBeNull()
    })

    it('#join opens it straight away', async () => {
        apiFetch.mockResolvedValue({ guest: READY })
        window.history.replaceState(null, '', '/#join')
        try {
            render(<LocalHome />)
            expect(await screen.findByRole('heading', { name: 'Phones and headsets in this place' })).toBeInTheDocument()
        } finally {
            window.history.replaceState(null, '', '/')
        }
    })
})
