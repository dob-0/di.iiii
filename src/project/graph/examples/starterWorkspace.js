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
    // Pixels below the windows that the cards need to be reachable, not a
    // fraction of the viewport: a card's height is absolute, so the same 37%
    // of an 844px phone and of a 664px one are not the same amount of room.
    // Three cards' worth. Below this the welcome note opens as a header only —
    // measured on iPhone 13 (664 tall, 250px band) and iPhone SE (568, 198),
    // where three of four cards sat behind it, against Pixel 7 (839, 314) and
    // a 390x844 phone (318) where all four are reachable with it open.
    const CARD_BAND_MIN = 300
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
        ? clamp(150, Math.round(viewportHeight * 0.22), 220)
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
    // On a phone this is DERIVED, not chosen — see the note on textFrame below.
    // The fit classifies a full-width window by whichever edge it sits nearer,
    // so this window must end above the viewport's middle or it is read as
    // bottom-docked and the whole inset calculation is discarded.
    const narrowTextTop = windowTop + worldHeight + 12
    const textHeight = narrow
        ? clamp(120, Math.min(240, viewportHeight - narrowTextTop * 2), 240)
        : 380
    // PHONE LAYOUT, and why it changed twice in one day.
    //
    // First the two windows stacked from the top and between them covered the
    // whole screen; the fit CENTRED the cards, so every card — including the
    // Studio one the welcome text says to tap — sat behind a window. The fix
    // then was to dock the windows to the top and bottom edges and leave a
    // clear band down the middle.
    //
    // That workaround is now actively harmful: the fit reads docked windows as
    // edge insets (getGraphEdgeInsets), so a window on each edge leaves a
    // pinched corridor, and fitting four cards into it zoomed the graph to 34%
    // — where cards are unreadable and, below CARD_CONTROL_MIN_ZOOM, the enter
    // chevron is not rendered at all. The instruction pointed at something
    // untappable again, by the opposite route.
    //
    // So: stack from the top and leave ONE contiguous band at the bottom — but
    // stacking alone is not enough. getGraphEdgeInsets classifies a full-width
    // window by whichever edge it is NEARER, so a second window whose middle
    // has slipped past the halfway line is filed as bottom-docked; the two
    // insets then claim more than the whole surface and the fit throws them
    // away, leaving the cards centred over the windows exactly as before. Hence
    // the derived height above: both windows must finish in the top half, and
    // the test asserts it. Seen on a 390×844 phone at DPR 3 all three times.
    const textFrame = {
        x: pad,
        y: narrow
            ? narrowTextTop
            : Math.max(windowTop, viewportHeight - textHeight - 72),
        width: textWidth,
        height: textHeight,
        // …and a fourth time, for the reason the third fix assumed away. The
        // invariant above — both windows finish in the top half — was checked
        // at viewportHeight 844. A real iPhone 13 hands the page 664 once
        // browser chrome is taken, and at 664 the arithmetic does not land
        // there: the welcome ends at 414 against a halfway line of 332, the
        // insets are discarded, and MEASURED on three devices, three of the
        // four cards were unreachable behind it — including the Studio card
        // this window's own text tells you to tap.
        //
        // Below that height the two windows genuinely cannot both be open and
        // leave a band for the cards; there is no arithmetic that fits them.
        // So the second one opens as a header only. Its title bar stays on
        // screen and expands with one tap, the fit stops counting it (RawEditor
        // drops minimized frames before getGraphEdgeInsets), and the cards get
        // the room. An instruction you can reach beats an instruction you can
        // read but cannot follow.
        minimized: narrow && (viewportHeight - (narrowTextTop + textHeight)) < CARD_BAND_MIN
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
