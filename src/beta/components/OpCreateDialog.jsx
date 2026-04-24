import { useEffect, useMemo, useState } from 'react'
import {
    NODE_CATEGORIES,
    listNodeTypes,
    getNodeType
} from '../../project/nodeRegistry.js'

const NODE_FAMILY_TABS = NODE_CATEGORIES.map((category) => ({ id: category.id, label: category.label }))

const portToField = (port) => {
    const label = port.label || port.id
    const path = [port.id]
    if (port.type === 'color') return { label, path, type: 'color' }
    if (port.type === 'boolean') return { label, path, type: 'checkbox' }
    if (port.type === 'number') return { label, path, type: 'number', min: port.min, max: port.max, step: port.step }
    if (port.type === 'string') {
        const isMultiline = port.id === 'body' || port.id === 'text'
        return { label, path, type: isMultiline ? 'textarea' : 'text' }
    }
    if (port.type === 'vec3') return { label, path, type: 'vec3' }
    return null
}

const derivePreviewKind = (type) => {
    if (!type) return 'panel'
    if (type.id === 'value.color') return 'color'
    if (type.id.startsWith('geom.')) return 'cube'
    if (type.id === 'view.browser') return 'browser'
    return 'panel'
}

const toDefinitionShim = (type) => {
    if (!type) return null
    const defaults = { ...(type.defaultValues || {}) }
    for (const port of type.inputs || []) {
        if (port.default !== undefined && defaults[port.id] === undefined) defaults[port.id] = port.default
    }
    const fields = (type.inputs || []).map(portToField).filter(Boolean)
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
        singleton: Boolean(type.singleton),
        previewKind: derivePreviewKind(type),
        defaultParams: defaults,
        sections: fields.length ? [{ id: 'params', label: 'Params', fields }] : []
    }
}

const cloneValue = (value) => {
    if (Array.isArray(value)) return value.map(cloneValue)
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, cloneValue(nested)]))
    }
    return value
}

const setNestedValue = (value, path, nextValue) => {
    const draft = cloneValue(value)
    let cursor = draft
    for (let index = 0; index < path.length - 1; index += 1) {
        const key = path[index]
        cursor[key] = cloneValue(cursor[key])
        cursor = cursor[key]
    }
    cursor[path[path.length - 1]] = nextValue
    return draft
}

const readNestedValue = (value, path = []) => path.reduce((current, key) => current?.[key], value)

function ParamField({ field, value, onChange }) {
    if (field.type === 'textarea') {
        return <textarea rows={4} value={value || ''} onChange={(event) => onChange(event.target.value)} />
    }
    if (field.type === 'color') {
        return <input type="color" value={value || '#ffffff'} onChange={(event) => onChange(event.target.value)} />
    }
    if (field.type === 'checkbox') {
        return <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
    }
    if (field.type === 'number') {
        return (
            <input
                type="number"
                value={Number.isFinite(Number(value)) ? value : 0}
                min={field.min}
                max={field.max}
                step={field.step ?? 0.1}
                onChange={(event) => onChange(Number(event.target.value))}
            />
        )
    }
    return <input type="text" value={value || ''} onChange={(event) => onChange(event.target.value)} />
}

function NodePreview({ definition, params }) {
    if (!definition) return null

    if (definition.previewKind === 'color') {
        return (
            <div className="beta-op-preview-card" style={{ background: params.color || '#ffffff' }}>
                <span>{params.color || '#ffffff'}</span>
            </div>
        )
    }

    if (definition.previewKind === 'cube') {
        return (
            <div className="beta-op-preview-card beta-op-preview-cube-shell">
                <div
                    className="beta-op-preview-cube"
                    style={{ background: params.color || '#5fa8ff' }}
                />
                <span>{(params.size || [1, 1, 1]).join(' x ')}</span>
            </div>
        )
    }

    if (definition.previewKind === 'browser') {
        return (
            <div className="beta-op-preview-browser-shell">
                <div className="beta-op-preview-browser-bar">
                    <span>{params.title || definition.label}</span>
                    <code>{params.url || 'https://example.com'}</code>
                </div>
                <iframe
                    title={`${definition.label} preview`}
                    src={params.url || 'https://example.com'}
                    sandbox="allow-scripts allow-forms allow-popups allow-modals"
                />
            </div>
        )
    }

    return (
        <div className="beta-op-preview-card beta-op-preview-panel">
            <strong>{params.title || definition.label}</strong>
            <p>{params.text || 'A blank authored surface.'}</p>
        </div>
    )
}

export default function OpCreateDialog({
    open,
    surface = 'world',
    onClose,
    onCreate
}) {
    const [family, setFamily] = useState('all')
    const [query, setQuery] = useState('')
    const availableDefinitions = useMemo(
        () => listNodeTypes({ query }).map(toDefinitionShim).filter(Boolean),
        [query]
    )
    const definitions = useMemo(
        () => listNodeTypes({ category: family, query }).map(toDefinitionShim).filter(Boolean),
        [family, query]
    )
    const [selectedId, setSelectedId] = useState('')
    const selectedDefinition = (selectedId ? toDefinitionShim(getNodeType(selectedId)) : null) || definitions[0] || null
    const [draftParams, setDraftParams] = useState({})

    useEffect(() => {
        if (!open) return
        setFamily('all')
        setQuery('')
    }, [open, surface])

    useEffect(() => {
        if (!open) return
        const nextSelectedId = definitions.some((definition) => definition.id === selectedId)
            ? selectedId
            : (definitions[0]?.id || '')
        setSelectedId(nextSelectedId)
    }, [definitions, open, selectedId])

    useEffect(() => {
        if (!selectedDefinition) {
            setDraftParams({})
            return
        }
        setDraftParams(cloneValue(selectedDefinition.defaultParams || {}))
    }, [selectedDefinition])

    if (!open) return null

    const editableFields = (selectedDefinition?.sections || [])
        .filter((section) => section.id === 'params')
        .flatMap((section) => section.fields || [])

    return (
        <div className="beta-op-create-backdrop">
            <button
                type="button"
                className="beta-op-create-scrim"
                aria-label="Close create dialog"
                onClick={onClose}
            />
            <section className="beta-op-create-dialog" role="dialog" aria-modal="true" aria-label="Create node">
                <header className="beta-op-create-header">
                    <div>
                        <span className="beta-window-kicker">OP Create</span>
                        <h3>{surface === 'view' ? 'Add View Node' : 'Add World Node'}</h3>
                    </div>
                    <button type="button" onClick={onClose}>Close</button>
                </header>

                <div className="beta-op-create-toolbar">
                    <input
                        className="beta-op-search"
                        placeholder="Search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                    <div className="beta-op-family-tabs">
                        <button type="button" className={family === 'all' ? 'is-active' : ''} onClick={() => setFamily('all')}>
                            All
                        </button>
                        {NODE_FAMILY_TABS
                            .filter((tab) => availableDefinitions.some((definition) => definition.family === tab.id) || family === tab.id)
                            .map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    className={family === tab.id ? 'is-active' : ''}
                                    onClick={() => setFamily(tab.id)}
                                >
                                    {tab.label}
                                </button>
                            ))}
                    </div>
                </div>

                <div className="beta-op-create-body">
                    <div className="beta-op-list">
                        {definitions.map((definition) => (
                            <button
                                key={definition.id}
                                type="button"
                                className={definition.id === selectedDefinition?.id ? 'is-selected' : ''}
                                onClick={() => setSelectedId(definition.id)}
                            >
                                <strong>{definition.label}</strong>
                                <span>{definition.id}</span>
                            </button>
                        ))}
                    </div>

                    <div className="beta-op-details">
                        {selectedDefinition ? (
                            <>
                                <NodePreview definition={selectedDefinition} params={draftParams} />
                                <div className="beta-op-param-grid">
                                    {editableFields.map((field) => {
                                        const value = readNestedValue(draftParams, field.path)
                                        return (
                                            <label key={`${selectedDefinition.id}-${field.label}`} className="beta-property-field">
                                                <span>{field.label}</span>
                                                <ParamField
                                                    field={field}
                                                    value={value}
                                                    onChange={(nextValue) => setDraftParams((current) => setNestedValue(current, field.path, nextValue))}
                                                />
                                            </label>
                                        )
                                    })}
                                </div>
                            </>
                        ) : (
                            <div className="beta-empty-state">No matching nodes yet.</div>
                        )}
                    </div>
                </div>

                <footer className="beta-op-create-footer">
                    <button type="button" onClick={onClose}>Cancel</button>
                    <button
                        type="button"
                        disabled={!selectedDefinition}
                        onClick={() => onCreate?.({
                            definition: selectedDefinition,
                            params: draftParams,
                            openGraph: false
                        })}
                    >
                        Create
                    </button>
                    <button
                        type="button"
                        disabled={!selectedDefinition}
                        onClick={() => onCreate?.({
                            definition: selectedDefinition,
                            params: draftParams,
                            openGraph: true
                        })}
                    >
                        Create + Open Graph
                    </button>
                </footer>
            </section>
        </div>
    )
}
