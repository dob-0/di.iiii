import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { listSpaceContents } from '../project/services/projectsApi.js'
import { buildPublicProjectPath } from '../utils/spaceRouting.js'
import { rigVariantOf, shortTitle, versionLinks } from './rigVariant.js'

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
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(10, 16, 24, 0.82)',
    backdropFilter: 'blur(12px)',
    maxWidth: 'calc(100vw - 2rem)',
    overflow: 'hidden'
}

const scrollerStyle = { display: 'flex', gap: '2px', overflowX: 'auto', scrollbarWidth: 'none' }
const columnStyle = { display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto', minHeight: 0 }

// Edge fade = the cue that the row goes on. Not a control: no pointer events.
const fadeStyle = (side) => ({
    position: 'absolute',
    top: 0,
    bottom: 0,
    [side]: 0,
    width: '28px',
    pointerEvents: 'none',
    background: `linear-gradient(to ${side === 'right' ? 'left' : 'right'}, rgba(10,16,24,0.95), rgba(10,16,24,0))`
})

const linkStyle = (current, extra = {}) => ({
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: '44px',
    padding: '0 0.95rem',
    borderRadius: '2px',
    fontSize: '0.9rem',
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    color: current ? '#05070a' : '#f5f7fa',
    background: current ? '#f5f7fa' : 'transparent',
    flex: '0 0 auto',
    ...extra
})

// A button in the row (Old versions / Versions): same rectangle, same 44 px, plain border.
const buttonStyle = { ...linkStyle(false), font: 'inherit', fontSize: '0.9rem', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.28)' }

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

// The labelled copies of old hall versions fold behind one entry. The current version is
// never folded (a visitor in an old copy still sees where they are). With no `copyOf`
// marks there are no copies, so no fold — the row is what it was.
export const splitVersions = (links) => {
    const shown = links.filter((l) => !l.copy || l.current)
    const folded = links.filter((l) => l.copy && !l.current)
    return { shown, folded }
}

function VersionLink({ l, curRef }) {
    return (
        <a ref={l.current ? curRef : undefined} href={l.href} aria-current={l.current ? 'page' : undefined} title={l.summary || l.title} style={linkStyle(l.current)}>
            {shortTitle(l.title, l.id)}
        </a>
    )
}

// mode 'row' (orbit): one horizontal row, current scrolled into view, an edge fade where it goes on.
// mode 'walk': one 44 px "Versions" button; opens a column under it (owner: switch without Esc).
export default function RigVersionSwitch({ spaceId, projectId, entities, top = '1rem', mode = 'row' }) {
    const variant = useMemo(() => rigVariantOf(entities), [entities])
    const existing = useSpaceProjects(spaceId, Boolean(variant))
    const links = useMemo(() => versionLinks(variant, projectId, (id) => buildPublicProjectPath(spaceId, id), existing), [variant, projectId, spaceId, existing])
    const [foldOpen, setFoldOpen] = useState(false)
    const [menuOpen, setMenuOpen] = useState(false)
    const [cue, setCue] = useState({ left: false, right: false })
    const scrollerRef = useRef(null)
    const curRef = useRef(null)
    const walk = mode === 'walk'
    const { shown, folded } = useMemo(() => (links ? splitVersions(links) : { shown: [], folded: [] }), [links])

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
        if (el && cur && !walk) el.scrollLeft = Math.max(0, cur.offsetLeft - (el.clientWidth - cur.offsetWidth) / 2)
        measure()
    }, [links, foldOpen, walk])
    useEffect(() => {
        window.addEventListener('resize', measure)
        return () => window.removeEventListener('resize', measure)
    }, [])

    if (!links) return null
    const current = links.find((l) => l.current)
    const fold = folded.length ? (
        <button type="button" aria-expanded={foldOpen} aria-controls="rig-old-versions" onClick={() => setFoldOpen((v) => !v)} style={buttonStyle}>
            {`Old versions (${folded.length})`}
        </button>
    ) : null
    const items = (
        <>
            {shown.map((l) => <VersionLink key={l.href} l={l} curRef={curRef} />)}
            {fold}
            {foldOpen ? <span id="rig-old-versions" style={{ display: 'contents' }}>{folded.map((l) => <VersionLink key={l.href} l={l} curRef={curRef} />)}</span> : null}
        </>
    )
    if (walk) {
        return (
            <nav aria-label="rig versions" style={{ ...rowStyle, top, position: 'fixed', zIndex: 30, flexDirection: 'column', maxHeight: `calc(100vh - ${top} - 1rem)` }}>
                <button type="button" aria-expanded={menuOpen} aria-controls="rig-walk-versions" onClick={() => setMenuOpen((v) => !v)} style={buttonStyle}>
                    {`Versions · ${current ? shortTitle(current.title, current.id) : ''}`}
                </button>
                {menuOpen ? <div id="rig-walk-versions" style={columnStyle}>{items}</div> : null}
            </nav>
        )
    }
    return (
        <nav aria-label="rig versions" style={{ ...rowStyle, top }}>
            <div ref={scrollerRef} onScroll={measure} style={scrollerStyle}>{items}</div>
            {cue.left ? <span aria-hidden="true" data-cue="left" style={fadeStyle('left')} /> : null}
            {cue.right ? <span aria-hidden="true" data-cue="right" style={fadeStyle('right')} /> : null}
        </nav>
    )
}
