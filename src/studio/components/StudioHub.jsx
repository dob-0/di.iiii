import { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Container } from '@mui/material'
import { appNavigate } from '../../utils/appNavigate.js'
import { buildAppSpacePath, buildPreferencesPath } from '../../utils/spaceRouting.js'
import { buildBetaHubPath } from '../../beta/utils/betaRouting.js'
import { importLegacySceneFile } from '../../project/import/importLegacyScene.js'
import GridFloorBackground from '../../components/GridFloorBackground.jsx'
import {
    DEFAULT_PROJECT_SPACE_ID,
    createProject,
    deleteProject,
    listProjects,
    updateProjectDocument,
    uploadProjectAsset
} from '../../project/services/projectsApi.js'
import { getServerSpace, updateServerSpace } from '../../services/serverSpaces.js'
import { buildStudioProjectPath, buildStudioSpacesPath, navigateToStudioPath } from '../utils/studioRouting.js'
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
        case 'legacy-import-studio': return 'Imported'
        case 'beta-v2': return 'Beta'
        case 'legacy-import': return 'Legacy'
        default: return 'Project'
    }
}

export default function StudioHub({ spaceId = DEFAULT_PROJECT_SPACE_ID }) {
    const [projects, setProjects] = useState([])
    const [status, setStatus] = useState('loading...')
    const [isBusy, setIsBusy] = useState(false)
    const [spaceLabel, setSpaceLabel] = useState(spaceId)
    const [creatingTitle, setCreatingTitle] = useState(null)

    const mostRecentProject = useMemo(() => projects[0] || null, [projects])

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

    const handleDelete = async (project) => {
        if (!project?.id) return
        if (!window.confirm(`Delete "${project.title || project.id}"? Cannot be undone.`)) return
        setIsBusy(true)
        try {
            const spaceMeta = await getServerSpace(spaceId).catch(() => null)
            if (spaceMeta?.publishedProjectId === project.id) {
                await updateServerSpace(spaceId, { publishedProjectId: null })
            }
            await deleteProject(project.id)
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
                cellOpacity={0.04}
                sectionOpacity={0.12}
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
                        <button className="sh-btn-new" onClick={handleNew} disabled={isBusy}>
                            + New
                        </button>
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
                    <span className="sh-sep">·</span>
                    <button className="sh-link" onClick={() => appNavigate(buildBetaHubPath(spaceId))}>Beta</button>
                    <span className="sh-sep">·</span>
                    <button className="sh-link" onClick={() => appNavigate(buildPreferencesPath(spaceId))}>Settings</button>
                    <span className="sh-sep">·</span>
                    <button className="sh-link" onClick={() => appNavigate(buildAppSpacePath(spaceId))}>Live</button>
                </div>

                {/* Status */}
                {status && (
                    <p className={`sh-status${status.includes('error') || status.includes('failed') ? ' sh-status-error' : ''}`}>
                        {status}
                    </p>
                )}

                {/* Projects */}
                {projects.length > 0 && (
                    <div className="sh-projects-grid">
                        {projects.map((project) => (
                            <div
                                key={project.id}
                                className="sh-project-card"
                                onClick={() => openProject(project.id)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={e => e.key === 'Enter' && openProject(project.id)}
                            >
                                <p className="sh-project-title">{project.title}</p>
                                <div className="sh-project-meta">
                                    <span className="sh-meta-tag">{formatRelativeDate(project.updatedAt)}</span>
                                    <span className="sh-meta-tag">{formatSource(project.source)}</span>
                                </div>
                                <button
                                    className="sh-btn-delete"
                                    onClick={e => { e.stopPropagation(); handleDelete(project) }}
                                    aria-label="Delete"
                                    title="Delete project"
                                >✕</button>
                            </div>
                        ))}
                    </div>
                )}

            </Container>
        </Box>
    )
}
