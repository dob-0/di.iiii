import { useEffect, useRef, useState } from 'react'
import { filterNodeDefinitions, getNodeDefinition } from '../../project/nodeRegistry.js'

const PALETTE_WIDTH = 280
const PALETTE_MAX_HEIGHT = 320
const PALETTE_OFFSET = 12

function getPalettePosition(clickX, clickY) {
    const vw = window.innerWidth
    const vh = window.innerHeight
    let x = clickX + PALETTE_OFFSET
    let y = clickY + PALETTE_OFFSET
    if (x + PALETTE_WIDTH > vw - 16) x = clickX - PALETTE_WIDTH - PALETTE_OFFSET
    if (y + PALETTE_MAX_HEIGHT > vh - 16) y = vh - PALETTE_MAX_HEIGHT - 16
    return { x: Math.max(16, x), y: Math.max(16, y) }
}

export default function NodePalette({
    open,
    surface = 'world',
    placement = null,
    onClose,
    onCreate
}) {
    const [query, setQuery] = useState('')
    const [activeIndex, setActiveIndex] = useState(0)
    const inputRef = useRef(null)

    const definitions = filterNodeDefinitions({ surface, family: 'all', query })

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

    const handleConfirm = (definition) => {
        if (!definition) return
        onCreate({
            definition,
            params: { ...(definition.defaultParams || {}) },
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
            setActiveIndex((i) => Math.min(i + 1, definitions.length - 1))
            return
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActiveIndex((i) => Math.max(i - 1, 0))
            return
        }
        if (event.key === 'Enter') {
            event.preventDefault()
            handleConfirm(definitions[activeIndex] || null)
        }
    }

    return (
        <div
            className="beta-node-palette-backdrop"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose()
            }}
        >
            <div
                className="beta-node-palette"
                style={{ left: pos.x, top: pos.y }}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <div className="beta-node-palette-input-row">
                    <input
                        ref={inputRef}
                        className="beta-node-palette-input"
                        placeholder="type a node name…"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={handleKeyDown}
                        autoComplete="off"
                        spellCheck={false}
                    />
                </div>
                {definitions.length > 0 ? (
                    <ul className="beta-node-palette-list">
                        {definitions.slice(0, 8).map((definition, index) => (
                            <li key={definition.id}>
                                <button
                                    type="button"
                                    className={`beta-node-palette-item${index === activeIndex ? ' is-active' : ''}`}
                                    onMouseEnter={() => setActiveIndex(index)}
                                    onMouseDown={(event) => {
                                        event.preventDefault()
                                        handleConfirm(definition)
                                    }}
                                >
                                    <strong>{definition.label}</strong>
                                    <span>{definition.id}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="beta-node-palette-empty">no match</div>
                )}
            </div>
        </div>
    )
}
