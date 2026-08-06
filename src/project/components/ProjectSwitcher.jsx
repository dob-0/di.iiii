import { useEffect, useRef, useState } from 'react'
import { LoadingInline } from '../../components/LoadingScreen.jsx'
import { appNavigate } from '../../utils/appNavigate.js'
import { buildPublicProjectPath, buildVanityProjectPath } from '../../utils/spaceRouting.js'
import { listProjects } from '../services/projectsApi.js'

// Known hierarchies for specific spaces, front door first. Unlisted ids keep
// the server's order (most-recently-touched) and sort after every listed id.
const SPACE_PROJECT_ORDER = {
    // Client-side spaceId stays underscore (`br_id_ge`, the raw URL segment) --
    // only the server slugifies to hyphens for on-disk paths. Keying this
    // hyphenated made the whole ordering silently inert.
    br_id_ge: ['landing', 'newww', 'br-id-ge-graph', 'br-id-ge-field',
        'br-id-ge-hosq', 'br-id-ge-jam', 'br-id-ge-guide',
        'ops-board', 'v-oooooo', 'br-id-ge-lab']
}

// Crew-only documents that must never appear in the visitor-facing switcher.
// This list previously had no visibility concept at all -- it showed every
// project the API returned, which is how the show's tech rider ("needs dash",
// br-id-ge-needs: equipment lists, open/settled task tracking) ended up
// public and copy-linkable next to the field/rite/landing. Hiding here, not
// deleting the project -- the crew still uses it via its direct URL.
const SPACE_PROJECT_HIDDEN = {
    br_id_ge: ['br-id-ge-needs']
}

function sortProjectsForSpace(spaceId, projects) {
    const hidden = SPACE_PROJECT_HIDDEN[spaceId]
    const visible = hidden ? projects.filter((p) => !hidden.includes(p.id)) : projects
    const order = SPACE_PROJECT_ORDER[spaceId]
    if (!order) return visible
    const rank = (id) => {
        const index = order.indexOf(id)
        return index === -1 ? order.length : index
    }
    return [...visible].sort((a, b) => rank(a.id) - rank(b.id))
}

// Idle: barely-there chrome, so it reads as UI rather than competing with
// whatever a space renders under it (this sits over arbitrary, unknown
// content -- every space's own header, art, or type). Full contrast only
// once it's actually being used (hover/focus/open), same shape a real
// button's affordance change would take, just tuned down at rest.
const pillStyleIdle = {
    appearance: 'none',
    border: '1px solid rgba(255,255,255,0.10)',
    background: 'rgba(10, 16, 24, 0.32)',
    color: 'rgba(245, 247, 250, 0.85)',
    borderRadius: '999px',
    padding: '0.45rem 0.8rem',
    fontSize: '0.8rem',
    cursor: 'pointer',
    backdropFilter: 'blur(8px)',
    transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease'
}

const pillStyleActive = {
    ...pillStyleIdle,
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(10, 16, 24, 0.82)',
    color: '#f5f7fa',
    backdropFilter: 'blur(12px)'
}

const cardStyle = {
    background: 'rgba(6, 9, 13, 0.9)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '18px',
    padding: '0.4rem',
    minWidth: '14rem',
    maxWidth: '20rem',
    // Capped so a long project list can never grow down into the
    // bottom-left "Made with di.iiii" badge -- both are pinned to the
    // left edge with no shared layout, so the badge's footprint (its
    // own 1rem margin plus height) has to be reserved here explicitly.
    maxHeight: 'min(60dvh, calc(100dvh - 9rem))',
    overflowY: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
    backdropFilter: 'blur(12px)'
}

const itemStyle = {
    appearance: 'none',
    display: 'block',
    width: '100%',
    textAlign: 'left',
    border: 0,
    background: 'transparent',
    color: '#f5f7fa',
    borderRadius: '12px',
    padding: '0.55rem 0.75rem',
    fontSize: '0.95rem',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
}

const activeItemStyle = {
    background: 'rgba(255,255,255,0.1)',
    fontWeight: 600,
    cursor: 'default'
}

const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem'
}

const copyButtonStyle = {
    appearance: 'none',
    flexShrink: 0,
    border: 0,
    background: 'transparent',
    color: '#f5f7fa',
    opacity: 0.6,
    borderRadius: '8px',
    padding: '0.4rem 0.5rem',
    fontSize: '0.85rem',
    cursor: 'pointer'
}

// Floating list of a space's projects on direct project links (/:space/p/:id),
// so viewers can hop between one-pagers without a detour through the hub.
export default function ProjectSwitcher({ spaceId, currentProjectId, spaceLabel = '' }) {
    const [open, setOpen] = useState(false)
    const [pillHover, setPillHover] = useState(false)
    const [projects, setProjects] = useState(null)
    const [copiedId, setCopiedId] = useState(null)
    const rootRef = useRef(null)

    // Vanity link (docs/architecture/SPEC_space_urls_and_portability.md) when
    // the project has a slug set; falls back to the guaranteed-stable /p/{id}
    // form otherwise — never a dead/unresolvable link either way.
    const copyProjectLink = (project) => {
        const path = project.slug
            ? buildVanityProjectPath(spaceId, project.slug)
            : buildPublicProjectPath(spaceId, project.id)
        const url = `${window.location.origin}${path}`
        navigator.clipboard?.writeText(url).then(() => {
            setCopiedId(project.id)
            setTimeout(() => setCopiedId((current) => (current === project.id ? null : current)), 1500)
        }).catch(() => {})
    }

    useEffect(() => {
        if (!open || projects || !spaceId) return undefined
        let cancelled = false
        listProjects(spaceId)
            .then((response) => {
                if (cancelled) return
                const list = Array.isArray(response) ? response : []
                setProjects(sortProjectsForSpace(spaceId, list))
            })
            .catch(() => {
                if (cancelled) return
                setProjects([])
            })
        return () => {
            cancelled = true
        }
    }, [open, projects, spaceId])

    useEffect(() => {
        if (!open) return undefined
        const handlePointerDown = (event) => {
            if (rootRef.current && !rootRef.current.contains(event.target)) {
                setOpen(false)
            }
        }
        window.addEventListener('pointerdown', handlePointerDown)
        return () => window.removeEventListener('pointerdown', handlePointerDown)
    }, [open])

    if (!spaceId) return null

    return (
        <div
            ref={rootRef}
            style={{
                position: 'absolute',
                top: '1rem',
                left: '1rem',
                zIndex: 30,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '0.5rem'
            }}
        >
            <button
                type="button"
                style={open || pillHover ? pillStyleActive : pillStyleIdle}
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
                onMouseEnter={() => setPillHover(true)}
                onMouseLeave={() => setPillHover(false)}
                onFocus={() => setPillHover(true)}
                onBlur={() => setPillHover(false)}
            >
                {(spaceLabel || spaceId) + (open ? ' ▴' : ' ▾')}
            </button>
            {open ? (
                <nav style={cardStyle} aria-label="Projects in this space">
                    {projects === null ? (
                        <div style={{ ...itemStyle, cursor: 'default', opacity: 0.7 }}>
                            <LoadingInline label="loading projects…" />
                        </div>
                    ) : projects.length === 0 ? (
                        <div style={{ ...itemStyle, cursor: 'default', opacity: 0.7 }}>No projects here.</div>
                    ) : (
                        projects.map((project) => {
                            const isCurrent = project.id === currentProjectId
                            return (
                                <div key={project.id} style={rowStyle}>
                                    <button
                                        type="button"
                                        aria-current={isCurrent ? 'page' : undefined}
                                        style={{ ...(isCurrent ? { ...itemStyle, ...activeItemStyle } : itemStyle), flex: 1 }}
                                        onClick={() => {
                                            setOpen(false)
                                            if (!isCurrent) {
                                                appNavigate(buildPublicProjectPath(spaceId, project.id))
                                            }
                                        }}
                                    >
                                        {project.title || project.id}
                                    </button>
                                    <button
                                        type="button"
                                        style={copyButtonStyle}
                                        title="Copy public link"
                                        aria-label={`Copy public link for ${project.title || project.id}`}
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            copyProjectLink(project)
                                        }}
                                    >
                                        {copiedId === project.id ? 'Copied ✓' : 'Copy link'}
                                    </button>
                                </div>
                            )
                        })
                    )}
                </nav>
            ) : null}
        </div>
    )
}
