import { useEffect, useRef, useState, useCallback } from 'react'
import { listNodeTypes, NODE_FAMILIES, FAMILY_BY_TYPE } from '../../project/nodeRegistry.js'

const PALETTE_WIDTH = 280
// Must match .raw-node-palette's max-height in raw.css — they disagreed by
// 40px, so the placement maths reserved space the palette never used.
const PALETTE_MAX_HEIGHT = 280
const PALETTE_OFFSET = 12

const toDefinitionShim = (type) => {
    if (!type) return null
    const defaults = { ...(type.defaultValues || {}) }
    for (const port of type.inputs || []) {
        if (port.default !== undefined && defaults[port.id] === undefined) defaults[port.id] = port.default
    }
    const mode = type.render === 'spatial-3d'
        ? 'spatial'
        : type.render === 'panel-2d'
            ? 'panel'
            : 'hidden'
    return {
        id: type.id,
        label: type.label,
        family: FAMILY_BY_TYPE[type.id] || null,
        mode,
        authoringOnly: Boolean(type.authoringOnly),
        devLocalOnly: Boolean(type.devLocalOnly),
        defaultParams: defaults
    }
}

const clamp = (min, value, max) => Math.min(Math.max(value, min), max)

function getPalettePosition(clickX, clickY) {
    const vw = window.innerWidth
    const vh = window.innerHeight
    // On a phone the palette is as wide as the screen, so flipping it to the
    // other side of the tap point cannot help — pin it to the left margin and
    // let the CSS width clamp do the rest.
    const width = Math.min(PALETTE_WIDTH, vw - 32)
    let x = clickX + PALETTE_OFFSET
    let y = clickY + PALETTE_OFFSET
    if (x + width > vw - 16) x = clickX - width - PALETTE_OFFSET
    if (y + PALETTE_MAX_HEIGHT > vh - 16) y = vh - PALETTE_MAX_HEIGHT - 16
    return { x: clamp(16, x, Math.max(16, vw - width - 16)), y: Math.max(16, y) }
}

export default function NodePalette({
    open,
    placement = null,
    onClose,
    onCreate,
    // Commands make this the workspace's ONE summons rather than a second
    // command system beside it: the same gesture that creates a node also
    // brings back the help, the chat, a hidden panel or the chrome itself.
    // Shape: { id, label, hint, run }.
    commands = []
}) {
    const [query, setQuery] = useState('')
    const [activeIndex, setActiveIndex] = useState(0)
    const inputRef = useRef(null)
    const listRef = useRef(null)

    const scrollActiveIntoView = useCallback((index) => {
        if (!listRef.current) return
        const item = listRef.current.querySelectorAll('li')[index]
        item?.scrollIntoView({ block: 'nearest' })
    }, [])

    const nodeEntries = listNodeTypes({ query })
        .map(toDefinitionShim)
        .filter(Boolean)
        .map((definition) => ({ kind: 'node', id: definition.id, label: definition.label, hint: definition.id, definition }))

    const q = query.trim().toLowerCase()
    const commandEntries = commands
        .filter((command) => !q || `${command.label} ${command.hint || ''}`.toLowerCase().includes(q))
        .map((command) => ({ kind: 'command', id: command.id, label: command.label, hint: command.hint, run: command.run }))

    // Commands first: with the chrome hidden they are the only way back to it,
    // so they must not be below a scroll of node types.
    //
    // With no query the node list is a browse, and 39 rows in registry
    // declaration order is where "raw feels messy" lived — so browse mode
    // groups by family, in the declared task order, with a sticky header per
    // family. Any typed character dissolves the grouping into the flat ranked
    // list: type-to-place stays exactly what it was.
    const groupedNodeEntries = q
        ? nodeEntries
        : NODE_FAMILIES.flatMap((family) => {
            const members = nodeEntries.filter((entry) => entry.definition.family === family.id)
            if (!members.length) return []
            return [
                { kind: 'header', id: `family:${family.id}`, label: family.label, count: members.length, color: family.color },
                ...members
            ]
        })
    // EXACT MATCH FIRST, absolutely. Typing "Out" and pressing Enter used to
    // open an Outliner panel: three command rows matched by substring and sat
    // above the node actually named Out, so the documented door-building flow
    // detonated on its own palette (watched happen in the UX audit). A row
    // whose LABEL equals the query outranks every substring match, node or
    // command; after that, label-prefix matches; the commands-first rule
    // holds only WITHIN a rank, for its original reason (chrome hidden,
    // commands must not sink below a scroll of nodes).
    const rank = (entry) => {
        if (!q) return 1
        const label = (entry.label || '').toLowerCase()
        if (label === q) return 0
        if (label.startsWith(q)) return 1
        return 2
    }
    const entries = [...commandEntries, ...groupedNodeEntries]
        .map((entry, index) => ({ entry, index }))
        .sort((a, b) => rank(a.entry) - rank(b.entry) || a.index - b.index)
        .map(({ entry }) => entry)

    // Family headers are rows but not choices — the highlight and Enter must
    // never land on one.
    const isSelectable = (entry) => Boolean(entry) && entry.kind !== 'header'
    const firstSelectableIndex = Math.max(0, entries.findIndex(isSelectable))

    useEffect(() => {
        if (!open) return
        setQuery('')
        setActiveIndex(firstSelectableIndex)
        requestAnimationFrame(() => inputRef.current?.focus())
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    useEffect(() => {
        setActiveIndex(firstSelectableIndex)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query])

    if (!open || !placement) return null

    const pos = getPalettePosition(placement.clientX || 0, placement.clientY || 0)

    const handleConfirm = (entry) => {
        if (!entry || entry.kind === 'header') return
        if (entry.kind === 'command') {
            // Closing first: a command that opens a panel would otherwise put it
            // behind the palette's own backdrop.
            onClose()
            entry.run?.()
            return
        }
        onCreate({
            definition: entry.definition,
            params: { ...(entry.definition.defaultParams || {}) },
            placement
        })
    }

    const handleKeyDown = (event) => {
        if (event.key === 'Escape') {
            onClose()
            return
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActiveIndex((i) => {
                let next = i
                for (let candidate = i + 1; candidate < entries.length; candidate += 1) {
                    if (isSelectable(entries[candidate])) { next = candidate; break }
                }
                scrollActiveIntoView(next)
                return next
            })
            return
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActiveIndex((i) => {
                let next = i
                for (let candidate = i - 1; candidate >= 0; candidate -= 1) {
                    if (isSelectable(entries[candidate])) { next = candidate; break }
                }
                scrollActiveIntoView(next)
                return next
            })
            return
        }
        if (event.key === 'Enter') {
            event.preventDefault()
            handleConfirm(entries[activeIndex] || null)
        }
    }

    return (
        <div
            className="raw-node-palette-backdrop"
            role="presentation"
            onPointerDown={(event) => {
                if (event.target === event.currentTarget) onClose()
            }}
        >
            <div
                className="raw-node-palette"
                role="dialog"
                aria-modal="true"
                aria-label="Create a node, or summon a panel"
                style={{ left: pos.x, top: pos.y }}
            >
                <div className="raw-node-palette-input-row">
                    <input
                        ref={inputRef}
                        className="raw-node-palette-input"
                        placeholder="type a node or panel name…"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={handleKeyDown}
                        autoComplete="off"
                        spellCheck={false}
                    />
                </div>
                {entries.length > 0 ? (
                    <ul ref={listRef} className="raw-node-palette-list">
                        {entries.map((entry, index) => (
                            <li key={`${entry.kind}:${entry.id}`}>
                                {entry.kind === 'header' ? (
                                    <div className="raw-node-palette-group" style={{ '--family-color': entry.color }}>
                                        <span>{entry.label}</span>
                                        <span className="raw-node-palette-group-count">{entry.count}</span>
                                    </div>
                                ) : (
                                <button
                                    type="button"
                                    className={`raw-node-palette-item${index === activeIndex ? ' is-active' : ''}${entry.kind === 'node' && entry.definition.authoringOnly ? ' is-shell' : ''}`}
                                    style={entry.kind === 'node' ? { '--family-color': NODE_FAMILIES.find((f) => f.id === entry.definition.family)?.color || 'transparent' } : undefined}
                                    onPointerEnter={(event) => {
                                        // Touch synthesises a pointerenter right
                                        // before the tap; moving the active row
                                        // then is harmless, but a stray one during
                                        // a scroll should not steal the highlight.
                                        if (event.pointerType === 'mouse') setActiveIndex(index)
                                    }}
                                    onPointerDown={(event) => {
                                        // preventDefault keeps focus in the search
                                        // input on mouse. Committing moved to
                                        // onClick: pointerdown fires the instant a
                                        // finger lands, so scrolling this list by
                                        // dragging on a row placed that row's node.
                                        // The browser suppresses click after a
                                        // scroll drag, which is exactly the
                                        // discrimination needed here.
                                        event.preventDefault()
                                        setActiveIndex(index)
                                    }}
                                    onClick={() => handleConfirm(entry)}
                                >
                                    <span className="raw-node-palette-item-title">
                                        <strong>{entry.label}</strong>
                                        <span>{entry.hint}</span>
                                    </span>
                                    {entry.kind === 'command' && (
                                        <span className="raw-node-palette-tag is-command">panel</span>
                                    )}
                                    {entry.kind === 'node' && entry.definition.authoringOnly && (
                                        <span className="raw-node-palette-tag" title="Holds its ports — computes nothing yet">
                                            shell
                                        </span>
                                    )}
                                    {entry.kind === 'node' && entry.definition.devLocalOnly && (
                                        <span className="raw-node-palette-tag" title="Only works against a local dev server on this machine">
                                            local dev
                                        </span>
                                    )}
                                </button>
                                )}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="raw-node-palette-empty">no match</div>
                )}
            </div>
        </div>
    )
}
