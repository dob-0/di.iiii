import { useEffect, useState } from 'react'
import {
    getSpaceFootprint,
    updateServerSpace,
    deleteServerSpace,
    restoreServerSpace,
    purgeServerSpace
} from '../../services/serverSpaces.js'
import { spaceName } from '../utils/spaceNames.js'

// Delete a space, and the Trash it goes to. Same promise a project's delete
// makes (StudioHub): nothing is removed, everything waits 30 days, and the
// confirm says so before the click rather than after it.

const DAY_MS = 24 * 60 * 60 * 1000

export const formatBytes = (bytes) => {
    const n = Number(bytes) || 0
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`
    return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

export const daysLeft = (restorableUntil, now = Date.now()) =>
    Math.max(0, Math.ceil(((Number(restorableUntil) || 0) - now) / DAY_MS))

export function SpaceDeleteDialog({ space, isAdmin = false, onClose, onDone }) {
    const [footprint, setFootprint] = useState(null)
    const [permanent, setPermanent] = useState(Boolean(space?.permanent))
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const name = spaceName(space)

    useEffect(() => {
        let cancelled = false
        getSpaceFootprint(space.id)
            .then((held) => { if (!cancelled) setFootprint(held) })
            .catch((e) => { if (!cancelled) setError(e.message || 'Could not read what this space holds.') })
        return () => { cancelled = true }
    }, [space.id])

    useEffect(() => {
        const onKey = (event) => { if (event.key === 'Escape' && !busy) onClose?.() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [busy, onClose])

    // The server refuses these whatever the client says; the dialog says why first.
    const reason = footprint?.protected && footprint.protected !== 'permanent'
        ? footprint.protected
        : (permanent ? 'permanent' : null)

    const unmarkPermanent = async () => {
        setBusy(true)
        setError('')
        try {
            await updateServerSpace(space.id, { permanent: false })
            setPermanent(false)
            setFootprint((held) => (held ? { ...held, protected: null } : held))
        } catch (e) {
            setError(e.message || 'Could not unmark the space.')
        } finally {
            setBusy(false)
        }
    }

    const confirm = async () => {
        setBusy(true)
        setError('')
        try {
            const receipt = await deleteServerSpace(space.id)
            onDone?.(receipt)
        } catch (e) {
            setError(e.message || 'Could not delete the space.')
            setBusy(false)
        }
    }

    const holdDays = Math.round((footprint?.holdMs || 30 * DAY_MS) / DAY_MS)

    return (
        <div className="ssh-dialog-scrim" role="presentation" onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose?.() }}>
            <div
                className="ssh-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="ssh-delete-title"
            >
                <h3 id="ssh-delete-title" className="ssh-dialog-title">Delete the space “{name}”?</h3>
                {footprint && !reason && (
                    <p className="ssh-dialog-body">
                        {footprint.projects === 0
                            ? 'It is empty: no projects.'
                            : `${plural(footprint.projects, 'project', 'projects')} go with it, ${formatBytes(footprint.bytes)} in all.`}
                        {' '}It goes to the Trash for {holdDays} days. Until then you can bring it back, with its projects.
                        After that it is removed for good.
                    </p>
                )}
                {!footprint && !error && <p className="ssh-dialog-body">Reading what it holds…</p>}
                {reason === 'permanent' && (
                    <p className="ssh-dialog-body">
                        This space is marked permanent (kept through the idle clean-up), so it is not deleted.
                        {isAdmin
                            ? ' Unmark it first, then delete it.'
                            : ' Only an admin can unmark it.'}
                    </p>
                )}
                {reason && reason !== 'permanent' && (
                    <p className="ssh-dialog-body">
                        This is {reason === 'front-room' ? 'the front room' : `a ${reason} space`}. It cannot be deleted.
                    </p>
                )}
                {error && <p className="ssh-dialog-body ssh-dialog-error" role="alert">{error}</p>}
                <div className="ssh-dialog-actions">
                    <button type="button" className="ssh-card-btn" onClick={onClose} disabled={busy}>Cancel</button>
                    {reason === 'permanent' && isAdmin && (
                        <button type="button" className="ssh-card-btn" onClick={unmarkPermanent} disabled={busy}>Unmark permanent</button>
                    )}
                    {!reason && (
                        <button
                            type="button"
                            className="ssh-card-btn ssh-card-btn--danger"
                            onClick={confirm}
                            disabled={busy || !footprint}
                        >{busy ? 'Moving…' : 'Move to Trash'}</button>
                    )}
                </div>
            </div>
        </div>
    )
}

export function SpaceTrashPanel({ trash, onChanged, onClose }) {
    const [busyId, setBusyId] = useState(null)
    const [error, setError] = useState('')
    // "Delete forever" asks twice, in place: the first press arms it.
    const [armedId, setArmedId] = useState(null)

    const run = async (space, action) => {
        setBusyId(space.id)
        setError('')
        try {
            await action(space.id)
            setArmedId(null)
            await onChanged?.()
        } catch (e) {
            setError(e.message || 'That did not work.')
        } finally {
            setBusyId(null)
        }
    }

    return (
        <section className="ssh-trash" aria-label="Trash">
            <div className="ssh-trash-head">
                <h3 className="ssh-trash-title">Trash</h3>
                <button type="button" className="ssh-card-btn" onClick={onClose}>Close</button>
            </div>
            {error && <p className="ssh-linker-status ssh-linker-error" role="alert">{error}</p>}
            {trash.spaces.length === 0 && <p className="ssh-linker-status">Nothing in the trash.</p>}
            <ul className="ssh-trash-list">
                {trash.spaces.map((space) => {
                    const left = daysLeft(space.restorableUntil)
                    return (
                        <li key={space.id} className="ssh-trash-row" data-trashed-space={space.id}>
                            <span className="ssh-trash-name">
                                <b>{spaceName(space)}</b>
                                <span className="ssh-trash-meta">
                                    {plural(space.projectCount || 0, 'project', 'projects')} · {plural(left, 'day', 'days')} left
                                </span>
                            </span>
                            <span className="ssh-trash-acts">
                                <button
                                    type="button"
                                    className="ssh-card-btn"
                                    disabled={busyId === space.id}
                                    onClick={() => run(space, restoreServerSpace)}
                                >Restore</button>
                                {armedId === space.id ? (
                                    <button
                                        type="button"
                                        className="ssh-card-btn ssh-card-btn--danger"
                                        disabled={busyId === space.id}
                                        onClick={() => run(space, purgeServerSpace)}
                                    >Remove for good</button>
                                ) : (
                                    <button
                                        type="button"
                                        className="ssh-card-btn ssh-card-btn--danger"
                                        disabled={busyId === space.id}
                                        onClick={() => setArmedId(space.id)}
                                    >Delete forever…</button>
                                )}
                            </span>
                        </li>
                    )
                })}
            </ul>
        </section>
    )
}
