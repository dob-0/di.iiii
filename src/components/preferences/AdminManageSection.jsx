import { useCallback, useEffect, useMemo, useState } from 'react'
import { ModuleSection, MetricCard, InfoPair } from './PreferencesShared.jsx'
import {
    listServerSpaces,
    createServerSpace,
    updateServerSpace,
    deleteServerSpace,
    getServerConfig,
    patchServerConfig,
    getSpaceGithubLink,
    connectSpaceGithub,
    disconnectSpaceGithub
} from '../../services/serverSpaces.js'
import {
    listProjects,
    createProject,
    updateProject,
    deleteProject
} from '../../project/services/projectsApi.js'
import { listUsers, updateUser } from '../../services/usersApi.js'
import useAuthSession from '../../hooks/useAuthSession.js'
import {
    buildStudioHubPath,
    buildStudioProjectPath,
    navigateToStudioPath
} from '../../studio/utils/studioRouting.js'
import { buildAppSpacePath } from '../../utils/spaceRouting.js'

const ROLES = [
    { key: 'viewer', hint: 'Read-only access' },
    { key: 'editor', hint: 'Can edit scenes' },
    { key: 'admin', hint: 'Full control + this console' }
]

// One directory-tree surface for spaces -> projects -> access. Composed entirely
// from the canonical preferences-* design system; reuses the existing space/project/
// user services (no bespoke backend, no duplicated logic).
export default function AdminManageSection() {
    const { spaceLimit } = useAuthSession()
    const [spaces, setSpaces] = useState([])
    const [config, setConfig] = useState({})
    const [users, setUsers] = useState(null) // null = loading, [] = none / not admin
    const [error, setError] = useState('')

    const [expanded, setExpanded] = useState(() => new Set())
    const [projectsBySpace, setProjectsBySpace] = useState({}) // id -> { loading, error, items }
    const [selection, setSelection] = useState({ type: 'root' })
    const [editing, setEditing] = useState(null) // { type, id, value }
    const [draftSpace, setDraftSpace] = useState('')
    const [draftProject, setDraftProject] = useState('')

    const globalSpaceId = config.globalSpaceId || null
    const defaultSpaceId = config.defaultSpaceId || null

    const loadSpaces = useCallback(async () => {
        try {
            const [list, cfg] = await Promise.all([listServerSpaces(), getServerConfig()])
            setSpaces(list)
            setConfig(cfg)
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

    useEffect(() => { loadSpaces() }, [loadSpaces])

    const loadProjects = useCallback(async (spaceId) => {
        setProjectsBySpace((prev) => ({ ...prev, [spaceId]: { loading: true, error: '', items: prev[spaceId]?.items || [] } }))
        try {
            const items = await listProjects(spaceId)
            setProjectsBySpace((prev) => ({ ...prev, [spaceId]: { loading: false, error: '', items } }))
        } catch (e) {
            setProjectsBySpace((prev) => ({ ...prev, [spaceId]: { loading: false, error: e.message || 'Failed to load projects.', items: [] } }))
        }
    }, [])

    const toggleExpand = useCallback((spaceId) => {
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(spaceId)) {
                next.delete(spaceId)
            } else {
                next.add(spaceId)
                if (!projectsBySpace[spaceId]) loadProjects(spaceId)
            }
            return next
        })
    }, [projectsBySpace, loadProjects])

    const runMutation = useCallback(async (fn, fallbackMessage) => {
        try {
            await fn()
        } catch (e) {
            setError(e.message || fallbackMessage)
        }
    }, [])

    // ─── space actions ────────────────────────────────────────────
    const createSpace = useCallback(() => {
        const label = draftSpace.trim()
        if (!label) return
        runMutation(async () => {
            const space = await createServerSpace({ label, isPermanent: true })
            setDraftSpace('')
            await loadSpaces()
            if (space?.id) setSelection({ type: 'space', spaceId: space.id })
        }, 'Could not create space.')
    }, [draftSpace, runMutation, loadSpaces])

    const patchSpace = useCallback((spaceId, updates) => (
        runMutation(async () => {
            await updateServerSpace(spaceId, updates)
            await loadSpaces()
        }, 'Could not update space.')
    ), [runMutation, loadSpaces])

    const removeSpace = useCallback((space) => {
        if (!window.confirm(`Delete space "${space.label || space.id}" and all its projects? This cannot be undone.`)) return
        runMutation(async () => {
            await deleteServerSpace(space.id)
            setSelection({ type: 'root' })
            await loadSpaces()
        }, 'Could not delete space.')
    }, [runMutation, loadSpaces])

    const setGuestGlobal = useCallback((spaceId) => {
        const makeGlobal = globalSpaceId !== spaceId
        runMutation(async () => {
            await patchServerConfig({ globalSpaceId: makeGlobal ? spaceId : null })
            if (makeGlobal) await updateServerSpace(spaceId, { kind: 'global' })
            await loadSpaces()
        }, 'Could not update guest access.')
    }, [globalSpaceId, runMutation, loadSpaces])

    const setDefault = useCallback((spaceId) => (
        runMutation(async () => {
            await patchServerConfig({ defaultSpaceId: spaceId })
            await loadSpaces()
        }, 'Could not set the default space.')
    ), [runMutation, loadSpaces])

    // ─── project actions ──────────────────────────────────────────
    const addProject = useCallback((spaceId) => {
        const title = draftProject.trim()
        if (!title) return
        runMutation(async () => {
            const res = await createProject(spaceId, { title })
            const project = res?.project || res
            setDraftProject('')
            await loadProjects(spaceId)
            if (project?.id) setSelection({ type: 'project', spaceId, projectId: project.id })
        }, 'Could not create project.')
    }, [draftProject, runMutation, loadProjects])

    const renameProject = useCallback((spaceId, projectId, title) => (
        runMutation(async () => {
            await updateProject(projectId, { title })
            await loadProjects(spaceId)
        }, 'Could not rename project.')
    ), [runMutation, loadProjects])

    const removeProject = useCallback((spaceId, project) => {
        if (!window.confirm(`Delete project "${project.title || project.id}"? This cannot be undone.`)) return
        runMutation(async () => {
            await deleteProject(project.id)
            if (selection.type === 'project' && selection.projectId === project.id) {
                setSelection({ type: 'space', spaceId })
            }
            await loadProjects(spaceId)
        }, 'Could not delete project.')
    }, [runMutation, loadProjects, selection])

    // ─── user / access actions ────────────────────────────────────
    const patchUser = useCallback((userId, patch) => (
        runMutation(async () => {
            const updated = await updateUser(userId, patch)
            setUsers((prev) => prev ? prev.map((u) => u.id === userId ? { ...u, ...updated } : u) : prev)
        }, 'Could not update user.')
    ), [runMutation])

    const toggleUserSpace = useCallback((user, spaceId) => {
        const next = user.spaces?.includes(spaceId)
            ? user.spaces.filter((s) => s !== spaceId)
            : [...(user.spaces || []), spaceId]
        patchUser(user.id, { spaces: next })
    }, [patchUser])

    // ─── selection helpers ────────────────────────────────────────
    const selectedSpace = useMemo(
        () => spaces.find((s) => s.id === selection.spaceId) || null,
        [spaces, selection.spaceId]
    )
    const selectedProject = useMemo(() => {
        if (selection.type !== 'project') return null
        return projectsBySpace[selection.spaceId]?.items?.find((p) => p.id === selection.projectId) || null
    }, [selection, projectsBySpace])

    const startEdit = (type, id, value) => setEditing({ type, id, value })
    const submitEdit = () => {
        if (!editing) return
        const value = editing.value.trim()
        if (value) {
            if (editing.type === 'space') patchSpace(editing.id, { label: value })
            if (editing.type === 'project') renameProject(selection.spaceId, editing.id, value)
        }
        setEditing(null)
    }

    return (
        <div className="preferences-manage-layout">
            <div className="preferences-stage-sidebar-block">
                <div className="preferences-stage-sidebar-title">Directory</div>
                <div className="preferences-tree">
                    <button
                        type="button"
                        className={`preferences-tree-row${selection.type === 'root' ? ' is-selected' : ''}`}
                        onClick={() => setSelection({ type: 'root' })}
                    >
                        <span className="preferences-tree-caret" aria-hidden="true">▾</span>
                        <span className="preferences-tree-name">Spaces</span>
                        <span className="preferences-tree-tag">{spaces.length}</span>
                    </button>

                    {spaces.map((space) => {
                        const isOpen = expanded.has(space.id)
                        const bucket = projectsBySpace[space.id]
                        return (
                            <div key={space.id} className="preferences-tree-group">
                                <button
                                    type="button"
                                    className={`preferences-tree-row is-child${selection.type === 'space' && selection.spaceId === space.id ? ' is-selected' : ''}`}
                                    onClick={() => { setSelection({ type: 'space', spaceId: space.id }); if (!isOpen) toggleExpand(space.id) }}
                                >
                                    <span
                                        className="preferences-tree-caret"
                                        role="button"
                                        tabIndex={-1}
                                        aria-hidden="true"
                                        onClick={(e) => { e.stopPropagation(); toggleExpand(space.id) }}
                                    >
                                        {isOpen ? '▾' : '▸'}
                                    </span>
                                    <span className="preferences-tree-name">{space.label || space.id}</span>
                                    {globalSpaceId === space.id && <span className="preferences-badge success">guest</span>}
                                    {space.isPublic && <span className="preferences-badge">live</span>}
                                </button>
                                {isOpen && (
                                    <>
                                        {bucket?.loading && <div className="preferences-tree-note">Loading projects…</div>}
                                        {bucket?.error && <div className="preferences-tree-note">{bucket.error}</div>}
                                        {bucket && !bucket.loading && bucket.items.length === 0 && (
                                            <div className="preferences-tree-note">No projects yet.</div>
                                        )}
                                        {bucket?.items?.map((project) => (
                                            <button
                                                key={project.id}
                                                type="button"
                                                className={`preferences-tree-row is-leaf${selection.type === 'project' && selection.projectId === project.id ? ' is-selected' : ''}`}
                                                onClick={() => setSelection({ type: 'project', spaceId: space.id, projectId: project.id })}
                                            >
                                                <span className="preferences-tree-caret" aria-hidden="true">·</span>
                                                <span className="preferences-tree-name">{project.title || 'Untitled'}</span>
                                            </button>
                                        ))}
                                    </>
                                )}
                            </div>
                        )
                    })}
                </div>
                {error && <div className="preferences-empty">{error}</div>}
            </div>

            <div className="preferences-manage-detail">
                {selection.type === 'root' && (
                    <RootDetail
                        spaces={spaces}
                        users={users}
                        globalSpaceId={globalSpaceId}
                        draftSpace={draftSpace}
                        setDraftSpace={setDraftSpace}
                        onCreateSpace={createSpace}
                        onPatchUser={patchUser}
                        spaceLimit={spaceLimit}
                    />
                )}

                {selection.type === 'space' && selectedSpace && (
                    <SpaceDetail
                        space={selectedSpace}
                        users={users}
                        projectsBucket={projectsBySpace[selectedSpace.id]}
                        isGlobal={globalSpaceId === selectedSpace.id}
                        isDefault={defaultSpaceId === selectedSpace.id}
                        editing={editing}
                        startEdit={startEdit}
                        submitEdit={submitEdit}
                        setEditing={setEditing}
                        onPatch={(updates) => patchSpace(selectedSpace.id, updates)}
                        onSetGlobal={() => setGuestGlobal(selectedSpace.id)}
                        onSetDefault={() => setDefault(selectedSpace.id)}
                        onDelete={() => removeSpace(selectedSpace)}
                        draftProject={draftProject}
                        setDraftProject={setDraftProject}
                        onAddProject={() => addProject(selectedSpace.id)}
                        onToggleUserSpace={toggleUserSpace}
                        onSelectProject={(projectId) => setSelection({ type: 'project', spaceId: selectedSpace.id, projectId })}
                    />
                )}

                {selection.type === 'project' && selectedProject && (
                    <ProjectDetail
                        space={selectedSpace}
                        project={selectedProject}
                        isPublished={selectedSpace?.publishedProjectId === selectedProject.id}
                        editing={editing}
                        startEdit={startEdit}
                        submitEdit={submitEdit}
                        setEditing={setEditing}
                        onPublish={() => patchSpace(selection.spaceId, { publishedProjectId: selectedProject.id })}
                        onUnpublish={() => patchSpace(selection.spaceId, { publishedProjectId: null })}
                        onDelete={() => removeProject(selection.spaceId, selectedProject)}
                    />
                )}

                {selection.type === 'project' && !selectedProject && (
                    <div className="preferences-empty">Select a project from the directory.</div>
                )}
            </div>
        </div>
    )
}

function RootDetail({ spaces, users, globalSpaceId, draftSpace, setDraftSpace, onCreateSpace, onPatchUser, spaceLimit }) {
    return (
        <>
            <ModuleSection title="Overview" subtitle="Everything you can manage from here">
                <div className="preferences-status-grid">
                    <MetricCard label="Spaces" value={spaces.length} />
                    <MetricCard label="Accounts" value={Array.isArray(users) ? users.length : '—'} />
                    <MetricCard
                        label="Guest entry"
                        value={globalSpaceId ? 'Shared space' : 'Private sandbox'}
                        tone={globalSpaceId ? 'success' : 'accent'}
                    />
                    <MetricCard label="Guest space" value={globalSpaceId || '—'} />
                </div>
            </ModuleSection>

            <ModuleSection
                title="New space"
                subtitle={Number.isFinite(spaceLimit) ? `Free accounts can create up to ${spaceLimit} spaces each` : 'A space holds projects, assets, and its own access'}
            >
                <form
                    className="preferences-inline-form"
                    onSubmit={(e) => { e.preventDefault(); onCreateSpace() }}
                >
                    <input
                        className="preferences-input"
                        placeholder="Space name"
                        value={draftSpace}
                        onChange={(e) => setDraftSpace(e.target.value)}
                    />
                    <button type="submit" className="toggle-button" disabled={!draftSpace.trim()}>Create space</button>
                </form>
                <div className="preferences-empty">Pick a space on the left to manage its projects and access.</div>
            </ModuleSection>

            <ModuleSection title="People" subtitle="Account roles and overall reach">
                {users === null && <div className="preferences-empty">Loading accounts…</div>}
                {Array.isArray(users) && users.length === 0 && (
                    <div className="preferences-empty">No accounts to manage (admin sign-in required).</div>
                )}
                <div className="preferences-collaborator-list">
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
                                    onClick={() => onPatchUser(u.id, { isUnrestricted: !u.isUnrestricted })}
                                    title="Access to every space"
                                >
                                    {u.isUnrestricted ? 'All spaces ✓' : 'Limit to granted spaces'}
                                </button>
                            </div>
                            <div className="preferences-command-grid">
                                {ROLES.map((role) => (
                                    <button
                                        key={role.key}
                                        type="button"
                                        className={`toggle-button ${u.role === role.key ? 'active' : ''}`}
                                        onClick={() => onPatchUser(u.id, { role: role.key })}
                                        title={role.hint}
                                    >
                                        {role.key}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </ModuleSection>
        </>
    )
}

function SpaceDetail({
    space, users, projectsBucket, isGlobal, isDefault,
    editing, startEdit, submitEdit, setEditing,
    onPatch, onSetGlobal, onSetDefault, onDelete,
    draftProject, setDraftProject, onAddProject, onToggleUserSpace, onSelectProject
}) {
    const isEditing = editing?.type === 'space' && editing.id === space.id
    const projects = projectsBucket?.items || []
    return (
        <>
            <ModuleSection
                title={space.label || space.id}
                subtitle={`Space · ${space.id}`}
                actions={
                    <div className="preferences-module-actions">
                        <button type="button" className="preferences-inline-action" onClick={() => navigateToStudioPath(buildStudioHubPath(space.id))}>Open hub</button>
                        <button type="button" className="preferences-inline-action" onClick={() => navigateToStudioPath(buildAppSpacePath(space.id))}>View live</button>
                        <button type="button" className="preferences-inline-action warning" onClick={onDelete}>Delete</button>
                    </div>
                }
            >
                {isEditing ? (
                    <form className="preferences-inline-form" onSubmit={(e) => { e.preventDefault(); submitEdit() }}>
                        <input
                            className="preferences-input"
                            ref={(el) => el?.focus()}
                            value={editing.value}
                            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                            onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                        />
                        <button type="submit" className="toggle-button">Save</button>
                        <button type="button" className="toggle-button" onClick={() => setEditing(null)}>Cancel</button>
                    </form>
                ) : (
                    <div className="preferences-command-grid">
                        <button type="button" className="toggle-button" onClick={() => startEdit('space', space.id, space.label || space.id)}>Rename</button>
                        <button type="button" className={`toggle-button ${space.isPublic ? 'active success-button' : ''}`} onClick={() => onPatch({ isPublic: !space.isPublic })}>
                            {space.isPublic ? 'Public ✓' : 'Private'}
                        </button>
                        <button type="button" className={`toggle-button ${space.isPermanent ? 'active' : ''}`} onClick={() => onPatch({ isPermanent: !space.isPermanent })}>
                            {space.isPermanent ? 'Permanent ✓' : 'Temporary'}
                        </button>
                        <button type="button" className={`toggle-button ${space.allowEdits !== false ? 'active' : ''}`} onClick={() => onPatch({ allowEdits: space.allowEdits === false })}>
                            {space.allowEdits !== false ? 'Editing on' : 'Locked'}
                        </button>
                        <button type="button" className={`toggle-button ${isDefault ? 'active' : ''}`} onClick={onSetDefault} disabled={isDefault}>
                            {isDefault ? 'Default space ✓' : 'Set as default'}
                        </button>
                        <button type="button" className={`toggle-button ${isGlobal ? 'active success-button' : ''}`} onClick={onSetGlobal} title="Signed-out visitors land in this shared space">
                            {isGlobal ? 'Guest entry ✓' : 'Make guest entry'}
                        </button>
                    </div>
                )}
            </ModuleSection>

            <ModuleSection
                title="Projects"
                subtitle={projectsBucket?.loading ? 'Loading…' : `${projects.length} in this space`}
            >
                <div className="preferences-space-list">
                    {projects.map((project) => (
                        <div key={project.id} className="preferences-space-row">
                            <div className="preferences-space-top">
                                <button type="button" className="preferences-link-label preferences-text-button" onClick={() => onSelectProject(project.id)}>
                                    {project.title || 'Untitled'}
                                </button>
                                <div className="preferences-space-flags">
                                    {space.publishedProjectId === project.id && <span className="preferences-badge success">published</span>}
                                    <button type="button" className="preferences-inline-action" onClick={() => navigateToStudioPath(buildStudioProjectPath(project.id, space.id))}>Open</button>
                                </div>
                            </div>
                            <div className="preferences-space-meta mono">{project.id}</div>
                        </div>
                    ))}
                    {!projectsBucket?.loading && projects.length === 0 && (
                        <div className="preferences-space-row"><div className="preferences-empty">No projects yet.</div></div>
                    )}
                </div>
                <form className="preferences-inline-form" onSubmit={(e) => { e.preventDefault(); onAddProject() }}>
                    <input
                        className="preferences-input"
                        placeholder="New project title"
                        value={draftProject}
                        onChange={(e) => setDraftProject(e.target.value)}
                    />
                    <button type="submit" className="toggle-button" disabled={!draftProject.trim()}>Add project</button>
                </form>
            </ModuleSection>

            <GithubSyncSection space={space} projects={projects} />

            <ModuleSection title="Who can access" subtitle="Per-account grant for this space">
                {users === null && <div className="preferences-empty">Loading accounts…</div>}
                {Array.isArray(users) && users.length === 0 && (
                    <div className="preferences-empty">No accounts to manage (admin sign-in required).</div>
                )}
                <div className="preferences-collaborator-list">
                    {Array.isArray(users) && users.map((u) => {
                        const has = u.isUnrestricted || u.spaces?.includes(space.id)
                        return (
                            <div key={u.id} className="preferences-collaborator-card">
                                <div className="preferences-collaborator-top">
                                    <div>
                                        <div className="preferences-collaborator-name">{u.displayName || u.email || u.id}</div>
                                        <div className="preferences-collaborator-meta mono">{u.role}{u.isUnrestricted ? ' · all spaces' : ''}</div>
                                    </div>
                                    <button
                                        type="button"
                                        className={`toggle-button ${has ? 'active success-button' : ''}`}
                                        onClick={() => onToggleUserSpace(u, space.id)}
                                        disabled={u.isUnrestricted}
                                        title={u.isUnrestricted ? 'Already has access to every space' : `Toggle access to ${space.id}`}
                                    >
                                        {has ? 'Has access ✓' : 'Grant access'}
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </ModuleSection>
        </>
    )
}

// Connect a space to a GitHub repo. Pushes to the repo auto-sync the space via
// the di.iiii GitHub App (serverXR /api/github/webhook). One link per space.
function GithubSyncSection({ space, projects }) {
    const [link, setLink] = useState(undefined) // undefined=loading · null=none · 'denied' · object=linked
    const [form, setForm] = useState({ owner: '', repo: '', projectId: '', entry: 'index.html' })
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [result, setResult] = useState(null)

    useEffect(() => {
        let active = true
        setLink(undefined); setError(''); setResult(null)
        getSpaceGithubLink(space.id)
            .then((l) => { if (active) setLink(l) })
            .catch((e) => { if (active) { setLink('denied'); setError(e.message || '') } })
        return () => { active = false }
    }, [space.id])

    useEffect(() => {
        setForm((f) => f.projectId ? f : { ...f, projectId: space.publishedProjectId || projects[0]?.id || '' })
    }, [space.publishedProjectId, projects])

    const connect = async () => {
        if (!form.owner.trim() || !form.repo.trim() || !form.projectId) { setError('Owner, repo and project are required.'); return }
        setBusy(true); setError(''); setResult(null)
        try {
            const res = await connectSpaceGithub(space.id, {
                owner: form.owner.trim(), repo: form.repo.trim(),
                projectId: form.projectId, entry: form.entry.trim() || 'index.html'
            })
            setLink(res.link); setResult(res.initialSync)
        } catch (e) { setError(e.message || 'Could not connect.') } finally { setBusy(false) }
    }

    const disconnect = async () => {
        if (!window.confirm('Disconnect this space from GitHub? It will stop auto-syncing.')) return
        setBusy(true); setError('')
        try { await disconnectSpaceGithub(space.id); setLink(null); setResult(null) }
        catch (e) { setError(e.message || 'Could not disconnect.') } finally { setBusy(false) }
    }

    return (
        <ModuleSection title="GitHub sync" subtitle="Connect a repo — pushes auto-update this space">
            {link === undefined && <div className="preferences-empty">Loading…</div>}

            {link === 'denied' && (
                <div className="preferences-empty">Sign in as the space owner or an admin to manage GitHub sync.</div>
            )}

            {link && link !== 'denied' && (
                <>
                    <InfoPair label="Repository" value={`${link.owner}/${link.repo}`} mono />
                    <InfoPair label="Project" value={link.projectId} mono />
                    <InfoPair label="Branch" value={link.ref || 'default'} />
                    <InfoPair label="App install" value={link.installationId ? `#${link.installationId}` : 'not found — install the di.iiii GitHub App on this repo'} />
                    <InfoPair label="Last push synced" value={link.lastSyncSha ? link.lastSyncSha.slice(0, 10) : 'on connect'} />
                    <div className="preferences-command-grid">
                        <button type="button" className="toggle-button active success-button" disabled>Connected ✓</button>
                        <button type="button" className="toggle-button warning" onClick={disconnect} disabled={busy}>Disconnect</button>
                    </div>
                </>
            )}

            {link === null && (
                <form className="preferences-inline-form" onSubmit={(e) => { e.preventDefault(); connect() }}>
                    <input className="preferences-input" placeholder="owner (e.g. dob-0)" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
                    <input className="preferences-input" placeholder="repo (e.g. br_id_ge)" value={form.repo} onChange={(e) => setForm({ ...form, repo: e.target.value })} />
                    <select className="preferences-input" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                        <option value="">project…</option>
                        {projects.map((p) => <option key={p.id} value={p.id}>{p.title || p.id}</option>)}
                    </select>
                    <input className="preferences-input" placeholder="entry (index.html)" value={form.entry} onChange={(e) => setForm({ ...form, entry: e.target.value })} />
                    <button type="submit" className="toggle-button" disabled={busy}>{busy ? 'Connecting…' : 'Connect repo'}</button>
                </form>
            )}

            {result && (
                <div className="preferences-empty">
                    {result.error ? `Connected, but first sync failed: ${result.error}` : `Synced ${result.bytes} bytes from ${result.ref}.`}
                </div>
            )}
            {error && link !== 'denied' && <div className="preferences-empty">{error}</div>}
        </ModuleSection>
    )
}

function ProjectDetail({ space, project, isPublished, editing, startEdit, submitEdit, setEditing, onPublish, onUnpublish, onDelete }) {
    const isEditing = editing?.type === 'project' && editing.id === project.id
    return (
        <ModuleSection
            title={project.title || 'Untitled'}
            subtitle={`Project · ${space?.label || space?.id || ''}`}
            actions={
                <div className="preferences-module-actions">
                    <button type="button" className="preferences-inline-action" onClick={() => navigateToStudioPath(buildStudioProjectPath(project.id, space?.id))}>Open in Studio</button>
                    <button type="button" className="preferences-inline-action warning" onClick={onDelete}>Delete</button>
                </div>
            }
        >
            <InfoPair label="Project ID" value={project.id} mono />
            <InfoPair label="Source" value={project.source || 'project'} />
            <InfoPair label="Published" value={isPublished ? 'Yes — live for this space' : 'No'} />

            {isEditing ? (
                <form className="preferences-inline-form" onSubmit={(e) => { e.preventDefault(); submitEdit() }}>
                    <input
                        className="preferences-input"
                        ref={(el) => el?.focus()}
                        value={editing.value}
                        onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                        onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                    />
                    <button type="submit" className="toggle-button">Save</button>
                    <button type="button" className="toggle-button" onClick={() => setEditing(null)}>Cancel</button>
                </form>
            ) : (
                <div className="preferences-command-grid">
                    <button type="button" className="toggle-button" onClick={() => startEdit('project', project.id, project.title || '')}>Rename</button>
                    {isPublished ? (
                        <button type="button" className="toggle-button active success-button" onClick={onUnpublish}>Unpublish</button>
                    ) : (
                        <button type="button" className="toggle-button" onClick={onPublish}>Set as published</button>
                    )}
                </div>
            )}
        </ModuleSection>
    )
}
