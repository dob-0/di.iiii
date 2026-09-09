// Layout + view-model for the Spaces constellation: pure functions so the
// R3F surface stays a thin renderer and this stays unit-testable in jsdom.

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

export const NODE_KIND = {
    OPEN: 'open',
    SANDBOX: 'sandbox',
    SPACE: 'space'
}

const kindOf = (space, { openSpaceId } = {}) => {
    if (space.id === openSpaceId) return NODE_KIND.OPEN
    if (space.kind === 'sandbox') return NODE_KIND.SANDBOX
    return NODE_KIND.SPACE
}

// Status drives color in the scene: amber = di.iiii's main space,
// cyan = public with a live face, slate = private work, faint = sandbox.
export const nodeStatus = (space, { defaultSpaceId } = {}) => {
    if (space.id === defaultSpaceId) return 'main'
    if (space.kind === 'sandbox') return 'sandbox'
    if (space.isPublic && space.publishedProjectId) return 'live'
    if (space.isPublic) return 'public'
    return 'private'
}

export const NODE_COLORS = {
    main: '#ffb347',
    live: '#4fd6ff',
    public: '#7fc4e8',
    private: '#8a93a6',
    sandbox: '#5f6b7a'
}

// Golden-angle spiral in a shallow disc: stable per index (no randomness so
// nodes never jump between reloads), the open space anchored at the center.
export const layoutSpaces = (spaces = [], { defaultSpaceId = null, openSpaceId = null } = {}) => {
    const open = spaces.filter(s => s.id === openSpaceId)
    const rest = spaces.filter(s => s.id !== openSpaceId)
    const ordered = [...open, ...rest]
    return ordered.map((space, i) => {
        const angle = i * GOLDEN_ANGLE
        // sqrt, not linear. Linear growth put the 22nd space 31 units out while
        // the first sat at 3.4, so the field could not be framed: at any zoom
        // that showed the outer ring the middle was a cluster of dots, and at
        // any zoom that read the middle the outer ring was off the canvas.
        // sqrt keeps the ring spacing even to the eye and the whole estate
        // inside one frame.
        const radius = i === 0 && open.length ? 0 : 3.4 + Math.sqrt(i) * 2.4
        const status = nodeStatus(space, { defaultSpaceId })
        return {
            id: space.id,
            space,
            kind: kindOf(space, { openSpaceId }),
            status,
            color: NODE_COLORS[status],
            position: [
                Math.cos(angle) * radius,
                Math.sin(i * 1.7) * 0.9,
                Math.sin(angle) * radius
            ],
            phase: (i * 0.618) % 1
        }
    })
}

// Node size grows with content but stays bounded so one packed space
// cannot dwarf the constellation.
export const nodeScale = (projectCount) => {
    const n = Number.isFinite(projectCount) ? projectCount : 1
    return 0.52 + Math.min(n, 14) * 0.055
}

// Satellite ring for the selected space's projects.
export const layoutProjects = (projects = [], nodePosition = [0, 0, 0], scale = 1) => {
    const r = 1.35 + scale * 0.9
    return projects.map((project, i) => {
        const angle = i * GOLDEN_ANGLE + 0.8
        return {
            id: project.id,
            project,
            position: [
                nodePosition[0] + Math.cos(angle) * r,
                nodePosition[1] + Math.sin(i * 2.1) * 0.45,
                nodePosition[2] + Math.sin(angle) * r
            ]
        }
    })
}

// How far back the camera has to stand to hold every node, with the label above
// each one and a margin. The map used to open at a fixed distance chosen when
// there were six spaces; at 22 it cropped the outermost ones against the edge of
// the canvas, which reads as a broken view rather than a big one.
export const fitDistance = (nodes = [], { fov = 55, aspect = 16 / 9, margin = 1.5 } = {}) => {
    if (!nodes.length) return 18
    const reach = nodes.reduce((max, node) => {
        const [x, y, z] = node.position
        // the label sits above the core, so the thing to fit is taller than the node
        const bodyReach = Math.hypot(x, y + nodeScale(node.projectCount ?? 1) * 2.2, z)
        return Math.max(max, bodyReach)
    }, 0)
    // The spaces lie on a disc and the camera looks down on it, so the disc is
    // WIDE on screen and foreshortened vertically — roughly half its width.
    // Both fits have to be satisfied and the frame decides which one binds: a
    // wide desktop crops top and bottom, a phone crops left and right. Fitting
    // only one of them is how the map cropped on every frame that was not the
    // 16/9 it was written for.
    const halfAngle = Math.tan((fov * Math.PI) / 360)
    const DISC_FORESHORTENING = 0.62
    const byWidth = (reach * margin) / (halfAngle * Math.max(aspect, 0.35))
    const byHeight = (reach * DISC_FORESHORTENING * margin) / halfAngle
    return Math.max(12, byWidth, byHeight)
}
