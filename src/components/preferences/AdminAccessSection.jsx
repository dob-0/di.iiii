import { useCallback, useEffect, useState } from 'react'
import { ModuleSection, MetricCard } from './PreferencesShared.jsx'
import {
    listServerSpaces,
    getServerConfig,
    patchServerConfig,
    updateServerSpace
} from '../../services/serverSpaces.js'
import { listUsers, updateUser } from '../../services/usersApi.js'

const ROLES = ['viewer', 'editor', 'admin']

// Admin management surface — guest mode + per-user access — composed entirely
// from the canonical preferences-* design system (no bespoke styling).
export default function AdminAccessSection() {
    const [spaces, setSpaces] = useState([])
    const [globalSpaceId, setGlobalSpaceId] = useState(null)
    const [users, setUsers] = useState(null) // null = loading, [] = none / not admin
    const [error, setError] = useState('')

    const load = useCallback(async () => {
        try {
            const [list, cfg] = await Promise.all([listServerSpaces(), getServerConfig()])
            setSpaces(list)
            setGlobalSpaceId(cfg.globalSpaceId || null)
            setError('')
        } catch (e) {
            setError(e.message || 'Failed to load spaces.')
        }
        try {
            setUsers(await listUsers())
        } catch {
            setUsers([]) // not an admin (or auth disabled) — no people panel
        }
    }, [])

    useEffect(() => { load() }, [load])

    const setGlobal = useCallback(async (spaceId) => {
        const makeGlobal = globalSpaceId !== spaceId
        try {
            await patchServerConfig({ globalSpaceId: makeGlobal ? spaceId : null })
            if (makeGlobal) await updateServerSpace(spaceId, { kind: 'global' })
            setGlobalSpaceId(makeGlobal ? spaceId : null)
            await load()
        } catch (e) {
            alert(e.message || 'Could not update the global space.')
        }
    }, [globalSpaceId, load])

    const patchUser = useCallback(async (userId, patch) => {
        try {
            const updated = await updateUser(userId, patch)
            setUsers(prev => prev ? prev.map(u => u.id === userId ? { ...u, ...updated } : u) : prev)
        } catch (e) {
            alert(e.message || 'Could not update user.')
        }
    }, [])

    const toggleUserSpace = useCallback((user, spaceId) => {
        const next = user.spaces?.includes(spaceId)
            ? user.spaces.filter(s => s !== spaceId)
            : [...(user.spaces || []), spaceId]
        patchUser(user.id, { spaces: next })
    }, [patchUser])

    return (
        <>
            <ModuleSection title="Guest Access" subtitle="How signed-out visitors enter spaces">
                <div className="preferences-status-grid">
                    <MetricCard
                        label="Guest Mode"
                        value={globalSpaceId ? 'Shared global' : 'Sandbox / guest'}
                        tone={globalSpaceId ? 'success' : 'accent'}
                    />
                    <MetricCard label="Global Space" value={globalSpaceId || '—'} />
                    <MetricCard label="Spaces" value={spaces.length} />
                    <MetricCard label="Accounts" value={Array.isArray(users) ? users.length : '—'} />
                </div>
                {error && <div className="preferences-empty">{error}</div>}
                <div className="preferences-command-grid">
                    {spaces.map((s) => (
                        <button
                            key={s.id}
                            type="button"
                            className={`toggle-button ${globalSpaceId === s.id ? 'active success-button' : ''}`}
                            onClick={() => setGlobal(s.id)}
                            title="Shared editable space for guests"
                        >
                            {globalSpaceId === s.id ? `Global · ${s.id}` : `Set global · ${s.id}`}
                        </button>
                    ))}
                </div>
            </ModuleSection>

            <ModuleSection title="People & Access" subtitle="Roles and per-space grants">
                {users === null && <div className="preferences-empty">Loading accounts…</div>}
                {Array.isArray(users) && users.length === 0 && (
                    <div className="preferences-empty">No accounts to manage (admin sign-in required).</div>
                )}
                {Array.isArray(users) && users.map((u) => (
                    <div key={u.id} className="preferences-collaborator-card">
                        <div className="preferences-collaborator-top">
                            <div>
                                <div className="preferences-collaborator-name">{u.displayName || u.email || u.id}</div>
                                <div className="preferences-collaborator-meta mono">{u.email || u.id}</div>
                            </div>
                            <button
                                type="button"
                                className={`toggle-button ${u.isUnrestricted ? 'active success-button' : ''}`}
                                onClick={() => patchUser(u.id, { isUnrestricted: !u.isUnrestricted })}
                                title="Access to every space"
                            >
                                {u.isUnrestricted ? 'All spaces ✓' : 'Grant all'}
                            </button>
                        </div>
                        <div className="preferences-command-grid">
                            {ROLES.map((r) => (
                                <button
                                    key={r}
                                    type="button"
                                    className={`toggle-button ${u.role === r ? 'active' : ''}`}
                                    onClick={() => patchUser(u.id, { role: r })}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                        {!u.isUnrestricted && spaces.length > 0 && (
                            <div className="preferences-command-grid">
                                {spaces.map((s) => (
                                    <button
                                        key={s.id}
                                        type="button"
                                        className={`toggle-button ${u.spaces?.includes(s.id) ? 'active success-button' : ''}`}
                                        onClick={() => toggleUserSpace(u, s.id)}
                                        title={`Toggle access to ${s.id}`}
                                    >
                                        {s.id}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </ModuleSection>
        </>
    )
}
