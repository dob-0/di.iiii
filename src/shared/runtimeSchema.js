export const RUNTIME_SCHEMA_VERSION = 1

export const EXECUTION_KINDS = ['in-process', 'worker', 'external-service']
export const RUNTIME_CLASSES = ['project-runtime', 'python-worker', 'renderer', 'adapter']
export const SUPPORTED_HOSTS = ['linux', 'mac', 'windows']
export const RUNTIME_SURFACES = ['world', 'view', 'graph', 'controller', 'projector', 'output-zone']
export const RUNTIME_TRANSPORTS = ['stdio', 'websocket', 'sse', 'local-socket', 'file-watch']
export const RUNTIME_ASSET_KINDS = ['image', 'video', 'audio', 'mapping', 'preset', 'shader', 'font']
export const ENTRYPOINT_KINDS = ['local-process', 'websocket', 'http', 'none']
export const II_RUNTIME_ID = 'ii'

export const cloneRuntimeValue = (value) => {
    if (Array.isArray(value)) {
        return value.map(cloneRuntimeValue)
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, cloneRuntimeValue(nested)]))
    }
    return value
}

const ensureString = (value, fallback = '') => {
    const next = typeof value === 'string' ? value.trim() : ''
    return next || fallback
}

const ensureObject = (value, fallback = {}) => (
    value && typeof value === 'object' && !Array.isArray(value)
        ? cloneRuntimeValue(value)
        : cloneRuntimeValue(fallback)
)

const ensureStringArray = (value, fallback = []) => {
    const source = Array.isArray(value) ? value : fallback
    const out = []
    for (const entry of source) {
        const normalized = ensureString(entry)
        if (!normalized || out.includes(normalized)) continue
        out.push(normalized)
    }
    return out
}

const ensureEnum = (value, allowed, fallback) => {
    const normalized = ensureString(value, fallback)
    return allowed.includes(normalized) ? normalized : fallback
}

export const generateRuntimeId = (prefix = 'runtime') => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export const defaultRuntimeEntrypoint = {
    kind: 'none'
}

export const defaultRuntimeDefinition = {
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    runtimeId: '',
    family: '',
    label: 'Unnamed Runtime',
    version: '0.1.0',
    executionKind: 'worker',
    runtimeClass: 'project-runtime',
    supportedHosts: [],
    capabilities: [],
    nodeTypes: [],
    surfaces: [],
    transports: [],
    assetKinds: [],
    entrypoint: defaultRuntimeEntrypoint
}

export const defaultRuntimeBinding = {
    bindingId: '',
    runtimeId: '',
    projectId: '',
    spaceId: '',
    nodeIds: [],
    edgeIds: [],
    assetRefs: [],
    surfaceRefs: [],
    config: {},
    documentVersion: 0,
    issuedAt: 0
}

export const defaultRuntimeCommand = {
    commandId: '',
    runtimeId: '',
    projectId: '',
    type: '',
    payload: {},
    issuedAt: 0
}

export const defaultRuntimeEvent = {
    eventId: '',
    runtimeId: '',
    projectId: '',
    type: '',
    payload: {},
    emittedAt: 0
}

export const defaultRuntimeCapabilityState = {
    runtimeId: '',
    sessionId: '',
    hostInfo: {},
    available: [],
    unavailable: [],
    degraded: []
}

export const defaultRuntimeAssetRef = {
    assetId: '',
    kind: '',
    mimeType: 'application/octet-stream',
    url: '',
    source: 'server',
    checksum: '',
    variants: {}
}

export const defaultIiRuntimeDefinition = {
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    runtimeId: II_RUNTIME_ID,
    family: 'ii',
    label: 'ii Live Runtime',
    version: '0.1.0',
    executionKind: 'worker',
    runtimeClass: 'project-runtime',
    supportedHosts: ['linux'],
    capabilities: [
        'terminal-render',
        'mapping',
        'midi',
        'osc',
        'audio-input',
        'camera-input',
        'web-control'
    ],
    nodeTypes: [
        'ii.output',
        'ii.surface',
        'ii.mapper',
        'ii.controller',
        'ii.mode',
        'ii.clock'
    ],
    surfaces: [
        'world',
        'view',
        'controller',
        'projector',
        'output-zone'
    ],
    transports: ['local-socket', 'websocket'],
    assetKinds: ['image', 'video', 'audio', 'mapping', 'preset', 'shader', 'font'],
    entrypoint: {
        kind: 'local-process',
        command: ['python3', '-m', 'ii_runtime']
    }
}

export const defaultRuntimeRegistry = {
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    runtimes: [defaultIiRuntimeDefinition]
}

export const defaultRuntimeRegistration = {
    registrationId: '',
    runtimeId: '',
    sessionId: '',
    projectId: '',
    spaceId: '',
    bindingId: '',
    transport: '',
    status: 'idle',
    hostInfo: {},
    capabilities: defaultRuntimeCapabilityState,
    registeredAt: 0
}

export const defaultRuntimeSnapshot = {
    snapshotId: '',
    runtimeId: '',
    sessionId: '',
    projectId: '',
    bindingId: '',
    transportState: 'disconnected',
    activeMode: '',
    palette: '',
    bpm: 0,
    blackout: false,
    metrics: {},
    mapping: {},
    inputs: {},
    outputs: {},
    snapshotAt: 0
}

export const normalizeRuntimeEntrypoint = (entrypoint = {}) => {
    const source = ensureObject(entrypoint)
    return {
        kind: ensureEnum(source.kind, ENTRYPOINT_KINDS, defaultRuntimeEntrypoint.kind),
        ...(Array.isArray(source.command) ? { command: source.command.map((part) => String(part)) } : {}),
        ...(source.url !== undefined ? { url: ensureString(source.url) } : {})
    }
}

export const normalizeRuntimeDefinition = (definition = {}) => {
    const source = ensureObject(definition)
    return {
        schemaVersion: RUNTIME_SCHEMA_VERSION,
        runtimeId: ensureString(source.runtimeId, generateRuntimeId()),
        family: ensureString(source.family),
        label: ensureString(source.label, defaultRuntimeDefinition.label),
        version: ensureString(source.version, defaultRuntimeDefinition.version),
        executionKind: ensureEnum(source.executionKind, EXECUTION_KINDS, defaultRuntimeDefinition.executionKind),
        runtimeClass: ensureEnum(source.runtimeClass, RUNTIME_CLASSES, defaultRuntimeDefinition.runtimeClass),
        supportedHosts: ensureStringArray(source.supportedHosts),
        capabilities: ensureStringArray(source.capabilities),
        nodeTypes: ensureStringArray(source.nodeTypes),
        surfaces: ensureStringArray(source.surfaces).filter((surface) => RUNTIME_SURFACES.includes(surface)),
        transports: ensureStringArray(source.transports).filter((transport) => RUNTIME_TRANSPORTS.includes(transport)),
        assetKinds: ensureStringArray(source.assetKinds).filter((assetKind) => RUNTIME_ASSET_KINDS.includes(assetKind)),
        entrypoint: normalizeRuntimeEntrypoint(source.entrypoint)
    }
}

export const normalizeRuntimeBinding = (binding = {}) => {
    const source = ensureObject(binding)
    return {
        bindingId: ensureString(source.bindingId, generateRuntimeId('binding')),
        runtimeId: ensureString(source.runtimeId),
        projectId: ensureString(source.projectId),
        spaceId: ensureString(source.spaceId),
        nodeIds: ensureStringArray(source.nodeIds),
        edgeIds: ensureStringArray(source.edgeIds),
        assetRefs: ensureStringArray(source.assetRefs),
        surfaceRefs: ensureStringArray(source.surfaceRefs),
        config: ensureObject(source.config),
        documentVersion: Number.isFinite(Number(source.documentVersion)) ? Number(source.documentVersion) : 0,
        issuedAt: Number.isFinite(Number(source.issuedAt)) ? Number(source.issuedAt) : 0
    }
}

export const normalizeRuntimeCommand = (command = {}) => {
    const source = ensureObject(command)
    return {
        commandId: ensureString(source.commandId, generateRuntimeId('command')),
        runtimeId: ensureString(source.runtimeId),
        projectId: ensureString(source.projectId),
        type: ensureString(source.type),
        payload: ensureObject(source.payload),
        issuedAt: Number.isFinite(Number(source.issuedAt)) ? Number(source.issuedAt) : 0
    }
}

export const normalizeRuntimeEvent = (event = {}) => {
    const source = ensureObject(event)
    return {
        eventId: ensureString(source.eventId, generateRuntimeId('event')),
        runtimeId: ensureString(source.runtimeId),
        projectId: ensureString(source.projectId),
        type: ensureString(source.type),
        payload: ensureObject(source.payload),
        emittedAt: Number.isFinite(Number(source.emittedAt)) ? Number(source.emittedAt) : 0
    }
}

export const normalizeRuntimeCapabilityState = (state = {}) => {
    const source = ensureObject(state)
    return {
        runtimeId: ensureString(source.runtimeId),
        sessionId: ensureString(source.sessionId),
        hostInfo: ensureObject(source.hostInfo),
        available: ensureStringArray(source.available),
        unavailable: ensureStringArray(source.unavailable),
        degraded: ensureStringArray(source.degraded)
    }
}

export const normalizeRuntimeAssetRef = (assetRef = {}) => {
    const source = ensureObject(assetRef)
    return {
        assetId: ensureString(source.assetId),
        kind: ensureString(source.kind),
        mimeType: ensureString(source.mimeType, defaultRuntimeAssetRef.mimeType),
        url: ensureString(source.url),
        source: ensureString(source.source, defaultRuntimeAssetRef.source),
        checksum: ensureString(source.checksum),
        variants: ensureObject(source.variants)
    }
}

export const normalizeRuntimeRegistry = (registry = {}) => {
    const source = ensureObject(registry)
    const normalized = []
    const seenRuntimeIds = new Set()
    for (const entry of Array.isArray(source.runtimes) ? source.runtimes : defaultRuntimeRegistry.runtimes) {
        const runtime = normalizeRuntimeDefinition(entry)
        if (!runtime.runtimeId || seenRuntimeIds.has(runtime.runtimeId)) continue
        seenRuntimeIds.add(runtime.runtimeId)
        normalized.push(runtime)
    }
    return {
        schemaVersion: RUNTIME_SCHEMA_VERSION,
        runtimes: normalized
    }
}

export const getRuntimeDefinition = (registry = defaultRuntimeRegistry, runtimeId = '') => {
    const normalizedRuntimeId = ensureString(runtimeId)
    if (!normalizedRuntimeId) return null
    const normalizedRegistry = normalizeRuntimeRegistry(registry)
    return normalizedRegistry.runtimes.find((runtime) => runtime.runtimeId === normalizedRuntimeId) || null
}

export const listRuntimeDefinitions = (registry = defaultRuntimeRegistry) => {
    return normalizeRuntimeRegistry(registry).runtimes
}

export const normalizeRuntimeRegistration = (registration = {}) => {
    const source = ensureObject(registration)
    return {
        registrationId: ensureString(source.registrationId, generateRuntimeId('registration')),
        runtimeId: ensureString(source.runtimeId),
        sessionId: ensureString(source.sessionId),
        projectId: ensureString(source.projectId),
        spaceId: ensureString(source.spaceId),
        bindingId: ensureString(source.bindingId),
        transport: ensureString(source.transport),
        status: ensureString(source.status, defaultRuntimeRegistration.status),
        hostInfo: ensureObject(source.hostInfo),
        capabilities: normalizeRuntimeCapabilityState(source.capabilities),
        registeredAt: Number.isFinite(Number(source.registeredAt)) ? Number(source.registeredAt) : 0
    }
}

export const normalizeRuntimeSnapshot = (snapshot = {}) => {
    const source = ensureObject(snapshot)
    return {
        snapshotId: ensureString(source.snapshotId, generateRuntimeId('snapshot')),
        runtimeId: ensureString(source.runtimeId),
        sessionId: ensureString(source.sessionId),
        projectId: ensureString(source.projectId),
        bindingId: ensureString(source.bindingId),
        transportState: ensureString(source.transportState, defaultRuntimeSnapshot.transportState),
        activeMode: ensureString(source.activeMode),
        palette: ensureString(source.palette),
        bpm: Number.isFinite(Number(source.bpm)) ? Number(source.bpm) : 0,
        blackout: Boolean(source.blackout),
        metrics: ensureObject(source.metrics),
        mapping: ensureObject(source.mapping),
        inputs: ensureObject(source.inputs),
        outputs: ensureObject(source.outputs),
        snapshotAt: Number.isFinite(Number(source.snapshotAt)) ? Number(source.snapshotAt) : 0
    }
}
