import { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Container } from '@mui/material'
import { appNavigate } from '../../utils/appNavigate.js'
import { buildAppSpacePath, buildPreferencesPath } from '../../utils/spaceRouting.js'
import { buildBetaHubPath } from '../../beta/utils/betaRouting.js'
import { importLegacySceneFile } from '../../project/import/importLegacyScene.js'
import {
    DEFAULT_PROJECT_SPACE_ID,
    createProject,
    deleteProject,
    listProjects,
    updateProjectDocument,
    uploadProjectAsset
} from '../../project/services/projectsApi.js'
import { getServerSpace, updateServerSpace } from '../../services/serverSpaces.js'
import { buildStudioProjectPath, navigateToStudioPath } from '../utils/studioRouting.js'
import '../styles/studio-hub.css'

const formatDate = (iso) =>
    new Date(iso || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

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

    const mostRecentProject = useMemo(() => projects[0] || null, [projects])

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

    const handleNew = async () => {
        if (isBusy) return
        setIsBusy(true)
        setStatus('creating...')
        try {
            const now = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            const title = `Project ${now}`
            const res = await createProject(spaceId, { title, slug: title, source: 'studio-v3' })
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
            <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>

                {/* Top row */}
                <div className="sh-top-row">
                    <h1 className="sh-title">Projects</h1>
                    <button className="sh-btn-new" onClick={handleNew} disabled={isBusy}>
                        + New
                    </button>
                </div>

                {/* Secondary actions */}
                <div className="sh-secondary-row">
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
                    <button className="sh-link" onClick={() => appNavigate(buildPreferencesPath(spaceId))}>Admin</button>
                    <span className="sh-sep">·</span>
                    <button className="sh-link" onClick={() => appNavigate(buildAppSpacePath(spaceId))}>Public</button>
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
                            <div key={project.id} className="sh-project-card">
                                <p className="sh-project-title">{project.title}</p>
                                <p className="sh-project-id">{project.id}</p>
                                <div className="sh-project-meta">
                                    <span className="sh-meta-tag">{formatDate(project.updatedAt)}</span>
                                    <span className="sh-meta-tag">{formatSource(project.source)}</span>
                                </div>
                                <div className="sh-project-actions">
                                    <button className="sh-btn-open" onClick={() => openProject(project.id)}>Open</button>
                                    <button className="sh-btn-delete" onClick={() => handleDelete(project)}>Delete</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

            </Container>
        </Box>
    )
}
