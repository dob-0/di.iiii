// Shared by the nav probes in scripts/nav (Node side only; nothing here touches a browser):
//  * loadFixture(file): a camera-places fixture (scripts/nav/fixtures/*.json), checked, or an Error that says what is wrong.
//  * parsePose(text): "px,py,pz,tx,ty,tz" -> six numbers.
//  * loadDesign(): the numbers the probes check against, read from THIS checkout (src/studio/navigation/freeMove.js and
//    mappings.js), so a probe never carries a copy that can drift from the app. Run a probe from the tree whose build is under test.
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

const ROOT = path.join(__dirname, '..', '..', '..')
const num = (x) => typeof x === 'number' && Number.isFinite(x)
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(num)
const isPose = (v) => Array.isArray(v) && v.length === 6 && v.every(num)

// Fixture shape: { fixture, fits, provenance: { source, date, licence }, places: [{ id, name, pos: [x,y,z], at: [x,y,z] }],
//                  poses: { <key>: { name, pose: [px,py,pz,tx,ty,tz] } } }   (scene metres; pos = camera, at = what it looks at)
function loadFixture(file) {
    let data
    // a path that is not found as given is tried from the repository root, so the usage lines work from any directory
    const where = fs.existsSync(file) || path.isAbsolute(file) ? file : path.join(ROOT, file)
    try { data = JSON.parse(fs.readFileSync(where, 'utf8')) } catch (e) { throw new Error(`NAV_PLACES ${file}: ${e.code === 'ENOENT' ? 'no such file' : 'not readable JSON (' + String(e.message).slice(0, 80) + ')'}`) }
    if (!data || typeof data !== 'object') throw new Error(`NAV_PLACES ${file}: the file must hold one JSON object`)
    const places = data.places == null ? [] : data.places
    if (!Array.isArray(places)) throw new Error(`NAV_PLACES ${file}: "places" must be an array`)
    const ids = new Set()
    places.forEach((p, i) => {
        if (!p || typeof p.id !== 'string' || !p.id) throw new Error(`NAV_PLACES ${file}: places[${i}] needs a text "id"`)
        if (ids.has(p.id)) throw new Error(`NAV_PLACES ${file}: place id ${p.id} is used twice`)
        ids.add(p.id)
        if (!isVec3(p.pos) || !isVec3(p.at)) throw new Error(`NAV_PLACES ${file}: place ${p.id} needs "pos" and "at" as [x, y, z] numbers`)
        if (p.pos.every((v, k) => v === p.at[k])) throw new Error(`NAV_PLACES ${file}: place ${p.id}: "pos" and "at" are the same point`)
    })
    const poses = {}
    for (const [key, v] of Object.entries(data.poses || {})) {
        if (!v || !isPose(v.pose)) throw new Error(`NAV_PLACES ${file}: poses.${key} needs "pose" as [px, py, pz, tx, ty, tz] numbers`)
        poses[key] = v.pose
    }
    return { file, meta: { fixture: data.fixture || path.basename(file), fits: data.fits || null, date: (data.provenance && data.provenance.date) || null }, places, poses }
}

function parsePose(text) {
    const v = String(text).split(',').map((s) => Number(s.trim()))
    if (!isPose(v)) throw new Error(`NAV_POSE "${text}": want six numbers px,py,pz,tx,ty,tz`)
    return v
}

async function loadDesign() {
    const dir = path.join(ROOT, 'src', 'studio', 'navigation')
    try {
        const fm = await import(pathToFileURL(path.join(dir, 'freeMove.js')).href)
        const mp = await import(pathToFileURL(path.join(dir, 'mappings.js')).href)
        // camera-controls mouseButtons at rest, [left, middle, right, wheel]: the Edit tool is the 'blender' preset, Navigate the 'studio' one
        const four = (id) => { const b = mp.mouseButtonsFor(id); return [b.left, b.middle, b.right, b.wheel] }
        const d = { speedFactor: fm.SPEED_FACTOR, turnSteps: fm.TURN_DISTANCE_STEPS, zoomPx: fm.ZOOM_DRAG_PIXELS_PER_STEP, inPlace: fm.IN_PLACE_DISTANCE, autoDivisor: fm.AUTO_SPEED_DIVISOR, buttons: { Edit: four('blender'), Navigate: four('studio') } }
        if (![d.speedFactor, d.turnSteps, d.zoomPx, d.inPlace].every(num) || !d.buttons.Edit.every(num) || !d.buttons.Navigate.every(num)) throw new Error('an expected export is missing')
        return d
    } catch (e) { return { error: String((e && e.message) || e).slice(0, 140) } }
}

module.exports = { ROOT, loadFixture, parsePose, loadDesign }
