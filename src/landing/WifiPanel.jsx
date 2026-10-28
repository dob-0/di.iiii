import { useCallback, useEffect, useState } from 'react'
import QrCode from '../components/QrCode.jsx'
import { apiFetch } from '../services/apiClient.js'
import GuestAddressPanel from './GuestAddressPanel.jsx'

/**
 * Open this install on the wifi (docs/ai/team-sync-by-network-name.md §7).
 *
 * One press opens the install's door for guests with its own name and
 * certificate; one press closes it. Every fact comes from the server
 * (GET/POST/DELETE /api/wifi-door, serverXR/src/wifiDoor.js). Three states:
 *   - no name yet: the older phones-and-headsets panel, with its setting;
 *   - private: what the name is, and the Open door button;
 *   - open: the QR of the address, the line for another di, and Close door.
 * A code is drawn only while the door is open: a QR for an address that does
 * not answer is a code that goes nowhere.
 */
export const fetchWifi = () => apiFetch('/api/wifi-door')
export const openWifi = () => apiFetch('/api/wifi-door', { method: 'POST' })
export const closeWifi = () => apiFetch('/api/wifi-door', { method: 'DELETE' })

const Command = ({ children }) => <code className="lh-guest-cmd">{children}</code>

export const wifiUrl = (door) => `https://${door.name}${door.port === 443 ? '' : `:${door.port}`}/`

export default function WifiPanel({ onClose, load = fetchWifi, open = openWifi, close = closeWifi }) {
    const [door, setDoor] = useState(null)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [problem, setProblem] = useState(null)

    useEffect(() => {
        let alive = true
        load()
            .then((next) => { if (alive) setDoor(next) })
            .catch(() => { if (alive) setDoor(null) })
            .finally(() => { if (alive) setLoading(false) })
        return () => { alive = false }
    }, [load])

    const press = useCallback(async (action) => {
        setBusy(true)
        setProblem(null)
        try {
            setDoor(await action())
        } catch (error) {
            setProblem(error?.data?.message || error?.message || 'The install did not answer.')
        } finally {
            setBusy(false)
        }
    }, [])

    if (loading) {
        return (
            <section className="lh-guest" aria-labelledby="lh-wifi-title">
                <h2 id="lh-wifi-title">Open this install on the wifi</h2>
                <p className="lh-guest-dim">Asking this machine…</p>
            </section>
        )
    }
    // No name (or an older install that does not know the route): the panel that says what is missing.
    if (!door || typeof door.open !== 'boolean' || !door.name) return <GuestAddressPanel onClose={onClose} />

    const url = wifiUrl(door)
    return (
        <section className="lh-guest lh-wifi" aria-labelledby="lh-wifi-title" data-wifi-state={door.open ? 'open' : 'private'}>
            <div className="lh-guest-head">
                <h2 id="lh-wifi-title">Open this install on the wifi</h2>
                {onClose && <button type="button" className="lh-guest-close" onClick={onClose}>Close</button>}
            </div>
            {door.open ? (
                <div className="lh-guest-row">
                    <div className="lh-guest-qr">
                        <QrCode value={url} size={184} label={`QR code for ${url}`} />
                    </div>
                    <div className="lh-guest-text">
                        <a className="lh-guest-address" href={url} target="_blank" rel="noreferrer">{url}</a>
                        <p className="lh-guest-lead">Open. A phone, a headset or a laptop on this wifi scans the code and arrives as a guest, with the open space. Your spaces stay yours.</p>
                        <p className="lh-guest-dim">For another di: <Command>{`di follow <space> --from ${door.name.split('.')[0]}`}</Command></p>
                        {door.error && <p className="lh-guest-lead lh-guest-warn">{door.error}</p>}
                        <button type="button" className="lh-door-button lh-wifi-press" disabled={busy} onClick={() => press(close)}>Close door</button>
                    </div>
                </div>
            ) : (
                <div className="lh-guest-text">
                    <p className="lh-guest-lead">Private. <strong>{door.name}</strong> is this install’s name; nothing listens on the wifi yet.</p>
                    <button type="button" className="lh-door-button lh-wifi-press" disabled={busy} onClick={() => press(open)}>Open door</button>
                </div>
            )}
            {problem && <p className="lh-guest-lead lh-guest-warn" role="alert">{problem}</p>}
        </section>
    )
}
