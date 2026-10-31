// The laser desk's Scenes row: one button per light-desk scene. One press recalls that scene on the LIGHT desk and makes the
// laser look that follows it live on THIS desk, so one scene drives both (the owner, ledger N1530, N1587, N1612: "no scenes and
// not connected lights and laser together"). Pure rules, no DOM and no fetch of its own, so they are tested on their own
// (sceneRow.test.js); desk.js draws the row, reads the two desks and passes the two routes in.
//
// What a press sends, and nothing else:
//   1. POST ../light/api/scenes/recall   { id }    the light desk's own route (the one its page uses for a scene button)
//   2. POST desk/api/go                  { look }  the laser desk's own route (the one a tile's picture click uses), only when a
//                                                  look follows the scene; a scene with no look is lights only
// It never arms a cube, never lifts a Blackout, never touches Master or BPM: those routes are not in this file.
// The link table comes from GET desk/api/follows (`table`: the look each light scene plays, whatever the "Follow light scenes"
// switch says), so the row works with the switch off as well as on.
// Loaded by the page as a plain script (window.DiSceneRow) and by its test as a CommonJS module.
'use strict'
;((root, factory) => {
    const api = factory()
    if (typeof module === 'object' && module.exports) module.exports = api
    else root.DiSceneRow = api
})(typeof window !== 'undefined' ? window : globalThis, () => {
    const LIGHT_API = '../light/api/' // the light desk's routes: a sibling of this page's /laser/
    const RECALL_PATH = 'scenes/recall' // under LIGHT_API
    const GO_PATH = 'desk/api/go' // this desk's own Go
    const POLL_MS = 1000 // the light desk's active scene is asked once a second, never faster than this page's own polls (500 ms and 1 s)
    const LIST_EVERY = 20 // the scene list is read again every 20th poll (a rename, a new scene) and whenever the count changes
    const LIGHT_TIMEOUT_MS = 4000 // a light desk that does not answer is said so; the row never waits on it for good
    const NOTE_MS = 12000 // how long the words about a press stay on the row

    const own = (obj, key) => obj !== null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key)
    const text = (v, fallback = '') => (typeof v === 'string' && v.trim() ? v.trim() : fallback)

    // The buttons, in the order the light desk lists its scenes. `lights`: the scene the light desk has active. `laser`: the
    // look this scene plays is the look on the cubes. `look` is null for a scene no look follows (lights only).
    const sceneItems = ({ scenes = [], activeScene = null, table = {}, liveId = null } = {}) =>
        (Array.isArray(scenes) ? scenes : [])
            .filter((s) => s && typeof s.id === 'string' && s.id)
            .map((s) => {
                const link = own(table, s.id) ? table[s.id] : null
                const lookId = link && typeof link.look === 'string' ? link.look : ''
                const look = lookId ? { id: lookId, name: text(link.name, lookId) } : null
                return {
                    id: s.id,
                    name: text(s.name, s.id),
                    look,
                    lights: activeScene !== null && activeScene !== undefined && s.id === activeScene,
                    laser: Boolean(look && liveId !== null && liveId !== undefined && look.id === liveId)
                }
            })

    const lookLine = (item) => (item.look ? `laser: ${item.look.name}` : 'lights only')
    const titleOf = (item) => (item.look
        ? `Press: the light desk recalls ${item.name} and this desk puts ${item.look.name} on the cubes.`
        : `Press: the light desk recalls ${item.name}. No laser look follows this scene, so the laser stays as it is.`)

    // A refusal in plain words. `r` is { ok:false, status?, error? } as the page's light helper answers.
    const lightWhy = (r) => {
        if (r && r.gone) return 'that scene is not on the light desk any more'
        if (r && r.down) return r.timeout ? 'the light desk did not answer in time' : 'the light desk did not answer'
        if (r && r.error) return `the light desk said "${text(String(r.error)).slice(0, 120)}"`
        if (r && r.status) return `the light desk refused it (${r.status})`
        return 'the light desk refused it'
    }
    const laserWhy = (r) => (r && r.error ? `this desk said "${text(String(r.error)).slice(0, 120)}"` : 'this desk refused it')

    // The words for one press: what happened to the lights and to the laser, each said once. kind 'ok' | 'error'.
    const pressText = ({ scene, link, light, laser, blackout = {} }) => {
        const parts = []
        if (light.ok) {
            parts.push(link ? `${scene.name}: lights recalled.` : `${scene.name}: lights recalled. No laser look follows it.`)
            if (blackout.light) parts.push('The light Blackout is on, so the lights stay dark.')
        } else parts.push(`Lights did not change: ${lightWhy(light)}.`)
        if (link) {
            if (laser && laser.ok) {
                parts.push(`Laser look ${link.name || link.look} is live.`)
                if (blackout.laser) parts.push('The laser Blackout is on, so the cubes stay dark.')
            } else parts.push(`Laser did not change: ${laserWhy(laser)}.`)
        }
        const failed = !light.ok || Boolean(link && !(laser && laser.ok))
        return { text: parts.join(' '), kind: failed ? 'error' : 'ok' }
    }

    // One press. `lightPost(path, body)` posts under LIGHT_API; `goLook(id)` is this desk's Go. Both answer { ok, error?, … } and
    // never throw (a throw is caught here and said as "did not answer"). The lights go first, then the laser; the laser is still
    // sent when the lights were refused, because the person at the desk pressed a scene and may need the look; the words say
    // which part happened. Each route is called once: nothing retries.
    const pressScene = async ({ scene, link, lightPost, goLook, blackout = {} }) => {
        let light
        try { light = await lightPost(RECALL_PATH, { id: scene.id }) } catch { light = { ok: false, down: true } }
        if (!light || typeof light !== 'object') light = { ok: false, down: true }
        let laser = null
        if (link) {
            try { laser = await goLook(link.look) } catch (error) { laser = { ok: false, error: error && error.message } }
        }
        return { light, laser, ...pressText({ scene, link, light, laser, blackout }) }
    }

    return { LIGHT_API, RECALL_PATH, GO_PATH, POLL_MS, LIST_EVERY, LIGHT_TIMEOUT_MS, NOTE_MS, sceneItems, lookLine, titleOf, lightWhy, pressText, pressScene }
})
