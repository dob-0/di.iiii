// Manual CJS mirror of src/shared/runtimeSchema.js (keep in lockstep).

const RUNTIME_SCHEMA_VERSION = 1

const EXECUTION_KINDS = ['in-process', 'worker', 'external-service']
const RUNTIME_CLASSES = ['project-runtime', 'python-worker', 'renderer', 'adapter']
const SUPPORTED_HOSTS = ['linux', 'mac', 'windows']
const RUNTIME_SURFACES = ['world', 'view', 'graph', 'controller', 'projector', 'output-zone']
const RUNTIME_TRANSPORTS = ['stdio', 'websocket', 'sse', 'local-socket', 'file-watch']
const RUNTIME_ASSET_KINDS = ['image', 'video', 'audio', 'mapping', 'preset', 'shader', 'font']
const ENTRYPOINT_KINDS = ['local-process', 'websocket', 'http', 'none']
const II_RUNTIME_ID = 'ii'

const cloneRuntimeValue = (value) => {
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

const generateRuntimeId = (prefix = 'runtime') => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

const defaultRuntimeEntrypoint = {
  kind: 'none'
}

const defaultRuntimeDefinition = {
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

const defaultRuntimeBinding = {
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

const defaultRuntimeCommand = {
  commandId: '',
  runtimeId: '',
  projectId: '',
  type: '',
  payload: {},
  issuedAt: 0
}

const defaultRuntimeEvent = {
  eventId: '',
  runtimeId: '',
  projectId: '',
  type: '',
  payload: {},
  emittedAt: 0
}

const defaultRuntimeCapabilityState = {
  runtimeId: '',
  sessionId: '',
  hostInfo: {},
  available: [],
  unavailable: [],
  degraded: []
}

const defaultRuntimeAssetRef = {
  assetId: '',
  kind: '',
  mimeType: 'application/octet-stream',
  url: '',
  source: 'server',
  checksum: '',
  variants: {}
}

const defaultIiRuntimeDefinition = {
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

const defaultRuntimeRegistry = {
  schemaVersion: RUNTIME_SCHEMA_VERSION,
  runtimes: [defaultIiRuntimeDefinition]
}

const defaultRuntimeRegistration = {
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

const defaultRuntimeSnapshot = {
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

const normalizeRuntimeEntrypoint = (entrypoint = {}) => {
  const source = ensureObject(entrypoint)
  return {
    kind: ensureEnum(source.kind, ENTRYPOINT_KINDS, defaultRuntimeEntrypoint.kind),
    ...(Array.isArray(source.command) ? { command: source.command.map((part) => String(part)) } : {}),
    ...(source.url !== undefined ? { url: ensureString(source.url) } : {})
  }
}

const normalizeRuntimeDefinition = (definition = {}) => {
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

const normalizeRuntimeBinding = (binding = {}) => {
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

const normalizeRuntimeCommand = (command = {}) => {
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

const normalizeRuntimeEvent = (event = {}) => {
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

const normalizeRuntimeCapabilityState = (state = {}) => {
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

const normalizeRuntimeAssetRef = (assetRef = {}) => {
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

const normalizeRuntimeRegistry = (registry = {}) => {
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

const getRuntimeDefinition = (registry = defaultRuntimeRegistry, runtimeId = '') => {
  const normalizedRuntimeId = ensureString(runtimeId)
  if (!normalizedRuntimeId) return null
  const normalizedRegistry = normalizeRuntimeRegistry(registry)
  return normalizedRegistry.runtimes.find((runtime) => runtime.runtimeId === normalizedRuntimeId) || null
}

const listRuntimeDefinitions = (registry = defaultRuntimeRegistry) => {
  return normalizeRuntimeRegistry(registry).runtimes
}

const normalizeRuntimeRegistration = (registration = {}) => {
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

const normalizeRuntimeSnapshot = (snapshot = {}) => {
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

module.exports = {
  RUNTIME_SCHEMA_VERSION,
  EXECUTION_KINDS,
  RUNTIME_CLASSES,
  SUPPORTED_HOSTS,
  RUNTIME_SURFACES,
  RUNTIME_TRANSPORTS,
  RUNTIME_ASSET_KINDS,
  ENTRYPOINT_KINDS,
  II_RUNTIME_ID,
  cloneRuntimeValue,
  generateRuntimeId,
  defaultRuntimeEntrypoint,
  defaultRuntimeDefinition,
  defaultRuntimeBinding,
  defaultRuntimeCommand,
  defaultRuntimeEvent,
  defaultRuntimeCapabilityState,
  defaultRuntimeAssetRef,
  defaultIiRuntimeDefinition,
  defaultRuntimeRegistry,
  defaultRuntimeRegistration,
  defaultRuntimeSnapshot,
  normalizeRuntimeEntrypoint,
  normalizeRuntimeDefinition,
  normalizeRuntimeBinding,
  normalizeRuntimeCommand,
  normalizeRuntimeEvent,
  normalizeRuntimeCapabilityState,
  normalizeRuntimeAssetRef,
  normalizeRuntimeRegistry,
  getRuntimeDefinition,
  listRuntimeDefinitions,
  normalizeRuntimeRegistration,
  normalizeRuntimeSnapshot
}
