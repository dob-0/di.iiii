/**
 * INFO LAYERS — one source for "who may see this piece of information".
 *
 * Every record, panel and message has exactly one layer:
 *   personal  one person's own life (their chats, credits, phones, home devices)
 *   private   a studio team's work (its machines, agents, services, pull requests, shows)
 *   di.iiii   the tools given to everyone (public, AGPL)
 * A piece with no layer named is personal: the safest default, never the most open.
 *
 * CJS because serverXR is CJS; src/utils/infoLayers.js is the browser's copy and
 * src/utils/infoLayers.test.js fails if the two drift (the same mirror shape as
 * shared/reservedSegments.cjs).
 */

const LAYERS = Object.freeze(['personal', 'private', 'di.iiii'])
const DEFAULT_LAYER = 'personal'

// Monitor panel -> layer. A panel missing here is personal.
const PANEL_LAYER = Object.freeze({
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

/** The layer of a Monitor panel by name; unknown names are personal. */
const panelLayer = (name) => (Object.prototype.hasOwnProperty.call(PANEL_LAYER, name) ? PANEL_LAYER[name] : DEFAULT_LAYER)

/** The layer of a machines row: a phone or tablet is personal, a studio machine is private. */
const machineRowLayer = (row) => (PERSONAL_OS.test(String(row?.os || '').trim()) ? 'personal' : 'private')

const isLayer = (value) => LAYERS.includes(value)

/** A copy of one panel carrying `layer` (and `layer` on each machines row). Never mutates. */
function tagPanel(name, panel) {
  if (!panel || typeof panel !== 'object' || Array.isArray(panel)) return panel
  const tagged = { ...panel, layer: panelLayer(name) }
  if (name === 'machines' && Array.isArray(panel.rows)) {
    tagged.rows = panel.rows.map((row) => (row && typeof row === 'object' ? { ...row, layer: machineRowLayer(row) } : row))
  }
  return tagged
}

/** Every panel of a snapshot's `panels` object tagged with its layer. */
function tagPanels(panels) {
  return Object.fromEntries(Object.entries(panels || {}).map(([name, panel]) => [name, tagPanel(name, panel)]))
}

/** Is a panel (by name) inside the given layers? The map decides, never the sender's own tag. */
const panelInLayers = (name, allowed) => allowed.includes(panelLayer(name))

module.exports = { LAYERS, DEFAULT_LAYER, PANEL_LAYER, panelLayer, machineRowLayer, isLayer, tagPanel, tagPanels, panelInLayers }
