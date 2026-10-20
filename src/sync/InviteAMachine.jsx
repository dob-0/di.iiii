import React, { useEffect, useRef, useState } from 'react'
import './syncLight.css'
import { issueJoinCode, revokeJoinCode } from './syncApi.js'

const mmss = (ms) => {
    const total = Math.max(0, Math.ceil(ms / 1000))
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * "Invite a machine": a four-word code for one space, and the address to type
 * with it. Used under the light, and on a space's card in the Manage row, so
 * the first invite has a door even before anything is shared.
 *
 * @param {object} props
 * @param {string} props.space
 * @param {() => void} [props.onBack]   shows a Back button when given
 * @param {() => void} [props.onChange] called after a code is made or revoked
 */
export default function InviteAMachine({ space, onBack = null, onChange = () => {} }) {
    const [invite, setInvite] = useState(null)
    const [error, setError] = useState(null)
    const [ended, setEnded] = useState(null)
    const started = useRef(false)

    useEffect(() => {
        if (started.current) return
        started.current = true
        issueJoinCode(space)
            .then((issued) => { setInvite({ ...issued, now: Number.isFinite(issued.now) ? issued.now : Date.now(), receivedAt: Date.now() }); onChange() })
            .catch((failure) => setError(failure?.message || 'Could not make a code.'))
    }, [space, onChange])

    const revoke = async () => {
        if (!invite) return
        try {
            await revokeJoinCode(space, invite.id)
            setEnded('Revoked. Nobody can use that code now.')
            setInvite(null)
        } catch (failure) {
            setError(failure?.message || 'Could not revoke it.')
        }
    }

    // The code's end is on the SERVER's clock; count from its own `now`.
    const [clock, setClock] = useState(0)
    useEffect(() => {
        if (!invite) return undefined
        const interval = setInterval(() => setClock(Date.now()), 1000)
        return () => clearInterval(interval)
    }, [invite])
    const left = invite ? invite.expiresAt - (invite.now + Math.max(0, (clock || invite.receivedAt) - invite.receivedAt)) : 0
    const expired = invite && left <= 0

    return (
        <>
            <p className="spanel-label">On the other machine, open di.iiii → Join, and type</p>
            {error && <p className="spanel-error" role="alert">{error}</p>}
            {ended && <p className="spanel-note">{ended}</p>}
            {!invite && !error && !ended && <p className="sdim">Making a code…</p>}
            {invite && (
                <>
                    <div className="scode" aria-label="Join code">{expired ? '— — — —' : invite.code}</div>
                    <p className="sdim">
                        {expired
                            ? 'This code has ended. Make a new one.'
                            : `Works for 10 minutes · this space only · you can revoke it · ${mmss(left)} left`}
                    </p>
                    {!expired && (
                        <>
                            <p className="spanel-label">And this address</p>
                            {invite.addresses?.length
                                ? invite.addresses.map((address) => <span key={address} className="saddress">{address}</span>)
                                : (
                                    <p className="spanel-note">
                                        This di.iiii answers only on this machine, so no other machine can reach it.
                                        Start it with <b>di up --lan</b> (same network) or use Tailscale, then make a new code.
                                    </p>
                                )}
                        </>
                    )}
                </>
            )}
            <div className="spanel-actions">
                {invite && !expired && <button type="button" className="sbtn" onClick={revoke}>Revoke this code</button>}
                {onBack && <button type="button" className="sbtn sbtn--quiet" onClick={onBack}>Back</button>}
            </div>
        </>
    )
}

