import { useCallback, useEffect, useRef, useState } from 'react'
import { disconnectMachine, listMachines } from '../services/cliLoginApi.js'
import './connectedMachines.css'

// The machines this account connected with `di connect`, each with Disconnect.
// One component, two places: the right-hand column of /device and the Spaces and users box in /admin.
// A machine stays connected on its own (new spaces are followed on its next check); Disconnect ends its keys
// and nothing else — the work on that machine is not touched (docs/architecture/CLI_LOGIN.md, "Connecting a machine").

const text = (value) => String(value ?? '').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, 80)

export const normaliseMachines = (list) => (Array.isArray(list) ? list : [])
    .filter((m) => m && typeof m.id === 'string' && m.id)
    .map((m) => ({
        id: m.id,
        name: text(m.name) || 'a machine',
        since: text(m.since),
        spaces: Array.isArray(m.spaces) ? m.spaces.map((s) => text(s?.label || s?.id)).filter(Boolean) : []
    }))

export default function ConnectedMachines({ heading = 'Connected machines', headingLevel = 2 }) {
    const Heading = `h${headingLevel}`
    const alive = useRef(true)
    const [status, setStatus] = useState('loading')
    const [machines, setMachines] = useState([])
    const [note, setNote] = useState('')
    const [asking, setAsking] = useState(null)
    const [busy, setBusy] = useState(null)

    const load = useCallback(async () => {
        setStatus('loading')
        try {
            const answer = await listMachines()
            if (!alive.current) return
            setMachines(normaliseMachines(answer?.machines))
            setStatus('ready')
        } catch (error) {
            if (!alive.current) return
            setStatus(error?.status === 401 || error?.status === 403 ? 'account' : 'failed')
        }
    }, [])

    useEffect(() => {
        alive.current = true
        load()
        return () => { alive.current = false }
    }, [load])

    const disconnect = async (machine) => {
        if (busy) return
        setBusy(machine.id)
        try {
            await disconnectMachine(machine.id)
            setMachines((all) => all.filter((m) => m.id !== machine.id))
            setNote(`Disconnected ${machine.name}. Its work was not touched.`)
        } catch (error) {
            if (error?.status === 404) {
                setMachines((all) => all.filter((m) => m.id !== machine.id))
                setNote(`${machine.name} is not in your list any more.`)
            } else setNote(`Could not disconnect ${machine.name}. It is still connected. Press Disconnect to try again.`)
        } finally {
            setBusy(null)
            setAsking(null)
        }
    }

    return (
        <section className="cm" aria-label={heading}>
            <Heading className="cm-title">{heading}</Heading>
            <p className="cm-note" role="status" aria-live="polite">{note}</p>
            {status === 'loading' && <p className="cm-empty">Loading…</p>}
            {status === 'account' && <p className="cm-empty">Sign in with an account to see its machines.</p>}
            {status === 'failed' && (
                <p className="cm-empty">Could not load the list. <button type="button" className="cm-btn" onClick={load}>Try again</button></p>
            )}
            {status === 'ready' && machines.length === 0 && (
                <p className="cm-empty">None yet. Run <code>di login</code> then <code>di connect</code> on a machine.</p>
            )}
            {status === 'ready' && machines.length > 0 && (
                <ul className="cm-list">
                    {machines.map((m) => (
                        <li className="cm-row" key={m.id}>
                            <div className="cm-main">
                                <span className="cm-name"><bdi>{m.name}</bdi></span>
                                <span className="cm-meta">
                                    Connected {m.since || 'at an unknown time'} · {m.spaces.length} {m.spaces.length === 1 ? 'space' : 'spaces'}
                                    {m.spaces.length ? `: ${m.spaces.join(', ')}` : ''}
                                </span>
                            </div>
                            {asking === m.id ? (
                                <div className="cm-confirm" role="group" aria-label={`Really disconnect ${m.name}?`}>
                                    <span>Really disconnect?</span>
                                    <button type="button" className="cm-btn cm-danger" aria-label={`Yes, disconnect ${m.name}`} onClick={() => disconnect(m)}>Yes</button>
                                    <button type="button" className="cm-btn" aria-label={`No, keep ${m.name}`} onClick={() => setAsking(null)}>No</button>
                                </div>
                            ) : (
                                <button type="button" className="cm-btn" aria-label={`Disconnect ${m.name}`} onClick={() => setAsking(m.id)}>Disconnect</button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}
