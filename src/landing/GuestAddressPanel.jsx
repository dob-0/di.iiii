import { useEffect, useState } from 'react'
import QrCode from '../components/QrCode.jsx'
import { apiFetch } from '../services/apiClient.js'

/**
 * Phones and headsets in this place — the guest path of the one local address
 * (docs/ai/one-local-address.md §5, D).
 *
 * Everyone with di opens http://diiii.localhost/ on their own machine. A device
 * WITHOUT di — a phone, a headset, a guest's laptop — opens this machine's one
 * HTTPS address instead, from a QR code shown here. Every fact on this panel
 * comes from the server (GET /api/guest-address, serverXR/src/guestAddress.js):
 * the name is the one in the certificate this machine serves, never typed in.
 * When there is no such name the panel says so and names the setting; it never
 * draws a code for an address that does not answer.
 */
export const fetchGuestAddress = async () => {
    const data = await apiFetch('/api/guest-address')
    return data?.guest || null
}

const Command = ({ children, long = false }) => <code className={`lh-guest-cmd${long ? ' lh-guest-cmd--long' : ''}`}>{children}</code>

const FOR_WHOM = 'For a phone, a headset or a guest’s laptop in this place that has no di of its own: scan the code, or type the address.'

function Body({ guest }) {
    if (guest.state === 'no-certificate' || guest.state === 'wildcard') {
        return (
            <div className="lh-guest-text">
                <p className="lh-guest-lead">
                    {guest.state === 'wildcard'
                        ? <>This machine’s certificate is for <strong>{guest.name}</strong>, which names no one machine, so there is no address to give a phone.</>
                        : <>This machine has no HTTPS name, so there is no address to give a phone.</>}
                </p>
                <p>
                    Setting: a certificate for a name you control at <Command long>{guest.setting}</Command>.
                    {' '}<Command>di up</Command> then serves https on the name written in it.
                </p>
                <p className="lh-guest-dim">
                    A plain network address is not enough: over http a phone gets no camera, no microphone and no XR.
                </p>
            </div>
        )
    }

    const unreachable = guest.state === 'not-on-network'
    const pointsElsewhere = !unreachable && guest.pointsHere === false
    const showCode = guest.state === 'ready' && !pointsElsewhere

    return (
        <div className={`lh-guest-row${showCode ? '' : ' lh-guest-row--nocode'}`}>
            {showCode && (
                <div className="lh-guest-qr">
                    <QrCode value={guest.address} size={184} label={`QR code for ${guest.address}`} />
                </div>
            )}
            <div className="lh-guest-text">
                <a className="lh-guest-address" href={guest.address} target="_blank" rel="noreferrer">{guest.address}</a>
                {showCode && <p className="lh-guest-lead">{FOR_WHOM}</p>}
                {unreachable && (
                    <p className="lh-guest-lead lh-guest-warn">
                        Phones cannot reach this machine on this start. Start it with <Command>{guest.command}</Command>, and the code appears here.
                    </p>
                )}
                {pointsElsewhere && (
                    <p className="lh-guest-lead lh-guest-warn">
                        The name points at {guest.pointsAt.join(', ')}, not at this machine, so a phone would land somewhere else.
                        {' '}<Command>{guest.command}</Command> points it here again through the dns-update hook in <Command>~/.di</Command>.
                    </p>
                )}
                {showCode && (
                    <p className="lh-guest-dim">
                        Same wifi as this machine.
                        {guest.pointsHere === true && <> The name points at {guest.pointsAt.join(', ')}, this machine, as this machine looks it up.</>}
                        {guest.pointsHere === null && guest.lookupError && <> This machine could not look the name up ({guest.lookupError}); a phone asks the place’s router.</>}
                    </p>
                )}
                {showCode && !guest.guests && (
                    <p className="lh-guest-dim">
                        Auth is off: whoever opens it can edit everything here. <Command>{guest.guestsCommand}</Command> gives each guest their own sandbox.
                    </p>
                )}
            </div>
        </div>
    )
}

export default function GuestAddressPanel({ onClose, load = fetchGuestAddress }) {
    const [status, setStatus] = useState({ loading: true, guest: null, error: null })

    useEffect(() => {
        let alive = true
        load()
            .then((guest) => { if (alive) setStatus({ loading: false, guest, error: guest ? null : 'empty' }) })
            .catch((error) => { if (alive) setStatus({ loading: false, guest: null, error: error?.status || error?.message || 'error' }) })
        return () => { alive = false }
    }, [load])

    return (
        <section className="lh-guest" aria-labelledby="lh-guest-title">
            <div className="lh-guest-head">
                <h2 id="lh-guest-title">Phones and headsets in this place</h2>
                {onClose && <button type="button" className="lh-guest-close" onClick={onClose}>Close</button>}
            </div>
            {status.loading && <p className="lh-guest-dim">Asking this machine…</p>}
            {!status.loading && status.guest && <Body guest={status.guest} />}
            {!status.loading && !status.guest && (
                <p className="lh-guest-lead lh-guest-warn">
                    {status.error === 404
                        ? 'This di did not answer the question; it may be older than this page. Update it with di update.'
                        : `This machine did not answer (${status.error}).`}
                </p>
            )}
        </section>
    )
}
