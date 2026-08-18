// The desk a first visit finds already set. /open/raw used to open on an
// empty grid with one hint line — honest zen, but a stranger's first sight of
// the platform was a blank page. This builds the starter constellation for a
// BRAND-NEW local workspace only (RawEditor seeds it as the document's origin,
// so undo unwinds to nothing rather than deleting it node by node, and the
// projectId guard upstream makes it structurally unable to touch any server
// space — see RawEditor.initialStoreState).
//
// The constellation is three ideas, not a museum:
//   - the World window, open: a live three.js room on the surface
//   - a Sky color node WIRED into it: the wire is real (evaluateNodeInput
//     drives the rendered background), so the first thing a visitor sees is
//     cause and effect, not decoration
//   - the Studio container: the room you can step into
// plus one text window that carries the onboarding the empty-state hint used
// to (both hints go silent once nodes exist).
import { createEdge, createNode } from '../../nodeRegistry.js'
import { buildNodeValues } from '../nodeGraphAuthoring.js'
import { buildStudioContainerWithInterior } from '../studioNode.js'

// Deep teal, deliberately not the World default '#0a0e16' — the Sky node must
// visibly be the one driving the room, or the wire reads as decoration.
export const STARTER_SKY_COLOR = '#062126'

export const STARTER_WELCOME_TEXT = [
    'a workspace, not a file.',
    'Sky is wired into World — change the color, the room follows.',
    'double-tap for the palette. enter Studio › for the room.'
].join('\n\n')

// A phone gets the same three ideas in less text, because its welcome window
// has to be short enough to leave the cards a clear band (see the layout note
// below) — and because a window that needs scrolling to finish a sentence is a
// worse first sight than one that does not.
export const STARTER_WELCOME_TEXT_NARROW = [
    'a workspace, not a file. Sky is wired into World — change the color, the room follows.',
    'tap Studio › for the room.'
].join('\n\n')

const clamp = (min, value, max) => Math.min(max, Math.max(min, value))

/**
 * Build the first-visit document for a blank local workspace.
 * Viewport dimensions decide the two visible window frames — the seed runs
 * client-side, so the caller passes the real ones.
 *
 * @returns {{ nodes: Array, edges: Array }}
 */
export function buildStarterWorkspaceDocument({
    workspaceTop = 168,
    viewportWidth = 1280,
    viewportHeight = 800
} = {}) {
    // The corridor has to STRADDLE THE CENTRE LINE, not merely be wide enough.
    // RawGraphSurface fits and centres the card cluster on the visible area —
    // the viewport's centre, which knows nothing about these two windows — so a
    // corridor that is off-centre slides the cards under a window even while
    // the gap between the windows is technically wider than a card. That is
    // exactly what happened at ~1050px (reported 2026-08-18 with the World
    // window sitting on the cards): world 441 + text 280 left a 281px gap, but
    // it ran 304..585 while the centred 202px card lane ran 424..626, so the
    // cards' right edge — and every output dot on it — was under the window and
    // could not be grabbed at all. Capping both edge windows keeps the lane
    // clear; below the cap's floor there is no honest corridor and the stacked
    // layout is the only one that leaves the cards reachable.
    const CARD_LANE_HALF = 101
    const CARD_LANE_GUTTER = 24
    const padWide = 24
    const edgeWindowMax = Math.floor(viewportWidth / 2) - CARD_LANE_HALF - CARD_LANE_GUTTER - padWide
    const narrow = viewportWidth < 640 || edgeWindowMax < 320
    const pad = narrow ? 12 : padWide

    // The seed opens in zen (no topbar), so windows sit high; if the visitor
    // summons the chrome they can drag them — the first impression wins.
    const windowTop = narrow ? 88 : 96

    const worldWidth = narrow
        ? viewportWidth - pad * 2
        : clamp(320, Math.min(Math.round(viewportWidth * 0.42), edgeWindowMax), 560)
    const worldHeight = narrow
        ? clamp(180, Math.round(viewportHeight * 0.24), 220)
        : Math.round(worldWidth * 0.7)
    const worldFrame = {
        x: narrow ? pad : viewportWidth - worldWidth - pad,
        y: windowTop,
        width: worldWidth,
        height: worldHeight
    }

    const textWidth = narrow
        ? viewportWidth - pad * 2
        : clamp(280, Math.min(Math.round(viewportWidth * 0.26), edgeWindowMax), 340)
    // Derived from the clear band, not picked: the window sits against the
    // bottom edge, so its height is what is left below the band's lower edge
    // (0.64 of the viewport) minus the two gaps.
    const textHeight = narrow ? clamp(200, Math.floor(viewportHeight * 0.36) - 24, 300) : 380
    // On a phone the two windows used to stack from the top and, between them,
    // cover the whole screen — so the cards sat behind them and "enter Studio ›
    // for the room" pointed at something invisible. The surface CENTRES the card
    // cluster vertically, so the only layout that leaves cards reachable is
    // windows at the two edges and a clear band down the middle. Seen on a 390×844
    // phone at DPR 3, which is how the bug was found; guarded by the
    // clear-band test in starterWorkspace.test.js.
    const textFrame = {
        x: pad,
        y: narrow
            ? viewportHeight - textHeight - 16
            : Math.max(windowTop, viewportHeight - textHeight - 72),
        width: textWidth,
        height: textHeight
    }

    // The graph surface auto-fits and CENTRES the card cluster in the visible
    // area, so the cards' absolute coordinates matter less than their spread:
    // a wide grid gets centred back under the floating windows. One narrow
    // column (200px cards) stays in the corridor between the welcome window
    // (lower-left) and the World window (right) on a desktop, and simply sits
    // beneath both windows on a phone.
    // Tighter on a phone: the cluster has to fit the band between the two
    // windows, and the surface zooms to fit rather than to these numbers.
    // Wider than the tallest card in the seed (World carries two ports, so it
    // is 98px) — at 88 the cards overlapped EACH OTHER, which reads as one
    // broken card rather than as spacing.
    const cardGap = narrow ? 112 : 140
    const cardTop = narrow ? worldFrame.y + worldHeight + 24 : workspaceTop
    const positions = {
        sky: [0, cardTop],
        world: [0, cardTop + cardGap],
        studio: [0, cardTop + cardGap * 2],
        text: [0, cardTop + cardGap * 3]
    }

    const skyNode = createNode('value.color', {
        label: 'Sky',
        graphX: positions.sky[0],
        graphY: positions.sky[1],
        values: { value: STARTER_SKY_COLOR }
    })

    const worldValues = buildNodeValues(
        'universe.world',
        { title: 'World' },
        { clientX: worldFrame.x, clientY: worldFrame.y },
        { workspaceTop }
    )
    worldValues.frame = { ...worldValues.frame, ...worldFrame, visible: true }
    const worldNode = createNode('universe.world', {
        label: 'World',
        graphX: positions.world[0],
        graphY: positions.world[1],
        values: worldValues
    })

    const textValues = buildNodeValues(
        'view.text',
        { content: narrow ? STARTER_WELCOME_TEXT_NARROW : STARTER_WELCOME_TEXT },
        { clientX: textFrame.x, clientY: textFrame.y },
        { workspaceTop }
    )
    textValues.frame = { ...textValues.frame, ...textFrame, visible: true, title: 'welcome' }
    const textNode = createNode('view.text', {
        label: 'welcome',
        graphX: positions.text[0],
        graphY: positions.text[1],
        values: textValues
    })

    const studio = buildStudioContainerWithInterior({
        graphX: positions.studio[0],
        graphY: positions.studio[1],
        workspaceTop
    })

    const nodes = [skyNode, worldNode, textNode, studio.container, ...studio.interior].filter(Boolean)
    const edges = (skyNode && worldNode)
        ? [createEdge(skyNode.id, 'out', worldNode.id, 'bgColor')].filter(Boolean)
        : []

    return { nodes, edges }
}
