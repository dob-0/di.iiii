import { useEffect, useRef, useState } from 'react'
import { appNavigate } from '../../utils/appNavigate.js'
import { buildPublicProjectPath } from '../../utils/spaceRouting.js'
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

function sortProjectsForSpace(spaceId, projects) {
    const order = SPACE_PROJECT_ORDER[spaceId]
    if (!order) return projects
    const rank = (id) => {
        const index = order.indexOf(id)
        return index === -1 ? order.length : index
    }
    return [...projects].sort((a, b) => rank(a.id) - rank(b.id))
}

const pillStyle = {
    appearance: 'none',
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(10, 16, 24, 0.82)',
    color: '#f5f7fa',
    borderRadius: '999px',
    padding: '0.7rem 1rem',
    fontSize: '0.95rem',
    cursor: 'pointer',
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

// Floating list of a space's projects on direct project links (/:space/p/:id),
// so viewers can hop between one-pagers without a detour through the hub.
export default function ProjectSwitcher({ spaceId, currentProjectId, spaceLabel = '' }) {
    const [open, setOpen] = useState(false)
    const [projects, setProjects] = useState(null)
    const rootRef = useRef(null)

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
                style={pillStyle}
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
            >
                {(spaceLabel || spaceId) + (open ? ' ▴' : ' ▾')}
            </button>
            {open ? (
                <nav style={cardStyle} aria-label="Projects in this space">
                    {projects === null ? (
                        <div style={{ ...itemStyle, cursor: 'default', opacity: 0.7 }}>Loading projects...</div>
                    ) : projects.length === 0 ? (
                        <div style={{ ...itemStyle, cursor: 'default', opacity: 0.7 }}>No projects here.</div>
                    ) : (
                        projects.map((project) => {
                            const isCurrent = project.id === currentProjectId
                            return (
                                <button
                                    key={project.id}
                                    type="button"
                                    aria-current={isCurrent ? 'page' : undefined}
                                    style={isCurrent ? { ...itemStyle, ...activeItemStyle } : itemStyle}
                                    onClick={() => {
                                        setOpen(false)
                                        if (!isCurrent) {
                                            appNavigate(buildPublicProjectPath(spaceId, project.id))
                                        }
                                    }}
                                >
                                    {project.title || project.id}
                                </button>
                            )
                        })
                    )}
                </nav>
            ) : null}
        </div>
    )
}
