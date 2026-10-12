import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import DeviceLoginPage, { CODE_ALPHABET, formatUserCode, plainText, relativeTime, toMillis } from './DeviceLoginPage.jsx'
import { clearServerUnavailable } from '../services/apiClient.js'
import { REQUEST_TIMEOUT_MS } from '../services/cliLoginApi.js'
import { APP_PAGE_DEVICE, getAppLocationState, isReservedAppSegment } from '../utils/spaceRouting.js'

// The browser half of `di login`, built against the wire format in
// docs/architecture/CLI_LOGIN.md. The server is written elsewhere, so every
// answer here is a stub on the global fetch — the real apiFetch still runs, which
// is what makes the status codes and error bodies arrive the way they will.

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(srcDir, rel), 'utf8')

const mockSession = vi.fn()
vi.mock('../hooks/useAuthSession.js', () => ({
    default: () => mockSession()
}))

// The existing sign-in surface, reduced to a marker that records what /device
// handed it.
const surface = vi.hoisted(() => ({ props: null }))
vi.mock('../components/AuthGate.jsx', () => ({
    SignInSurface: (props) => {
        surface.props = props
        return <div data-testid="sign-in-surface">the sign-in surface</div>
    }
}))

const account = (overrides = {}) => ({
    requireAuth: true,
    local: false,
    authenticated: true,
    type: 'session',
    label: 'Taron',
    loading: false,
    error: null,
    refresh: vi.fn(),
    ...overrides
})
const guest = () => account({ type: 'guest', label: 'Guest' })
const signedOut = () => account({ authenticated: false, type: null, label: null })

// ── a stub server ───────────────────────────────────────────────────────────

const NOW = Date.parse('2026-10-07T12:00:00Z')
const LOOKUP = 'POST /api/auth/device/lookup'
const DECISION = 'POST /api/auth/device/decision'
const TOKENS = 'GET /api/auth/cli/tokens'

const reply = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body
})

let routes
let fetchMock

const keyOf = (url, init = {}) => `${init.method || 'GET'} ${String(url).slice(String(url).indexOf('/api/'))}`
const route = (key, handler) => { routes[key] = handler }
const calls = (key) => fetchMock.mock.calls
    .filter(([url, init]) => keyOf(url, init) === key)
    .map(([, init]) => ({ init, json: init?.body ? JSON.parse(init.body) : undefined }))

const lookupAnswer = (overrides = {}) => ({
    label: 'taron-laptop (di 0.4.17)',
    requestedAt: NOW - 2 * 60 * 1000,
    expiresAt: NOW + 8 * 60 * 1000,
    from: '203.0.x.x',
    ...overrides
})

const deferred = () => {
    let resolve
    const promise = new Promise((done) => { resolve = done })
    return { promise, resolve }
}

beforeEach(() => {
    clearServerUnavailable()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    routes = { [TOKENS]: () => reply(200, { tokens: [] }) }
    fetchMock = vi.fn((url, init = {}) => {
        const handler = routes[keyOf(url, init)]
        if (!handler) return Promise.reject(new Error(`no stub for ${keyOf(url, init)}`))
        return Promise.resolve().then(() => handler(init))
    })
    vi.stubGlobal('fetch', fetchMock)
    mockSession.mockReturnValue(account())
    surface.props = null
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    mockSession.mockReset()
    window.history.replaceState(null, '', '/')
    document.head.querySelectorAll('meta[name="robots"]').forEach((meta) => meta.remove())
})

const codeField = () => screen.getByLabelText('Code from the terminal')

// Types the code the way a person does, and presses Enter.
const submitCode = async (user, text = 'bdfghjkl') => {
    await user.type(codeField(), `${text}{Enter}`)
}

const reachQuestion = async (user, answer = lookupAnswer()) => {
    route(LOOKUP, () => reply(200, answer))
    render(<DeviceLoginPage />)
    await submitCode(user)
    return screen.findByRole('heading', { name: 'A terminal asked to sign in as you' })
}

const APPROVED = 'Signed in. You can close this tab and go back to the terminal.'
const DENIED = 'Denied. Nothing was signed in.'

// ── the address ─────────────────────────────────────────────────────────────

describe('/device is its own address', () => {
    it('is routed as a page, and no space can take the word', () => {
        expect(getAppLocationState({ pathname: '/device', search: '' }).page).toBe(APP_PAGE_DEVICE)
        expect(getAppLocationState({ pathname: '/device/', search: '' }).page).toBe(APP_PAGE_DEVICE)
        expect(isReservedAppSegment('device')).toBe(true)
    })

    it('names itself in the tab, Sentence case', () => {
        render(<DeviceLoginPage />)
        expect(document.title).toBe('Terminal sign-in — di.iiii')
    })

    it('asks search engines to leave it out, and only while it is open', () => {
        const view = render(<DeviceLoginPage />)
        expect(document.head.querySelector('meta[name="robots"][content="noindex"]')).not.toBeNull()
        view.unmount()
        expect(document.head.querySelector('meta[name="robots"]')).toBeNull()
    })

    // RFC 8628 §5.4: a link that carries the code is how someone gets another
    // person to approve THEIR terminal. Nothing is read from the address.
    it('never takes the code from the address', () => {
        window.history.replaceState(null, '', '/device?code=BDFG-HJKL&user_code=BDFG-HJKL')
        render(<DeviceLoginPage />)
        expect(codeField()).toHaveValue('')
        expect(calls(LOOKUP)).toHaveLength(0)
    })
})

// ── who is looking ──────────────────────────────────────────────────────────

describe('before there is an account', () => {
    it('says it is checking the session, and asks the server nothing yet', () => {
        mockSession.mockReturnValue(account({ loading: true }))
        render(<DeviceLoginPage />)
        expect(screen.getByText('Checking your session…')).toBeInTheDocument()
        expect(screen.queryByLabelText('Code from the terminal')).toBeNull()
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it.each([
        ['signed out', signedOut],
        ['a guest', guest]
    ])('shows the sign-in surface to %s, with the reason, and no code form', async (_name, session) => {
        mockSession.mockReturnValue(session())
        render(<DeviceLoginPage />)

        expect(screen.getByText('Sign in with your account to approve a terminal.')).toBeInTheDocument()
        expect(await screen.findByTestId('sign-in-surface')).toBeInTheDocument()
        expect(screen.queryByLabelText('Code from the terminal')).toBeNull()
        expect(screen.queryByText('Terminals signed in as you')).toBeNull()
        // Nothing about codes or terminals is asked of the server for someone who cannot approve.
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('puts the person back on this screen once they have signed in on the surface', async () => {
        const session = guest()
        mockSession.mockReturnValue(session)
        const view = render(<DeviceLoginPage />)
        await screen.findByTestId('sign-in-surface')

        // The surface calls back when a sign-in made on it has finished; the session
        // hook then re-reads the session (here the stub changes, and the page redraws).
        expect(typeof surface.props.onSignedIn).toBe('function')
        mockSession.mockReturnValue(account())
        await act(async () => { surface.props.onSignedIn() })
        view.rerender(<DeviceLoginPage />)

        expect(session.refresh).toHaveBeenCalledTimes(1)
        expect(codeField()).toBeInTheDocument()
        expect(screen.queryByTestId('sign-in-surface')).toBeNull()
    })

    it.each([
        ['401 auth_required', 401, { error: 'auth_required' }],
        ['403 account_required', 403, { error: 'account_required' }]
    ])('shows the sign-in surface when the server answers %s to the code', async (_name, status, body) => {
        const user = userEvent.setup()
        route(LOOKUP, () => reply(status, body))
        render(<DeviceLoginPage />)
        await submitCode(user)

        expect(await screen.findByTestId('sign-in-surface')).toBeInTheDocument()
        expect(screen.getByText('Sign in with your account to approve a terminal.')).toBeInTheDocument()
        expect(screen.queryByLabelText('Code from the terminal')).toBeNull()
    })

    it('shows the sign-in surface when the list of terminals is refused', async () => {
        route(TOKENS, () => reply(403, { error: 'account_required' }))
        render(<DeviceLoginPage />)
        expect(await screen.findByTestId('sign-in-surface')).toBeInTheDocument()
    })

    it('says when the session cannot be read, and offers to try again', () => {
        const session = account({ error: 'Failed to reach server' })
        mockSession.mockReturnValue(session)
        render(<DeviceLoginPage />)

        expect(screen.getByRole('alert')).toHaveTextContent('Could not reach di.iiii to check who you are.')
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        expect(session.refresh).toHaveBeenCalledTimes(1)
    })

    it('says plainly that a server without accounts has no terminal sign-in', () => {
        mockSession.mockReturnValue(account({ local: true }))
        render(<DeviceLoginPage />)
        expect(screen.getByText('Terminal sign-in needs accounts, and this di.iiii runs without them.')).toBeInTheDocument()
        expect(screen.queryByLabelText('Code from the terminal')).toBeNull()
    })
})

// ── the code ────────────────────────────────────────────────────────────────

describe('the code field', () => {
    it('is labelled, described, and has focus when the screen opens', () => {
        render(<DeviceLoginPage />)
        const field = codeField()
        expect(field).toHaveFocus()
        expect(field).toHaveAccessibleName('Code from the terminal')
        expect(field).toHaveAccessibleDescription(/8 letters, like BDFG-HJKL/)
        expect(field).toHaveAttribute('autocomplete', 'off')
    })

    it('upper-cases and formats XXXX-XXXX as it is typed, whether or not the dash is typed', async () => {
        const user = userEvent.setup()
        render(<DeviceLoginPage />)

        await user.type(codeField(), 'bdfg')
        expect(codeField()).toHaveValue('BDFG')
        await user.type(codeField(), 'h')
        expect(codeField()).toHaveValue('BDFG-H')
        await user.type(codeField(), 'jkl')
        expect(codeField()).toHaveValue('BDFG-HJKL')

        await user.clear(codeField())
        await user.type(codeField(), 'bdfg-hjkl')
        expect(codeField()).toHaveValue('BDFG-HJKL')
    })

    it('drops what can never be in a code, and stops at eight letters', async () => {
        const user = userEvent.setup()
        render(<DeviceLoginPage />)
        await user.type(codeField(), 'b1a d-f g 9hjklmnp')
        expect(codeField()).toHaveValue('BDFG-HJKL')
    })

    it('keeps the caret where the person is typing when it re-formats', async () => {
        const user = userEvent.setup()
        render(<DeviceLoginPage />)
        await user.type(codeField(), 'bdfghjkl')

        await user.type(codeField(), 'c', { initialSelectionStart: 2, initialSelectionEnd: 2 })

        expect(codeField()).toHaveValue('BDCF-GHJK')
        expect(codeField().selectionStart).toBe(3)
    })

    it('sends the formatted code when Enter is pressed', async () => {
        const user = userEvent.setup()
        route(LOOKUP, () => reply(200, lookupAnswer()))
        render(<DeviceLoginPage />)
        await submitCode(user, 'bdfghjkl')

        await screen.findByRole('heading', { name: 'A terminal asked to sign in as you' })
        const sent = calls(LOOKUP)
        expect(sent).toHaveLength(1)
        expect(sent[0].json).toEqual({ userCode: 'BDFG-HJKL' })
        // The browser's own session cookie travels with it, through the shared fetch layer.
        expect(sent[0].init.credentials).toBe('include')
    })

    it('sends the same thing when "Check code" is pressed', async () => {
        const user = userEvent.setup()
        route(LOOKUP, () => reply(200, lookupAnswer()))
        render(<DeviceLoginPage />)
        await user.type(codeField(), 'bdfghjkl')
        await user.click(screen.getByRole('button', { name: 'Check code' }))

        await screen.findByRole('heading', { name: 'A terminal asked to sign in as you' })
        expect(calls(LOOKUP)[0].json).toEqual({ userCode: 'BDFG-HJKL' })
    })

    it('asks for the missing letters instead of asking the server', async () => {
        const user = userEvent.setup()
        render(<DeviceLoginPage />)
        await user.type(codeField(), 'bdf')
        await user.click(screen.getByRole('button', { name: 'Check code' }))

        expect(screen.getByRole('alert')).toHaveTextContent('Type all 8 letters of the code.')
        expect(codeField()).toHaveAttribute('aria-invalid', 'true')
        expect(codeField()).toHaveFocus()
        expect(calls(LOOKUP)).toHaveLength(0)
    })

    it('says so when the code is not waiting any more, keeps focus on the field, and offers no pointless retry', async () => {
        const user = userEvent.setup()
        route(LOOKUP, () => reply(404, { error: 'unknown_code' }))
        render(<DeviceLoginPage />)
        await submitCode(user)

        const alert = await screen.findByRole('alert')
        expect(alert).toHaveTextContent('That code is not waiting any more. Run di login again in the terminal.')
        expect(within(alert).getByText('di login').tagName).toBe('CODE')
        expect(within(alert).queryByRole('button')).toBeNull()
        expect(codeField()).toHaveFocus()
        expect(codeField()).toHaveAccessibleDescription(/not waiting any more/)
    })

    it('says "too many tries" on a 429', async () => {
        const user = userEvent.setup()
        route(LOOKUP, () => reply(429, { error: 'rate_limited' }))
        render(<DeviceLoginPage />)
        await submitCode(user)
        expect(await screen.findByRole('alert')).toHaveTextContent('Too many tries — wait a minute.')
    })

    it('says what a server error was, with its number', async () => {
        const user = userEvent.setup()
        route(LOOKUP, () => reply(500, { error: 'boom' }))
        render(<DeviceLoginPage />)
        await submitCode(user)
        expect(await screen.findByRole('alert')).toHaveTextContent('di.iiii could not check the code (error 500). Try again.')
    })

    it('says the network failed, and "Try again" really tries again', async () => {
        const user = userEvent.setup()
        route(LOOKUP, () => { throw new TypeError('Failed to fetch') })
        render(<DeviceLoginPage />)
        await submitCode(user)

        const alert = await screen.findByRole('alert')
        expect(alert).toHaveTextContent('Could not reach di.iiii. Check your connection, then try again.')

        // The shared fetch layer refuses calls for 15 s after a network error; a person
        // pressing the button is not a storm, so the press must reach the network.
        route(LOOKUP, () => reply(200, lookupAnswer()))
        await user.click(within(alert).getByRole('button', { name: 'Try again' }))
        await screen.findByRole('heading', { name: 'A terminal asked to sign in as you' })
        expect(calls(LOOKUP)).toHaveLength(2)
        expect(calls(LOOKUP)[1].json).toEqual({ userCode: 'BDFG-HJKL' })
    })

    it('shows "Checking…" while it waits, and never leaves it', async () => {
        const user = userEvent.setup()
        const gate = deferred()
        route(LOOKUP, () => gate.promise)
        render(<DeviceLoginPage />)
        await submitCode(user)
        expect(screen.getByRole('button', { name: 'Checking…' })).toHaveAttribute('aria-busy', 'true')

        await act(async () => { gate.resolve(reply(404, { error: 'unknown_code' })) })
        expect(screen.queryByText('Checking…')).toBeNull()
        expect(screen.getByRole('button', { name: 'Check code' })).toHaveAttribute('aria-busy', 'false')
    })

    it('ends a call that never answers with a message and a way to try again, not a spinner', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(NOW)
        route(LOOKUP, (init) => new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')))
        }))
        render(<DeviceLoginPage />)
        fireEvent.change(codeField(), { target: { value: 'bdfghjkl' } })
        fireEvent.click(screen.getByRole('button', { name: 'Check code' }))
        expect(screen.getByRole('button', { name: 'Checking…' })).toBeInTheDocument()

        await act(async () => { await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 50) })

        const alert = screen.getByRole('alert')
        expect(alert).toHaveTextContent('di.iiii did not answer in time. Check your connection, then try again.')
        expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
        expect(screen.queryByText('Checking…')).toBeNull()
    })
})

// ── the question ────────────────────────────────────────────────────────────

describe('what is asking', () => {
    it('says who asked, when, from where, and warns, in plain text', async () => {
        const user = userEvent.setup()
        const heading = await reachQuestion(user)

        expect(heading).toHaveFocus()
        expect(screen.queryByLabelText('Code from the terminal')).toBeNull()

        // The label sits under "What asked", set apart from this screen's own words.
        const asked = screen.getByText('What asked').nextElementSibling
        expect(asked).toHaveTextContent('taron-laptop (di 0.4.17)')
        expect(screen.getByText('Where from').nextElementSibling).toHaveTextContent('203.0.x.x')

        // "2 minutes ago", with the exact time on the element and written out beside it.
        const when = screen.getByText('2 minutes ago').closest('time')
        expect(when).toHaveAttribute('dateTime', new Date(NOW - 120000).toISOString())
        expect(when.getAttribute('title')).toMatch(/Oct 2026/)
        expect(when).toHaveTextContent(when.getAttribute('title'))

        expect(screen.getByText('Only approve this if you just started it yourself.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Deny' })).toBeInTheDocument()
    })

    it('shows the label as text and never builds markup from it', async () => {
        const user = userEvent.setup()
        const evil = '<img src=x onerror=alert(1)>'
        await reachQuestion(user, lookupAnswer({ label: evil, from: '<b>bold</b>' }))

        expect(screen.getByText('What asked').nextElementSibling).toHaveTextContent(evil)
        expect(document.querySelector('img')).toBeNull()
        expect(document.querySelector('b')).toBeNull()
    })

    it('strips what can hide or reorder text, and says so when the terminal gave no name', async () => {
        const user = userEvent.setup()
        await reachQuestion(user, lookupAnswer({ label: 'evil‮gnp.exe\u0007', from: '' }))
        const asked = screen.getByText('What asked').nextElementSibling
        expect(asked.textContent).toBe('evil gnp.exe')
        expect(screen.getByText('Where from').nextElementSibling).toHaveTextContent('Unknown')
    })

    it('does not guess a time it cannot read', async () => {
        const user = userEvent.setup()
        await reachQuestion(user, lookupAnswer({ label: '', requestedAt: 'not a time' }))
        expect(screen.getByText('A terminal that gave no name')).toBeInTheDocument()
        expect(screen.getByText('When').nextElementSibling).toHaveTextContent('Unknown')
    })

    it('Approve sends approve: true for the code that was checked, then says it is done', async () => {
        const user = userEvent.setup()
        await reachQuestion(user)
        route(DECISION, () => reply(200, { approved: true }))
        await user.click(screen.getByRole('button', { name: 'Approve' }))

        const status = await screen.findByText(APPROVED)
        expect(status.closest('[role="status"]')).not.toBeNull()
        expect(calls(DECISION)).toHaveLength(1)
        expect(calls(DECISION)[0].json).toEqual({ userCode: 'BDFG-HJKL', approve: true })
        expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
        expect(screen.getByRole('button', { name: 'Sign another terminal in' })).toHaveFocus()
    })

    it('Deny sends approve: false and says nothing was signed in', async () => {
        const user = userEvent.setup()
        await reachQuestion(user)
        route(DECISION, () => reply(200, { approved: false }))
        await user.click(screen.getByRole('button', { name: 'Deny' }))

        expect(await screen.findByText(DENIED)).toBeInTheDocument()
        expect(calls(DECISION)[0].json).toEqual({ userCode: 'BDFG-HJKL', approve: false })
        expect(screen.queryByText(APPROVED)).toBeNull()
    })

    it('believes the server over the button when they disagree', async () => {
        const user = userEvent.setup()
        await reachQuestion(user)
        route(DECISION, () => reply(200, { approved: false }))
        await user.click(screen.getByRole('button', { name: 'Approve' }))
        expect(await screen.findByText(DENIED)).toBeInTheDocument()
    })

    it('sends one decision however many times the button is pressed', async () => {
        const user = userEvent.setup()
        await reachQuestion(user)
        const gate = deferred()
        route(DECISION, () => gate.promise)
        await user.click(screen.getByRole('button', { name: 'Approve' }))
        await user.click(screen.getByRole('button', { name: 'Approve' }))
        await act(async () => { gate.resolve(reply(200, { approved: true })) })

        expect(calls(DECISION)).toHaveLength(1)
        expect(await screen.findByText(APPROVED)).toBeInTheDocument()
    })

    it('goes back to the form for a new code when the old one ran out in between', async () => {
        const user = userEvent.setup()
        await reachQuestion(user)
        route(DECISION, () => reply(404, { error: 'unknown_code' }))
        await user.click(screen.getByRole('button', { name: 'Approve' }))

        expect(await screen.findByRole('alert')).toHaveTextContent('That code is not waiting any more.')
        expect(codeField()).toHaveValue('')
        expect(codeField()).toHaveFocus()
    })

    it('says the network failed on a decision and repeats the SAME decision on "Try again"', async () => {
        const user = userEvent.setup()
        await reachQuestion(user)
        route(DECISION, () => { throw new TypeError('Failed to fetch') })
        await user.click(screen.getByRole('button', { name: 'Approve' }))

        const alert = await screen.findByRole('alert')
        expect(alert).toHaveTextContent('Could not reach di.iiii.')
        route(DECISION, () => reply(200, { approved: true }))
        await user.click(within(alert).getByRole('button', { name: 'Try again' }))

        expect(await screen.findByText(APPROVED)).toBeInTheDocument()
        expect(calls(DECISION).map((call) => call.json.approve)).toEqual([true, true])
    })

    it('shows the sign-in surface when the decision is refused as not an account', async () => {
        const user = userEvent.setup()
        await reachQuestion(user)
        route(DECISION, () => reply(403, { error: 'account_required' }))
        await user.click(screen.getByRole('button', { name: 'Approve' }))
        expect(await screen.findByTestId('sign-in-surface')).toBeInTheDocument()
    })

    it('lets the person start again with another terminal', async () => {
        const user = userEvent.setup()
        await reachQuestion(user)
        route(DECISION, () => reply(200, { approved: true }))
        await user.click(screen.getByRole('button', { name: 'Approve' }))
        await user.click(await screen.findByRole('button', { name: 'Sign another terminal in' }))

        expect(codeField()).toHaveValue('')
        expect(codeField()).toHaveFocus()
        expect(screen.queryByText(APPROVED)).toBeNull()
    })
})

// ── the terminals already signed in ─────────────────────────────────────────

const LAPTOP = { id: 'a1b2c3d4e5f60718', label: 'taron-laptop (di 0.4.17)', createdAt: Date.parse('2026-10-01T09:00:00Z'), lastUsedAt: null, expiresAt: NOW + 90 * 86400000 }
const STUDIO = { id: '99aabbccddeeff00', label: 'studio-pc', createdAt: '2026-09-20T10:00:00Z', lastUsedAt: Date.parse('2026-10-05T18:30:00Z'), expiresAt: NOW + 80 * 86400000 }

describe('terminals signed in as you', () => {
    it('lists each one with its name, when it signed in, and when it was last used', async () => {
        route(TOKENS, () => reply(200, { tokens: [STUDIO, LAPTOP] }))
        render(<DeviceLoginPage />)

        const list = await screen.findByRole('list')
        const rows = within(list).getAllByRole('listitem')
        // Newest sign-in first, whatever order the server used.
        expect(rows).toHaveLength(2)
        expect(rows[0]).toHaveTextContent('taron-laptop (di 0.4.17)')
        expect(rows[0]).toHaveTextContent(/Signed in 1 Oct 2026 · Last used not yet/)
        expect(rows[1]).toHaveTextContent('studio-pc')
        // Newer ICU data writes "Sept" for en-GB, older "Sep": the month is not what is under test.
        expect(rows[1]).toHaveTextContent(/Signed in 20 Sep\w* 2026 · Last used 5 Oct 2026/)
        expect(within(rows[0]).getByRole('button', { name: 'Revoke taron-laptop (di 0.4.17)' })).toBeInTheDocument()
        expect(within(rows[1]).getByRole('button', { name: 'Revoke studio-pc' })).toBeInTheDocument()
        expect(calls(TOKENS)).toHaveLength(1)
    })

    it('is there while a code is being checked and while the question is open', async () => {
        const user = userEvent.setup()
        route(TOKENS, () => reply(200, { tokens: [LAPTOP] }))
        await reachQuestion(user)
        expect(screen.getByRole('heading', { name: 'Terminals signed in as you' })).toBeInTheDocument()
        expect(await screen.findByRole('button', { name: 'Revoke taron-laptop (di 0.4.17)' })).toBeInTheDocument()
    })

    it('says "None yet" when there are none', async () => {
        render(<DeviceLoginPage />)
        expect(await screen.findByText(/None yet\./)).toHaveTextContent('None yet. Run di login in a terminal.')
        expect(screen.queryByRole('list')).toBeNull()
    })

    it('shows a name as text only', async () => {
        route(TOKENS, () => reply(200, { tokens: [{ ...LAPTOP, label: '<img src=x onerror=alert(1)>' }] }))
        render(<DeviceLoginPage />)
        expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
        expect(document.querySelector('img')).toBeNull()
    })

    it('says when the list could not be loaded and loads it again on "Try again"', async () => {
        const user = userEvent.setup()
        route(TOKENS, () => reply(500, { error: 'boom' }))
        render(<DeviceLoginPage />)

        const alert = await screen.findByRole('alert')
        expect(alert).toHaveTextContent('di.iiii could not load the list (error 500). Try again.')
        route(TOKENS, () => reply(200, { tokens: [LAPTOP] }))
        await user.click(within(alert).getByRole('button', { name: 'Try again' }))

        expect(await screen.findByRole('button', { name: 'Revoke taron-laptop (di 0.4.17)' })).toBeInTheDocument()
        expect(screen.queryByText('Loading…')).toBeNull()
    })

    it('revokes in two steps: Revoke asks, No keeps it, Yes ends it', async () => {
        const user = userEvent.setup()
        route(TOKENS, () => reply(200, { tokens: [LAPTOP, STUDIO] }))
        render(<DeviceLoginPage />)
        const revoke = await screen.findByRole('button', { name: 'Revoke taron-laptop (di 0.4.17)' })

        // Step one asks; nothing has been sent, and focus is on the safe answer.
        await user.click(revoke)
        expect(calls('DELETE /api/auth/cli/tokens/a1b2c3d4e5f60718')).toHaveLength(0)
        const group = screen.getByRole('group', { name: 'Really revoke taron-laptop (di 0.4.17)?' })
        expect(within(group).getByText('Really revoke?')).toBeInTheDocument()
        expect(within(group).getByRole('button', { name: 'No, keep taron-laptop (di 0.4.17)' })).toHaveFocus()

        // No puts it back, and focus returns to the button that was pressed.
        await user.click(within(group).getByRole('button', { name: /^No/ }))
        expect(calls('DELETE /api/auth/cli/tokens/a1b2c3d4e5f60718')).toHaveLength(0)
        expect(screen.getByRole('button', { name: 'Revoke taron-laptop (di 0.4.17)' })).toHaveFocus()

        // Step two ends it: the right route, the right method, and only this row goes.
        route('DELETE /api/auth/cli/tokens/a1b2c3d4e5f60718', () => reply(200, { revoked: true }))
        await user.click(screen.getByRole('button', { name: 'Revoke taron-laptop (di 0.4.17)' }))
        await user.click(screen.getByRole('button', { name: 'Yes, revoke taron-laptop (di 0.4.17)' }))

        expect(await screen.findByText('Revoked taron-laptop (di 0.4.17). That terminal is signed out.')).toBeInTheDocument()
        expect(calls('DELETE /api/auth/cli/tokens/a1b2c3d4e5f60718')).toHaveLength(1)
        expect(screen.queryByRole('button', { name: 'Revoke taron-laptop (di 0.4.17)' })).toBeNull()
        expect(screen.getByRole('button', { name: 'Revoke studio-pc' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Terminals signed in as you' })).toHaveFocus()
    })

    it('says so when a revoke failed, keeps the row, and leaves the button to try again', async () => {
        const user = userEvent.setup()
        route(TOKENS, () => reply(200, { tokens: [LAPTOP] }))
        render(<DeviceLoginPage />)
        route('DELETE /api/auth/cli/tokens/a1b2c3d4e5f60718', () => reply(500, { error: 'boom' }))
        await user.click(await screen.findByRole('button', { name: 'Revoke taron-laptop (di 0.4.17)' }))
        await user.click(screen.getByRole('button', { name: /^Yes/ }))

        const alert = await screen.findByRole('alert')
        expect(alert).toHaveTextContent('Could not revoke taron-laptop (di 0.4.17) (error 500). It is still signed in. Press Revoke to try again.')
        expect(screen.getByRole('button', { name: 'Revoke taron-laptop (di 0.4.17)' })).toHaveFocus()
        expect(screen.queryByText(/signed out/)).toBeNull()

        // And the second try really is sent.
        route('DELETE /api/auth/cli/tokens/a1b2c3d4e5f60718', () => reply(200, { revoked: true }))
        await user.click(screen.getByRole('button', { name: 'Revoke taron-laptop (di 0.4.17)' }))
        await user.click(screen.getByRole('button', { name: /^Yes/ }))
        expect(await screen.findByText(/That terminal is signed out/)).toBeInTheDocument()
        expect(calls('DELETE /api/auth/cli/tokens/a1b2c3d4e5f60718')).toHaveLength(2)
    })

    it('says so when a revoke could not reach the server, and that the terminal is still signed in', async () => {
        const user = userEvent.setup()
        route(TOKENS, () => reply(200, { tokens: [LAPTOP] }))
        render(<DeviceLoginPage />)
        route('DELETE /api/auth/cli/tokens/a1b2c3d4e5f60718', () => { throw new TypeError('Failed to fetch') })
        await user.click(await screen.findByRole('button', { name: 'Revoke taron-laptop (di 0.4.17)' }))
        await user.click(screen.getByRole('button', { name: /^Yes/ }))

        expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach di.iiii, so taron-laptop (di 0.4.17) is still signed in. Press Revoke to try again.')
        expect(screen.getByRole('button', { name: 'Revoke taron-laptop (di 0.4.17)' })).toBeInTheDocument()
    })

    it('drops the row and says why when the server no longer has it', async () => {
        const user = userEvent.setup()
        route(TOKENS, () => reply(200, { tokens: [LAPTOP] }))
        render(<DeviceLoginPage />)
        route('DELETE /api/auth/cli/tokens/a1b2c3d4e5f60718', () => reply(404, { error: 'not_found' }))
        await user.click(await screen.findByRole('button', { name: 'Revoke taron-laptop (di 0.4.17)' }))
        await user.click(screen.getByRole('button', { name: /^Yes/ }))

        expect(await screen.findByText('taron-laptop (di 0.4.17) is not in your list any more.')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Revoke taron-laptop (di 0.4.17)' })).toBeNull()
    })

    it('puts an id that needs escaping into the address safely', async () => {
        const user = userEvent.setup()
        route(TOKENS, () => reply(200, { tokens: [{ ...LAPTOP, id: 'a/b c' }] }))
        render(<DeviceLoginPage />)
        route('DELETE /api/auth/cli/tokens/a%2Fb%20c', () => reply(200, { revoked: true }))
        await user.click(await screen.findByRole('button', { name: /^Revoke/ }))
        await user.click(screen.getByRole('button', { name: /^Yes/ }))
        expect(await screen.findByText(/That terminal is signed out/)).toBeInTheDocument()
    })
})

// ── how it is built ─────────────────────────────────────────────────────────

describe('how it behaves for everyone', () => {
    it('never uses a browser alert, confirm or prompt, and opens no modal', async () => {
        const user = userEvent.setup()
        const blocked = ['alert', 'confirm', 'prompt'].map((name) => vi.spyOn(window, name).mockImplementation(() => { throw new Error(`window.${name} was called`) }))
        route(TOKENS, () => reply(200, { tokens: [LAPTOP] }))
        await reachQuestion(user)
        route(DECISION, () => reply(200, { approved: true }))
        await user.click(screen.getByRole('button', { name: 'Approve' }))
        await screen.findByText(APPROVED)
        route('DELETE /api/auth/cli/tokens/a1b2c3d4e5f60718', () => reply(200, { revoked: true }))
        await user.click(screen.getByRole('button', { name: /^Revoke/ }))
        await user.click(screen.getByRole('button', { name: /^Yes/ }))
        await screen.findByText(/That terminal is signed out/)

        blocked.forEach((spy) => expect(spy).not.toHaveBeenCalled())
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(screen.queryByRole('alertdialog')).toBeNull()
    })

    it('gives every control a name and keeps results in live regions', async () => {
        const user = userEvent.setup()
        route(TOKENS, () => reply(200, { tokens: [LAPTOP, STUDIO] }))
        const named = () => {
            const controls = [...screen.queryAllByRole('button'), ...screen.queryAllByRole('textbox'), ...screen.queryAllByRole('link')]
            expect(controls.length).toBeGreaterThan(3)
            controls.forEach((control) => expect(control).toHaveAccessibleName())
        }

        // The code form, with the list under it ...
        route(LOOKUP, () => reply(200, lookupAnswer()))
        render(<DeviceLoginPage />)
        await screen.findByText('studio-pc')
        expect(screen.queryAllByRole('textbox')).toHaveLength(1)
        named()
        const live = screen.getAllByRole('status')
        expect(live.length).toBeGreaterThanOrEqual(2)
        live.forEach((region) => expect(region).toHaveAttribute('aria-live', 'polite'))

        // ... and the question, with the list under it.
        await submitCode(user)
        await screen.findByRole('heading', { name: 'A terminal asked to sign in as you' })
        named()
    })
})

describe('the helpers', () => {
    it('the code alphabet is the twenty letters of the contract, with no vowel', () => {
        expect(CODE_ALPHABET).toBe('BCDFGHJKLMNPQRSTVWXZ')
        expect(CODE_ALPHABET).toHaveLength(20)
        expect(CODE_ALPHABET).not.toMatch(/[AEIOUY]/)
    })

    it('formatUserCode', () => {
        expect(formatUserCode('')).toBe('')
        expect(formatUserCode('bdf')).toBe('BDF')
        expect(formatUserCode('bdfg')).toBe('BDFG')
        expect(formatUserCode('bdfgh')).toBe('BDFG-H')
        expect(formatUserCode('BDFG-HJKL')).toBe('BDFG-HJKL')
        expect(formatUserCode(' bdfg  hjkl ')).toBe('BDFG-HJKL')
        expect(formatUserCode('bdfghjklmnpq')).toBe('BDFG-HJKL')
        expect(formatUserCode('a e i o u 1 2 3')).toBe('')
        expect(formatUserCode(null)).toBe('')
    })

    it('toMillis reads milliseconds, seconds and ISO strings, and nothing else', () => {
        expect(toMillis(NOW)).toBe(NOW)
        expect(toMillis(String(NOW))).toBe(NOW)
        expect(toMillis(NOW / 1000)).toBe(NOW)
        expect(toMillis('2026-10-07T12:00:00Z')).toBe(NOW)
        expect(toMillis(null)).toBeNull()
        expect(toMillis(undefined)).toBeNull()
        expect(toMillis('')).toBeNull()
        expect(toMillis('soon')).toBeNull()
        expect(toMillis(Number.NaN)).toBeNull()
        expect(toMillis(1e20)).toBeNull()
    })

    it('relativeTime', () => {
        expect(relativeTime(NOW - 10 * 1000, NOW)).toBe('just now')
        expect(relativeTime(NOW + 10 * 1000, NOW)).toBe('just now')
        expect(relativeTime(NOW - 2 * 60 * 1000, NOW)).toBe('2 minutes ago')
        expect(relativeTime(NOW - 60 * 60 * 1000, NOW)).toBe('1 hour ago')
        expect(relativeTime(NOW - 3 * 86400 * 1000, NOW)).toBe('3 days ago')
    })

    it('plainText', () => {
        expect(plainText('a‮b\u0007c')).toBe('a b c')
        expect(plainText('  two   words ')).toBe('two words')
        expect(plainText('Մակարյան-laptop')).toBe('Մակարյան-laptop')
        expect(plainText(42)).toBe('')
        expect(plainText(null)).toBe('')
    })
})

// A browser cannot be started here, so what the stylesheet promises for a phone
// is checked as written. This is NOT a measurement of the layout — it fails if
// someone deletes the rule, and says nothing about how the page looks.
describe('the stylesheet keeps its promises to a phone', () => {
    const css = read('pages/deviceLogin.css')
    const base = read('styles/base.css')
    const body = (selector) => {
        const escaped = selector.replace(/[.[\]()-]/g, '\\$&')
        const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))
        return match ? match[1] : ''
    }

    it('buttons are at least a touch target tall and wide, and the token is 44px', () => {
        expect(body('.device-btn')).toMatch(/min-height:\s*var\(--di-touch-target\)/)
        expect(body('.device-btn')).toMatch(/min-width:\s*var\(--di-touch-target\)/)
        expect(body('.device-code')).toMatch(/min-height:\s*var\(--di-touch-target\)/)
        expect(base).toMatch(/--di-touch-target:\s*44px/)
    })

    it('the code field is 16px or larger, or a phone zooms the page when it is focused', () => {
        expect(body('.device-code')).toMatch(/font-size:\s*var\(--di-text-6\)/)
        expect(base).toMatch(/--di-text-6:\s*1\.25rem/)
    })

    it('the field and long text cannot push the page sideways', () => {
        expect(body('.device-code')).toMatch(/box-sizing:\s*border-box/)
        expect(body('.device-code')).toMatch(/width:\s*100%/)
        expect(body('.device-facts dd')).toMatch(/overflow-wrap:\s*anywhere/)
        expect(body('.device-row-name')).toMatch(/overflow-wrap:\s*anywhere/)
        expect(body('.device-row')).toMatch(/flex-wrap:\s*wrap/)
    })

    it('everything that takes focus shows a ring', () => {
        const ring = css.match(/([^{}]*:focus-visible[^{}]*)\{[^}]*outline:\s*2px solid var\(--di-cyan\)/)
        expect(ring).not.toBeNull()
        for (const selector of ['.device-code', '.device-btn', '.device-card-title']) {
            expect(ring[1]).toContain(`${selector}:focus-visible`)
        }
    })
})
