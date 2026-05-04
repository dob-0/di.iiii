import { useCallback, useEffect, useRef, useState } from 'react'
import { buildAppSpacePath } from '../../utils/spaceRouting.js'
import { buildPreferencesPath } from '../../utils/spaceRouting.js'
import { importLegacySceneFile } from '../../project/import/importLegacyScene.js'
import { uploadImportedProjectAssets } from '../../project/import/projectImportAssets.js'
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
import { GUIDE_AUDIENCES } from '../utils/betaGuide.js'

export default function BetaHub({ spaceId = DEFAULT_PROJECT_SPACE_ID }) {
    const [projects, setProjects] = useState([])
    const [title, setTitle] = useState('Untitled Project')
    const [status, setStatus] = useState('Loading beta projects...')
    const [isBusy, setIsBusy] = useState(false)
    const [importWarnings, setImportWarnings] = useState([])
    const titleInputRef = useRef(null)

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
        let createdProjectId = null
        let importCommitted = false
        try {
            const { document, assetFiles, warnings } = await importLegacySceneFile(file)
            const response = await createProject(spaceId, {
                title: document.projectMeta.title,
                slug: document.projectMeta.title,
                source: 'beta-v2'
            })
            createdProjectId = response.project.id
            const baseDocument = {
                ...document,
                projectMeta: {
                    ...document.projectMeta,
                    id: createdProjectId,
                    spaceId,
                    source: 'beta-v2'
                }
            }
            const { document: nextDocument } = await uploadImportedProjectAssets({
                projectId: createdProjectId,
                document: baseDocument,
                assetFiles,
                uploadProjectAsset
            })
            await updateProjectDocument(createdProjectId, nextDocument)
            importCommitted = true
            setImportWarnings(warnings)
            openProject(createdProjectId)
        } catch (error) {
            if (createdProjectId && !importCommitted) {
                await deleteProject(createdProjectId).catch((cleanupError) => {
                })
            }
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

    const focusCreateInput = () => {
        titleInputRef.current?.focus?.()
        titleInputRef.current?.select?.()
    }

    const handleAudienceAction = (audienceId) => {
        if (audienceId === 'visitor') {
            window.location.assign(buildAppSpacePath(spaceId))
            return
        }
        focusCreateInput()
    }

    return (
        <main className="beta-hub">
            <div className="beta-hub-layout">
                <header className="beta-hub-header">
                    <div className="beta-hub-wordmark">
                        <span className="beta-hub-di-sq" />
                        <span className="beta-hub-di-sq" />
                        <span className="beta-hub-di-sq" />
                    </div>
                    <h1 className="beta-hub-title">di.i beta</h1>
                    <p className="beta-hub-tagline">space · {spaceId}</p>
                </header>

                <section className="beta-hub-onboarding" aria-label="Beta onboarding">
                    <div className="beta-hub-onboarding-copy">
                        <span className="beta-window-kicker">First Landing</span>
                        <h2>Choose a path.</h2>
                        <p>Look first, or build first.</p>
                    </div>
                    <div className="beta-hub-onboarding-grid">
                        {GUIDE_AUDIENCES.map((audience) => (
                            <section key={audience.id} className="beta-hub-onboarding-card">
                                <div className="beta-hub-onboarding-mark" aria-hidden="true">
                                    <span>{audience.glyph}</span>
                                </div>
                                <span className="beta-window-kicker">{audience.label}</span>
                                <h3>{audience.title}</h3>
                                <div className="beta-hub-onboarding-chip-row">
                                    {audience.tags.map((tag) => (
                                        <span key={tag} className="beta-hub-onboarding-chip">{tag}</span>
                                    ))}
                                </div>
                                <ol className="beta-hub-onboarding-steps">
                                    {audience.steps.map((step) => (
                                        <li key={step}>{step}</li>
                                    ))}
                                </ol>
                                <button type="button" onClick={() => handleAudienceAction(audience.id)}>
                                    {audience.actionLabel}
                                </button>
                            </section>
                        ))}
                    </div>
                </section>

                <div className="beta-hub-create-row">
                    <input
                        ref={titleInputRef}
                        className="beta-hub-title-input"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="project title"
                        onKeyDown={(e) => e.key === 'Enter' && !isBusy && handleCreate()}
                    />
                    <button type="button" className="beta-hub-create-btn" onClick={handleCreate} disabled={isBusy}>
                        new
                    </button>
                    <label className="beta-hub-import-btn">
                        <input type="file" accept=".zip,.json,application/zip,application/json" onChange={handleImport} />
                        import
                    </label>
                </div>

                <div className="beta-hub-projects">
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
                                        ×
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="beta-hub-empty">{status}</p>
                    )}
                </div>

                <footer className="beta-hub-footer">
                    <button type="button" onClick={() => window.location.assign(buildStudioHubPath(spaceId))}>studio</button>
                    <button type="button" onClick={() => window.location.assign(buildAppSpacePath(spaceId))}>public</button>
                    <button type="button" onClick={() => window.location.assign(buildPreferencesPath(spaceId))}>admin</button>
                </footer>

                {importWarnings.length ? (
                    <div className="beta-hub-warnings">
                        {importWarnings.map((warning) => (
                            <p key={warning}>{warning}</p>
                        ))}
                    </div>
                ) : null}
            </div>
        </main>
    )
}
