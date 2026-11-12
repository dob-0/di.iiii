import { Fragment, useEffect, useMemo, useState } from 'react'
import SurfaceBar from '../components/SurfaceBar.jsx'
import { isEmbedRequest } from '../utils/previewMode.js'
import RouteSurfaceFallback from '../components/RouteSurfaceFallback.jsx'
import useAuthSession from '../hooks/useAuthSession.js'
import useLocalInstall from '../hooks/useLocalInstall.js'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import { useAllTools } from '../studio/utils/jamMode.js'
import { spaceAddressOf } from '../utils/spaceAddress.js'
import { spaceTabTitle, spaceWordFor } from '../utils/oneNamePerSpace.js'
import { listCollections, listProjects, listSpaceContents } from '../project/services/projectsApi.js'
import { doorsForListRow } from '../project/doors.js'
import { groupByShelf } from '../project/shelves.js'
import { getServerSpace } from '../services/serverSpaces.js'
import { appNavigate } from '../utils/appNavigate.js'
import { buildAppSpacePath, buildPublicProjectPath, buildScanPath, buildVanityProjectPath } from '../utils/spaceRouting.js'
import { emptySpaceSentence } from '../components/emptySpaceWords.js'
import { sourcesProjectId } from '../scan/scanSources.js'
import { buildStudioHubPath } from '../studio/utils/studioRouting.js'
import { getCodeSpace } from '../studio/utils/codeSpaces.js'
import { isSpaceInSessionScope } from '../utils/sessionScope.js'
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

// A member's data (nav reach, 2026-11-12). The contents list a visitor is given
// carries no shelf and no counts on its rows (serverXR/src/routes/projectRoutes.js,
// GET /api/spaces/:id/contents), so a member's page also asks what the Studio
// hub asks: the shelves, and the member list, whose rows say which shelf a
// project is on and what it holds (`layers`, the counts that say which doors
// it has). Never rejects: a failed request is a state the page says quietly
// ('failed'), not a blank page, and not zero shelves.
const NO_MEMBER_DATA = { status: 'none', collections: [], byId: null }
const FAILED_MEMBER_DATA = { status: 'failed', collections: [], byId: null }

const askMemberData = (spaceId) => new Promise((resolve) => {
    resolve(Promise.all([listCollections(spaceId), listProjects(spaceId)]))
})
    .then(([collections, rows]) => {
        if (!Array.isArray(collections) || !Array.isArray(rows)) return FAILED_MEMBER_DATA
        return {
            status: 'ready',
            collections,
            byId: new Map(rows.map((row) => [row.id, { collectionId: row.collectionId || null, layers: row.layers || null }]))
        }
    })
    .catch(() => FAILED_MEMBER_DATA)

export default function SpaceContentsPage({ spaceId }) {
    const session = useAuthSession()
    const { role, requireAuth } = session
    const localInstall = useLocalInstall()
    const isEmbed = isEmbedRequest()
    const allTools = useAllTools()
    const [state, setState] = useState({ status: 'loading', projects: [], space: null, error: null })
    // Member-only data, in its own state so the contents load below stays as it
    // was: a session that arrives late must not send the page back to loading.
    const [memberData, setMemberData] = useState(NO_MEMBER_DATA)

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

    // One name per space: the bar, the heading and the tab say the same word, whichever address was typed.
    const address = spaceAddressOf(state.space, spaceId)
    const label = spaceWordFor(state.space?.label, address)
    const projects = state.projects

    // The tab says the space's name, the same one the heading below and the /{space} tab say (docs/ai/vocabulary.md,
    // "One name per space") — it was the index.html default on every space's list. The platform's own space (id main)
    // gets none: the front door keeps index.html's title. Asked of the space's record, not of the word that was typed.
    useDocumentTitle(state.status === 'ready'
        ? spaceTabTitle({ spaceId: state.space?.id || spaceId, label: state.space?.label, address })
        : null)

    // A page that is CODE has no row on any server, so a list built by asking
    // the server what a space holds cannot see it. That is the whole of why the
    // WCC landing page was missing from the WCC space: it is compiled React at
    // /wcc, not a document. src/works/works.js knows about it, so ask there too
    // and show it in line with the rest — to a visitor it is one more thing the
    // space holds, not a category.
    const codeSpace = getCodeSpace(spaceId)
    const thingCount = projects.length + (codeSpace ? 1 : 0)

    // Only one row can say "the way in", and where a work shadows the space the
    // stored door is not it: the router hands `/wcc` to the code before any
    // space route ever sees it (src/RootApp.jsx, workForSegment), so the
    // project the database calls the door is reachable only at its own address.
    const doorId = codeSpace ? null : (state.space?.publishedProjectId || null)

    // The space holds its own footage, so it is a place being collected rather
    // than a space that merely has work in it. Read off the list that is already
    // loaded — no second request, and no claim about a space nobody has scanned.
    const isBeingScanned = projects.some((project) => project.id === sourcesProjectId(spaceId))

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
        // Scope alone is not a key — the server checks the session is signed in
        // before it ever reads scope, and so does this.
        return Boolean(session.authenticated) && isSpaceInSessionScope(session, spaceId)
    }, [requireAuth, role, spaceId, session])

    // The member's own data is read in its own effect, which waits for BOTH
    // facts: the session says canEdit, and the space has answered. On a hosted
    // install canEdit flips to true when the session arrives; that must not
    // send the contents above back to loading, so it is not a dependency there.
    const contentsReady = state.status === 'ready'
    useEffect(() => {
        let alive = true
        // Nothing of a previous space or session is kept.
        setMemberData(NO_MEMBER_DATA)
        // listProjects creates a space that is missing (projectsApi.js,
        // withAutoProvisionedSpace): so only for somebody who could already
        // edit, and only once the space has answered, never for a visitor.
        if (!canEdit || !contentsReady) return undefined
        askMemberData(spaceId).then((answer) => {
            if (alive) setMemberData(answer)
        })
        return () => { alive = false }
    }, [canEdit, contentsReady, spaceId])

    // The member's page: each row filed under its shelf and carrying what the
    // project holds. A visitor's rows are the contents rows, untouched.
    const memberReady = canEdit && memberData.status === 'ready'
    const memberSettled = canEdit && (memberData.status === 'ready' || memberData.status === 'failed')
    const memberRows = useMemo(() => {
        if (!memberReady) return projects
        return projects.map((project) => {
            const known = memberData.byId.get(project.id)
            return known ? { ...project, collectionId: known.collectionId, layers: known.layers } : project
        })
    }, [memberReady, memberData, projects])

    // For a member with at least one shelf, the list is grouped under shelf
    // headings; with none, or for a visitor, it stays the one flat list.
    const shelfGroups = memberReady && memberData.collections.length > 0
        ? groupByShelf(memberRows, memberData.collections)
        : null
    const shelvesFailed = canEdit && memberData.status === 'failed'

    // One scene row and, for a member, the doors of that project under it. The
    // strip is a sibling of the row's link, never inside it. It is drawn only
    // once the member's data has settled (answered or failed), so a strip never
    // changes after it appears; a project the list knows nothing about gets the
    // three sure doors, and a page gets none (doorsForListRow).
    const renderRow = (project) => {
        const kind = kindOf(project.mode)
        const href = contentsHref(spaceId, project)
        const doors = memberSettled
            ? doorsForListRow(project, {
                space: spaceId,
                isLocalInstall: localInstall.isLocal,
                from: 'studio',
                allTools
            })
            : []
        return (
            <li key={project.id} className={doors.length ? 'sc-item--doors' : undefined}>
                <a className="sc-row" href={href}>
                    <span className="sc-row-name">
                        {project.title}
                        {project.id === doorId && (
                            <span className="sc-row-door" title="What this space opens on">the way in</span>
                        )}
                        {/* Only a member is ever sent a private row, so the
                            mark is for them: this one visitors do not see. */}
                        {project.visibility === 'private' && (
                            <span className="sc-row-door" title="Private — only members of this space see it">private</span>
                        )}
                    </span>
                    <span className="sc-row-kind">
                        {kind.label}
                        <span className="sc-row-hint">{kind.hint}</span>
                    </span>
                    <span className="sc-row-when">{whenDone(project.updatedAt)}</span>
                </a>
                {doors.length > 0 && (
                    <div className="sc-row-doors" role="group" aria-label={`Open ${project.title || project.id} in`}>
                        {doors.map((door) => (
                            <a key={door.key} className="sc-door" href={door.href}>{door.label}</a>
                        ))}
                    </div>
                )}
            </li>
        )
    }

    const codeRow = codeSpace && (
        <li key={`code-${codeSpace.spaceId}`}>
            <a className="sc-row" href={codeSpace.path}>
                <span className="sc-row-name">
                    {codeSpace.title}
                    <span className="sc-row-door" title="What this space opens on">the way in</span>
                </span>
                <span className="sc-row-kind">
                    {kindOf(codeSpace.kind).label}
                    <span className="sc-row-hint">{kindOf(codeSpace.kind).hint}</span>
                </span>
                <span className="sc-row-when" />
            </a>
        </li>
    )

    if (state.status === 'loading' || isOnlyTheDoor) {
        return <RouteSurfaceFallback label="Loading" detail="" />
    }

    return (
        <div className="sc">
            <SurfaceBar
                space={spaceId}
                spaceLabel={label}
                spaceAddress={address}
                isLocalInstall={localInstall.isLocal}
                hidden={isEmbed}
            />

            <div className="sc-page">
                <h1 className="sc-title">{label}</h1>
                {state.status === 'error' ? (
                    <p className="sc-lede">{state.error}</p>
                ) : (
                    <p className="sc-lede">
                        {thingCount === 0
                            ? emptySpaceSentence(canEdit)
                            : `Everything in this space — ${thingCount} ${thingCount === 1 ? 'thing' : 'things'}, each one a scene you can be inside or a page you can read.`}
                    </p>
                )}

                {/* A member's shelves did not load: say so once, quietly, and keep
                    the flat list. Not the same as a space with no shelves. */}
                {thingCount > 0 && shelvesFailed && (
                    <p className="sc-shelf-note">The shelves did not load, so this list is not grouped.</p>
                )}

                {thingCount > 0 && !shelfGroups && (
                    <ul className="sc-list">
                        {codeRow}
                        {memberRows.map(renderRow)}
                    </ul>
                )}

                {thingCount > 0 && shelfGroups && (
                    <>
                        {codeRow && <ul className="sc-list">{codeRow}</ul>}
                        {shelfGroups.map((group) => (
                            <Fragment key={group.id}>
                                <h2 className="sc-shelf">{group.label}</h2>
                                {group.items.length > 0
                                    ? <ul className="sc-list">{group.items.map(renderRow)}</ul>
                                    : <p className="sc-shelf-empty">Nothing on this shelf yet.</p>}
                            </Fragment>
                        ))}
                    </>
                )}

                {canEdit && state.status !== 'error' && (
                    <p className="sc-aside">
                        <a className="sc-aside-link" href={buildStudioHubPath(spaceId)}>Open this space in Studio</a>
                        {' '}— drafts and older work are there too.
                    </p>
                )}

                {/* A space that already holds its own footage is a PLACE
                    somebody has been collecting, so the way back to the camera
                    belongs here and only here: one quiet line beside the other
                    one, for somebody who could already edit, and nothing at all
                    on a space that has never been scanned. The published face of
                    the footage room stays chrome-free — the owner's call of
                    2026-08-07, and a floating Scan button on a public page would
                    be exactly the thing it refused. */}
                {canEdit && isBeingScanned && (
                    <p className="sc-aside">
                        <a className="sc-aside-link" href={buildScanPath(spaceId)}>Add to the scan of this place</a>
                        {' '}— the camera, and the wall it lands on.
                    </p>
                )}
            </div>
        </div>
    )
}
