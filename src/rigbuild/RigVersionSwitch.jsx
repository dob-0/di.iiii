import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getProjectDocument, listProductionVersions, listSpaceContents } from '../project/services/projectsApi.js'
import { versionsFromDocument } from '../shared/productionVersions.js'
import { buildPublicProjectPath } from '../utils/spaceRouting.js'
import useRememberedOpen from '../utils/rememberedOpen.js'
import { CHIP, PANEL } from './chromeStyle.js'
import { rigVariantOf, versionLinks, versionListProjectOf } from './rigVariant.js'

// THE VERSION SWITCH in the space view (RIG_BUILD.md §15). Owner, 2026-09-28: three
// versions of MOXIR's rig — minimal, middle, full — to choose between by looking.
// Each version is a project of the space; this is a row of plain links to them, shown
// only on a project that says it is one of a set (components.rigVariant). Real links,
// so it works with no script state, opens in a new tab, and a thumb reaches it (44 px).
// Chrome small: one quiet row, the room stays the picture.

const rowStyle = {
    position: 'absolute',
    left: '1rem',
    zIndex: 20,
    display: 'flex',
    gap: '2px',
    padding: '2px',
    borderRadius: '2px',
    border: '1px solid var(--di-cyan-border, rgba(77, 249, 255, 0.3))',
    background: 'var(--di-scrim, rgba(4, 6, 14, 0.74))',
    backdropFilter: 'blur(12px)',
    maxWidth: 'calc(100vw - 2rem)',
    overflow: 'hidden'
}

const scrollerStyle = { display: 'flex', gap: '2px', overflowX: 'auto', scrollbarWidth: 'none', position: 'relative' }
const columnStyle = { display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto', minHeight: 0 }

// Edge fade + chevron = the cue that the row goes on (a bare 28 px fade left a half-word showing
// and read as a clipped label, owner walk 2026-10-07 P14). Not a control: no pointer events.
const fadeStyle = (side) => ({
    position: 'absolute',
    top: 0,
    bottom: 0,
    [side]: 0,
    width: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: side === 'right' ? 'flex-end' : 'flex-start',
    padding: '0 0.45rem',
    color: '#f5f7fa',
    fontSize: '1.1rem',
    pointerEvents: 'none',
    background: `linear-gradient(to ${side === 'right' ? 'left' : 'right'}, rgba(10,16,24,1) 35%, rgba(10,16,24,0))`
})

const linkStyle = (current, extra = {}) => ({
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: '44px',
    padding: '0 0.95rem',
    borderRadius: '2px',
    fontSize: 'var(--di-text-4, 0.9rem)',
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    color: current ? 'var(--di-black, #000)' : 'var(--di-text, #fff)',
    background: current ? 'var(--di-cyan, #4df9ff)' : 'transparent',
    flex: '0 0 auto',
    ...extra
})

// A button in the row (Old versions / Versions): same rectangle, same 44 px, plain border.
const buttonStyle = { ...linkStyle(false), font: 'inherit', fontSize: 'var(--di-text-4, 0.9rem)', cursor: 'pointer', border: '1px solid var(--di-cyan-border, rgba(77, 249, 255, 0.3))' }

// What the space really holds: the same visitor-safe list the space's contents page reads
// (GET /api/spaces/:id/contents) — rows with each version's own mark. null until it answers — and null for good if
// it cannot, so the row then shows only the version you are in, never a dead link.
function useSpaceProjects(spaceId, enabled) {
    const [ids, setIds] = useState(null)
    useEffect(() => {
        if (!enabled || !spaceId) return undefined
        let live = true
        setIds(null)
        listSpaceContents(spaceId)
            .then((projects) => { if (live) setIds(projects || []) })
            .catch(() => { if (live) setIds(null) })
        return () => { live = false }
    }, [spaceId, enabled])
    return ids
}

// The production's version list (docs/architecture/decisions/2026-10-04-production-versions.md). Read in
// this order: the server's public parts of it (GET /api/spaces/:id/productions/:production/versions — the
// only one a visitor can read, the list project is private), then the private list project itself (a member
// on an older server), then null and the row is what it was. undefined while it loads.
function useVersionList(spaceId, variant) {
    const production = variant?.set || null
    const listProjectId = versionListProjectOf(variant)
    const [list, setList] = useState(undefined)
    useEffect(() => {
        if (!listProjectId || !spaceId) { setList(null); return undefined }
        let live = true
        setList(undefined)
        const fromPrivate = () => getProjectDocument(listProjectId)
            .then((answer) => (answer?.document ? versionsFromDocument(answer.document) : null))
        Promise.resolve()
            .then(() => listProductionVersions(spaceId, production))
            .then((versions) => (Array.isArray(versions) && versions.length ? { production: { id: production }, entries: versions, problems: [] } : null))
            .catch(() => null)
            .then((answered) => answered || fromPrivate())
            .catch(() => null)
            .then((answer) => { if (live) setList(answer) })
        return () => { live = false }
    }, [spaceId, production, listProjectId])
    return list
}

// The labelled copies of old hall versions fold behind one entry. The current version is
// never folded (a visitor in an old copy still sees where they are). With no `copyOf`
// marks there are no copies, so no fold — the row is what it was.
// CONCEPTS (a version kept on purpose as an idea) fold the same way, behind their own button, "Concepts (n)".
// The version for the show comes first on the row as ever; a concept you are standing in is not folded.
export const splitVersions = (links) => {
    const shown = links.filter((l) => (!l.copy && !l.concept) || l.current)
    const folded = links.filter((l) => l.copy && !l.concept && !l.current)
    const concepts = links.filter((l) => l.concept && !l.current)
    return { shown, folded, concepts }
}

function VersionLink({ l, curRef }) {
    return (
        <a ref={l.current ? curRef : undefined} href={l.href} aria-current={l.current ? 'page' : undefined} title={`${l.summary || l.title}${l.show ? ' — for the show' : ''}`} style={linkStyle(l.current)}>
            {l.name}
            {l.show ? <span data-show="true" style={{ marginLeft: '0.4rem', opacity: 0.72, fontSize: '0.8rem' }}>· for the show</span> : null}
        </a>
    )
}

// mode 'row' (orbit): one horizontal row, current scrolled into view, an edge fade where it goes on.
// mode 'walk': one 44 px "Versions" button; opens a column under it (owner: switch without Esc).
// bare: the switch sits INSIDE the scene bar (SceneBar.jsx), which owns the glass, the border and the position;
// then this is only the row of links, shrinking and scrolling inside the space the bar gives it.
const bareStyle = { display: 'flex', gap: '2px', position: 'relative', minWidth: 0, flex: '0 1 auto', overflow: 'hidden' }

export default function RigVersionSwitch({ spaceId, projectId, entities, top = '1rem', mode = 'row', maxWidth = null, bare = false }) {
    const variant = useMemo(() => rigVariantOf(entities), [entities])
    const existing = useSpaceProjects(spaceId, Boolean(variant))
    const list = useVersionList(spaceId, variant)
    // while the list is loading only the current version shows (no row that reshuffles when it lands)
    const links = useMemo(() => versionLinks(variant, projectId, (id) => buildPublicProjectPath(spaceId, id), list === undefined ? null : existing, list || null), [variant, projectId, spaceId, existing, list])
    const [foldOpen, setFoldOpen] = useState(false)
    const [conceptsOpen, setConceptsOpen] = useState(false)
    const [bareOpen, toggleBare] = useRememberedOpen('versions')
    const [walkOpen, setWalkOpen] = useState(false)
    const menuOpen = bare ? bareOpen : walkOpen
    const toggleMenu = bare ? toggleBare : () => setWalkOpen((v) => !v)
    const [cue, setCue] = useState({ left: false, right: false })
    const scrollerRef = useRef(null)
    const curRef = useRef(null)
    const walk = mode === 'walk'
    const { shown, folded, concepts } = useMemo(() => (links ? splitVersions(links) : { shown: [], folded: [], concepts: [] }), [links])

    const measure = () => {
        const el = scrollerRef.current
        if (!el) return
        const left = el.scrollLeft > 1
        const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
        setCue((c) => (c.left === left && c.right === right ? c : { left, right }))
    }
    // the current version scrolled into view, then the cue
    useLayoutEffect(() => {
        const el = scrollerRef.current
        const cur = curRef.current
        if (el && cur && !walk) {
            // Centred; but a title wider than the strip starts just right of the left edge fade (48 px + 4), so its first letter is never under it.
            const centred = cur.offsetLeft - (el.clientWidth - cur.offsetWidth) / 2
            el.scrollLeft = Math.max(0, cur.offsetWidth > el.clientWidth ? cur.offsetLeft - 52 : centred)
        }
        measure()
    }, [links, foldOpen, conceptsOpen, walk])
    useEffect(() => {
        window.addEventListener('resize', measure)
        return () => window.removeEventListener('resize', measure)
    }, [])

    if (!links) return null
    const current = links.find((l) => l.current)
    const fold = folded.length ? (
        <button type="button" aria-expanded={foldOpen} aria-controls="rig-old-versions" onClick={() => setFoldOpen((v) => !v)} style={buttonStyle}>
            {`Old (${folded.length})`}
        </button>
    ) : null
    const conceptFold = concepts.length ? (
        <button type="button" aria-expanded={conceptsOpen} aria-controls="rig-concepts" onClick={() => setConceptsOpen((v) => !v)} style={buttonStyle}>
            {`Concepts (${concepts.length})`}
        </button>
    ) : null
    const items = (
        <>
            {shown.map((l) => <VersionLink key={l.href} l={l} curRef={curRef} />)}
            {fold}
            {foldOpen ? <span id="rig-old-versions" style={{ display: 'contents' }}>{folded.map((l) => <VersionLink key={l.href} l={l} curRef={curRef} />)}</span> : null}
            {conceptFold}
            {conceptsOpen ? <span id="rig-concepts" style={{ display: 'contents' }}>{concepts.map((l) => <VersionLink key={l.href} l={l} curRef={curRef} />)}</span> : null}
        </>
    )
    if (walk) {
        return (
            <nav aria-label="rig versions" style={{ ...rowStyle, top, position: 'fixed', zIndex: 30, flexDirection: 'column', maxHeight: `calc(100vh - ${top} - 1rem)` }}>
                <button type="button" aria-expanded={menuOpen} aria-controls="rig-walk-versions" onClick={toggleMenu} style={{ ...buttonStyle, maxWidth: '100%', minWidth: 0 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{`Versions · ${current ? current.name : ''}`}</span>
                </button>
                {menuOpen ? <div id="rig-walk-versions" style={columnStyle}>{items}</div> : null}
            </nav>
        )
    }
    // In the scene bar the switch is ONE small chip - the version you are in - and the row of siblings opens under it
    // (the scene is the page, owner 2026-10-13); remembered for this viewer only.
    if (bare) {
        return (
            <nav aria-label="rig versions" data-bare="true" style={{ position: 'relative', minWidth: 0, flex: '0 1 auto' }}>
                <button type="button" data-testid="rig-versions-chip" aria-expanded={menuOpen} aria-controls="rig-bar-versions" onClick={toggleMenu}
                    title="The versions of this production" style={{ ...CHIP, maxWidth: 'min(16rem, calc(100vw - 2rem))' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{`Versions · ${current ? current.name : ''}`}</span>
                    <span aria-hidden="true" style={{ opacity: 0.7 }}>{menuOpen ? '▾' : '▸'}</span>
                </button>
                {menuOpen ? <div id="rig-bar-versions" style={{ ...PANEL, minWidth: 'min(16rem, calc(100vw - 2rem))', display: 'flex', flexDirection: 'column' }}>{items}</div> : null}
            </nav>
        )
    }
    return (
        <nav aria-label="rig versions" data-bare={bare ? 'true' : undefined} style={bare ? bareStyle : { ...rowStyle, top, ...(maxWidth ? { maxWidth } : {}) }}>
            <div ref={scrollerRef} onScroll={measure} style={scrollerStyle}>{items}</div>
            {cue.left ? <span aria-hidden="true" data-cue="left" style={fadeStyle('left')}>‹</span> : null}
            {cue.right ? <span aria-hidden="true" data-cue="right" style={fadeStyle('right')}>›</span> : null}
        </nav>
    )
}
