import { useCallback, useEffect, useRef, useState } from 'react'
import { buildAppSpacePath } from '../../utils/spaceRouting.js'
import { buildPreferencesPath } from '../../utils/spaceRouting.js'
import { importLegacySceneFile } from '../../project/import/importLegacyScene.js'
import {
    DEFAULT_PROJECT_SPACE_ID,
    createProject,
    deleteProject,
    getProjectDocument,
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
import { STUDIO_TYPE_ID, buildStudioContainerWithInterior } from '../../project/graph/studioNode.js'
import { stashRawEnterNode } from '../utils/rawEnterNodeHandoff.js'
import { DEFAULT_RAW_WORKSPACE_TOP } from '../utils/windowLayout.js'
import SpaceSyncPanel from '../../components/SpaceSyncPanel.jsx'

// Reserved project slug (and therefore id — creation derives one from the
// other, see serverXR/src/projectStore.js's PROJECT_RESERVED_SLUGS) for the
// single per-space project that hosts the Studio container node. Not
// "studio" itself — that slug is blocked because it would collide with the
// existing /{space}/studio route.
// `projects.id` is a GLOBAL primary key and ids derive from slugs, so a fixed
// slug here meant exactly one space in the whole install could hold a Studio
// node: the second space to try it got a 409 "Project already exists" and the
// button died. Scoping the slug by space is the smallest fix that does not
// touch the id model.
//
// The bare legacy id is still accepted when it appears in THIS space's list —
// it can only be there if it belongs here — so the one space that already has
// one keeps it, and nothing needs migrating.
const STUDIO_PROJECT_ID = 'studio-node'
const studioProjectSlugFor = (spaceId) => `${STUDIO_PROJECT_ID}-${spaceId}`

export default function RawHub({ spaceId = DEFAULT_PROJECT_SPACE_ID }) {
    const { role } = useAuthSession()
    const [projects, setProjects] = useState([])
    const [title, setTitle] = useState('Untitled Project')
    const [status, setStatus] = useState('Loading projects...')
    const [isBusy, setIsBusy] = useState(false)
    const [importWarnings, setImportWarnings] = useState([])
    const titleInputRef = useRef(null)
    const workflowSteps = [
        'Create or open a space from admin.',
        'Start a project, or import one you made earlier.',
        'Build it on the canvas: add nodes, wire them together.',
        "Publish it at the space's public address."
    ]

    const loadProjects = useCallback(async () => {
        setStatus('Loading projects...')
        try {
            const nextProjects = await listProjects(spaceId)
            setProjects(nextProjects)
            setStatus(nextProjects.length ? '' : 'No projects in this space yet.')
        } catch (error) {
            setStatus(error.message || 'Unable to load projects.')
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
        setStatus('Creating project...')
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
            setStatus(error.message || 'Unable to import that project.')
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

    // "open studio" used to just navigate to the separate /studio route —
    // a plain link, no data connecting it to anything the user built in Raw.
    // Studio is now reachable as a container node inside Raw's own graph (see
    // studioNode.js), so this finds or creates the one project that hosts it
    // and opens straight into its interior (Outliner/Scene/Inspector) instead.
    const handleOpenStudio = async () => {
        setIsBusy(true)
        setStatus('Opening Studio...')
        try {
            const scopedId = studioProjectSlugFor(spaceId)
            let project = projects.find((existing) => existing.id === scopedId || existing.id === STUDIO_PROJECT_ID)
            let studioNodeId = null
            if (!project) {
                const response = await createProject(spaceId, {
                    title: 'Studio',
                    slug: scopedId,
                    source: 'raw-v2'
                })
                project = response.project
                const { container, interior } = buildStudioContainerWithInterior({
                    workspaceTop: DEFAULT_RAW_WORKSPACE_TOP
                })
                if (container) {
                    studioNodeId = container.id
                    await updateProjectDocument(project.id, {
                        ...response.document,
                        nodes: [...(response.document.nodes || []), container, ...interior]
                    })
                }
            } else {
                // GET .../document responds { document, version, project } —
                // not the document itself (see serverXR/src/routes/
                // projectRoutes.js). Reading `.nodes` straight off the
                // response silently found nothing on every "open studio"
                // after the first, so the handoff never stashed and the
                // editor landed at the project root instead of inside Studio.
                const { document } = await getProjectDocument(project.id)
                studioNodeId = (document?.nodes || []).find((node) => node.typeId === STUDIO_TYPE_ID)?.id || null
            }
            if (studioNodeId) stashRawEnterNode(project.id, studioNodeId)
            openProject(project.id)
        } catch (error) {
            setStatus(error.message || 'Unable to open Studio.')
        } finally {
            setIsBusy(false)
        }
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
                    <h1 className="raw-hub-title">di.iiii</h1>
                    <p className="raw-hub-tagline">space · {spaceId}</p>
                </header>


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
                        new project
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

                {/* The GUIDE comes after the list, not before it.
                    This address means "this space's node projects", and it used to
                    open on a full page of onboarding with the list pushed below the
                    fold — so the Studio hub's "Nodes" button, which is how a person
                    who already has projects gets here, answered a request for a list
                    with a lesson. Below the list it costs a returning person nothing,
                    and a newcomer still meets it first, because their list is empty
                    and takes almost no room. */}
                <section className="raw-hub-onboarding" aria-label="Getting started">
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
                            <h3>Space → project → publish</h3>
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
                            <button type="button" onClick={handleOpenStudio} disabled={isBusy}>
                                open the Studio node
                            </button>
                        </section>
                    </div>
                </section>

                <SpaceSyncPanel spaceId={spaceId} />

                <footer className="raw-hub-footer">
                    {/* It goes to Studio, so it says Studio. "studio projects" named two
                        levels at once and matched no dictionary row. */}
                    <button type="button" title="Open this space in Studio" onClick={() => appNavigate(buildStudioHubPath(spaceId))}>studio</button>
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
