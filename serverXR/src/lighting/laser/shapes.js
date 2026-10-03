'use strict'

// A look → one frame of laser points.
//
// A look is what the Raw "Laser" node makes: a shape and how to draw it. The server
// renders it, not the browser, so the cube is fed at a steady rate even when the tab
// is busy or hidden — the same reason the lighting desk runs its own 40 Hz loop.
//
// Points come out as { x, y, r, g, b }: x, y in −1…1 (the cube's whole field), colour
// in 0…1. protocol.toWords clamps again on the way out; here the rules are about
// what a beam may do:
//   - the path is resampled evenly, so speed along the line is constant and the
//     brightness is even (a laser drawn with uneven spacing burns at its slow parts);
//   - a closed shape is closed; an open one travels back BLANK, so the return stroke
//     is invisible;
//   - a point past the field's edge is blank, never piled on the edge;
//   - a shape that collapses to a dot (size ~0) is drawn BLANK: a still beam puts its
//     whole power into one spot, the one failure a laser show must never have.

const SHAPES = ['circle', 'polygon', 'star', 'line', 'wave', 'spiral', 'lissajous']

const DEFAULT_LOOK = Object.freeze({
  shape: 'circle',
  sides: 5,
  size: 0.5,
  x: 0,
  y: 0,
  rotation: 0,
  spin: 0,
  color: '#00ff00',
  intensity: 0.3,
  waves: 3,
  speed: 0.25
})

// Below this extent (in field units, −1…1) a shape counts as a dot.
const MIN_EXTENT = 0.02
// Blank points at the start of a frame, so the galvos settle before the beam opens.
const BLANK_LEAD = 8

const num = (v, fallback) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : fallback)
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

function parseColor(value) {
  if (Array.isArray(value) && value.length >= 3) return value.slice(0, 3).map((v) => clamp(num(v, 0), 0, 1))
  if (typeof value === 'string') {
    const hex = value.trim().replace(/^#/, '')
    if (/^[0-9a-f]{6}$/i.test(hex)) return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    if (/^[0-9a-f]{3}$/i.test(hex)) return [0, 1, 2].map((i) => parseInt(hex[i] + hex[i], 16) / 255)
  }
  return parseColor(DEFAULT_LOOK.color)
}

// Whatever arrives from a wire, as a look the renderer can trust.
function normalizeLook(raw = {}) {
  const look = { ...DEFAULT_LOOK, ...(raw && typeof raw === 'object' ? raw : {}) }
  return {
    shape: SHAPES.includes(look.shape) ? look.shape : DEFAULT_LOOK.shape,
    sides: Math.round(clamp(num(look.sides, DEFAULT_LOOK.sides), 3, 12)),
    size: clamp(num(look.size, DEFAULT_LOOK.size), 0, 1),
    x: clamp(num(look.x, 0), -1, 1),
    y: clamp(num(look.y, 0), -1, 1),
    rotation: num(look.rotation, 0),
    spin: clamp(num(look.spin, 0), -4, 4),
    color: parseColor(look.color),
    intensity: clamp(num(look.intensity, DEFAULT_LOOK.intensity), 0, 1),
    waves: Math.round(clamp(num(look.waves, DEFAULT_LOOK.waves), 1, 12)),
    speed: clamp(num(look.speed, DEFAULT_LOOK.speed), -4, 4)
  }
}

// The shape's outline as a polyline in a unit field (radius 1), before size,
// rotation and position. `closed` says whether the last point joins the first.
function outline(look, t) {
  const TAU = Math.PI * 2
  const pts = []
  switch (look.shape) {
    case 'circle':
      for (let i = 0; i < 64; i++) pts.push([Math.cos((i / 64) * TAU), Math.sin((i / 64) * TAU)])
      return { pts, closed: true }
    case 'polygon':
      for (let i = 0; i < look.sides; i++) pts.push([Math.cos((i / look.sides) * TAU), Math.sin((i / look.sides) * TAU)])
      return { pts, closed: true, corners: true }
    case 'star':
      for (let i = 0; i < look.sides * 2; i++) {
        const r = i % 2 === 0 ? 1 : 0.45
        const a = (i / (look.sides * 2)) * TAU
        pts.push([r * Math.cos(a), r * Math.sin(a)])
      }
      return { pts, closed: true, corners: true }
    case 'line':
      return { pts: [[-1, 0], [1, 0]], closed: false, corners: true }
    case 'wave':
      for (let i = 0; i <= 64; i++) {
        const u = i / 64
        pts.push([u * 2 - 1, 0.5 * Math.sin(u * TAU * look.waves + t * TAU * look.speed)])
      }
      return { pts, closed: false }
    case 'spiral':
      for (let i = 0; i <= 96; i++) {
        const u = i / 96
        const a = u * TAU * look.waves
        pts.push([u * Math.cos(a), u * Math.sin(a)])
      }
      return { pts, closed: false }
    case 'lissajous':
      for (let i = 0; i < 128; i++) {
        const a = (i / 128) * TAU
        pts.push([Math.sin(a * look.waves + t * TAU * look.speed), Math.sin(a * (look.waves + 1))])
      }
      return { pts, closed: true }
    default:
      return { pts: [], closed: false }
  }
}

// Resample a polyline to n points at equal spacing along its length.
function resample(pts, closed, n) {
  const path = closed ? [...pts, pts[0]] : pts
  const seg = []
  let total = 0
  for (let i = 1; i < path.length; i++) {
    const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1])
    seg.push(d)
    total += d
  }
  if (!(total > 0) || n < 2) return path.slice(0, Math.max(0, n))
  const out = []
  let k = 0
  let walked = 0
  for (let j = 0; j < n; j++) {
    const target = (j / (n - 1)) * total
    while (k < seg.length - 1 && walked + seg[k] < target) { walked += seg[k]; k++ }
    const f = seg[k] > 0 ? (target - walked) / seg[k] : 0
    out.push([path[k][0] + (path[k + 1][0] - path[k][0]) * f, path[k][1] + (path[k + 1][1] - path[k][1]) * f])
  }
  return out
}

// One frame of `budget` points for `look` at time `t` (seconds).
function renderFrame(rawLook, t = 0, budget = 500) {
  const look = normalizeLook(rawLook)
  const n = Math.max(BLANK_LEAD + 16, Math.floor(budget))
  const { pts, closed } = outline(look, t)
  const angle = look.rotation + t * look.spin * Math.PI * 2
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const place = ([u, v]) => [look.x + look.size * (u * cos - v * sin), look.y + look.size * (u * sin + v * cos)]

  const blank = (p) => ({ x: p[0], y: p[1], r: 0, g: 0, b: 0 })
  const [cr, cg, cb] = look.color.map((c) => c * look.intensity)
  // A point pushed past the field's edge is blanked, not clamped: clamping would stack
  // every such point on the edge and burn a bright line there.
  const inField = (p) => Math.abs(p[0]) <= 1 && Math.abs(p[1]) <= 1
  const lit = (p) => (inField(p) ? { x: p[0], y: p[1], r: cr, g: cg, b: cb } : blank(p))

  if (!pts.length) return Array.from({ length: n }, () => blank([0, 0]))

  // An open shape needs a blank way back; give it a third of the budget.
  const drawCount = closed ? n - BLANK_LEAD : Math.floor((n - BLANK_LEAD) * 2 / 3)
  const drawn = resample(pts, closed, drawCount).map(place)

  const xs = drawn.map((p) => p[0])
  const ys = drawn.map((p) => p[1])
  const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  const isDot = !(extent >= MIN_EXTENT) || look.intensity === 0

  const frame = []
  for (let i = 0; i < BLANK_LEAD; i++) frame.push(blank(drawn[0]))
  for (const p of drawn) frame.push(isDot ? blank(p) : lit(p))
  if (!closed) {
    const back = resample([drawn[drawn.length - 1], drawn[0]], false, n - frame.length)
    for (const p of back) frame.push(blank(p))
  }
  while (frame.length < n) frame.push(blank(drawn[0]))
  return frame
}

module.exports = { SHAPES, DEFAULT_LOOK, MIN_EXTENT, normalizeLook, renderFrame, parseColor }
