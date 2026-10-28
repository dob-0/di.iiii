import { useCallback, useEffect, useState } from 'react'
import QrCode from '../components/QrCode.jsx'
import { apiFetch } from '../services/apiClient.js'
import GuestAddressPanel from './GuestAddressPanel.jsx'

/**
 * Share this install on the wifi (docs/ai/team-sync-by-network-name.md §7).
 *
 * One press opens the install's door for guests with its own name and
 * certificate; one press closes it. Every fact comes from the server
 * (GET/POST/DELETE /api/share, serverXR/src/shareDoor.js). Three states:
 *   - no name yet: the older phones-and-headsets panel, with its setting;
 *   - private: what the name is, and the Share button;
 *   - shared: the QR of the address, the line for another di, and Unshare.
 * A code is drawn only while the door is open: a QR for an address that does
 * not answer is a code that goes nowhere.
 */
export const fetchShare = () => apiFetch('/api/share')
export const openShare = () => apiFetch('/api/share', { method: 'POST' })
export const closeShare = () => apiFetch('/api/share', { method: 'DELETE' })

const Command = ({ children }) => <code className="lh-guest-cmd">{children}</code>

export const shareUrl = (share) => `https://${share.name}${share.port === 443 ? '' : `:${share.port}`}/`

export default function SharePanel({ onClose, load = fetchShare, open = openShare, close = closeShare }) {
    const [share, setShare] = useState(null)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [problem, setProblem] = useState(null)

    useEffect(() => {
        let alive = true
        load()
            .then((next) => { if (alive) setShare(next) })
            .catch(() => { if (alive) setShare(null) })
            .finally(() => { if (alive) setLoading(false) })
        return () => { alive = false }
    }, [load])

    const press = useCallback(async (action) => {
        setBusy(true)
        setProblem(null)
        try {
            setShare(await action())
        } catch (error) {
            setProblem(error?.data?.message || error?.message || 'The install did not answer.')
        } finally {
            setBusy(false)
        }
    }, [])

    if (loading) {
        return (
            <section className="lh-guest" aria-labelledby="lh-share-title">
                <h2 id="lh-share-title">Share this install on the wifi</h2>
                <p className="lh-guest-dim">Asking this machine…</p>
            </section>
        )
    }
    // No name (or an older install that does not know the route): the panel that says what is missing.
    if (!share || typeof share.shared !== 'boolean' || !share.name) return <GuestAddressPanel onClose={onClose} />

    const url = shareUrl(share)
    return (
        <section className="lh-guest lh-share" aria-labelledby="lh-share-title" data-share-state={share.shared ? 'shared' : 'private'}>
            <div className="lh-guest-head">
                <h2 id="lh-share-title">Share this install on the wifi</h2>
                {onClose && <button type="button" className="lh-guest-close" onClick={onClose}>Close</button>}
            </div>
            {share.shared ? (
                <div className="lh-guest-row">
                    <div className="lh-guest-qr">
                        <QrCode value={url} size={184} label={`QR code for ${url}`} />
                    </div>
                    <div className="lh-guest-text">
                        <a className="lh-guest-address" href={url} target="_blank" rel="noreferrer">{url}</a>
                        <p className="lh-guest-lead">Shared. A phone, a headset or a laptop on this wifi scans the code and arrives as a guest, with the open space. Your spaces stay yours.</p>
                        <p className="lh-guest-dim">For another di: <Command>{`di follow <space> --from ${share.name.split('.')[0]}`}</Command></p>
                        {share.error && <p className="lh-guest-lead lh-guest-warn">{share.error}</p>}
                        <button type="button" className="lh-door-button lh-share-press" disabled={busy} onClick={() => press(close)}>Unshare</button>
                    </div>
                </div>
            ) : (
                <div className="lh-guest-text">
                    <p className="lh-guest-lead">Private. <strong>{share.name}</strong> is this install’s name; nothing listens on the wifi yet.</p>
                    <button type="button" className="lh-door-button lh-share-press" disabled={busy} onClick={() => press(open)}>Share</button>
                </div>
            )}
            {problem && <p className="lh-guest-lead lh-guest-warn" role="alert">{problem}</p>}
        </section>
    )
}
