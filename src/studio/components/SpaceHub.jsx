import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Container } from '@mui/material'
import useAuthSession from '../../hooks/useAuthSession.js'
import { getApiAuthProviders, getOAuthUrl } from '../../services/apiClient.js'
import {
    listServerSpaces,
    createServerSpace,
    updateServerSpace,
    deleteServerSpace,
    getServerConfig,
    patchServerConfig
} from '../../services/serverSpaces.js'
import { listProjects, getProject, updateProject } from '../../project/services/projectsApi.js'
import GithubSyncSection from '../../components/preferences/GithubSyncSection.jsx'
import { buildStudioHubPath, navigateToStudioPath } from '../utils/studioRouting.js'
import { appNavigate } from '../../utils/appNavigate.js'
import { buildAppSpacePath } from '../../utils/spaceRouting.js'
import { getSpaceShareUrl } from '../../storage/spaceStore.js'
import '../styles/studio-space-hub.css'

// Each preview iframe is a full app instance, so a burst of simultaneous
// boots janks the hub on first paint. At most this many previews boot at
// once; a slot frees when the iframe's document loads (or the card unmounts
// or scrolls away before that).
const PREVIEW_BOOT_SLOTS = 2
const previewBootQueue = { active: 0, waiting: [] }

function requestPreviewBoot(start) {
    const entry = { start, granted: false, released: false }
    const grantNext = () => {
        while (previewBootQueue.active < PREVIEW_BOOT_SLOTS && previewBootQueue.waiting.length) {
            const next = previewBootQueue.waiting.shift()
            next.granted = true
            previewBootQueue.active += 1
            next.start()
        }
    }
    entry.release = () => {
        if (entry.released) return
        entry.released = true
        if (entry.granted) {
            previewBootQueue.active -= 1
        } else {
            const index = previewBootQueue.waiting.indexOf(entry)
            if (index !== -1) previewBootQueue.waiting.splice(index, 1)
        }
        grantNext()
    }
    previewBootQueue.waiting.push(entry)
    grantNext()
    return entry.release
}

// Live thumbnail of a published space: embeds the real live route in preview
// mode (?preview=1 — static camera, no chrome, no XR offer, low-power render
// loop). The iframe only mounts while the card is near the viewport so
// off-screen spaces cost nothing, and unmounts again when scrolled away to
// free its WebGL context. Boots are queued through requestPreviewBoot above.
function SpaceCardPreview({ spaceId, label }) {
    const hostRef = useRef(null)
    const [visible, setVisible] = useState(false)
    const [booted, setBooted] = useState(false)
    const releaseRef = useRef(null)

    useEffect(() => {
        const node = hostRef.current
        if (!node) return undefined
        if (typeof IntersectionObserver !== 'function') {
            setVisible(true)
            return undefined
        }
        const observer = new IntersectionObserver(
            (entries) => setVisible(entries.some((entry) => entry.isIntersecting)),
            { rootMargin: '160px' }
        )
        observer.observe(node)
        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        if (!visible) {
            setBooted(false)
            return undefined
        }
        const release = requestPreviewBoot(() => setBooted(true))
        releaseRef.current = release
        return () => {
            releaseRef.current = null
            release()
        }
    }, [visible])

    // Backstop: if the iframe never fires load (network error, blocked), free
    // the boot slot anyway so the rest of the queue is not starved.
    useEffect(() => {
        if (!booted) return undefined
        const timer = setTimeout(() => releaseRef.current?.(), 15000)
        return () => clearTimeout(timer)
    }, [booted])

    return (
        <div ref={hostRef} className="ssh-card-preview" aria-hidden="true">
            {visible && booted ? (
                <iframe
                    src={`${buildAppSpacePath(spaceId)}?preview=1`}
                    title={`${label} — live preview`}
                    loading="lazy"
                    tabIndex={-1}
                    onLoad={() => releaseRef.current?.()}
                />
            ) : null}
        </div>
    )
}

export default function SpaceHub() {
    const { authenticated, type, role, canCreateSpace, ownedSpaceCount, spaceLimit, spaces: sessionScopes } = useAuthSession()
    const [spaces, setSpaces] = useState([])
    const [status, setStatus] = useState('loading...')
    const [creatingTitle, setCreatingTitle] = useState(null)
    const [isBusy, setIsBusy] = useState(false)
    const [defaultSpaceId, setDefaultSpaceId] = useState(null)
    // projectId → title map for linked projects
    const [projectTitles, setProjectTitles] = useState({})
    // project linker state: { spaceId, projects, loading, renamingId, renameValue }
    const [linker, setLinker] = useState(null)
    // GitHub sync panel state: { spaceId, projects, loading }
    const [github, setGithub] = useState(null)
    const [providers, setProviders] = useState(null) // null until sign-in requested
    const [copiedLiveId, setCopiedLiveId] = useState(null)

    const isGuest = type === 'guest'
    const isAccount = authenticated && !isGuest
    const isAdmin = role === 'admin'
    const canManage = (space) => space.isOwner || isAdmin

    const loadSpaces = useCallback(async () => {
        setStatus('loading...')
        try {
            const [list, cfg] = await Promise.all([listServerSpaces(), getServerConfig()])
            setSpaces(list)
            setDefaultSpaceId(cfg.defaultSpaceId || null)
            setStatus('')
            // resolve titles for any linked projects
            const ids = [...new Set(list.map(s => s.publishedProjectId).filter(Boolean))]
            if (ids.length) {
                const results = await Promise.allSettled(ids.map(id => getProject(id)))
                const titles = {}
                results.forEach((r, i) => {
                    if (r.status === 'fulfilled') {
                        const p = r.value?.project || r.value
                        if (p?.id) titles[p.id] = p.title || p.id
                    } else {
                        titles[ids[i]] = ids[i]
                    }
                })
                setProjectTitles(titles)
            }
        } catch (e) {
            setStatus(e.message || 'error loading spaces')
        }
    }, [])

    useEffect(() => { loadSpaces() }, [loadSpaces])

    const openSpace = (spaceId) =>
        navigateToStudioPath(buildStudioHubPath(spaceId))

    // A card opens the editor only when the session can actually work there
    // (owner/admin, or scoped in — e.g. guests jamming in main). Public spaces
    // you can't enter go straight to their live view instead of a login wall.
    const canEnter = (space) => canManage(space)
        || (Array.isArray(sessionScopes) && sessionScopes.includes(space.id))

    const openCard = (space) => {
        if (!canEnter(space) && space.isPublic) {
            appNavigate(buildAppSpacePath(space.id))
            return
        }
        openSpace(space.id)
    }

    const submitCreate = async (title) => {
        const name = title.trim()
        if (!name) return
        setCreatingTitle(null)
        setIsBusy(true)
        setStatus('creating...')
        try {
            const space = await createServerSpace({ label: name, isPermanent: true })
            await loadSpaces()
            navigateToStudioPath(buildStudioHubPath(space.id))
        } catch (e) {
            setStatus(e.message || 'error creating space')
            setIsBusy(false)
        }
    }

    const handleRename = useCallback(async (space, e) => {
        e.stopPropagation()
        const next = window.prompt('Rename space:', space.label || space.id)?.trim()
        if (!next || next === space.label) return
        try {
            await updateServerSpace(space.id, { label: next })
            await loadSpaces()
        } catch (err) {
            alert(err.message || 'Could not rename space.')
        }
    }, [loadSpaces])

    const handleDelete = useCallback(async (space, e) => {
        e.stopPropagation()
        if (!window.confirm(`Delete "${space.label || space.id}"? This cannot be undone.`)) return
        try {
            await deleteServerSpace(space.id)
            await loadSpaces()
        } catch (err) {
            alert(err.message || 'Could not delete space.')
        }
    }, [loadSpaces])

    const handleCopyLiveLink = useCallback(async (space, e) => {
        e.stopPropagation()
        const url = getSpaceShareUrl(space.id)
        try {
            await navigator.clipboard.writeText(url)
            setCopiedLiveId(space.id)
            setTimeout(() => setCopiedLiveId(null), 2000)
        } catch {
            window.prompt('Copy live link', url)
        }
    }, [])

    const handleTogglePublic = useCallback(async (space, e) => {
        e.stopPropagation()
        try {
            await updateServerSpace(space.id, { isPublic: !space.isPublic })
            await loadSpaces()
        } catch (err) {
            alert(err.message || 'Could not update space.')
        }
    }, [loadSpaces])

    const handleSetMain = useCallback(async (space, e) => {
        e.stopPropagation()
        try {
            await patchServerConfig({ defaultSpaceId: space.id })
            setDefaultSpaceId(space.id)
        } catch (err) {
            alert(err.message || 'Could not set main space.')
        }
    }, [])

    const handleOpenLinker = useCallback(async (space, e) => {
        e.stopPropagation()
        if (linker?.spaceId === space.id) {
            setLinker(null)
            return
        }
        setLinker({ spaceId: space.id, projects: [], loading: true, renamingId: null, renameValue: '' })
        try {
            const projects = await listProjects(space.id)
            setLinker(prev => prev?.spaceId === space.id
                ? { ...prev, projects, loading: false }
                : prev
            )
        } catch (err) {
            setLinker(prev => prev?.spaceId === space.id
                ? { ...prev, projects: [], loading: false, error: err.message }
                : prev
            )
        }
    }, [linker])

    const handleOpenGithub = useCallback(async (space, e) => {
        e.stopPropagation()
        if (github?.spaceId === space.id) {
            setGithub(null)
            return
        }
        setGithub({ spaceId: space.id, projects: [], loading: true })
        try {
            const projects = await listProjects(space.id)
            setGithub(prev => prev?.spaceId === space.id ? { spaceId: space.id, projects, loading: false } : prev)
        } catch {
            setGithub(prev => prev?.spaceId === space.id ? { spaceId: space.id, projects: [], loading: false } : prev)
        }
    }, [github])

    const handleSignIn = useCallback(async () => {
        if (providers) {
            setProviders(null)
            return
        }
        try {
            setProviders(await getApiAuthProviders())
        } catch {
            setProviders({ github: false, google: false })
        }
    }, [providers])

    const handleLinkProject = useCallback(async (spaceId, projectId) => {
        try {
            // Linking only sets the live project. Visibility (isPublic) stays an
            // independent, explicit choice via the existing Public/Private toggle —
            // linking no longer silently flips a space public.
            await updateServerSpace(spaceId, { publishedProjectId: projectId || null })
            setLinker(null)
            await loadSpaces()
        } catch (err) {
            alert(err.message || 'Could not link project.')
        }
    }, [loadSpaces])

    const handleStartRenameProject = useCallback((project, e) => {
        e.stopPropagation()
        setLinker(prev => prev ? { ...prev, renamingId: project.id, renameValue: project.title || '' } : prev)
    }, [])

    const handleSubmitRenameProject = useCallback(async (projectId, e) => {
        e?.preventDefault?.()
        const newTitle = linker?.renameValue?.trim()
        if (!newTitle) return
        try {
            await updateProject(projectId, { title: newTitle })
            setLinker(prev => prev ? {
                ...prev,
                renamingId: null,
                renameValue: '',
                projects: prev.projects.map(p => p.id === projectId ? { ...p, title: newTitle } : p)
            } : prev)
            setProjectTitles(prev => ({ ...prev, [projectId]: newTitle }))
        } catch (err) {
            alert(err.message || 'Could not rename project.')
        }
    }, [linker])

    return (
        <Box className="studio-shell-root ssh-root">
            <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
                <div className="ssh-top-row">
                    <div>
                        <p className="ssh-eyebrow">di.iiii</p>
                        <h1 className="ssh-title">Spaces</h1>
                    </div>
                    <div className="ssh-actions">
                        {isAccount ? (
                            creatingTitle === null ? (
                                canCreateSpace ? (
                                    <button
                                        className="ssh-btn-create"
                                        onClick={() => setCreatingTitle('')}
                                        disabled={isBusy}
                                    >
                                        + Create
                                        {Number.isFinite(spaceLimit) && (
                                            <span className="ssh-quota"> · {ownedSpaceCount}/{spaceLimit}</span>
                                        )}
                                    </button>
                                ) : (
                                    <span className="ssh-quota-full" title="Delete a space to make room">
                                        Space limit reached ({ownedSpaceCount}/{spaceLimit})
                                    </span>
                                )
                            ) : (
                                <form
                                    className="ssh-new-form"
                                    onSubmit={e => { e.preventDefault(); submitCreate(creatingTitle) }}
                                >
                                    <input
                                        className="ssh-new-input"
                                        ref={el => el?.focus()}
                                        placeholder="Space name"
                                        value={creatingTitle}
                                        onChange={e => setCreatingTitle(e.target.value)}
                                        onKeyDown={e => e.key === 'Escape' && setCreatingTitle(null)}
                                    />
                                    <button className="ssh-btn-create" type="submit">Create</button>
                                    <button className="ssh-btn-cancel" type="button" onClick={() => setCreatingTitle(null)}>✕</button>
                                </form>
                            )
                        ) : providers === null ? (
                            <button className="ssh-btn-signin" onClick={handleSignIn}>
                                Sign in to create
                            </button>
                        ) : (
                            <div className="ssh-actions">
                                {providers.github && (
                                    <a className="ssh-btn-signin" href={getOAuthUrl('github')}>Continue with GitHub</a>
                                )}
                                {providers.google && (
                                    <a className="ssh-btn-signin" href={getOAuthUrl('google')}>Continue with Google</a>
                                )}
                                {!providers.github && !providers.google && (
                                    <span className="ssh-quota-full">No sign-in providers configured.</span>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {isGuest && (
                    <p className="ssh-guest-banner">
                        {spaces.some(s => s.kind === 'sandbox')
                            ? 'Guest session — you\'re working in a private temporary sandbox. Sign in to create spaces that are yours and stay.'
                            : 'Guest session — you\'re in a shared space. Sign in to create your own spaces.'}
                    </p>
                )}

                {status && (
                    <p className={`ssh-status${status.includes('error') ? ' ssh-status-error' : ''}`}>
                        {status}
                    </p>
                )}

                {spaces.length > 0 && (
                    <div className="ssh-spaces-grid">
                        {spaces.map((space) => {
                            const isMain = space.id === defaultSpaceId
                            const isLinking = linker?.spaceId === space.id
                            const linkedTitle = space.publishedProjectId
                                ? (projectTitles[space.publishedProjectId] || space.publishedProjectId)
                                : null

                            return (
                                <div
                                    key={space.id}
                                    className="ssh-space-card"
                                    onClick={() => openCard(space)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={e => e.key === 'Enter' && openCard(space)}
                                >
                                    <div className="ssh-card-header">
                                        <span className="ssh-space-id">{space.id}</span>
                                        {isMain && <span className="ssh-badge-main">Main</span>}
                                        {space.isPublic && <span className="ssh-badge-live">Live</span>}
                                        {space.isPublic && !canEnter(space) && <span className="ssh-badge-viewonly">View live</span>}
                                    </div>
                                    {space.isPublic && space.publishedProjectId && (
                                        <SpaceCardPreview spaceId={space.id} label={space.label || space.id} />
                                    )}
                                    <p className="ssh-space-label">{space.label || space.id}</p>
                                    {linkedTitle && (
                                        <p className="ssh-space-project">Project: {linkedTitle}</p>
                                    )}
                                    {space.publishedProjectId && !space.isPublic && (
                                        <p className="ssh-space-warning">
                                            ⚠ Not public — visitors will see a login wall, not the project.
                                        </p>
                                    )}
                                    {space.isPublic && (
                                        <div className="ssh-live-link" role="presentation" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                                            <a
                                                className="ssh-live-url"
                                                href={getSpaceShareUrl(space.id)}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                {getSpaceShareUrl(space.id)}
                                            </a>
                                            <button className="ssh-card-btn" onClick={e => handleCopyLiveLink(space, e)}>
                                                {copiedLiveId === space.id ? 'Copied' : 'Copy'}
                                            </button>
                                        </div>
                                    )}

                                    {canManage(space) && (
                                        <div className="ssh-card-actions" role="presentation" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                                            <button className="ssh-card-btn" onClick={e => handleRename(space, e)}>
                                                Rename
                                            </button>
                                            <button
                                                className={`ssh-card-btn${space.isPublic ? ' ssh-card-btn--active' : ''}`}
                                                onClick={e => handleTogglePublic(space, e)}
                                            >
                                                {space.isPublic ? 'Public' : 'Private'}
                                            </button>
                                            <button
                                                className={`ssh-card-btn${isLinking ? ' ssh-card-btn--active' : ''}`}
                                                onClick={e => handleOpenLinker(space, e)}
                                            >
                                                {space.publishedProjectId ? 'Change project' : 'Link project'}
                                            </button>
                                            <button
                                                className={`ssh-card-btn${github?.spaceId === space.id ? ' ssh-card-btn--active' : ''}`}
                                                onClick={e => handleOpenGithub(space, e)}
                                            >
                                                GitHub sync
                                            </button>
                                            {isAdmin && !isMain && (
                                                <button className="ssh-card-btn" onClick={e => handleSetMain(space, e)}>
                                                    Set main
                                                </button>
                                            )}
                                            <button
                                                className="ssh-card-btn ssh-card-btn--danger"
                                                onClick={e => handleDelete(space, e)}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    )}

                                    {github?.spaceId === space.id && (
                                        <div className="ssh-github-panel" role="presentation" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                                            {github.loading
                                                ? <p className="ssh-linker-status">Loading…</p>
                                                : <GithubSyncSection space={space} projects={github.projects} />}
                                        </div>
                                    )}

                                    {isLinking && (
                                        <div className="ssh-project-linker" role="presentation" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                                            {linker.loading && <p className="ssh-linker-status">Loading projects...</p>}
                                            {linker.error && <p className="ssh-linker-status ssh-linker-error">{linker.error}</p>}
                                            {!linker.loading && !linker.error && linker.projects.length === 0 && (
                                                <p className="ssh-linker-status">No projects yet. Open this space in Studio to create one.</p>
                                            )}
                                            {!linker.loading && linker.projects.length > 0 && (
                                                <div className="ssh-linker-list">
                                                    {linker.projects.map(p => (
                                                        <div key={p.id} className={`ssh-linker-item${space.publishedProjectId === p.id ? ' is-linked' : ''}`}>
                                                            {linker.renamingId === p.id ? (
                                                                // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
                                                                <form
                                                                    className="ssh-linker-rename-form"
                                                                    onSubmit={e => { e.preventDefault(); handleSubmitRenameProject(p.id) }}
                                                                    onClick={e => e.stopPropagation()}
                                                                    onKeyDown={e => e.stopPropagation()}
                                                                >
                                                                    <input
                                                                        className="ssh-linker-rename-input"
                                                                        ref={el => el?.focus()}
                                                                        value={linker.renameValue}
                                                                        onChange={e => setLinker(prev => prev ? { ...prev, renameValue: e.target.value } : prev)}
                                                                        onKeyDown={e => e.key === 'Escape' && setLinker(prev => prev ? { ...prev, renamingId: null } : prev)}
                                                                    />
                                                                    <button className="ssh-card-btn" type="submit">Save</button>
                                                                    <button className="ssh-card-btn" type="button" onClick={() => setLinker(prev => prev ? { ...prev, renamingId: null } : prev)}>✕</button>
                                                                </form>
                                                            ) : (
                                                                <>
                                                                    <button
                                                                        className="ssh-linker-select"
                                                                        onClick={() => handleLinkProject(space.id, p.id)}
                                                                        title="Use as published project"
                                                                    >
                                                                        <span className="ssh-linker-label">{p.title || 'Untitled'}</span>
                                                                        {space.publishedProjectId === p.id && <span className="ssh-linker-check">linked</span>}
                                                                    </button>
                                                                    <button
                                                                        className="ssh-linker-rename-btn"
                                                                        onClick={e => handleStartRenameProject(p, e)}
                                                                        title="Rename project"
                                                                    >
                                                                        Rename
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="ssh-linker-footer">
                                                {!linker.loading && space.publishedProjectId && (
                                                    <button
                                                        className="ssh-card-btn ssh-card-btn--danger"
                                                        onClick={() => handleLinkProject(space.id, null)}
                                                    >
                                                        Unlink
                                                    </button>
                                                )}
                                                <button className="ssh-card-btn" onClick={() => setLinker(null)}>
                                                    Close
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </Container>
        </Box>
    )
}
