import { Suspense, lazy, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import useAuthSession from '../hooks/useAuthSession.js'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import useNoIndex from '../hooks/useNoIndex.js'
import { useKeyboardPageScroll } from '../hooks/useKeyboardPageScroll.js'
import { clearServerUnavailable } from '../services/apiClient.js'
import {
    decideDeviceCode,
    listTerminalLogins,
    lookupDeviceCode,
    revokeTerminalLogin
} from '../services/cliLoginApi.js'
import './legal.css'
import './deviceLogin.css'

// `/device` — the browser half of `di login` (docs/architecture/CLI_LOGIN.md).
//
// A terminal shows a short code. The person opens this address in the browser
// they are already signed in with, types the code, reads what is asking, and
// approves or denies it. The flow is the OAuth 2.0 Device Authorization Grant
// (RFC 8628), the one `gh auth login` and `az login` use; this is its "user
// code" screen (§3.3).
//
// Two rules from RFC 8628 §5.4 (remote phishing) shape this screen:
//   - the code is TYPED, never carried in the address: nothing is read from the
//     URL and nothing is pre-filled, so a link cannot approve for anyone;
//   - the screen says what is asking, when, and from where, and tells the person
//     to approve only what they started themselves.
//
// Everything the terminal sent (its label, the address) is machine-chosen text.
// It is shown as text only, and the characters that can hide or reorder it are
// taken out first.

// Lazy for the same reason RootApp loads it lazily: the sign-in surface pulls in
// MUI, which a person who is already signed in never needs.
const SignInSurface = lazy(() => import('../components/AuthGate.jsx').then((m) => ({ default: m.SignInSurface })))

// ── the code ────────────────────────────────────────────────────────────────

// The 20 letters a code is made of: no vowels, so no word can appear in one, and
// no look-alikes (RFC 8628 §6.1). The same set the server hands out.
export const CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ'
export const CODE_LENGTH = 8

const codeLetters = (raw) => [...String(raw ?? '').toUpperCase()].filter((ch) => CODE_ALPHABET.includes(ch))

// "bdfg hjkl", "BDFG-HJKL" and "bdfghjkl" all become BDFG-HJKL. Whatever can
// never be in a code (numbers, vowels, spaces, dashes) is dropped as it is typed.
// The dash appears with the fifth letter, so Backspace never fights it.
export const formatUserCode = (raw) => {
    const letters = codeLetters(raw).slice(0, CODE_LENGTH).join('')
    return letters.length > 4 ? `${letters.slice(0, 4)}-${letters.slice(4)}` : letters
}

// Where the caret belongs once `letters` letters stand before it: after the dash
// when there is one.
const caretAfter = (letters) => (letters > 4 ? letters + 1 : letters)

// ── times and text ──────────────────────────────────────────────────────────

const LOCALE = 'en-GB'

// The contract names the time fields (requestedAt, createdAt, lastUsedAt) but not
// their format, so all three usual ones are read: milliseconds since 1970,
// seconds since 1970, and an ISO 8601 string. Anything else is "unknown", never
// a guess.
export const toMillis = (value) => {
    let ms = null
    if (typeof value === 'number') ms = value
    else if (typeof value === 'string' && value.trim()) {
        ms = /^\d+$/.test(value.trim()) ? Number(value.trim()) : Date.parse(value)
    }
    if (ms === null || !Number.isFinite(ms)) return null
    // Seconds since 1970 stay below 1e11; milliseconds for any date after 1973 are above it.
    if (ms > 0 && ms < 1e11) ms *= 1000
    return Math.abs(ms) <= 8.64e15 ? ms : null
}

export const relativeTime = (ms, now) => {
    const seconds = Math.round((ms - now) / 1000)
    const away = Math.abs(seconds)
    if (away < 45) return 'just now'
    const formatter = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'always' })
    if (away < 3600) return formatter.format(Math.round(seconds / 60), 'minute')
    if (away < 86400) return formatter.format(Math.round(seconds / 3600), 'hour')
    return formatter.format(Math.round(seconds / 86400), 'day')
}

const exactTime = (ms) => new Date(ms).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'medium' })
const dayOnly = (ms) => new Date(ms).toLocaleDateString(LOCALE, { dateStyle: 'medium' })

// Controls, zero-width and direction-changing characters: they can hide text or
// reorder what stands beside it, and a label has no use for them.
const isHidden = (cp) => cp < 0x20
    || (cp >= 0x7f && cp <= 0x9f)
    || cp === 0x061c
    || cp === 0x200b
    || cp === 0x200e || cp === 0x200f
    || (cp >= 0x202a && cp <= 0x202e)
    || (cp >= 0x2060 && cp <= 0x2069)
    || cp === 0xfeff

export const plainText = (value) => (typeof value === 'string'
    ? [...value].map((ch) => (isHidden(ch.codePointAt(0)) ? ' ' : ch)).join('').replace(/\s+/g, ' ').trim()
    : '')

const NO_NAME = 'A terminal that gave no name'

// What the question shows, worked out once when the answer arrives and not while
// drawing, so "2 minutes ago" does not change under the reader's eyes.
const describeAsk = (answer, userCode) => {
    const askedAt = toMillis(answer?.requestedAt)
    return {
        userCode,
        label: plainText(answer?.label),
        from: plainText(answer?.from),
        when: askedAt === null ? null : {
            iso: new Date(askedAt).toISOString(),
            ago: relativeTime(askedAt, Date.now()),
            exact: exactTime(askedAt)
        }
    }
}

// ── failures ────────────────────────────────────────────────────────────────

// What a failed call means for this screen. apiFetch's errors carry `.status` and
// the parsed body in `.data`; an error with no status is the network (or the
// timeout cliLoginApi.js adds).
const describeFailure = (error) => {
    const status = error?.status
    const code = error?.data?.error
    if (status === 401 || (status === 403 && code === 'account_required')) return { kind: 'account' }
    if (status === 404 && code === 'unknown_code') return { kind: 'unknown' }
    if (status === 429) return { kind: 'rate' }
    if (typeof status !== 'number') return { kind: 'network', timeout: Boolean(error?.isTimeout) }
    return { kind: 'server', status }
}

function ProblemText({ problem, doing }) {
    switch (problem.kind) {
    case 'short':
        return <>Type all 8 letters of the code.</>
    case 'unknown':
        return <>That code is not waiting any more. Run <code>di login</code> again in the terminal.</>
    case 'rate':
        return <>Too many tries — wait a minute.</>
    case 'network':
        return <>{problem.timeout ? 'di.iiii did not answer in time.' : 'Could not reach di.iiii.'} Check your connection, then try again.</>
    default:
        return <>di.iiii could not {doing} (error {problem.status}). Try again.</>
    }
}

function Problem({ problem, doing, id }) {
    if (!problem) return null
    return (
        <div className="device-problem" role="alert" id={id}>
            <p><ProblemText problem={problem} doing={doing} /></p>
            {problem.retry && (
                <button type="button" className="device-btn" onClick={problem.retry}>Try again</button>
            )}
        </div>
    )
}

// ── the code form, the question, the answer ─────────────────────────────────

const APPROVED = 'Signed in. You can close this tab and go back to the terminal.'
const DENIED = 'Denied. Nothing was signed in.'

function Flow({ onNeedsAccount }) {
    const inputId = useId()
    const hintId = useId()
    const problemId = useId()
    const confirmId = useId()
    const inputRef = useRef(null)
    const caretRef = useRef(null)
    const confirmRef = useRef(null)
    const againRef = useRef(null)
    const busy = useRef(false)
    const [phase, setPhase] = useState('form')
    const [code, setCode] = useState('')
    const [request, setRequest] = useState(null)
    const [outcome, setOutcome] = useState(null)
    const [problem, setProblem] = useState(null)
    const [pending, setPending] = useState(false)

    // Focus goes to the first useful thing each time the screen changes: the code
    // field, then the question (its heading, so the details are read before the
    // buttons), then the way to start again.
    useEffect(() => {
        const target = phase === 'confirm' ? confirmRef.current : phase === 'done' ? againRef.current : inputRef.current
        target?.focus()
    }, [phase])

    // Re-formatting the value would throw the caret to the end; put it back where
    // the person was typing.
    useLayoutEffect(() => {
        const input = inputRef.current
        if (input && caretRef.current !== null && document.activeElement === input) {
            input.setSelectionRange(caretRef.current, caretRef.current)
        }
        caretRef.current = null
    }, [code])

    const onChange = (event) => {
        const input = event.target
        const raw = input.value
        const before = codeLetters(raw.slice(0, input.selectionStart ?? raw.length)).length
        caretRef.current = caretAfter(Math.min(before, CODE_LENGTH))
        setCode(formatUserCode(raw))
        if (problem?.kind === 'short') setProblem(null)
    }

    // A failed call: say what failed. "Not an account" is not an error to show
    // here but a different screen (the sign-in), so it is handed up.
    const fail = (error, retry) => {
        const failure = describeFailure(error)
        if (failure.kind === 'account') {
            onNeedsAccount()
            return failure
        }
        // Only a failure that trying again can cure gets the button: a dead code
        // stays dead, and "too many tries" needs the minute, not another press.
        setProblem({ ...failure, retry: failure.kind === 'network' || failure.kind === 'server' ? retry : undefined })
        return failure
    }

    const check = async () => {
        if (busy.current) return
        const userCode = formatUserCode(code)
        if (codeLetters(userCode).length < CODE_LENGTH) {
            setProblem({ kind: 'short' })
            inputRef.current?.focus()
            return
        }
        busy.current = true
        // A deliberate press is not a request storm: lift the shared cooldown that
        // follows a network error, or "Try again" would answer without trying.
        clearServerUnavailable()
        setPending(true)
        setProblem(null)
        try {
            setRequest(describeAsk(await lookupDeviceCode(userCode), userCode))
            setPhase('confirm')
        } catch (error) {
            const failure = fail(error, check)
            if (failure.kind === 'unknown') {
                inputRef.current?.focus()
                inputRef.current?.select()
            }
        } finally {
            busy.current = false
            setPending(false)
        }
    }

    const decide = async (approve) => {
        if (busy.current || !request) return
        busy.current = true
        clearServerUnavailable()
        setPending(true)
        setProblem(null)
        try {
            const answer = await decideDeviceCode(request.userCode, approve)
            // The server's word wins over the button that was pressed.
            const approved = typeof answer?.approved === 'boolean' ? answer.approved : approve
            setOutcome(approved ? 'approved' : 'denied')
            setPhase('done')
        } catch (error) {
            const failure = fail(error, () => decide(approve))
            if (failure.kind === 'unknown') {
                // Expired or decided elsewhere between the two steps: back to the form for a new code.
                setRequest(null)
                setCode('')
                setPhase('form')
            }
        } finally {
            busy.current = false
            setPending(false)
        }
    }

    const startAgain = () => {
        setCode('')
        setRequest(null)
        setOutcome(null)
        setProblem(null)
        setPhase('form')
    }

    return (
        <div className="device-flow">
            {/* Always in the page, so a screen reader hears the text arrive. */}
            <div className="device-status" role="status" aria-live="polite" aria-atomic="true">
                {phase === 'done' ? (outcome === 'approved' ? APPROVED : DENIED) : null}
            </div>

            {phase === 'form' && (
                <form
                    className="device-form"
                    noValidate
                    onSubmit={(event) => {
                        event.preventDefault()
                        check()
                    }}
                >
                    <label className="device-field-label" htmlFor={inputId}>Code from the terminal</label>
                    <p className="device-hint" id={hintId}>
                        The terminal shows 8 letters, like BDFG-HJKL. Type them here yourself.
                    </p>
                    <input
                        id={inputId}
                        ref={inputRef}
                        className="device-code"
                        type="text"
                        value={code}
                        onChange={onChange}
                        autoComplete="off"
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                        enterKeyHint="go"
                        aria-describedby={problem ? `${hintId} ${problemId}` : hintId}
                        aria-invalid={problem?.kind === 'short' || problem?.kind === 'unknown' ? true : undefined}
                    />
                    <div className="device-actions">
                        <button type="submit" className="device-btn device-btn-primary" aria-busy={pending}>
                            {pending ? 'Checking…' : 'Check code'}
                        </button>
                    </div>
                    <Problem problem={problem} doing="check the code" id={problemId} />
                </form>
            )}

            {phase === 'confirm' && request && (
                <section className="device-card" aria-labelledby={confirmId}>
                    <h2 id={confirmId} ref={confirmRef} tabIndex={-1} className="device-card-title">
                        A terminal asked to sign in as you
                    </h2>
                    <dl className="device-facts">
                        <dt>What asked</dt>
                        <dd className="device-asked"><bdi>{request.label || NO_NAME}</bdi></dd>
                        <dt>When</dt>
                        <dd>
                            {request.when ? (
                                <time dateTime={request.when.iso} title={request.when.exact}>
                                    {request.when.ago}
                                    <span className="device-muted"> · {request.when.exact}</span>
                                </time>
                            ) : 'Unknown'}
                        </dd>
                        <dt>Where from</dt>
                        <dd>{request.from || 'Unknown'}</dd>
                    </dl>
                    <p className="device-warning">Only approve this if you just started it yourself.</p>
                    <div className="device-actions">
                        <button type="button" className="device-btn device-btn-primary" aria-busy={pending} onClick={() => decide(true)}>
                            Approve
                        </button>
                        <button type="button" className="device-btn" aria-busy={pending} onClick={() => decide(false)}>
                            Deny
                        </button>
                    </div>
                    <Problem problem={problem} doing="finish that" />
                </section>
            )}

            {phase === 'done' && (
                <div className="device-actions">
                    <button type="button" ref={againRef} className="device-btn" onClick={startAgain}>
                        Sign another terminal in
                    </button>
                </div>
            )}
        </div>
    )
}

// ── the terminals already signed in ─────────────────────────────────────────

const normaliseTokens = (list) => (Array.isArray(list) ? list : [])
    .filter((entry) => entry && entry.id !== undefined && entry.id !== null && entry.id !== '')
    .map((entry) => ({
        id: String(entry.id),
        label: plainText(entry.label),
        createdAt: toMillis(entry.createdAt),
        lastUsedAt: toMillis(entry.lastUsedAt)
    }))
    // Newest first; a login with no readable date goes last.
    .sort((a, b) => (b.createdAt ?? -Infinity) - (a.createdAt ?? -Infinity))

const nameOf = (token) => token.label || NO_NAME

function DayCell({ ms }) {
    return <time dateTime={new Date(ms).toISOString()} title={exactTime(ms)}>{dayOnly(ms)}</time>
}

function TerminalList({ onNeedsAccount }) {
    const headingId = useId()
    const headingRef = useRef(null)
    const noRef = useRef(null)
    const revokeButtons = useRef(new Map())
    const alive = useRef(true)
    const [status, setStatus] = useState('loading')
    const [tokens, setTokens] = useState([])
    const [failure, setFailure] = useState(null)
    const [asking, setAsking] = useState(null)
    const [refocus, setRefocus] = useState(null)
    const [revoking, setRevoking] = useState(null)
    const [rowProblems, setRowProblems] = useState({})
    const [note, setNote] = useState(null)

    const load = useCallback(async () => {
        clearServerUnavailable()
        setStatus('loading')
        setFailure(null)
        try {
            const answer = await listTerminalLogins()
            if (!alive.current) return
            setTokens(normaliseTokens(answer?.tokens))
            setStatus('ready')
        } catch (error) {
            if (!alive.current) return
            const described = describeFailure(error)
            if (described.kind === 'account') {
                onNeedsAccount()
                return
            }
            setFailure(described)
            setStatus('failed')
        }
    }, [onNeedsAccount])

    useEffect(() => {
        alive.current = true
        load()
        return () => { alive.current = false }
    }, [load])

    // Two steps, so the second one needs focus: on "No", the safe answer, so that
    // a second press of Enter cannot end a login by accident.
    useEffect(() => {
        if (asking) noRef.current?.focus()
    }, [asking])

    useEffect(() => {
        if (!refocus) return
        revokeButtons.current.get(refocus)?.focus()
        setRefocus(null)
    }, [refocus])

    const cancel = (token) => {
        setAsking(null)
        setRefocus(token.id)
    }

    const revoke = async (token) => {
        if (revoking) return
        clearServerUnavailable()
        setRevoking(token.id)
        setRowProblems((all) => ({ ...all, [token.id]: null }))
        try {
            await revokeTerminalLogin(token.id)
            setTokens((list) => list.filter((entry) => entry.id !== token.id))
            setAsking(null)
            setNote(`Revoked ${nameOf(token)}. That terminal is signed out.`)
            headingRef.current?.focus()
        } catch (error) {
            const described = describeFailure(error)
            if (described.kind === 'account') {
                onNeedsAccount()
                return
            }
            setAsking(null)
            if (error?.status === 404) {
                // Not this account's, or already gone: either way it is not in the list.
                setTokens((list) => list.filter((entry) => entry.id !== token.id))
                setNote(`${nameOf(token)} is not in your list any more.`)
                headingRef.current?.focus()
            } else {
                setRowProblems((all) => ({ ...all, [token.id]: described }))
                setRefocus(token.id)
            }
        } finally {
            setRevoking(null)
        }
    }

    const rowProblemText = (token, problem) => {
        const name = nameOf(token)
        if (problem.kind === 'rate') return 'Too many tries — wait a minute. It is still signed in.'
        if (problem.kind === 'network') {
            return `${problem.timeout ? 'di.iiii did not answer in time' : 'Could not reach di.iiii'}, so ${name} is still signed in. Press Revoke to try again.`
        }
        return `Could not revoke ${name} (error ${problem.status}). It is still signed in. Press Revoke to try again.`
    }

    return (
        <section className="device-card" aria-labelledby={headingId}>
            <h2 id={headingId} ref={headingRef} tabIndex={-1} className="device-card-title">
                Terminals signed in as you
            </h2>
            <p className="device-status device-status-list" role="status" aria-live="polite" aria-atomic="true">{note}</p>

            {status === 'loading' && <p className="device-note" role="status">Loading…</p>}

            {status === 'failed' && (
                <Problem problem={{ ...failure, retry: load }} doing="load the list" />
            )}

            {status === 'ready' && tokens.length === 0 && (
                <p className="device-note">None yet. Run <code>di login</code> in a terminal.</p>
            )}

            {status === 'ready' && tokens.length > 0 && (
                <ul className="device-rows">
                    {tokens.map((token) => {
                        const problem = rowProblems[token.id]
                        const name = nameOf(token)
                        return (
                            <li className="device-row" key={token.id}>
                                <div className="device-row-main">
                                    <span className="device-row-name"><bdi>{name}</bdi></span>
                                    <span className="device-row-meta">
                                        Signed in {token.createdAt === null ? 'at an unknown time' : <DayCell ms={token.createdAt} />}
                                        {' · '}
                                        Last used {token.lastUsedAt === null ? 'not yet' : <DayCell ms={token.lastUsedAt} />}
                                    </span>
                                </div>
                                <div className="device-row-actions">
                                    {asking === token.id ? (
                                        <div className="device-confirm" role="group" aria-label={`Really revoke ${name}?`}>
                                            <span className="device-confirm-text">Really revoke?</span>
                                            <button
                                                type="button"
                                                className="device-btn device-btn-danger"
                                                aria-busy={revoking === token.id}
                                                aria-label={`Yes, revoke ${name}`}
                                                onClick={() => revoke(token)}
                                            >
                                                Yes
                                            </button>
                                            <button
                                                type="button"
                                                ref={noRef}
                                                className="device-btn"
                                                aria-label={`No, keep ${name}`}
                                                onClick={() => cancel(token)}
                                            >
                                                No
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            className="device-btn"
                                            aria-label={`Revoke ${name}`}
                                            ref={(el) => {
                                                if (el) revokeButtons.current.set(token.id, el)
                                                else revokeButtons.current.delete(token.id)
                                            }}
                                            onClick={() => {
                                                setRowProblems((all) => ({ ...all, [token.id]: null }))
                                                setAsking(token.id)
                                            }}
                                        >
                                            Revoke
                                        </button>
                                    )}
                                </div>
                                {problem && (
                                    <div className="device-problem device-row-problem" role="alert">
                                        <p>{rowProblemText(token, problem)}</p>
                                    </div>
                                )}
                            </li>
                        )
                    })}
                </ul>
            )}
        </section>
    )
}

// ── the page ────────────────────────────────────────────────────────────────

export default function DeviceLoginPage() {
    const rootRef = useRef(null)
    useKeyboardPageScroll(rootRef)
    useDocumentTitle('Terminal sign-in — di.iiii')
    useNoIndex()

    const session = useAuthSession()
    const { refresh } = session

    // The server answered "this is not an account" (401, or 403 account_required)
    // to a call made here. The session cannot always tell: a guest looks signed in.
    const [refused, setRefused] = useState(false)
    const needAccount = useCallback(() => setRefused(true), [])
    const afterSignIn = useCallback(() => {
        setRefused(false)
        refresh?.()
    }, [refresh])
    const retrySession = useCallback(() => {
        clearServerUnavailable()
        refresh?.()
    }, [refresh])

    const isAccount = Boolean(session.authenticated) && session.type !== 'guest' && !refused

    let body
    if (session.loading) {
        body = <p className="device-note" role="status">Checking your session…</p>
    } else if (session.error) {
        body = (
            <div className="device-problem" role="alert">
                <p>Could not reach di.iiii to check who you are. Check your connection, then try again.</p>
                <button type="button" className="device-btn" onClick={retrySession}>Try again</button>
            </div>
        )
    } else if (session.local) {
        body = <p className="device-note">Terminal sign-in needs accounts, and this di.iiii runs without them.</p>
    } else if (!isAccount) {
        body = (
            <>
                <p className="device-lead">Sign in with your account to approve a terminal.</p>
                <Suspense fallback={<p className="device-note" role="status">Loading…</p>}>
                    <SignInSurface onSignedIn={afterSignIn} />
                </Suspense>
            </>
        )
    } else {
        body = (
            <>
                <Flow onNeedsAccount={needAccount} />
                <TerminalList onNeedsAccount={needAccount} />
            </>
        )
    }

    return (
        <div className="legal-root device-root" data-page="device" ref={rootRef}>
            <nav className="legal-nav">
                <a href="/" className="legal-nav-logo">di<span className="legal-dot">.</span>iiii</a>
                <div className="legal-nav-links">
                    <a href="/" className="legal-nav-link">← Home</a>
                    <a href="/wiki#terminal-sign-in" className="legal-nav-link">How this works</a>
                </div>
            </nav>

            <header className="legal-header">
                <p className="legal-eyebrow">terminal sign-in</p>
                <h1 className="legal-title">Sign a terminal in</h1>
                <p className="legal-lede">
                    A terminal shows a short code. Type it here to sign that terminal in as you.
                </p>
            </header>

            <main className="legal-content device-main">
                {body}
            </main>
        </div>
    )
}
