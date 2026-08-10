import { useCallback, useEffect, useState } from 'react'
import { createProject, deleteProject, listProjects, updateProject } from '../../project/services/projectsApi.js'
import { getServerSpace, updateServerSpace } from '../../services/serverSpaces.js'
import { buildStudioProjectPath, navigateToStudioPath } from '../utils/studioRouting.js'

// The Projects window: hop between the space's projects and do light
// management (new / rename / delete) without leaving the editor for the hub.
export default function StudioProjectsPanel({ spaceId, currentProjectId }) {
    const [projects, setProjects] = useState(null)
    const [publishedProjectId, setPublishedProjectId] = useState(null)
    const [status, setStatus] = useState('')
    const [busy, setBusy] = useState(false)
    const [renamingId, setRenamingId] = useState(null)
    const [renameValue, setRenameValue] = useState('')
    const [creating, setCreating] = useState(false)
    const [createValue, setCreateValue] = useState('')

    const loadProjects = useCallback(async () => {
        if (!spaceId) return
        try {
            const next = await listProjects(spaceId)
            setProjects(next)
            setStatus('')
        } catch (e) {
            setProjects([])
            setStatus(e.message || 'error loading projects')
        }
    }, [spaceId])

    useEffect(() => { void loadProjects() }, [loadProjects])

    useEffect(() => {
        if (!spaceId) return
        getServerSpace(spaceId)
            .then((space) => setPublishedProjectId(space?.publishedProjectId || null))
            .catch(() => {})
    }, [spaceId])

    const openProject = (projectId) => {
        if (projectId === currentProjectId) return
        navigateToStudioPath(buildStudioProjectPath(projectId, spaceId))
    }

    const submitCreate = async (e) => {
        e?.preventDefault?.()
        const name = createValue.trim() || 'Untitled'
        setCreating(false)
        setCreateValue('')
        setBusy(true)
        setStatus('creating...')
        try {
            const res = await createProject(spaceId, { title: name, slug: name, source: 'studio-v3' })
            navigateToStudioPath(buildStudioProjectPath(res.project.id, spaceId))
        } catch (err) {
            setStatus(err.message || 'create failed')
            setBusy(false)
        }
    }

    const submitRename = async (projectId, e) => {
        e?.preventDefault?.()
        const next = renameValue.trim()
        setRenamingId(null)
        setRenameValue('')
        if (!next) return
        try {
            await updateProject(projectId, { title: next })
            setProjects((prev) => (prev || []).map((p) => (p.id === projectId ? { ...p, title: next } : p)))
        } catch (err) {
            setStatus(err.message || 'rename failed')
        }
    }

    const handleDelete = async (project) => {
        if (!project?.id || busy) return
        if (project.id === currentProjectId) return
        if (!window.confirm(`Delete "${project.title || project.id}"? Cannot be undone.`)) return
        setBusy(true)
        try {
            const wasPublished = publishedProjectId === project.id
            // Delete first: if it fails, nothing about the space's publish
            // state changes. Only clear the live pointer once the project is
            // actually gone, so a failed delete never leaves the space
            // silently unpublished while the project still exists.
            await deleteProject(project.id)
            let unpublishError = null
            if (wasPublished) {
                try {
                    await updateServerSpace(spaceId, { publishedProjectId: null })
                    setPublishedProjectId(null)
                } catch (e) {
                    unpublishError = e
                }
            }
            await loadProjects()
            // loadProjects clears the status on success, so the warning has to
            // be set after it — otherwise the one message telling the user the
            // space now points nowhere is wiped before it can be read.
            if (unpublishError) {
                setStatus(`Project deleted, but the space's live pointer could not be cleared: ${unpublishError.message || unpublishError}`)
            }
        } catch (e) {
            setStatus(e.message || 'delete failed')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="spp-root">
            <div className="spp-list">
                {projects === null ? (
                    <div className="spp-status">loading projects...</div>
                ) : projects.length === 0 ? (
                    <div className="spp-status">no projects in this space yet</div>
                ) : (
                    projects.map((project) => {
                        const isCurrent = project.id === currentProjectId
                        return (
                            <div key={project.id} className={`spp-row ${isCurrent ? 'spp-row--current' : ''}`}>
                                {renamingId === project.id ? (
                                    <form className="spp-rename" onSubmit={(e) => submitRename(project.id, e)}>
                                        <input
                                            ref={(el) => el?.focus()}
                                            value={renameValue}
                                            onChange={(e) => setRenameValue(e.target.value)}
                                            onBlur={(e) => submitRename(project.id, e)}
                                            onKeyDown={(e) => { if (e.key === 'Escape') { setRenamingId(null); setRenameValue('') } }}
                                            aria-label="Project title"
                                        />
                                    </form>
                                ) : (
                                    <button
                                        type="button"
                                        className="spp-open"
                                        aria-current={isCurrent ? 'page' : undefined}
                                        onClick={() => openProject(project.id)}
                                        title={isCurrent ? 'This project is open' : `Open ${project.title || project.id}`}
                                    >
                                        <span className="spp-title">{project.title || project.id}</span>
                                        {publishedProjectId === project.id && <span className="spp-badge">live</span>}
                                    </button>
                                )}
                                <span className="spp-actions">
                                    <button
                                        type="button"
                                        className="spp-icon"
                                        title="Rename"
                                        aria-label="Rename"
                                        onClick={() => { setRenamingId(project.id); setRenameValue(project.title || '') }}
                                    >
                                        ✎
                                    </button>
                                    {!isCurrent && (
                                        <button
                                            type="button"
                                            className="spp-icon spp-icon--danger"
                                            title="Delete"
                                            aria-label="Delete"
                                            disabled={busy}
                                            onClick={() => handleDelete(project)}
                                        >
                                            ×
                                        </button>
                                    )}
                                </span>
                            </div>
                        )
                    })
                )}
            </div>
            {creating ? (
                <form className="spp-new-form" onSubmit={submitCreate}>
                    <input
                        ref={(el) => el?.focus()}
                        placeholder="project title"
                        value={createValue}
                        onChange={(e) => setCreateValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Escape') { setCreating(false); setCreateValue('') } }}
                        aria-label="New project title"
                    />
                    <button type="submit" className="spp-icon" title="Create" aria-label="Create">✓</button>
                </form>
            ) : (
                <button type="button" className="spp-new" disabled={busy} onClick={() => setCreating(true)}>
                    ＋ New project
                </button>
            )}
            {status && <div className="spp-status">{status}</div>}
        </div>
    )
}
