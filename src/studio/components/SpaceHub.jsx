import { useCallback, useEffect, useState } from 'react'
import { Box, Container } from '@mui/material'
import useAuthSession from '../../hooks/useAuthSession.js'
import {
    listServerSpaces,
    createServerSpace,
    updateServerSpace,
    deleteServerSpace,
    getServerConfig,
    patchServerConfig
} from '../../services/serverSpaces.js'
import { listProjects, getProject, updateProject } from '../../project/services/projectsApi.js'
import { buildStudioHubPath, navigateToStudioPath } from '../utils/studioRouting.js'
import '../styles/studio-space-hub.css'

export default function SpaceHub() {
    const { authenticated, login } = useAuthSession()
    const [spaces, setSpaces] = useState([])
    const [status, setStatus] = useState('loading...')
    const [creatingTitle, setCreatingTitle] = useState(null)
    const [isBusy, setIsBusy] = useState(false)
    const [defaultSpaceId, setDefaultSpaceId] = useState(null)
    // projectId → title map for linked projects
    const [projectTitles, setProjectTitles] = useState({})
    // project linker state: { spaceId, projects, loading, renamingId, renameValue }
    const [linker, setLinker] = useState(null)

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

    const handleLinkProject = useCallback(async (spaceId, projectId) => {
        try {
            const space = spaces.find(s => s.id === spaceId)
            const patch = { publishedProjectId: projectId || null }
            // linking a project implies the user wants it visible — flip isPublic too
            // unless they've never been linked before but already toggled it off on purpose
            if (projectId && space && !space.isPublic) {
                patch.isPublic = true
            }
            await updateServerSpace(spaceId, patch)
            setLinker(null)
            await loadSpaces()
        } catch (err) {
            alert(err.message || 'Could not link project.')
        }
    }, [loadSpaces, spaces])

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
                        {authenticated ? (
                            creatingTitle === null ? (
                                <button
                                    className="ssh-btn-create"
                                    onClick={() => setCreatingTitle('')}
                                    disabled={isBusy}
                                >
                                    + Create
                                </button>
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
                        ) : (
                            <button className="ssh-btn-signin" onClick={login}>
                                Sign in to create
                            </button>
                        )}
                    </div>
                </div>

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
                                    onClick={() => openSpace(space.id)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={e => e.key === 'Enter' && openSpace(space.id)}
                                >
                                    <div className="ssh-card-header">
                                        <span className="ssh-space-id">{space.id}</span>
                                        {isMain && <span className="ssh-badge-main">Main</span>}
                                        {space.isPublic && <span className="ssh-badge-live">Live</span>}
                                    </div>
                                    <p className="ssh-space-label">{space.label || space.id}</p>
                                    {linkedTitle && (
                                        <p className="ssh-space-project">Project: {linkedTitle}</p>
                                    )}
                                    {space.publishedProjectId && !space.isPublic && (
                                        <p className="ssh-space-warning">
                                            ⚠ Not public — visitors will see a login wall, not the project.
                                        </p>
                                    )}

                                    {authenticated && (
                                        <div className="ssh-card-actions" onClick={e => e.stopPropagation()}>
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
                                            {!isMain && (
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

                                    {isLinking && (
                                        <div className="ssh-project-linker" onClick={e => e.stopPropagation()}>
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
