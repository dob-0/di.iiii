// THE CUE LIST ON THE DESK — the cards page's side of the desk's cue runner
// (serverXR/src/lighting/cuerun.js, docs/architecture/LIGHTING_DESK.md "The cue runner").
// Where a desk is here, the desk keeps the time: the page hands it the document's cues
// and asks it to go, stop or loop, and reads back where it is. The page runs no timer
// of its own then, so two open pages never fire a cue twice and the show keeps looping
// with every page closed. Pure, apart from the fetch calls at the bottom.

import { lightingApiUrl } from '../map/lightingLink.js'

/** The document's cues as the desk's runner takes them. */
export const deskCueList = (cues = []) => cues
    .filter((c) => c && typeof c.lightLook === 'string' && c.lightLook)
    .map((c) => ({ id: c.id, name: c.name || c.lightLook, lookId: c.lightLook, hold: Number(c.hold) || 0, fade: Number(c.fade) || 0 }))

/** The cue GO fires after `current`: past the last, cue 1 while looping, else none (-1). */
export const nextCueIndex = (current, n, loop) => {
    if (!n) return -1
    const next = current + 1
    if (next < n) return next
    return loop ? 0 : -1
}

/** A signature of what the desk would be told, to tell a real change from a re-render. */
export const cueListSignature = (cues) => JSON.stringify(deskCueList(cues))

/** "next in 12 s · loop" — the line under GO while the desk plays the list. */
export const cueClockWords = (desk) => {
    if (!desk) return ''
    const parts = []
    if (desk.running && desk.nextInMs != null) parts.push(`next in ${Math.ceil(desk.nextInMs / 1000)} s`)
    else if (desk.running) parts.push('holds')
    else parts.push('stopped')
    if (desk.loop && desk.autoplay) parts.push('loop')
    if (desk.missing?.length) parts.push(`${desk.missing.length} look${desk.missing.length === 1 ? '' : 's'} not on the desk`)
    return parts.join(' · ')
}

const post = async (route, body) => {
    const res = await fetch(lightingApiUrl(route), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || `the desk answered ${res.status}`)
    return json.cues || null
}

export const deskCues = {
    read: async () => {
        const res = await fetch(lightingApiUrl('api/cues'))
        if (!res.ok) return null
        return (await res.json()).cues || null
    },
    load: (projectId, cues, loop, keepIndex = false) => post('api/cues/load', { project: projectId, list: deskCueList(cues), loop: loop === true, keepIndex }),
    go: (index) => post('api/cues/go', index == null ? {} : { index }),
    back: () => post('api/cues/back'),
    stop: () => post('api/cues/stop'),
    loop: (loop) => post('api/cues/loop', { loop: loop === true })
}
