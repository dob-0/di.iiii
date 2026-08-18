import { getNodeType } from '../nodeRegistry.js'

const portToInspectorField = (port, node = null) => {
    const label = port.label || port.id
    const path = [port.id]
    if (node?.typeId === 'view.image' && port.id === 'src') {
        return { label, path, type: 'asset', portType: 'texture', assetKind: 'image' }
    }
    if (port.type === 'color') return { label, path, type: 'color', portType: 'color' }
    if (port.type === 'boolean') return { label, path, type: 'checkbox', portType: 'boolean' }
    if (port.type === 'number') return { label, path, type: 'number', min: port.min, max: port.max, step: port.step, portType: 'number' }
    if (port.type === 'string') {
        const isMultiline = port.id === 'body' || port.id === 'text' || port.id === 'content'
        return { label, path, type: isMultiline ? 'textarea' : 'text', portType: 'string' }
    }
    if (port.type === 'vec3') return { label, path, type: 'vec3', portType: 'vec3' }
    if (port.type === 'geometry' || port.type === 'texture' || port.type === 'signal') {
        return { label, path, type: 'connection', portType: port.type }
    }
    return { label, path, type: 'text', portType: port.type || 'any' }
}

// Every node type — not just node.null — gets this section, so any brick can
// optionally be viewed/edited "as code" (product decision 2026-07-19). Stored
// under a reserved values.__code key so it never collides with node.null's
// real values.body (that stays load-bearing, read by getNodeInputs/
// getNodeOutputs) or any future type's own body-named port. Stays fully
// inert — nothing reads or executes values.__code anywhere; it's storage and
// display only.
//
// `component: 'values'` (section AND field) is required, not decorative: the
// inspector's values map only ever has one top-level `values` key for a
// node, so a section with its own distinct `id` (needed as a stable React
// key, and to render as its own labeled block) must explicitly route reads
// (section.component, the id-lookup fallback) and writes (field.component)
// back to that shared object — same pattern the World section already uses
// for its own fields.
const CODE_SECTION = {
    id: 'code',
    // The label says what the box actually does: nothing executes this yet.
    // Before, an editable "Code / Body" with no caveat was the whole
    // inspector for input-less nodes — the single most dishonest surface the
    // 2026-08-18 node truth audit found.
    label: 'Code — stored, not run',
    component: 'values',
    fields: [{ label: 'Body', path: ['__code'], type: 'textarea', portType: 'string', component: 'values' }]
}

export const deriveNodeInspectorSections = (node) => {
    if (!node) return []
    const typeId = node.typeId || node.definitionId
    const type = getNodeType(typeId)
    if (!type) return []

    if (type.isNull) {
        const dynamicPorts = (node.values?.portDefs || [])
            .filter((port) => port.dir === 'in')
            .map((port) => portToInspectorField(port, node))
            .filter(Boolean)

        return [
            {
                id: 'values',
                label: 'Node',
                fields: [
                    { label: 'Body', path: ['body'], type: 'textarea', portType: 'string' },
                    ...dynamicPorts
                ]
            },
            CODE_SECTION
        ]
    }

    // Some node types store real user-facing config in defaultValues that
    // isn't also a port (an OSC target IP/port, an RTMP destination, a
    // recording filename pattern) — those were never surfaced anywhere in
    // the inspector at all, unlike port-backed fields. configInputs
    // declares them in the same {id, type, label} shape as a port; they
    // read/write node.values[id] through the exact same path mechanism.
    const fields = [...(type.inputs || []), ...(type.configInputs || [])]
        .map((port) => portToInspectorField(port, node))
        .filter(Boolean)

    // For value/source nodes with no inputs but an editable `value` field
    if (!fields.length && node.values !== undefined && 'value' in { ...type.defaultValues }) {
        const outType = type.outputs?.[0]?.type
        const fieldType = outType === 'color' ? 'color'
            : outType === 'number' ? 'number'
            : outType === 'vec3' ? 'vec3'
            : outType === 'boolean' ? 'checkbox'
            : 'text'
        fields.push({ label: type.label || 'Value', path: ['value'], type: fieldType, portType: outType || 'any' })
    }

    const sections = fields.length ? [{ id: 'values', label: 'Ports', fields }] : []
    sections.push(CODE_SECTION)
    return sections
}
