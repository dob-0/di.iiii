import { useEffect, useRef, useState, useCallback } from 'react'
import { listNodeTypes } from '../../project/nodeRegistry.js'
import { filterNodeTypesForSurface } from '../../project/graph/nodeSurfaceFilters.js'

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
    const surface = type.render === 'panel-2d' ? 'view' : 'world'
    const mode = type.render === 'spatial-3d'
        ? 'spatial'
        : type.render === 'panel-2d'
            ? 'panel'
            : 'hidden'
    return {
        id: type.id,
        label: type.label,
        family: type.category,
        surface,
        mode,
        authoringOnly: Boolean(type.authoringOnly),
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
    surface = 'world',
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

    const nodeEntries = filterNodeTypesForSurface(listNodeTypes({ query }), surface)
        .map(toDefinitionShim)
        .filter(Boolean)
        .map((definition) => ({ kind: 'node', id: definition.id, label: definition.label, hint: definition.id, definition }))

    const q = query.trim().toLowerCase()
    const commandEntries = commands
        .filter((command) => !q || `${command.label} ${command.hint || ''}`.toLowerCase().includes(q))
        .map((command) => ({ kind: 'command', id: command.id, label: command.label, hint: command.hint, run: command.run }))

    // Commands first: with the chrome hidden they are the only way back to it,
    // so they must not be below a scroll of node types.
    const entries = [...commandEntries, ...nodeEntries]

    useEffect(() => {
        if (!open) return
        setQuery('')
        setActiveIndex(0)
        requestAnimationFrame(() => inputRef.current?.focus())
    }, [open])

    useEffect(() => {
        setActiveIndex(0)
    }, [query])

    if (!open || !placement) return null

    const pos = getPalettePosition(placement.clientX || 0, placement.clientY || 0)

    const handleConfirm = (entry) => {
        if (!entry) return
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
                const next = Math.min(i + 1, entries.length - 1)
                scrollActiveIntoView(next)
                return next
            })
            return
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActiveIndex((i) => {
                const next = Math.max(i - 1, 0)
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
                                <button
                                    type="button"
                                    className={`raw-node-palette-item${index === activeIndex ? ' is-active' : ''}`}
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
                                        <span className="raw-node-palette-tag" title="Placeable and editable, but doesn't compute or render anything yet">
                                            authoring only
                                        </span>
                                    )}
                                </button>
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
