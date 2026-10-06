// A space on its own domain — the owner's panel, under Manage on the space's card.
// Spec: docs/architecture/SPEC_space_own_domain.md.
//
// The owner types a domain. The server registers it, keeps checking, and
// switches it on when its DNS points at di.iiii; this panel only shows where
// each domain stands and the record still to add. Nothing here is a step the
// owner has to remember: "Check now" is a shortcut, not a duty — the server
// checks on its own every two minutes.

import { useCallback, useEffect, useState } from 'react'
import { addSpaceDomain, checkSpaceDomain, listSpaceDomains, removeSpaceDomain } from '../../services/serverSpaces.js'

const STATE_WORDS = {
    active: 'Live',
    pending: 'Waiting for DNS',
    failed: 'Not working',
    unmanaged: 'Saved — not switched on'
}

const messageOf = (error) => error?.data?.message || error?.message || 'Something went wrong.'

export default function SpaceDomainPanel({ space, onClose }) {
    const [domains, setDomains] = useState([])
    const [connected, setConnected] = useState(true)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [draft, setDraft] = useState('')
    const [busy, setBusy] = useState('')

    const load = useCallback(async () => {
        try {
            const result = await listSpaceDomains(space.id)
            setDomains(result.domains)
            setConnected(result.connected)
            setError('')
        } catch (err) {
            setError(messageOf(err))
        } finally {
            setLoading(false)
        }
    }, [space.id])

    useEffect(() => { load() }, [load])

    const replace = (domain) => setDomains((list) => list.map((d) => (d.hostname === domain.hostname ? domain : d)))

    const handleAdd = async (event) => {
        event.preventDefault()
        const hostname = draft.trim()
        if (!hostname) return
        setBusy('add')
        try {
            const domain = await addSpaceDomain(space.id, hostname)
            setDomains((list) => [...list.filter((d) => d.hostname !== domain.hostname), domain])
            setDraft('')
            setError('')
        } catch (err) {
            setError(messageOf(err))
        } finally {
            setBusy('')
        }
    }

    const handleCheck = async (hostname) => {
        setBusy(hostname)
        try {
            replace(await checkSpaceDomain(space.id, hostname))
            setError('')
        } catch (err) {
            setError(messageOf(err))
        } finally {
            setBusy('')
        }
    }

    const handleRemove = async (hostname) => {
        setBusy(hostname)
        try {
            await removeSpaceDomain(space.id, hostname)
            setDomains((list) => list.filter((d) => d.hostname !== hostname))
            setError('')
        } catch (err) {
            setError(messageOf(err))
        } finally {
            setBusy('')
        }
    }

    return (
        <div className="ssh-project-linker" role="presentation" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
            <p className="ssh-linker-status">
                Your own domain shows this space to visitors. You keep editing here.
            </p>
            {!space.isPublic && (
                <p className="ssh-linker-status ssh-linker-error">
                    Make the space public first: a domain shows it to everyone.
                </p>
            )}
            {!connected && (
                <p className="ssh-linker-status">
                    This di.iiii is not connected to Cloudflare, so a domain is saved but does not switch on by itself. An admin can switch it on.
                </p>
            )}
            {loading && <p className="ssh-linker-status">Loading…</p>}
            {error && <p className="ssh-linker-status ssh-linker-error">{error}</p>}

            {domains.length > 0 && (
                <div className="ssh-linker-list">
                    {domains.map((domain) => (
                        <div key={domain.hostname} className="ssh-domain-item">
                            <div className="ssh-linker-item">
                                <span className="ssh-linker-select">
                                    <span>
                                        <strong>{domain.hostname}</strong>
                                        {' · '}
                                        <span className={domain.live ? 'ssh-badge-live' : ''}>{STATE_WORDS[domain.state] || domain.state}</span>
                                    </span>
                                </span>
                                {connected && !domain.live && (
                                    <button className="ssh-linker-rename-btn" disabled={Boolean(busy)} onClick={() => handleCheck(domain.hostname)}>
                                        {busy === domain.hostname ? 'Checking…' : 'Check now'}
                                    </button>
                                )}
                                <button className="ssh-linker-rename-btn" disabled={Boolean(busy)} onClick={() => handleRemove(domain.hostname)}>
                                    Remove
                                </button>
                            </div>
                            {domain.live && (
                                <p className="ssh-linker-status">
                                    <a href={`https://${domain.hostname}/`} target="_blank" rel="noreferrer">https://{domain.hostname}</a> shows this space.
                                </p>
                            )}
                            {!domain.live && domain.records?.length > 0 && (
                                <>
                                    <p className="ssh-linker-status">Add these at the company that runs your domain’s DNS:</p>
                                    <table className="ssh-domain-records">
                                        <tbody>
                                            {domain.records.map((record) => (
                                                <tr key={`${record.type}:${record.name}`}>
                                                    <td>{record.type}</td>
                                                    <td><code>{record.name}</code></td>
                                                    <td><code>{record.value}</code></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <p className="ssh-linker-status">
                                        It switches on by itself once these are in place. A domain with nothing pointed at it is let go after 7 days.
                                    </p>
                                </>
                            )}
                            {domain.lastError && !domain.live && (
                                <p className="ssh-linker-status ssh-linker-error">{domain.lastError}</p>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {space.isPublic && (
                <form className="ssh-linker-footer" onSubmit={handleAdd}>
                    <input
                        className="ssh-domain-input"
                        value={draft}
                        placeholder="yourdomain.com"
                        aria-label="Domain"
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(e) => setDraft(e.target.value)}
                    />
                    <button type="submit" className="ssh-card-btn" disabled={!draft.trim() || Boolean(busy)}>
                        {busy === 'add' ? 'Adding…' : 'Add domain'}
                    </button>
                    <button type="button" className="ssh-card-btn" onClick={onClose}>Close</button>
                </form>
            )}
            {!space.isPublic && (
                <div className="ssh-linker-footer">
                    <button className="ssh-card-btn" onClick={onClose}>Close</button>
                </div>
            )}
        </div>
    )
}
