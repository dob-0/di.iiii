import { useEffect, useState } from 'react'
import { buildAppSpacePath } from '../../utils/spaceRouting.js'
import { importLegacySceneFile } from '../import/importLegacyScene.js'
import {
    DEFAULT_BETA_SPACE_ID,
    createBetaProject,
    listBetaProjects,
    updateBetaProjectDocument,
    uploadBetaProjectAsset
} from '../services/projectsApi.js'
import { buildBetaProjectPath } from '../utils/betaRouting.js'

const detectEntityTypeFromMime = (mimeType = '') => {
    if (mimeType.startsWith('image/')) return 'image'
    if (mimeType.startsWith('video/')) return 'video'
    if (mimeType.startsWith('audio/')) return 'audio'
    if (mimeType.startsWith('model/')) return 'model'
    if (mimeType === 'application/octet-stream') return 'model'
    return null
}

export default function BetaHub() {
    const [projects, setProjects] = useState([])
    const [title, setTitle] = useState('Untitled Beta Project')
    const [status, setStatus] = useState('Loading beta projects...')
    const [isBusy, setIsBusy] = useState(false)
    const [importWarnings, setImportWarnings] = useState([])

    const loadProjects = async () => {
        setStatus('Loading beta projects...')
        try {
            const nextProjects = await listBetaProjects(DEFAULT_BETA_SPACE_ID)
            setProjects(nextProjects)
            setStatus(nextProjects.length ? '' : 'No beta projects yet.')
        } catch (error) {
            setStatus(error.message || 'Unable to load beta projects.')
        }
    }

    useEffect(() => {
        loadProjects()
    }, [])

    const openProject = (projectId) => {
        window.history.pushState({}, '', buildBetaProjectPath(projectId))
        window.dispatchEvent(new PopStateEvent('popstate'))
    }

    const handleCreate = async () => {
        setIsBusy(true)
        setStatus('Creating beta project...')
        try {
            const response = await createBetaProject(DEFAULT_BETA_SPACE_ID, {
                title,
                slug: title
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
            const response = await createBetaProject(DEFAULT_BETA_SPACE_ID, {
                title: document.projectMeta.title,
                slug: document.projectMeta.title
            })
            const assetMap = new Map()
            for (const [assetId, assetFile] of assetFiles.entries()) {
                const uploaded = await uploadBetaProjectAsset(response.project.id, assetFile, { assetId })
                assetMap.set(assetId, uploaded)
            }
            const nextDocument = {
                ...document,
                projectMeta: {
                    ...document.projectMeta,
                    id: response.project.id,
                    spaceId: DEFAULT_BETA_SPACE_ID
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
            await updateBetaProjectDocument(response.project.id, nextDocument)
            setImportWarnings(warnings)
            openProject(response.project.id)
        } catch (error) {
            setStatus(error.message || 'Unable to import legacy scene.')
        } finally {
            setIsBusy(false)
            event.target.value = ''
        }
    }

    return (
        <main className="beta-hub">
            <section className="beta-hub-hero">
                <span className="beta-chip">Hidden Beta</span>
                <h1>Desktop Editor V2</h1>
                <p>
                    Asset-first, windowed, and document-driven. This beta lives beside the legacy editor so we can rebuild the core cleanly.
                </p>
                <div className="beta-hub-actions">
                    <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Project title" />
                    <button type="button" onClick={handleCreate} disabled={isBusy}>Create New Project</button>
                    <label className="beta-file-button">
                        <input type="file" accept=".zip,.json,application/zip,application/json" onChange={handleImport} />
                        Import V1 Local Scene
                    </label>
                    <button type="button" onClick={() => window.location.assign(buildAppSpacePath(DEFAULT_BETA_SPACE_ID))}>
                        Open Legacy Editor
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
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p>{status}</p>
                    )}
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
