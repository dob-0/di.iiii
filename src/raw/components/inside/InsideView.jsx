import { useCallback, useEffect, useMemo, useState } from 'react'
import { CONTAINER_TYPE_IDS, getFamilyColorForType, getNodeFamily, getNodeType } from '../../../project/nodeRegistry.js'
import { createFrameMemory, createNodeGraphContext, evaluateNodeOutput } from '../../../project/graph/nodeGraphRuntime.js'
import { readInside } from '../../../project/graph/insideReading.js'
import { isTopType, TOP_OPERATORS } from '../../../project/tops/topOperators.js'
import { useTopReport } from '../../../project/tops/topReports.js'
import { RICH_SEE_KINDS, SCOPE_KINDS, insidePreviewKind } from './insidePreviewKind.js'
import InsideSee from './InsideSee.jsx'
import InsideMadeOf from './InsideMadeOf.jsx'
import { InsideIn, InsideOut } from './InsideRails.jsx'
import { CameraSection } from './topSections.jsx'
import { runsOnLabel, withMachineOptions } from './topMachineOptions.js'
import './inside.css'

// The inside of a node — the same workshop for every node there is.
//
// Owner, 2026-09-14: "like pure materials with a Game Boy when you can see all
// details; if needed go inside and change something". So, around the node's
// own canvas (the editor's scoped graph, where you place nodes INSIDE it and
// wire them into it):
//
//   HEAD  back · the node's name · what it is · where it runs — the one
//         "where am I" on screen
//   SEE   the node working, by what it makes; docked on top, collapsible
//   IN    settings and inputs as one list; each input a socket a card inside
//         can be wired to
//   OUT   what it gives, live, and where each output goes
//   MADE OF  the real code, by where it lives; shader and script editable
//
// Desktop: IN left, OUT right, SEE over the canvas, MADE OF under it. Below
// 1100px OUT folds under IN. A phone is one column: SEE sticky under the head,
// and In · Out · Made of · Canvas as a one-thumb strip at the bottom.

export const INSIDE_HEAD_HEIGHT = 44
const IN_WIDTH = 280
const OUT_WIDTH = 260
const FOLDED_WIDTH = 300
const BAR_HEIGHT = 36
const PHONE_STRIP = 48
export const INSIDE_WIDE = 1100
export const INSIDE_PHONE = 640

const readFlag = (key, fallback) => {
    try {
        const stored = window.localStorage.getItem(key)
        return stored === null ? fallback : stored === '1'
    } catch {
        return fallback
    }
}
const writeFlag = (key, value) => {
    try { window.localStorage.setItem(key, value ? '1' : '0') } catch { /* private window */ }
}

const viewportSize = () => (typeof window === 'undefined'
    ? { width: 1440, height: 900 }
    : { width: window.innerWidth, height: window.innerHeight })

export const insideLayoutFor = (width) => (width < INSIDE_PHONE ? 'phone' : width < INSIDE_WIDE ? 'folded' : 'wide')

/**
 * The frame's measurements, so the canvas can fit its cards into the part of
 * the screen the frame leaves free. Pure; the component uses the same numbers
 * for its own CSS variables, so the two cannot drift.
 */
export function insideGeometry({ width, height, top = 0, seeOpen = true, madeOfOpen = false, phonePanel = 'canvas', compact = false }) {
    const layout = insideLayoutFor(width)
    const left = layout === 'wide' ? IN_WIDTH : layout === 'folded' ? FOLDED_WIDTH : 0
    const right = layout === 'wide' ? OUT_WIDTH : 0
    const centre = Math.max(0, width - left - right)
    const available = Math.max(0, height - top - INSIDE_HEAD_HEIGHT)
    // A picture/shape/window earns the big 16:9 band (capped well under the
    // 40% ceiling the owner asked for). A number, a swatch, a line of text
    // does not — SEE shrinks to a short strip so the setting it belongs to
    // is not pushed off a phone screen by a preview with nothing to show.
    const richPicture = Math.round(Math.min(available * (layout === 'phone' ? 0.3 : 0.36), (centre * 9) / 16))
    const compactPicture = Math.round(Math.min(96, available * 0.16))
    const seePicture = compact ? compactPicture : richPicture
    const see = BAR_HEIGHT + (seeOpen ? seePicture : 0)
    const madeOf = layout === 'phone' ? 0 : (madeOfOpen ? Math.round(available * 0.42) : BAR_HEIGHT)
    const bottom = layout === 'phone' ? PHONE_STRIP : madeOf
    const sheet = layout === 'phone' && phonePanel !== 'canvas' ? Math.max(0, available - see - PHONE_STRIP) : 0
    return {
        layout,
        insets: { left, right, top: INSIDE_HEAD_HEIGHT + see, bottom: bottom + sheet },
        see,
        seePicture,
        madeOf,
        sheet
    }
}

function HeadName({ label, onRename }) {
    const [draft, setDraft] = useState(null)
    if (!onRename) return <h1 className="raw-inside-name">{label}</h1>
    if (draft === null) {
        return (
            <h1 className="raw-inside-name">
                <button type="button" className="raw-inside-name-button" title="Rename" aria-label={`${label} — rename`} onClick={() => setDraft(label)}>
                    {label}
                </button>
            </h1>
        )
    }
    return (
        <input
            className="raw-inside-name-input"
            aria-label="New name"
            value={draft}
            ref={(element) => element?.focus()}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
                const next = draft.trim()
                if (next && next !== label) onRename(next)
                setDraft(null)
            }}
            onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
                if (event.key === 'Escape') setDraft(null)
            }}
        />
    )
}

export default function InsideView({
    node,
    allNodes = [],
    document = null,
    clockNow = 0,
    liveOutputs = null,
    machines = [],
    depth = 2,
    childCount = 0,
    top = 0,
    assetOptions = [],
    onPickAssetFile = null,
    renderWindow = null,
    onChangeValue,
    onPatchValues,
    onRename,
    onLeave,
    onLeaveAll,
    onGoToNode,
    onWire,
    onUnplug,
    onInsetsChange = null,
    // The Script tab for nodes that are not picture operators is a slot: a
    // component (default NodeScriptTab) and the props that connect it to the
    // per-node script runner. See NodeScriptTab.jsx.
    scriptTab = null,
    scriptProps = null
}) {
    const type = getNodeType(node?.typeId)
    const label = node?.label || type?.label || 'this node'
    const [viewport, setViewport] = useState(viewportSize)
    const [seeOpen, setSeeOpenState] = useState(() => readFlag('raw.inside.seeOpen', true))
    const [madeOfOpen, setMadeOfOpenState] = useState(() => readFlag('raw.inside.madeOfOpen', false))
    const [phonePanel, setPhonePanel] = useState('in')
    const setSeeOpen = useCallback((next) => { setSeeOpenState(next); writeFlag('raw.inside.seeOpen', next) }, [])
    const setMadeOfOpen = useCallback((next) => { setMadeOfOpenState(next); writeFlag('raw.inside.madeOfOpen', next) }, [])

    useEffect(() => {
        if (typeof window === 'undefined') return undefined
        const onResize = () => setViewport(viewportSize())
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [])

    const kind = insidePreviewKind(node)
    const compact = !RICH_SEE_KINDS.has(kind)
    const geometry = insideGeometry({ ...viewport, top, seeOpen, madeOfOpen, phonePanel, compact })
    const insetsKey = JSON.stringify(geometry.insets)
    useEffect(() => {
        onInsetsChange?.(JSON.parse(insetsKey))
    }, [insetsKey, onInsetsChange])
    useEffect(() => () => onInsetsChange?.(null), [onInsetsChange])

    // Two memories, never the room's: frameMemory is impure by design, and a
    // Lag read at two clocks through one memory would corrupt its glide.
    const [readMemory] = useState(createFrameMemory)
    const [scopeMemory] = useState(createFrameMemory)
    // Text is read at 125 ms steps — a number rewritten 60 times a second is a
    // blur. The scope below samples the unquantised clock.
    const readNow = Math.floor((clockNow || 0) / 125) * 125
    const machinesKey = machines
    const reading = useMemo(() => {
        if (!node) return { inRows: [], outRows: [] }
        const safeDocument = document || { nodes: allNodes, edges: [] }
        return readInside(node, {
            allNodes,
            context: createNodeGraphContext(safeDocument, { now: readNow, liveOutputs, frameMemory: readMemory }),
            document: safeDocument,
            childCount,
            decorateSections: (sections) => withMachineOptions(node, sections, machinesKey)
        })
    }, [node, allNodes, document, readNow, liveOutputs, readMemory, childCount, machinesKey])

    const seeRows = useMemo(() => {
        if (!SCOPE_KINDS.has(kind) || !node) return reading.outRows
        const context = createNodeGraphContext(document || { nodes: allNodes, edges: [] }, { now: clockNow, liveOutputs, frameMemory: scopeMemory })
        return reading.outRows.map((row) => ({ ...row, value: evaluateNodeOutput(node, row.id, context) }))
    }, [kind, node, document, allNodes, clockNow, liveOutputs, scopeMemory, reading.outRows])

    const report = useTopReport(isTopType(node?.typeId) ? node.id : null)

    if (!node) return null

    const family = getNodeFamily(node.typeId)
    const accent = family ? getFamilyColorForType(node.typeId) : null
    const isContainer = CONTAINER_TYPE_IDS.has(node.typeId)
    const kindWord = type?.label && type.label !== label ? type.label : null
    const where = runsOnLabel(node, machines)
    const { layout } = geometry
    const patch = (values) => onPatchValues?.(node.id, values)
    const change = (id, value) => onChangeValue?.(node.id, id, value)

    const inRail = (
        <InsideIn
            node={{ ...node, label }}
            rows={reading.inRows}
            allNodes={allNodes}
            assetOptions={assetOptions}
            onPickAssetFile={onPickAssetFile}
            onChangeValue={change}
            onGoToNode={onGoToNode}
            onWire={onWire}
            onUnplug={onUnplug}
        >
            {TOP_OPERATORS[node.typeId]?.source === 'camera'
                ? <CameraSection node={node} report={report} onPatchValues={patch} />
                : null}
        </InsideIn>
    )
    const outRail = <InsideOut node={{ ...node, label }} rows={reading.outRows} allNodes={allNodes} onGoToNode={onGoToNode} onWire={onWire} />
    const madeOf = (open, onToggle) => (
        <InsideMadeOf
            node={{ ...node, label }}
            machines={machines}
            report={report}
            open={open}
            onToggle={onToggle}
            onPatchValues={patch}
            scriptTab={scriptTab}
            scriptProps={scriptProps}
        />
    )

    const style = {
        '--raw-inside-top': `${top}px`,
        '--raw-inside-left': `${geometry.insets.left}px`,
        '--raw-inside-right': `${geometry.insets.right}px`,
        '--raw-inside-see': `${geometry.see}px`,
        '--raw-inside-madeof': `${geometry.madeOf}px`,
        ...(accent ? { '--raw-inside-accent': accent } : {})
    }

    return (
        <div className="raw-inside" data-layout={layout} style={style}>
            <header className="raw-inside-head">
                <button type="button" className="raw-inside-icon raw-inside-back" onClick={onLeave} aria-label={`Leave ${label}`} title="Leave">
                    <span aria-hidden="true">‹</span>
                </button>
                <i className="raw-inside-dot" aria-hidden="true" />
                <HeadName label={label} onRename={onRename ? (next) => onRename(node.id, next) : null} />
                {/* The type word only earns its place when it says something the
                    name does not — an unrenamed "Cube" node reading "Cube Cube"
                    was the exact duplicate the owner flagged. */}
                {kindWord || isContainer ? (
                    <span className="raw-inside-kind">
                        {kindWord}
                        {isContainer ? `${kindWord ? ' · ' : ''}holds ${childCount}` : ''}
                    </span>
                ) : null}
                {where ? (
                    <span className="raw-inside-where raw-inside-chip">runs on <strong>{where}</strong></span>
                ) : (
                    <span className="raw-inside-where raw-inside-chip" title="Runs wherever this window is open">here</span>
                )}
                {depth > 2 && onLeaveAll ? (
                    <button type="button" className="raw-inside-icon" onClick={onLeaveAll} aria-label="All the way out" title="All the way out">
                        <span aria-hidden="true">◈</span>
                    </button>
                ) : null}
            </header>

            <section className={`raw-inside-see${seeOpen ? ' is-open' : ''}`} aria-label={`See — ${label} working`}>
                <div className="raw-inside-see-bar">
                    <h2 className="raw-inside-rail-title">See</h2>
                    <button
                        type="button"
                        className="raw-inside-icon"
                        aria-expanded={seeOpen}
                        aria-label={seeOpen ? 'Fold See away' : 'Open See'}
                        onClick={() => setSeeOpen(!seeOpen)}
                    >
                        <span aria-hidden="true">{seeOpen ? '▴' : '▾'}</span>
                    </button>
                </div>
                {seeOpen ? (
                    <div className="raw-inside-see-body" style={{ height: geometry.seePicture }}>
                        <InsideSee
                            kind={kind}
                            node={{ ...node, label }}
                            allNodes={allNodes}
                            edges={document?.edges || []}
                            inRows={reading.inRows}
                            outRows={seeRows}
                            now={clockNow}
                            renderWindow={renderWindow}
                            childCount={childCount}
                        />
                    </div>
                ) : null}
            </section>

            {layout === 'phone' ? (
                <>
                    {phonePanel !== 'canvas' ? (
                        <div className="raw-inside-sheet" style={{ height: geometry.sheet }}>
                            {phonePanel === 'in' ? inRail : null}
                            {phonePanel === 'out' ? outRail : null}
                            {phonePanel === 'madeof' ? madeOf(true, () => {}) : null}
                        </div>
                    ) : null}
                    <nav className="raw-inside-strip" aria-label={`Inside ${label}`}>
                        {[['in', 'In'], ['out', 'Out'], ['madeof', 'Made of'], ['canvas', 'Canvas']].map(([id, text]) => (
                            <button
                                key={id}
                                type="button"
                                className="raw-inside-segment"
                                aria-pressed={phonePanel === id}
                                onClick={() => setPhonePanel(id)}
                            >
                                {text}
                            </button>
                        ))}
                    </nav>
                </>
            ) : (
                <>
                    <div className="raw-inside-left">
                        {inRail}
                        {layout === 'folded' ? outRail : null}
                    </div>
                    {layout === 'wide' ? <div className="raw-inside-right">{outRail}</div> : null}
                    <div className="raw-inside-bottom">{madeOf(madeOfOpen, setMadeOfOpen)}</div>
                </>
            )}
        </div>
    )
}
