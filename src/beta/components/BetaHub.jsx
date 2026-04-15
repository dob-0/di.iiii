import { useCallback, useEffect, useState } from 'react'
import { buildAppSpacePath } from '../../utils/spaceRouting.js'
import { buildPreferencesPath } from '../../utils/spaceRouting.js'
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
import { buildStudioHubPath } from '../../studio/utils/studioRouting.js'
import { buildBetaProjectPath, navigateToBetaPath } from '../utils/betaRouting.js'

const detectEntityTypeFromMime = (mimeType = '') => {
    if (mimeType.startsWith('image/')) return 'image'
    if (mimeType.startsWith('video/')) return 'video'
    if (mimeType.startsWith('audio/')) return 'audio'
    if (mimeType.startsWith('model/')) return 'model'
    if (mimeType === 'application/octet-stream') return 'model'
    return null
}

export default function BetaHub({ spaceId = DEFAULT_PROJECT_SPACE_ID }) {
    const [projects, setProjects] = useState([])
    const [title, setTitle] = useState('Untitled Project')
    const [status, setStatus] = useState('Loading beta projects...')
    const [isBusy, setIsBusy] = useState(false)
    const [importWarnings, setImportWarnings] = useState([])

    const loadProjects = useCallback(async () => {
        setStatus('Loading beta projects...')
        try {
            const nextProjects = await listProjects(spaceId)
            setProjects(nextProjects)
            setStatus(nextProjects.length ? '' : 'No beta projects in this space yet.')
        } catch (error) {
            setStatus(error.message || 'Unable to load beta projects.')
        }
    }, [spaceId])

    useEffect(() => {
        loadProjects()
    }, [loadProjects])

    const openProject = (projectId) => {
        navigateToBetaPath(buildBetaProjectPath(projectId, spaceId))
    }

    const handleCreate = async () => {
        setIsBusy(true)
        setStatus('Creating beta project...')
        try {
            const response = await createProject(spaceId, {
                title,
                slug: title,
                source: 'beta-v2'
            })
            openProject(response.project.id)
        } catch (error) {
            setStatus(error.message || 'Unable to create project.')
        } finally {
            setIsBusy(false)
        }
    }

    const handleImport = async (event) => {
        const file = event.target.files?.[0]
        if (!file) return
        setIsBusy(true)
        setStatus(`Importing ${file.name}...`)
        setImportWarnings([])
        try {
            const { document, assetFiles, warnings } = await importLegacySceneFile(file)
            const response = await createProject(spaceId, {
                title: document.projectMeta.title,
                slug: document.projectMeta.title,
                source: 'beta-v2'
            })
            const assetMap = new Map()
            for (const [assetId, assetFile] of assetFiles.entries()) {
                const uploaded = await uploadProjectAsset(response.project.id, assetFile, { assetId })
                assetMap.set(assetId, uploaded)
            }
            const nextDocument = {
                ...document,
                projectMeta: {
                    ...document.projectMeta,
                    id: response.project.id,
                    spaceId,
                    source: 'beta-v2'
                },
                assets: document.assets.map((asset) => {
                    const uploaded = assetMap.get(asset.id)
                    return uploaded || asset
                }),
                entities: document.entities.map((entity) => {
                    const type = detectEntityTypeFromMime(assetMap.get(entity.components?.media?.assetId)?.mimeType || '')
                    if (!entity.components?.media?.assetId || !assetMap.get(entity.components.media.assetId)) {
                        return entity
                    }
                    return {
                        ...entity,
                        type: type || entity.type
                    }
                })
            }
            await updateProjectDocument(response.project.id, nextDocument)
            setImportWarnings(warnings)
            openProject(response.project.id)
        } catch (error) {
            setStatus(error.message || 'Unable to import legacy scene.')
        } finally {
            setIsBusy(false)
            event.target.value = ''
        }
    }

    const handleDeleteProject = async (project) => {
        if (!project?.id) return
        const confirmed = window.confirm(`Delete project "${project.title || project.id}"? This cannot be undone.`)
        if (!confirmed) return
        setIsBusy(true)
        setStatus(`Deleting ${project.title || project.id}...`)
        try {
            const spaceMeta = await getServerSpace(spaceId).catch(() => null)
            if (spaceMeta?.publishedProjectId === project.id) {
                await updateServerSpace(spaceId, { publishedProjectId: null })
            }
            await deleteProject(project.id)
            await loadProjects()
            setStatus('Project deleted.')
        } catch (error) {
            setStatus(error.message || 'Unable to delete project.')
        } finally {
            setIsBusy(false)
        }
    }

    return (
        <main className="beta-hub">
            <section className="beta-hub-hero">
                <div className="beta-hub-actions" style={{ gap: '0.5rem', justifyContent: 'flex-start' }}>
                    <span className="beta-chip">V2 Beta</span>
                    <span className="beta-chip" style={{ background: 'rgba(255,255,255,0.08)' }}>Space {spaceId}</span>
                </div>
                <h1>Desktop Editor V2</h1>
                <p>
                    Asset-first, windowed, and document-driven. This is the experimental workspace for this space, while Studio remains the official main workspace.
                </p>
                <div className="beta-hub-actions">
                    <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Project title" />
                    <button type="button" onClick={handleCreate} disabled={isBusy}>Create New Project</button>
                    <label className="beta-file-button">
                        <input type="file" accept=".zip,.json,application/zip,application/json" onChange={handleImport} />
                        Import V1 Local Scene
                    </label>
                    <button type="button" onClick={() => window.location.assign(buildAppSpacePath(spaceId))}>
                        Open public route
                    </button>
                    <button type="button" onClick={() => window.location.assign(buildStudioHubPath(spaceId))}>
                        Open Studio workspace
                    </button>
                    <button type="button" onClick={() => window.location.assign(buildPreferencesPath(spaceId))}>
                        Open admin
                    </button>
                </div>
            </section>

            <section className="beta-hub-grid">
                <div className="beta-card">
                    <h2>Recent Projects</h2>
                    {projects.length ? (
                        <ul className="beta-project-list">
                            {projects.map((project) => (
                                <li key={project.id}>
                                    <button type="button" onClick={() => openProject(project.id)}>
                                        <strong>{project.title}</strong>
                                        <span>{project.id}</span>
                                    </button>
                                    <button
                                        type="button"
                                        className="danger"
                                        onClick={() => handleDeleteProject(project)}
                                    >
                                        Delete
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p>{status}</p>
                    )}
                </div>
                <div className="beta-card">
                    <h2>Role In The Platform</h2>
                    <ul className="beta-inline-list">
                        <li>Beta lane for alternative and experimental project workflow</li>
                        <li>Useful for testing ideas without replacing the main Studio surface</li>
                        <li>Kept alongside Studio instead of replacing it</li>
                    </ul>
                </div>
                <div className="beta-card">
                    <h2>What V2 Reuses</h2>
                    <ul className="beta-inline-list">
                        <li>Server auth/edit lock and CORS hardening</li>
                        <li>Asset upload and fetch transport</li>
                        <li>Three/R3F graphics stack</li>
                        <li>Socket presence + cursor transport</li>
                    </ul>
                </div>
                <div className="beta-card">
                    <h2>What V2 Replaces</h2>
                    <ul className="beta-inline-list">
                        <li>Legacy objects[] scene model</li>
                        <li>Old panel shell split vs float duplication</li>
                        <li>Main editor orchestration in App.jsx</li>
                        <li>Legacy render composition</li>
                    </ul>
                </div>
            </section>

            {importWarnings.length ? (
                <section className="beta-card beta-import-warnings">
                    <h2>Import Warnings</h2>
                    <ul className="beta-inline-list">
                        {importWarnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                        ))}
                    </ul>
                </section>
            ) : null}
        </main>
    )
}
