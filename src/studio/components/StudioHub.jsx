import { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Container } from '@mui/material'
import { appNavigate } from '../../utils/appNavigate.js'
import { buildAppSpacePath, buildPreferencesPath } from '../../utils/spaceRouting.js'
import { buildRawProjectsPath } from '../../raw/utils/rawRouting.js'
import { importLegacySceneFile } from '../../project/import/importLegacyScene.js'
import GridFloorBackground from '../../components/GridFloorBackground.jsx'
import useAuthSession from '../../hooks/useAuthSession.js'
import {
    DEFAULT_PROJECT_SPACE_ID,
    createProject,
    deleteProject,
    listProjects,
    updateProject,
    updateProjectDocument,
    uploadProjectAsset
} from '../../project/services/projectsApi.js'
import { getServerSpace, updateServerSpace } from '../../services/serverSpaces.js'
import { buildStudioProjectPath, buildStudioSpacesPath, navigateToStudioPath } from '../utils/studioRouting.js'
import { getCodeSpace } from '../utils/codeSpaces.js'
import '../styles/studio-hub.css'

const formatRelativeDate = (iso) => {
    const d = new Date(iso || Date.now())
    const diff = Date.now() - d.getTime()
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    if (diff < 7 * 86400000) return `${Math.floor(diff / 86400000)}d ago`
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const formatSource = (source = '') => {
    switch (source) {
        case 'studio-v3': return 'Studio'
        case 'raw-v2': return 'Nodes'
        case 'legacy-import-studio': return 'Imported'
        case 'beta-v2': return 'Legacy'
        case 'legacy-import': return 'Legacy'
        default: return 'Project'
    }
}

const isArchivedTitle = (title = '') => title.trimStart().startsWith('[archived]')

export default function StudioHub({ spaceId = DEFAULT_PROJECT_SPACE_ID }) {
    const { role, openSpaceId } = useAuthSession()
    const [projects, setProjects] = useState([])
    const [status, setStatus] = useState('loading...')
    const [isBusy, setIsBusy] = useState(false)
    const [spaceLabel, setSpaceLabel] = useState(spaceId)
    const [creatingTitle, setCreatingTitle] = useState(null)
    const [renamingId, setRenamingId] = useState(null)
    const [renameValue, setRenameValue] = useState('')
    const [showArchived, setShowArchived] = useState(false)

    // Non-null when this space's scene is code rather than a project document.
    const codeSpace = useMemo(() => getCodeSpace(spaceId), [spaceId])

    const mostRecentProject = useMemo(() => projects[0] || null, [projects])
    const archivedProjects = useMemo(() => projects.filter(p => isArchivedTitle(p.title)), [projects])
    const visibleProjects = useMemo(
        () => showArchived ? projects : projects.filter(p => !isArchivedTitle(p.title)),
        [projects, showArchived]
    )

    useEffect(() => {
        setSpaceLabel(spaceId)
        getServerSpace(spaceId).then((space) => {
            if (space?.label) setSpaceLabel(space.label)
        }).catch(() => {})
    }, [spaceId])

    const loadProjects = useCallback(async () => {
        setStatus('loading...')
        try {
            const next = await listProjects(spaceId)
            setProjects(next)
            setStatus('')
        } catch (e) {
            setStatus(e.message || 'error loading projects')
        }
    }, [spaceId])

    useEffect(() => { loadProjects() }, [loadProjects])

    // The open space is a door, not a lobby: forward straight into the shared
    // jam project so "step inside" lands in 3D. ?browse=1 keeps the project
    // list reachable for management.
    // The forward REPLACES its history entry — pushing left the door itself in
    // history, so browser Back returned to /open/studio, which immediately
    // re-forwarded: visitors could never get back to where they came from.
    useEffect(() => {
        if (!openSpaceId || spaceId !== openSpaceId) return
        if (new URLSearchParams(window.location.search).has('browse')) return
        const jam = projects.find(p => p.id === 'open-jam') || projects[0]
        if (jam) navigateToStudioPath(buildStudioProjectPath(jam.id, spaceId), { replace: true })
    }, [projects, spaceId, openSpaceId])

    const openProject = (projectId) =>
        navigateToStudioPath(buildStudioProjectPath(projectId, spaceId))

    const handleNew = () => {
        if (isBusy) return
        setCreatingTitle('')
    }

    const submitNew = async (title) => {
        const name = title.trim() || 'Untitled'
        setCreatingTitle(null)
        setIsBusy(true)
        setStatus('creating...')
        try {
            const res = await createProject(spaceId, { title: name, slug: name, source: 'studio-v3' })
            openProject(res.project.id)
        } catch (e) {
            setStatus(e.message || 'error')
            setIsBusy(false)
        }
    }

    const handleImport = async (event) => {
        const file = event.target.files?.[0]
        if (!file) return
        setIsBusy(true)
        setStatus(`importing ${file.name}...`)
        try {
            const { document, assetFiles, warnings } = await importLegacySceneFile(file)
            const title = document.projectMeta.title
            const res = await createProject(spaceId, { title, slug: title, source: 'legacy-import-studio' })
            for (const [assetId, assetFile] of assetFiles.entries()) {
                await uploadProjectAsset(res.project.id, assetFile, { assetId })
            }
            await updateProjectDocument(res.project.id, {
                ...document,
                projectMeta: { ...document.projectMeta, id: res.project.id, spaceId, source: 'legacy-import-studio' }
            })
            if (warnings.length) setStatus(warnings.join(' '))
            openProject(res.project.id)
        } catch (e) {
            setStatus(e.message || 'import failed')
        } finally {
            setIsBusy(false)
            event.target.value = ''
        }
    }

    const startRename = (project, e) => {
        e.stopPropagation()
        setRenamingId(project.id)
        setRenameValue(project.title || '')
    }

    const submitRename = async (projectId, e) => {
        e?.preventDefault?.()
        const next = renameValue.trim()
        if (!next) return
        try {
            await updateProject(projectId, { title: next })
            setProjects(prev => prev.map(p => p.id === projectId ? { ...p, title: next } : p))
        } catch (err) {
            setStatus(err.message || 'rename failed')
        } finally {
            setRenamingId(null)
            setRenameValue('')
        }
    }

    const handleDelete = async (project) => {
        if (!project?.id) return
        if (!window.confirm(`Delete "${project.title || project.id}"? Cannot be undone.`)) return
        setIsBusy(true)
        try {
            const spaceMeta = await getServerSpace(spaceId).catch(() => null)
            const wasPublished = spaceMeta?.publishedProjectId === project.id
            // Delete first: if it fails, nothing about the space's publish
            // state changes. Only clear the live pointer once the project is
            // actually gone, so a failed delete never leaves the space
            // silently unpublished while the project still exists.
            await deleteProject(project.id)
            if (wasPublished) {
                try {
                    await updateServerSpace(spaceId, { publishedProjectId: null })
                } catch (unpublishError) {
                    setStatus(`Project deleted, but this space still points at it as its live project: ${unpublishError.message || unpublishError}`)
                }
            }
            await loadProjects()
        } catch (e) {
            setStatus(e.message || 'delete failed')
        } finally {
            setIsBusy(false)
        }
    }

    return (
        <Box className="studio-shell-root studio-hub-root">
            <GridFloorBackground
                opacity={0.25}
                showNodes={false}
                overlayGradient="radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(0,0,0,0.6) 100%), linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.4) 100%)"
            />
            <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 }, position: 'relative', zIndex: 1 }}>

                {/* Top row */}
                <div className="sh-top-row">
                    <div>
                        <p className="sh-space-context">Space: {spaceLabel}</p>
                        <h1 className="sh-title">Projects</h1>
                    </div>
                    {creatingTitle === null ? (
                        <div className="sh-top-actions">
                            <button
                                className="sh-btn-outline"
                                title="The node editor"
                                onClick={() => appNavigate(buildRawProjectsPath(spaceId))}
                            >
                                Nodes
                            </button>
                            <button className="sh-btn-new" onClick={handleNew} disabled={isBusy}>
                                + New project
                            </button>
                        </div>
                    ) : (
                        <form
                            className="sh-new-form"
                            onSubmit={e => { e.preventDefault(); submitNew(creatingTitle) }}
                        >
                            <input
                                className="sh-new-input"
                                ref={el => el?.focus()}
                                placeholder="Project name"
                                value={creatingTitle}
                                onChange={e => setCreatingTitle(e.target.value)}
                                onKeyDown={e => e.key === 'Escape' && setCreatingTitle(null)}
                            />
                            <button className="sh-btn-new" type="submit">Create</button>
                            <button className="sh-btn-cancel" type="button" onClick={() => setCreatingTitle(null)}>✕</button>
                        </form>
                    )}
                </div>

                {/* Secondary actions */}
                <div className="sh-secondary-row">
                    <button className="sh-link" onClick={() => appNavigate(buildStudioSpacesPath())}>← Spaces</button>
                    <span className="sh-sep">·</span>
                    <label className={`sh-link${isBusy ? ' sh-link-disabled' : ''}`}>
                        Import
                        <input
                            hidden type="file"
                            accept=".zip,.json,application/zip,application/json"
                            onChange={handleImport}
                            disabled={isBusy}
                        />
                    </label>
                    {mostRecentProject && (
                        <>
                            <span className="sh-sep">·</span>
                            <button
                                className="sh-link"
                                onClick={() => openProject(mostRecentProject.id)}
                            >
                                Latest
                            </button>
                        </>
                    )}
                    {/* /admin gates non-admins out — showing this to everyone
                        was the audit's "Settings dead-end" (labeled Settings, led
                        to an admin wall, bounced the user back). Admin-only now. */}
                    {role === 'admin' && (
                        <>
                            <span className="sh-sep">·</span>
                            <button className="sh-link" onClick={() => appNavigate(buildPreferencesPath(spaceId))}>Admin</button>
                        </>
                    )}
                    <span className="sh-sep">·</span>
                    <button className="sh-link" onClick={() => appNavigate(buildAppSpacePath(spaceId))}>View live</button>
                    {archivedProjects.length > 0 && (
                        <>
                            <span className="sh-sep">·</span>
                            <button className="sh-link" onClick={() => setShowArchived(v => !v)}>
                                {showArchived ? 'Hide archived' : `${archivedProjects.length} archived`}
                            </button>
                        </>
                    )}
                </div>

                {/* Status */}
                {status && (
                    <p className={`sh-status${status.includes('error') || status.includes('failed') ? ' sh-status-error' : ''}`}>
                        {status}
                    </p>
                )}

                {/* Empty state — first visit to a fresh space. Suppressed for a
                    code space: "No projects yet" beside a finished installation
                    is simply untrue, and the invitation to create one leads
                    nowhere useful. */}
                {projects.length === 0 && !codeSpace && !status && creatingTitle === null && (
                    <div className="sh-empty-state">
                        <p className="sh-empty-title">No projects yet</p>
                        <p className="sh-empty-hint">
                            A project is one thing you build and publish.
                            Create your first one — you can rename or delete it anytime.
                        </p>
                        <button className="sh-btn-new" onClick={handleNew} disabled={isBusy}>
                            + Create your first project
                        </button>
                    </div>
                )}

                {/* Projects. A space whose scene is code has content even with
                    zero projects, and it shares the grid rather than sitting in
                    one of its own — it is one of this space's things, not a
                    separate category. See utils/codeSpaces.js. */}
                {(codeSpace || visibleProjects.length > 0) && (
                    <div className="sh-projects-grid">
                        {codeSpace && (
                            <div
                                className="sh-project-card sh-project-card--code"
                                role="button"
                                tabIndex={0}
                                onClick={() => appNavigate(codeSpace.path)}
                                onKeyDown={e => e.key === 'Enter' && appNavigate(codeSpace.path)}
                            >
                                <p className="sh-project-title">{codeSpace.label}</p>
                                <span className="sh-code-badge">built from code</span>
                                <p className="sh-code-blurb">{codeSpace.blurb}</p>
                                <div className="sh-code-actions">
                                    <button
                                        className="sh-link"
                                        type="button"
                                        onClick={e => { e.stopPropagation(); appNavigate(codeSpace.path) }}
                                    >
                                        Open
                                    </button>
                                    <span className="sh-sep">·</span>
                                    <button
                                        className="sh-link"
                                        type="button"
                                        onClick={e => { e.stopPropagation(); appNavigate(codeSpace.directorPath) }}
                                    >
                                        {codeSpace.directorLabel}
                                    </button>
                                </div>
                            </div>
                        )}
                        {visibleProjects.map((project) => {
                            const isRenaming = renamingId === project.id
                            return (
                                <div
                                    key={project.id}
                                    className="sh-project-card"
                                    onClick={() => !isRenaming && openProject(project.id)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={e => e.key === 'Enter' && !isRenaming && openProject(project.id)}
                                >
                                    {isRenaming ? (
                                        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
                                        <form
                                            className="sh-rename-form"
                                            onSubmit={e => submitRename(project.id, e)}
                                            onClick={e => e.stopPropagation()}
                                            onKeyDown={e => e.stopPropagation()}
                                        >
                                            <input
                                                className="sh-rename-input"
                                                ref={el => el?.focus()}
                                                value={renameValue}
                                                onChange={e => setRenameValue(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Escape') { setRenamingId(null); setRenameValue('') }
                                                }}
                                            />
                                            <button className="sh-rename-save" type="submit">Save</button>
                                            <button className="sh-rename-cancel" type="button" onClick={() => { setRenamingId(null); setRenameValue('') }}>✕</button>
                                        </form>
                                    ) : (
                                        <p
                                            className="sh-project-title"
                                            onDoubleClick={e => startRename(project, e)}
                                            title="Double-click to rename"
                                        >
                                            {project.title}
                                        </p>
                                    )}
                                    <div className="sh-project-meta">
                                        <span className="sh-meta-tag">{formatRelativeDate(project.updatedAt)}</span>
                                        <span className="sh-meta-tag">{formatSource(project.source)}</span>
                                    </div>
                                    {!isRenaming && (
                                        <>
                                            <button
                                                className="sh-btn-rename"
                                                onClick={e => startRename(project, e)}
                                                title="Rename project"
                                            >Rename</button>
                                            <button
                                                className="sh-btn-delete"
                                                onClick={e => { e.stopPropagation(); handleDelete(project) }}
                                                aria-label="Delete"
                                                title="Delete project"
                                            >✕</button>
                                        </>
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
