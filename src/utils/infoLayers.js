// The browser's copy of shared/infoLayers.cjs (the one source of info layers).
// src/utils/infoLayers.test.js fails if the two drift.
export const LAYERS = Object.freeze(['personal', 'private', 'di.iiii'])
export const DEFAULT_LAYER = 'personal'

export const PANEL_LAYER = Object.freeze({
    chats: 'personal',
    credits: 'personal',
    machines: 'private',
    network: 'private',
    agents: 'private',
    presence: 'private',
    connected: 'private',
    services: 'private',
    spaces: 'private',
    pullRequests: 'private',
    tasks: 'private',
    shows: 'private'
})

const PERSONAL_OS = /^(android|ios|ipados)$/i

export const panelLayer = (name) => (Object.prototype.hasOwnProperty.call(PANEL_LAYER, name) ? PANEL_LAYER[name] : DEFAULT_LAYER)
export const machineRowLayer = (row) => (PERSONAL_OS.test(String(row?.os || '').trim()) ? 'personal' : 'private')
export const isLayer = (value) => LAYERS.includes(value)
