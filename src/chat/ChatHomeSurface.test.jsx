import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChatHomeSurface from './ChatHomeSurface.jsx'

// Walked as a plain visitor on 2026-09-11: the + button is offered to a guest,
// the server answers 401 with the real reason, and the list drew "Nobody yet.
// You can write to people who share a space with you." over it — a door with
// the wrong sign on it, and no way to guess the right one.

vi.mock('../hooks/useAuthSession.js', () => ({
    default: () => ({ authenticated: true, type: 'guest', label: 'Guest', subject: 'guest:abc' })
}))

vi.mock('../utils/appNavigate.js', () => ({ appNavigate: vi.fn() }))

vi.mock('./privateChatIndex.js', () => ({
    listRememberedConversations: () => [],
    readRoomSeen: () => 0
}))

const answer = (status, body) => Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body)
})

const openThePicker = async () => {
    const plus = await screen.findByLabelText('Start a private conversation')
    plus.click()
}

beforeEach(() => {
    navigator.serviceWorker?.register?.mockClear?.()
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('the people picker', () => {
    it('gives a guest the reason the server gave, not "nobody shares a space with you"', async () => {
        vi.stubGlobal('fetch', vi.fn((url) => (String(url).includes('/api/dm/people')
            ? answer(401, { error: 'Sign in with an account to talk privately.' })
            : answer(200, { rooms: [] }))))

        render(<ChatHomeSurface />)
        await openThePicker()

        expect(await screen.findByText('Sign in with an account to talk privately.')).toBeInTheDocument()
        expect(screen.queryByText(/Nobody yet/)).not.toBeInTheDocument()
    })

    it('still says "nobody yet" when the list is genuinely empty', async () => {
        vi.stubGlobal('fetch', vi.fn((url) => (String(url).includes('/api/dm/people')
            ? answer(200, { people: [] })
            : answer(200, { rooms: [] }))))

        render(<ChatHomeSurface />)
        await openThePicker()

        await waitFor(() => expect(screen.getByText(/Nobody yet/)).toBeInTheDocument())
    })
})
