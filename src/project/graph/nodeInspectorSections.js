import { PORT_TYPES, getNodeOperation, getNodeOperations, getNodeOutputs, getNodeType } from '../nodeRegistry.js'

// Common cue keys a show actually uses, plus a wildcard — the audit's fix #4:
// a free-text Key invited a typo no one would notice until the cue missed.
// "Any" is a real runtime option (KeyboardFeed treats it as a wildcard), not
// a stand-in for "type one instead".
export const KEYBOARD_KEY_OPTIONS = [
    'Space', 'Enter', 'Escape', 'Tab', 'Backspace',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
    'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    'Any'
].map((key) => ({ value: key, label: key }))

// Ports whose declared type is the honest `any` (the wire coerces to
// whatever is plugged in — that is workstream 4's territory) but whose
// UNWIRED, typed-by-hand box has one obvious shape. Widening the box's type
// beyond what the port itself promises would be the same dishonesty the
// audit found elsewhere; this only ever narrows an `any` field that a person
// types into directly.
const TYPED_ANY_FIELDS = {
    'device.dmx.out': { blackout: 'boolean' },
    'device.midi.out': { trigger: 'boolean' }
}

const portToInspectorField = (port, node = null) => {
    const label = port.label || port.id
    const path = [port.id]
    if (node?.typeId === 'view.image' && port.id === 'src') {
        return { label, path, type: 'asset', portType: 'texture', assetKind: 'image' }
    }
    // The file-backed nodes pick from the document's assets rather than
    // typing an id by hand. Kind-filtered so a sound never offers a mesh.
    const ASSET_PICKERS = { 'geom.model': 'model', 'media.video': 'video', 'media.audio': 'audio' }
    if (port.id === 'src' && ASSET_PICKERS[node?.typeId]) {
        return { label, path, type: 'asset', portType: 'string', assetKind: ASSET_PICKERS[node.typeId] }
    }
    // A menu of the cues a show actually presses, not a box that accepts any
    // typo (design audit B8/fix #4).
    if (node?.typeId === 'device.keyboard' && port.id === 'key') {
        return { label, path, type: 'select', portType: 'string', options: KEYBOARD_KEY_OPTIONS }
    }
    // Clip names only exist once a viewport has loaded the model file
    // (src/project/viewport/modelClipRegistry.js) — the same live registry
    // Studio's inspector already reads. Empty registry falls back to a plain
    // text box so an id can still be typed by hand before anything has loaded.
    if (node?.typeId === 'geom.model' && port.id === 'animationClip') {
        return { label, path, type: 'modelClip', portType: 'string', assetId: node.values?.src || null }
    }
    // Web MIDI can enumerate real device names once permission is granted;
    // PropertyInspector falls back to a text box when it can't.
    if (node?.typeId === 'device.midi.out' && port.id === 'deviceId') {
        return { label, path, type: 'midiOutDevice', portType: 'string' }
    }
    // The keeper's endpoint is arbitrary (a festival GPU box, a laptop), so
    // its model list can only ever come from asking that endpoint — falls
    // back to text when nothing answers.
    if (node?.typeId === 'agent.keeper' && port.id === 'model') {
        return { label, path, type: 'keeperModel', portType: 'string', endpoint: node.values?.endpoint || '' }
    }
    const typedAny = TYPED_ANY_FIELDS[node?.typeId]?.[port.id]
    if (typedAny === 'boolean') {
        return { label, path, type: 'checkbox', portType: 'boolean' }
    }
    // A doorway's `portType` decides what its socket on the container will
    // carry, so it must be CHOSEN from the real list rather than typed — a typo
    // yields a port type nothing is compatible with, and the only symptom is a
    // wire that refuses to connect for no visible reason.
    if (port.id === 'portType' && (node?.typeId === 'port.in' || node?.typeId === 'port.out')) {
        return {
            label,
            path,
            type: 'select',
            portType: 'string',
            options: Object.entries(PORT_TYPES).map(([value, meta]) => ({ value, label: meta.label }))
        }
    }
    // A port (or configInput) that declares its own `options` is a choice, not
    // a typed string — the doorway rule above, generalised so a node type can
    // say so in the registry instead of being special-cased here. DMX Out's
    // `rig` is the first: two rigs answer to the node and typing the word is
    // exactly how you get a node that silently does nothing.
    if (Array.isArray(port.options) && port.options.length) {
        return {
            label,
            path,
            type: 'select',
            portType: port.type || 'string',
            options: port.options.map((option) => (
                typeof option === 'string'
                    ? { value: option, label: option }
                    : { value: option.value, label: option.label || option.value }
            ))
        }
    }
    if (port.type === 'color') return { label, path, type: 'color', portType: 'color' }
    if (port.type === 'boolean') return { label, path, type: 'checkbox', portType: 'boolean' }
    if (port.type === 'number') return { label, path, type: 'number', min: port.min, max: port.max, step: port.step, portType: 'number', default: port.default }
    if (port.type === 'string') {
        const isMultiline = port.id === 'body' || port.id === 'text' || port.id === 'content'
        return { label, path, type: isMultiline ? 'textarea' : 'text', portType: 'string' }
    }
    if (port.type === 'vec3') return { label, path, type: 'vec3', portType: 'vec3', default: port.default }
    if (port.type === 'geometry' || port.type === 'texture' || port.type === 'signal') {
        return { label, path, type: 'connection', portType: port.type }
    }
    return { label, path, type: 'text', portType: port.type || 'any' }
}

// The "Code — stored, not run" section is gone (2026-09-14). It was a
// textarea nothing ever read; the inside of a node now shows the code that
// really runs (MADE OF), and where a script can run, that is where it is
// written. values.__code in old documents stays as harmless data.

// An input port with a wire into it reads the wire, not the stored value —
// the sheet used to offer the box anyway and a typed value was silently
// ignored (festival-machine inventory 2026-09-06). `wired` lets the inspector
// show the field read-only and say why. A field's first path segment is the
// port id, and the edge's toPort is the same id.
//
// `wiredSources` (portId -> {nodeId, label}) is the fix for design audit A3:
// before, "wired" was the only thing said — the box still showed the STORED
// value, which could disagree with what the wire actually carries. RawEditor
// resolves the live value through evaluateNodeInputs and hands the source
// node's own label back here so the field can say "from <label>" and, in
// PropertyInspector, go there on a click.
const markWiredFields = (fields, wiredPortIds = [], wiredSources = {}) => {
    if (!wiredPortIds.length) return fields
    const wired = new Set(wiredPortIds)
    return fields.map((field) => {
        const portId = field.path?.[0]
        if (!wired.has(portId)) return field
        const source = wiredSources[portId]
        return {
            ...field,
            wired: true,
            fromNodeId: source?.nodeId || null,
            fromLabel: source?.label || null
        }
    })
}

export const deriveNodeInspectorSections = (node, { wiredPortIds = [], wiredSources = {} } = {}) => {
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
                fields: markWiredFields([
                    { label: 'Body', path: ['body'], type: 'textarea', portType: 'string' },
                    ...dynamicPorts
                ], wiredPortIds, wiredSources)
            }
        ]
    }

    // Some node types store real user-facing config in defaultValues that
    // isn't also a port (an OSC target IP/port, an RTMP destination, a
    // recording filename pattern) — those were never surfaced anywhere in
    // the inspector at all, unlike port-backed fields. configInputs
    // declares them in the same {id, type, label} shape as a port; they
    // read/write node.values[id] through the exact same path mechanism.
    // An operator family's operation is the first thing on the sheet, above
    // the ports — it decides what the ports mean, so reading it after them
    // would be reading the answer before the question. It is a parameter, not
    // a port: nothing can wire an operation, because a card whose identity
    // changed on a live wire could not be read off the canvas.
    const operations = getNodeOperations(typeId)
    const operationField = operations
        ? [{
            label: 'Operation',
            path: ['operation'],
            type: 'select',
            portType: 'string',
            options: operations.map(({ value, label }) => ({ value, label }))
        }]
        : []

    // The PORTS the operation actually presents, not the type's static shape:
    // Sin's second port is labelled Unused, Multiply's default is 1 and Add's
    // is 0. A port the operation does not read is dropped from the sheet — it
    // stays ON THE CARD, so a wire into it is never hidden, but offering an
    // editable box for a number nothing will read is the kind of dishonest
    // surface the 2026-08-18 node truth audit went looking for.
    // Doorway-promoted sockets are deliberately not here either: the sheet
    // edits a node's own values, and a promoted socket belongs to its door.
    const declaredInputs = (getNodeOperation(node)?.inputs || type.inputs || []).filter((port) => !port.unused)
    const fields = [...operationField, ...declaredInputs, ...(type.configInputs || [])]
        .map((port) => (port.path ? port : portToInspectorField(port, node)))
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

    // An operator family's sheet does not hold ports alone — the operation is
    // the first thing in it and is not a port, and `port` has exactly one
    // meaning here (docs/ai/vocabulary.md): where a wire attaches.
    const sections = fields.length
        ? [{ id: 'values', label: operations ? 'Operation and ports' : 'Ports', fields: markWiredFields(fields, wiredPortIds, wiredSources) }]
        : []
    return sections
}

// The field type an OUTPUT port's live value renders as — same shapes the
// input side already uses, so a number reads as a number whichever rail it
// is on (design audit B8: "Out" with live values, same formatting as inputs).
const outputFieldType = (portType) => {
    if (portType === 'color') return 'color'
    if (portType === 'boolean') return 'checkbox'
    if (portType === 'number') return 'number'
    if (portType === 'vec3') return 'vec3'
    if (portType === 'geometry' || portType === 'texture' || portType === 'signal') return 'connection'
    return 'text'
}

// The inspector's "Out" section (fix #2 / design audit B8): every output
// port this node has, shaped the same way an input field is, but read-only —
// PropertyInspector fills in the live values (RawEditor evaluates them
// through evaluateNodeOutput) the same way it fills in wired inputs.
// `scopeNodes` is only needed so a container's doorway-promoted output
// sockets show up here too (getNodeOutputs' own contract).
export const buildOutputsSection = (node, scopeNodes = null) => {
    if (!node) return null
    const outputs = getNodeOutputs(node, scopeNodes)
    if (!outputs.length) return null
    return {
        id: 'outputs',
        label: 'Out',
        fields: outputs.map((port) => ({
            label: port.label || port.id,
            path: [port.id],
            type: outputFieldType(port.type),
            portType: port.type,
            readOnly: true
        }))
    }
}
