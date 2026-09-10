import { useEffect, useMemo, useState } from 'react'
import SurfaceBar from '../components/SurfaceBar.jsx'
import RouteSurfaceFallback from '../components/RouteSurfaceFallback.jsx'
import useAuthSession from '../hooks/useAuthSession.js'
import useLocalInstall from '../hooks/useLocalInstall.js'
import { listSpaceContents } from '../project/services/projectsApi.js'
import { getServerSpace } from '../services/serverSpaces.js'
import { appNavigate } from '../utils/appNavigate.js'
import { buildAppSpacePath, buildPublicProjectPath, buildVanityProjectPath } from '../utils/spaceRouting.js'
import { buildStudioHubPath } from '../studio/utils/studioRouting.js'
import './spaceContents.css'

/**
 * `/{space}/projects` — everything a space holds, as a visitor can reach it.
 *
 * Measured on the owner's own copy on 2026-09-10: 22 spaces, 201 projects, and
 * 114 of those projects reachable by no click from anywhere. Not junk — every
 * one had something in it. 78 sat behind three front pages that nothing linked
 * to; the rest were single leaves nobody had a way to name. A space had exactly
 * one door (`spaces.publishedProjectId`) and that door was the whole of what a
 * visitor could get to.
 *
 * Owner, 2026-09-10: *"we need full visibility of our every layer"*, and the
 * shape he agreed to — a space should show everything inside it, and each thing
 * should say whether it is a scene or a page, using the setting di.iiii already
 * has, instead of asking you to pick a kind at the moment you know least.
 *
 * The sibling of StudioHub, not a copy of it. An author files, archives,
 * reorders and deletes; StudioHub is where all of that lives and it stays
 * there. A visitor only goes places, so this is one list, in one order, with
 * one fact per row.
 *
 * What it will not do:
 *
 *   - It will not show a draft or an archived project. That filter is enforced
 *     on the server (serverXR/src/routes/projectRoutes.js), because a filter
 *     that lives in a component is a suggestion.
 *   - It will not name a kind the data cannot keep. `presentationState.mode` is
 *     the author's own setting and the one the published surface already obeys;
 *     a stored `kind` column would be a claim about a document that carries
 *     entities[] and nodes[] at the same time with nothing enforcing either.
 *   - It will not stand in front of a space that holds one thing. See below.
 */

// Two words, both already in the dictionary (docs/ai/vocabulary.md): a scene is
// the 3D place you can be inside, a page is a published web page. The third
// mode, 'fixed-camera', is a scene you look at from one chosen position rather
// than walk — still a scene, so it says so, and the second word says which kind
// of looking it expects. Nothing here is guessed: the mode is what the author
// set in the editor.
const KIND = {
    'scene': { label: 'Scene', hint: 'walk it' },
    'fixed-camera': { label: 'Scene', hint: 'one view' },
    'code': { label: 'Page', hint: 'a web page' }
}

const kindOf = (mode) => KIND[mode] || KIND.scene

const whenDone = (ms) => {
    if (!ms) return ''
    const diff = Date.now() - Number(ms)
    if (diff < 60_000) return 'just now'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
    if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`
    return new Date(Number(ms)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// The pretty address when the project has a public handle, the permanent one
// when it does not — the same order every other link in the product uses.
export const contentsHref = (spaceId, project) => (project.slug
    ? buildVanityProjectPath(spaceId, project.slug)
    : buildPublicProjectPath(spaceId, project.id))

export default function SpaceContentsPage({ spaceId }) {
    const { role, spaces: sessionScopes, openSpaceId, sandboxSpaceId, requireAuth } = useAuthSession()
    const localInstall = useLocalInstall()
    const [state, setState] = useState({ status: 'loading', projects: [], space: null, error: null })

    useEffect(() => {
        let alive = true
        setState({ status: 'loading', projects: [], space: null, error: null })
        Promise.all([
            listSpaceContents(spaceId),
            // The label and the door. Its failure is not this page's failure:
            // the list is the page, and a space that will not describe itself
            // still has contents worth showing.
            getServerSpace(spaceId).catch(() => null)
        ])
            .then(([projects, space]) => {
                if (!alive) return
                setState({ status: 'ready', projects, space, error: null })
            })
            .catch((error) => {
                if (!alive) return
                setState({ status: 'error', projects: [], space: null, error: error?.message || 'That space did not answer.' })
            })
        return () => { alive = false }
    }, [spaceId])

    const doorId = state.space?.publishedProjectId || null
    const label = state.space?.label || spaceId
    const projects = state.projects

    // A space that holds one thing must not grow a page that says less than the
    // thing does. If the only project on show is the space's own door, this list
    // is a screen whose entire content is a link to the room you would already be
    // standing in — so hand the visitor the room instead, and replace the entry in
    // history so Back leaves the door behind rather than bouncing through it.
    // Only when it IS the door: one project that is NOT the door is exactly the
    // case this page exists for, because nothing else in the product links to it.
    const isOnlyTheDoor = state.status === 'ready'
        && projects.length === 1
        && Boolean(doorId)
        && projects[0].id === doorId

    useEffect(() => {
        if (!isOnlyTheDoor) return
        appNavigate(buildAppSpacePath(spaceId), { replace: true })
    }, [isOnlyTheDoor, spaceId])

    // Editing lives in Studio and stays there — this page never offers it, it
    // only says where it is, and only to somebody who could already get in.
    // Same reading of the session SpaceHub's card uses.
    const canEdit = useMemo(() => {
        if (!requireAuth) return true
        if (role === 'admin') return true
        if (spaceId === openSpaceId || spaceId === sandboxSpaceId) return true
        return Array.isArray(sessionScopes) && sessionScopes.includes(spaceId)
    }, [requireAuth, role, spaceId, openSpaceId, sandboxSpaceId, sessionScopes])

    if (state.status === 'loading' || isOnlyTheDoor) {
        return <RouteSurfaceFallback label="Loading" detail="" />
    }

    return (
        <div className="sc">
            <SurfaceBar
                space={spaceId}
                spaceLabel={label}
                isLocalInstall={localInstall.isLocal}
            />

            <div className="sc-page">
                <h1 className="sc-title">{label}</h1>
                {state.status === 'error' ? (
                    <p className="sc-lede">{state.error}</p>
                ) : (
                    <p className="sc-lede">
                        {projects.length === 0
                            ? 'Nothing is on show in this space yet.'
                            : `Everything in this space — ${projects.length} ${projects.length === 1 ? 'thing' : 'things'}, each one a scene you can be inside or a page you can read.`}
                    </p>
                )}

                {projects.length > 0 && (
                    <ul className="sc-list">
                        {projects.map((project) => {
                            const kind = kindOf(project.mode)
                            const href = contentsHref(spaceId, project)
                            return (
                                <li key={project.id}>
                                    <a className="sc-row" href={href}>
                                        <span className="sc-row-name">
                                            {project.title}
                                            {project.id === doorId && (
                                                <span className="sc-row-door" title="What this space opens on">the way in</span>
                                            )}
                                        </span>
                                        <span className="sc-row-kind">
                                            {kind.label}
                                            <span className="sc-row-hint">{kind.hint}</span>
                                        </span>
                                        <span className="sc-row-when">{whenDone(project.updatedAt)}</span>
                                    </a>
                                </li>
                            )
                        })}
                    </ul>
                )}

                {canEdit && state.status !== 'error' && (
                    <p className="sc-aside">
                        <a className="sc-aside-link" href={buildStudioHubPath(spaceId)}>Open this space in Studio</a>
                        {' '}— drafts, archived work, shelves and the trash are there.
                    </p>
                )}
            </div>
        </div>
    )
}
