// Compose the Open Jam room from what is inside it.
// Usage: node compose-open-jam.mjs <apiBase> <token> <wall|floor> [--style=night|paper|blueprint|blue] [--apply]
// Styles (wall only) set the ground, grid, fog, light and text colours; the objects stay the same.
const args = process.argv.slice(2)
const [base, token, layout = 'wall'] = args
const apply = args.includes('--apply')
const style = (args.find((a) => a.startsWith('--style=')) || '--style=night').slice(8)
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
const get = async (p) => { const r = await fetch(base + p, { headers: H }); if (!r.ok) throw new Error(`${r.status} ${p}`); return r.json() }
const PI = Math.PI
import crypto from 'node:crypto'
import { slotAt } from '../../../shared/placement.cjs'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const STYLES = {
  // a night gallery: dark ground, the photos carry the light, warm text
  night: { background: '#0b0b12', sign: '#181822', grid: false, fog: { near: 18, far: 60, color: '#0b0b12', enabled: true }, ambient: 0.55, sun: 1.1,
    colors: { headline: '#fff3d6', like: '#a9b0c2', scan: '#ffd166', howto: '#eceaf2' } },
  // a zine: paper ground, faint grid, ink text
  paper: { background: '#efece4', sign: '#ffffff', grid: { cell: '#d9d4c8', section: '#c4bdae' }, fog: { near: 30, far: 90, color: '#efece4', enabled: true }, ambient: 0.95, sun: 0.5,
    colors: { headline: '#141414', like: '#5a5a5a', scan: '#b5411d', howto: '#141414' } },
  // paper + blue: the zine's light ground, the front room's blue drawn on it
  blueprint: { background: '#eceef6', sign: '#ffffff', grid: { cell: '#c8cfe6', section: '#2a3fb8' }, fog: { near: 34, far: 110, color: '#eceef6', enabled: true }, ambient: 0.9, sun: 0.6,
    colors: { headline: '#0000a0', like: '#5f6784', scan: '#0000a0', howto: '#15182b' } },
  // the front room's own world: deep blue, cyan grid
  blue: { background: '#0000a0', sign: '#000070', grid: { cell: '#2a6e73', section: '#4df9ff' }, fog: { near: 30, far: 120, color: null, enabled: true }, ambient: 0.5, sun: 1.5,
    colors: { headline: '#4df9ff', like: '#cfd8ff', scan: '#ffffff', howto: '#ffffff' } },
}
const ST = STYLES[style]
if (!ST) { console.error(`unknown style ${style}; one of ${Object.keys(STYLES).join(', ')}`); process.exit(1) }

// THE PATH — what a visitor walks past between arriving and leaving.
//
// The owner: "a landing inside where people after scanning the QR start a path
// where staged things teach and help you create … and the final point is seeing
// all the other spaces — a circle of working, all in eyes."
//
// So the teaching is not a page in front of the room, it is the room. Three
// stations stand on the floor between the entry and the wall, each one sentence
// at the moment it is true, and a door at the end that leads on. All of them are
// PINNED: they are the building, not the exhibition, and the build zones must
// never hang them.
const PATH = [
  { name: 'path_here', at: [0, 0.45, 4.3], scale: 0.058, align: 'center',
    value: 'you are standing in a space.\nthis one is open — anyone may add to it.' },
  { name: 'path_wall', at: [2.9, 0.45, -3.4], scale: 0.058, align: 'center',
    value: 'everything on these walls\nsomebody put here on one night in July.' },
  { name: 'path_yours', at: [-2.9, 0.45, -3.4], scale: 0.058, align: 'center',
    value: 'add yours with the ＋ button.\nit hangs itself, in line, beside theirs.' },
]
// The door out. A space with nothing beyond it is a cul-de-sac; this one opens
// onto the front room, which is where every other space is listed.
// BEHIND the visitor, facing back into the room. A door between them and the wall
// reads as a picture frame with somebody's cat in it, and one at the side crowds
// the arrival — but the moment you want the way on is the moment you turn round,
// and then it is the only thing there.
const DOOR = { name: 'path_door', spaceId: 'main', projectId: 'main-dii-project', label: 'the other spaces', at: [0, 0, 8.4], rotation: [0, PI, 0], scale: 0.9 }

// the four lines, as they should read (the originals had a typo, a missing step 3 and "assets")
const COPY = {
  headline: "let's make some memories together",
  like: 'like we did on the jam night, 21 July 2026',
  scan: 'scan it',
  howto: '1. scan the code\n2. open the room and add your photos\n3. tap edit and move them where you like\n4. they stay — this room is the record',
}

const { project } = await get('/api/projects/open-jam')
const { document: doc } = await get('/api/projects/open-jam/document')
const ents = Array.isArray(doc.entities) ? doc.entities : Object.values(doc.entities || {})
const textOf = (e) => e.components?.text?.value ?? e.components?.text?.content ?? ''
const JUNK_TEXT = (s) => { const t = (s || '').trim(); return !t || t === 'New Text' || /^-+$/.test(t) }
const PRIMS = new Set(['cone', 'cylinder', 'sphere', 'ring', 'torus', 'box', 'plane'])

// --- sort what we have
const photos = [], texts = {}, remove = [], path = {}
let qr = null, ambient = null, sun = null
const seen = new Set()
for (const e of ents) {
  if (e.type === 'image') {
    if (e.name === 'open_jam_qr') { qr = e; continue }
    const key = `${e.name}|${e.components?.media?.assetId}`
    if (seen.has(key)) { remove.push(e); continue }
    seen.add(key); photos.push(e); continue
  }
  if (/^path_/.test(e.name || '')) { path[e.name] = e; continue }
  if (e.type === 'text') {
    const t = textOf(e).trim().toLowerCase()
    if (JUNK_TEXT(t)) { remove.push(e); continue }
    if (t.startsWith('let')) texts.headline = e
    else if (t.startsWith('scan')) texts.scan = e
    else if (t.startsWith('1.')) texts.howto = e
    else if (t.startsWith('like we')) texts.like = e
    else texts[`other${Object.keys(texts).length}`] = e
    continue
  }
  if (PRIMS.has(e.type)) { remove.push(e); continue }
  if (e.type === 'portal') { const p = e.components?.portal || e.components?.reference || {}; if (!p.spaceId && !p.projectId) remove.push(e); continue }
  if (e.type === 'ambientLight') { if (ambient) remove.push(e); else ambient = e; continue }
  if (e.type === 'directionalLight') { if (sun) remove.push(e); else sun = e; continue }
  if (/Light$/.test(e.type)) { remove.push(e); continue }
}
photos.sort((a, b) => String(a.name).localeCompare(String(b.name)))

const ops = []
const del = (e) => ops.push({ type: 'deleteEntity', payload: { entityId: e.id } })
const tf = (e, position, rotation, scale) => ops.push({ type: 'updateComponent', payload: { entityId: e.id, component: 'transform', patch: { position, rotation, scale: Array.isArray(scale) ? scale : [scale, scale, scale] } } })
const txt = (e, patch) => ops.push({ type: 'updateComponent', payload: { entityId: e.id, component: 'text', patch } })
const paint = (e, color) => ops.push({ type: 'updateComponent', payload: { entityId: e.id, component: 'appearance', patch: { color, opacity: 1 } } })
const light = (e, intensity, color) => ops.push({ type: 'updateComponent', payload: { entityId: e.id, component: 'light', patch: { intensity, ...(color ? { color } : {}) } } })
for (const e of remove) del(e)

const STAND = [PI / 2, 0, 0]          // flat plane stood up, facing +z
const FACE_PX = [PI / 2, 0, -PI / 2]  // stood up, then turned to face +x
const FACE_NX = [PI / 2, 0, PI / 2]   // stood up, then turned to face -x
let camera, world

if (layout === 'wall') {
  // Three panels around the visitor, hung in TWO rows — one row of a wide wall shrank
  // to a band across the middle of a portrait phone. A photo plane's HEIGHT follows its
  // scale: ImageObject builds a plane 3 units TALL and 3·aspect wide, so height = 3·scale
  // and a uniform scale already gives an even hanging line. The only thing to cap is a
  // banner like the festival poster (3.3:1), which at the row scale would be 5 units wide.
  const ROW_H = 2.0, MAX_W = 3.4, BASE = ROW_H / 3, ROWS = [1.15, 3.35], GAP = 3.7
  const BACK_Z = -7.5, WING_X = 6.2, WING_Z = -2.0
  const dims = new Map()
  for (const e of photos) {
    const id = e.components?.media?.assetId
    const r = await fetch(`${base}/api/projects/open-jam/assets/${id}`, { headers: { Authorization: H.Authorization } })
    const buf = Buffer.from(await r.arrayBuffer())
    const p = join(mkdtempSync(join(tmpdir(), 'open-jam-dims-')), String(id))
    writeFileSync(p, buf)
    const [width, height] = execFileSync('magick', ['identify', '-format', '%w %h', p]).toString().trim().split(' ').map(Number)
    dims.set(e.id, { width, height })
  }
  const scaleOf = (e) => { const d = dims.get(e.id); return d ? Math.min(BASE, MAX_W / (3 * (d.width / d.height))) : BASE }
  // The SERVER decides where a photo hangs from now on (shared/placement.cjs).
  // This script hangs the ones already in the room on exactly those slots — same
  // module, same numbers — so turning the rule on moves nothing, and a photo
  // added a minute later lands in the next free slot rather than on top of one.
  const LAYOUT = { rows: ROWS, gap: GAP, slotHeight: ROW_H, maxWidth: MAX_W, back: { z: BACK_Z }, wings: { x: WING_X, z: WING_Z } }
  photos.forEach((e, i) => {
    const slot = slotAt(LAYOUT, i)
    tf(e, slot.position, slot.rotation, scaleOf(e))
  })
  // The front desk is a LECTERN on the floor, tilted up towards the entry camera.
  // Standing it upright at eye height put it over the photo line — a portrait phone
  // photo on the wall hangs from y 0.2 to 3.2, so there is no clear band up there.
  // The floor in front of the walls is the only empty part of the entry frame.
  // the scan caption goes in FRONT of the code: behind it, the code's own plane hides it
  const LECTERN = [1.02, 0, 0]  // stood up, then leaned back ~30° to face the camera
  // pinned: the code is furniture on its lectern, not an exhibit — without this
  // the wall would swallow it the moment the build zones came on
  if (qr) { tf(qr, [-2.2, 0.3, 0.8], LECTERN, 0.34); ops.push({ type: 'updateComponent', payload: { entityId: qr.id, component: 'placement', patch: { pinned: true } } }) }
  if (texts.scan) { tf(texts.scan, [-2.2, 0.12, 1.7], LECTERN, 0.07); txt(texts.scan, { value: COPY.scan, billboard: false, align: 'center', fontFamily: 'JetBrains Mono, monospace', fontWeight: '600' }); paint(texts.scan, ST.colors.scan) }
  if (texts.howto) { tf(texts.howto, [1.7, 0.55, 1.0], LECTERN, 0.062); txt(texts.howto, { value: COPY.howto, billboard: false, align: 'left', fontFamily: 'Inter, sans-serif', fontWeight: '500' }); paint(texts.howto, ST.colors.howto) }
  if (texts.headline) { tf(texts.headline, [0, 5.3, BACK_Z], STAND, 0.26); txt(texts.headline, { value: COPY.headline, billboard: false, align: 'center', fontFamily: 'Inter, sans-serif', fontWeight: '700' }); paint(texts.headline, ST.colors.headline) }
  if (texts.like) { tf(texts.like, [0, 4.8, BACK_Z], STAND, 0.11); txt(texts.like, { value: COPY.like, billboard: false, align: 'center', fontFamily: 'JetBrains Mono, monospace', fontWeight: '500' }); paint(texts.like, ST.colors.like) }
  // the path, laid on the floor like the lectern so it never reads through the wall
  const pin = (id) => ops.push({ type: 'updateComponent', payload: { entityId: id, component: 'placement', patch: { pinned: true } } })
  for (const station of PATH) {
    const existing = path[station.name]
    const components = {
      transform: { position: station.at, rotation: LECTERN, scale: [station.scale, station.scale, station.scale] },
      appearance: { color: ST.colors.howto, opacity: 1 },
      text: { value: station.value, billboard: false, align: station.align, fontFamily: 'Inter, sans-serif', fontWeight: '500' },
      placement: { pinned: true },
    }
    if (existing) {
      tf(existing, station.at, LECTERN, station.scale)
      txt(existing, components.text)
      paint(existing, ST.colors.howto)
      pin(existing.id)
    } else {
      ops.push({ type: 'createEntity', payload: { entity: { id: crypto.randomUUID(), type: 'text', name: station.name, parentId: null, components } } })
    }
  }
  const door = path[DOOR.name]
  const doorComponents = {
    transform: { position: DOOR.at, rotation: DOOR.rotation, scale: [DOOR.scale, DOOR.scale, DOOR.scale] },
    appearance: { color: ST.colors.headline, opacity: 1 },
    reference: { spaceId: DOOR.spaceId, projectId: DOOR.projectId, mode: 'portal', label: DOOR.label, style: 'frame', labelColor: ST.colors.headline, labelPlate: false },
    placement: { pinned: true },
  }
  if (door) {
    tf(door, DOOR.at, DOOR.rotation, DOOR.scale)
    ops.push({ type: 'updateComponent', payload: { entityId: door.id, component: 'reference', patch: doorComponents.reference } })
    paint(door, ST.colors.headline)
    pin(door.id)
  } else {
    ops.push({ type: 'createEntity', payload: { entity: { id: crypto.randomUUID(), type: 'portal', name: DOOR.name, parentId: null, components: doorComponents } } })
  }
  camera = { projection: 'perspective', position: [0, 2.0, 6.8], target: [0, 1.9, -3], fov: 44, zoom: 1, near: 0.1, far: 300, locked: false }
  // the walker starts where the camera stands and faces the back wall (yaw π = looking -z);
  // the floor plan keeps them inside the three walls
  world = {
    backgroundColor: ST.background,
    // Build zones ON: from here the room arranges itself. Anything hangable that
    // arrives — a phone's photo dropped at the origin, an import, a drag into the
    // void — is put in the next free slot by the SERVER (shared/placement.cjs),
    // and the wall grows outward rather than running out. These numbers are the
    // same ones this script hangs the existing photos on, so nothing jumps when
    // the rule comes on.
    placement: {
      enabled: true,
      types: ['image', 'video'],
      layout: { rows: ROWS, gap: GAP, slotHeight: ROW_H, maxWidth: MAX_W, back: { z: BACK_Z }, wings: { x: WING_X, z: WING_Z } },
    },
    fog: ST.fog,
    gridVisible: !!ST.grid,
    ...(ST.grid ? { gridCellColor: ST.grid.cell, gridSectionColor: ST.grid.section, gridCellSize: 1, gridSectionSize: 5, gridFadeDistance: 40 } : {}),
    spawn: { x: 0, z: 7, yaw: 3.14159, pitch: 0, altY: 1.6 },
    // the floor stops 2.5 units short of the back wall: at 1 unit a walker's nose is
// pressed against somebody's photograph and the room disappears
    walkableAreas: [{ minX: -5.2, maxX: 5.2, minZ: -5.0, maxZ: 9.0 }],
  }
} else {
  // a mosaic on the floor, seen from above: photos as they were left, gathered together
  const cols = 5, S = 0.8, GAP = 3.1
  photos.forEach((e, i) => {
    const c = i % cols, r = Math.floor(i / cols)
    tf(e, [(c - (cols - 1) / 2) * GAP, 0.02 + r * 0.001, (r - 1) * GAP], [0, 0, 0], S)
  })
  if (qr) tf(qr, [-9, 0.02, 0], [0, 0, 0], 0.6)
  if (texts.headline) { tf(texts.headline, [0, 2.4, -5.5], [0, 0, 0], 1.6); txt(texts.headline, { billboard: true }) }
  if (texts.like) { tf(texts.like, [0, 1.8, -5.5], [0, 0, 0], 0.9); txt(texts.like, { billboard: true }) }
  if (texts.scan) { tf(texts.scan, [-8, 1.4, 0], [0, 0, 0], 0.9); txt(texts.scan, { billboard: true }) }
  if (texts.howto) { tf(texts.howto, [8, 1.4, 0], [0, 0, 0], 0.7); txt(texts.howto, { billboard: true }) }
  camera = { projection: 'perspective', position: [0, 11, 11], target: [0, 0, -1], fov: 55, zoom: 1, near: 0.1, far: 300, locked: false }
  world = { spawn: { x: 0, z: 7, yaw: 3.14159, pitch: 0, altY: 1.6 } }
}
// every light draws a small helper sphere where it stands (the ambient one sat above the
// back wall and read as a leftover): keep both high and behind the camera
if (ambient) { tf(ambient, [-4, 12, 34], [0, 0, 0], 1); light(ambient, ST.ambient, '#ffffff') }
if (sun) { tf(sun, [4, 14, 34], [0, 0, 0], 1); light(sun, ST.sun, style === 'paper' ? '#ffffff' : '#fff1dc') }
ops.push({ type: 'setPresentationState', payload: { patch: { entryView: 'fixed-camera', fixedCamera: camera } } })
ops.push({ type: 'setWorldState', payload: { patch: world } })

console.log(`Open Jam @ ${base} v${project.documentVersion} — layout ${layout}, style ${style}: ${photos.length} photos, qr ${!!qr}, texts ${Object.keys(texts).join(',')}, remove ${remove.length}, ops ${ops.length}`)
if (!apply) { console.log('dry run'); process.exit(0) }
const r = await fetch(`${base}/api/projects/open-jam/ops`, { method: 'POST', headers: H, body: JSON.stringify({ baseVersion: project.documentVersion, ops }) })
const body = await r.json().catch(() => ({}))
console.log('POST ops ->', r.status, body.newVersion ?? JSON.stringify(body).slice(0, 160))
