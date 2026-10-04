import React, { useState } from 'react'
import './syncLight.css'
import { joinWithCode, previewJoin } from './syncApi.js'

/**
 * "Join" — the other half of linking two machines (sketch C, 2026-10-01).
 *
 * Four words and the host's address; this install's own server then does what
 * `di follow` does (serverXR/src/follow/join.js). Two steps, so nothing is
 * spent before the person has seen what they are joining:
 *
 *   Find  → "found · ponyo · space MOXIR · 16 projects"   (the code is NOT spent)
 *   Join  → copies the space here and keeps it in step    (the code is spent)
 *
 * A same-named space already here is somebody's work: it is only merged into
 * when the person says so, and the code is not spent before they do.
 */
export default function JoinMachine({ onJoined = () => {}, onClose = null }) {
    const [address, setAddress] = useState('')
    const [code, setCode] = useState('')
    const [step, setStep] = useState('form')        // form → found → joining → done
    const [found, setFound] = useState(null)
    const [merge, setMerge] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState(null)
    const [joined, setJoined] = useState(null)

    const canFind = address.trim().length > 0 && code.trim().split(/[\s·.,;:|/\\_-]+/).filter(Boolean).length === 4

    const find = async (event) => {
        event?.preventDefault()
        if (!canFind || busy) return
        setBusy(true)
        setError(null)
        try {
            const result = await previewJoin({ address: address.trim(), code: code.trim() })
            setFound(result)
            setMerge(false)
            setStep('found')
        } catch (failure) {
            setError(failure.message)
        } finally {
            setBusy(false)
        }
    }

    const join = async () => {
        if (busy || (found?.localExists && !merge)) return
        setBusy(true)
        setError(null)
        setStep('joining')
        try {
            const result = await joinWithCode({ address: address.trim(), code: code.trim(), into: merge })
            setJoined(result)
            setStep('done')
            onJoined(result)
        } catch (failure) {
            setError(failure.message)
            // A refusal before the code was spent leaves it good; one after says so itself.
            setStep('found')
        } finally {
            setBusy(false)
        }
    }

    const again = () => { setStep('form'); setFound(null); setError(null); setCode('') }

    return (
        <section className="sjoin" aria-label="Join a space from another machine">
            <h2>Join</h2>
            {step === 'done' ? (
                <>
                    <p>
                        Joined <b>{joined?.label || joined?.spaceId}</b>{joined?.hostName ? <> from <b>{joined.hostName}</b></> : null}.
                        {' '}It is copying here and will keep in step.
                    </p>
                    <div className="spanel-actions">
                        <a className="sbtn" href={`/${encodeURIComponent(joined.spaceId)}`}>Open it</a>
                        {onClose && <button type="button" className="sbtn sbtn--quiet" onClick={onClose}>Close</button>}
                    </div>
                </>
            ) : (
                <form onSubmit={find}>
                    <label className="sfield">
                        <span>Address of the other machine</span>
                        <input
                            className="sinput"
                            value={address}
                            onChange={(event) => { setAddress(event.target.value); if (step !== 'form') setStep('form') }}
                            placeholder="192.168.1.9:3000"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck="false"
                            inputMode="url"
                            disabled={step === 'joining'}
                        />
                    </label>
                    <label className="sfield">
                        <span>Code</span>
                        <input
                            className="sinput scode scode--input"
                            value={code}
                            onChange={(event) => { setCode(event.target.value); if (step !== 'form') setStep('form') }}
                            placeholder="AMBER · DESK · NINE · RIVER"
                            autoCapitalize="characters"
                            autoCorrect="off"
                            spellCheck="false"
                            disabled={step === 'joining'}
                        />
                    </label>
                    {error && <p className="spanel-error" role="alert">{error}</p>}
                    {step === 'form' && (
                        <div className="spanel-actions">
                            <button type="submit" className="sbtn" disabled={!canFind || busy}>{busy ? 'Looking…' : 'Find'}</button>
                            {onClose && <button type="button" className="sbtn sbtn--quiet" onClick={onClose}>Close</button>}
                        </div>
                    )}
                    {(step === 'found' || step === 'joining') && found && (
                        <>
                            <div className="spanel-row">
                                <span>found</span>
                                <span>
                                    {found.hostName ? `${found.hostName} · ` : ''}space {String(found.label || found.spaceId).toUpperCase()}
                                    {Number.isFinite(found.projects) ? ` · ${found.projects} ${found.projects === 1 ? 'project' : 'projects'}` : ''}
                                </span>
                            </div>
                            {found.localExists && (
                                <label className="spanel-note" style={{ display: 'block' }}>
                                    <input type="checkbox" checked={merge} onChange={(event) => setMerge(event.target.checked)} />
                                    {' '}A space called {found.spaceId} is already here. Merge the other copy into it.
                                </label>
                            )}
                            <div className="spanel-actions">
                                <button type="button" className="sbtn" onClick={join} disabled={busy || (found.localExists && !merge)}>
                                    {step === 'joining' ? 'Joining…' : 'Join — copy it here and keep it in step'}
                                </button>
                                <button type="button" className="sbtn sbtn--quiet" onClick={again} disabled={busy}>Start over</button>
                            </div>
                        </>
                    )}
                </form>
            )}
        </section>
    )
}
