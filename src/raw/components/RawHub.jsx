import { useCallback, useEffect, useRef, useState } from 'react'
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
import { appNavigate } from '../../utils/appNavigate.js'
import useAuthSession from '../../hooks/useAuthSession.js'
import { buildStudioHubPath } from '../../studio/utils/studioRouting.js'
import { buildRawProjectPath, navigateToRawPath } from '../utils/rawRouting.js'
import { GUIDE_AUDIENCES } from '../utils/rawGuide.js'
import SpaceSyncPanel from '../../components/SpaceSyncPanel.jsx'

export default function RawHub({ spaceId = DEFAULT_PROJECT_SPACE_ID }) {
    const { role } = useAuthSession()
    const [projects, setProjects] = useState([])
    const [title, setTitle] = useState('Untitled Project')
    const [status, setStatus] = useState('Loading seed projects...')
    const [isBusy, setIsBusy] = useState(false)
    const [importWarnings, setImportWarnings] = useState([])
    const titleInputRef = useRef(null)
    const workflowSteps = [
        'Create or open the space from the admin surface or spaces panel.',
        'Start a seed project or import a legacy scene for experimental work.',
        'Keep the node-first iteration here while you test layout, routing, and sync.',
        'Move stable work into Studio and publish it to the public space route.'
    ]

    const loadProjects = useCallback(async () => {
        setStatus('Loading seed projects...')
        try {
            const nextProjects = await listProjects(spaceId)
            setProjects(nextProjects)
            setStatus(nextProjects.length ? '' : 'No seed projects in this space yet.')
        } catch (error) {
            setStatus(error.message || 'Unable to load seed projects.')
        }
    }, [spaceId])

    useEffect(() => {
        loadProjects()
    }, [loadProjects])

    const openProject = (projectId) => {
        navigateToRawPath(buildRawProjectPath(projectId, spaceId))
    }

    const handleCreate = async () => {
        setIsBusy(true)
        setStatus('Creating seed project...')
        try {
            const response = await createProject(spaceId, {
                title,
                slug: title,
                source: 'raw-v2'
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
                source: 'raw-v2'
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
                    source: 'raw-v2'
                }
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

    const focusCreateInput = () => {
        titleInputRef.current?.focus?.()
        titleInputRef.current?.select?.()
    }

    const handleAudienceAction = (audienceId) => {
        if (audienceId === 'visitor') {
            appNavigate(buildAppSpacePath(spaceId))
            return
        }
        focusCreateInput()
    }

    return (
        <main className="raw-hub">
            <div className="raw-hub-layout">
                <header className="raw-hub-header">
                    <div className="raw-hub-wordmark">
                        <span className="raw-hub-di-sq" />
                        <span className="raw-hub-di-sq" />
                        <span className="raw-hub-di-sq" />
                    </div>
                    <h1 className="raw-hub-title">di.iiii seed</h1>
                    <p className="raw-hub-tagline">space · {spaceId}</p>
                </header>

                <section className="raw-hub-onboarding" aria-label="Seed onboarding">
                    <div className="raw-hub-onboarding-copy">
                        <span className="raw-window-kicker">First Landing</span>
                        <h2>Choose a path.</h2>
                        <p>Look first, or build first.</p>
                    </div>
                    <div className="raw-hub-onboarding-grid">
                        {GUIDE_AUDIENCES.map((audience) => (
                            <section key={audience.id} className="raw-hub-onboarding-card">
                                <div className="raw-hub-onboarding-mark" aria-hidden="true">
                                    <span>{audience.glyph}</span>
                                </div>
                                <span className="raw-window-kicker">{audience.label}</span>
                                <h3>{audience.title}</h3>
                                <div className="raw-hub-onboarding-chip-row">
                                    {audience.tags.map((tag) => (
                                        <span key={tag} className="raw-hub-onboarding-chip">{tag}</span>
                                    ))}
                                </div>
                                <ol className="raw-hub-onboarding-steps">
                                    {audience.steps.map((step) => (
                                        <li key={step}>{step}</li>
                                    ))}
                                </ol>
                                <button type="button" onClick={() => handleAudienceAction(audience.id)}>
                                    {audience.actionLabel}
                                </button>
                            </section>
                        ))}
                        <section className="raw-hub-onboarding-card">
                            <div className="raw-hub-onboarding-mark" aria-hidden="true">
                                <span>↔</span>
                            </div>
                            <span className="raw-window-kicker">Workflow</span>
                            <h3>Space → Seed → Studio</h3>
                            <div className="raw-hub-onboarding-chip-row">
                                <span className="raw-hub-onboarding-chip">space</span>
                                <span className="raw-hub-onboarding-chip">project</span>
                                <span className="raw-hub-onboarding-chip">publish</span>
                            </div>
                            <ol className="raw-hub-onboarding-steps">
                                {workflowSteps.map((step) => (
                                    <li key={step}>{step}</li>
                                ))}
                            </ol>
                            <button type="button" onClick={() => appNavigate(buildStudioHubPath(spaceId))}>
                                open studio
                            </button>
                        </section>
                    </div>
                </section>

                <div className="raw-hub-create-row">
                    <input
                        ref={titleInputRef}
                        className="raw-hub-title-input"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="project title"
                        onKeyDown={(e) => e.key === 'Enter' && !isBusy && handleCreate()}
                    />
                    <button type="button" className="raw-hub-create-btn" onClick={handleCreate} disabled={isBusy}>
                        new
                    </button>
                    <label className="raw-hub-import-btn">
                        <input type="file" accept=".zip,.json,application/zip,application/json" onChange={handleImport} />
                        import
                    </label>
                </div>

                <div className="raw-hub-projects">
                    {projects.length ? (
                        <ul className="raw-project-list">
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
                        <p className="raw-hub-empty">{status}</p>
                    )}
                </div>

                <SpaceSyncPanel spaceId={spaceId} />

                <footer className="raw-hub-footer">
                    <button type="button" onClick={() => appNavigate(buildStudioHubPath(spaceId))}>studio</button>
                    <button type="button" onClick={() => appNavigate(buildAppSpacePath(spaceId))}>public</button>
                    {role === 'admin' && (
                        <button type="button" onClick={() => appNavigate(buildPreferencesPath(spaceId))}>admin</button>
                    )}
                </footer>

                {importWarnings.length ? (
                    <div className="raw-hub-warnings">
                        {importWarnings.map((warning) => (
                            <p key={warning}>{warning}</p>
                        ))}
                    </div>
                ) : null}
            </div>
        </main>
    )
}
