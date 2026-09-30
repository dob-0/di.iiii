import { Fragment, useEffect, useMemo, useState } from 'react'
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
    borderRadius: '999px',
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(10, 16, 24, 0.82)',
    backdropFilter: 'blur(12px)',
    maxWidth: 'calc(100vw - 2rem)',
    overflowX: 'auto'
}

const dividerStyle = { alignSelf: 'center', flex: '0 0 1px', height: '24px', margin: '0 4px', background: 'rgba(255,255,255,0.28)' }

const linkStyle = (current) => ({
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: '44px',
    padding: '0 0.95rem',
    borderRadius: '999px',
    fontSize: '0.9rem',
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    color: current ? '#05070a' : '#f5f7fa',
    background: current ? '#f5f7fa' : 'transparent'
})

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

export default function RigVersionSwitch({ spaceId, projectId, entities, top = '1rem' }) {
    const variant = useMemo(() => rigVariantOf(entities), [entities])
    const existing = useSpaceProjects(spaceId, Boolean(variant))
    const links = useMemo(() => versionLinks(variant, projectId, (id) => buildPublicProjectPath(spaceId, id), existing), [variant, projectId, spaceId, existing])
    if (!links) return null
    return (
        <nav aria-label="rig versions" style={{ ...rowStyle, top }}>
            {links.map((l, i) => (
                <Fragment key={l.href}>
                    {/* the labelled copies of old hall versions come after the live ones, apart */}
                    {l.copy && !links[i - 1]?.copy ? <span aria-hidden="true" style={dividerStyle} /> : null}
                    <a href={l.href} aria-current={l.current ? 'page' : undefined} title={l.summary || l.title} style={linkStyle(l.current)}>
                        {shortTitle(l.title, l.id)}
                    </a>
                </Fragment>
            ))}
        </nav>
    )
}
