import { useEffect, useRef, useSyncExternalStore } from 'react'
import { getSharedLightingMirror } from './useLightingMirror.js'

// A LAMP THAT KNOWS WHICH LAMP IT IS. Step 3 of "one project is one stage"
// (di-atlas/decisions/2026-09-20-one-project-one-stage.md).
//
// An object with `components.fixture = { index }` is joined to the fixture with that
// index on the lighting desk. While the desk is here, what that fixture is emitting
// RIGHT NOW replaces what the object was authored to emit: the desk's colour instead
// of the authored colour, the desk's level scaling the authored intensity. When the
// desk is absent — every hosted di.iiii, and a local one whose desk was never opened —
// the authored values show, byte for byte, and nothing here touches the network.
//
// The authored intensity is kept as the lamp's REACH at full: three.js intensities are
// not percentages (a spot at 2, a point at 1, a directional at 1.5 all mean "as bright
// as this room needs"), so a fixture at 100% shows the authored lamp and the dimmer
// scales it down from there. The authored colour is replaced outright — a desk that
// says amber means amber.
//
// The document is never written. What the desk says is a view, held in the store
// (useLightingMirror.js) and read here; the op log carries only the join.

const NOTHING = null
const DARK_COLOUR = '#5c6166' // the same "lamps are here and off" grey as the markers

export const fixtureIndexOf = (entity) => {
    const index = Number(entity?.components?.fixture?.index)
    return Number.isInteger(index) && index > 0 ? index : null
}

// A fixture index is not enforced unique on the desk (LIGHTING_SHOW_PORTABILITY.md §3):
// the first patched fixture with the index wins, and the desk's own list order decides.
export const fixtureByIndex = (fixtures, index) => {
    if (index == null || !Array.isArray(fixtures)) return NOTHING
    return fixtures.find((fixture) => Number(fixture?.index) === index) || NOTHING
}

const toHex = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')

// The colour the desk is emitting, at full — `colour` arrives already dimmed, so the
// level is divided back out, the same way the markers do it. A fixture giving out
// nothing has no hue to show; it takes the neutral grey and a zero intensity.
export const liveLight = (light, fixture) => {
    const authored = light && typeof light === 'object' ? light : {}
    if (!fixture) return authored
    const level = Math.max(0, Math.min(1, Number(fixture.level) || 0))
    const { r = 0, g = 0, b = 0 } = fixture.colour || {}
    const peak = Math.max(r, g, b)
    const dark = level <= 0.004 || peak <= 0
    const color = dark ? DARK_COLOUR : `#${toHex((r / peak) * 255)}${toHex((g / peak) * 255)}${toHex((b / peak) * 255)}`
    const authoredIntensity = Number.isFinite(Number(authored.intensity)) ? Number(authored.intensity) : 1
    return { ...authored, color, intensity: dark ? 0 : authoredIntensity * level }
}

// The object as the room should draw it: itself when the desk is absent or it has no
// fixture, otherwise itself with its light replaced by what the desk says.
export const liveLightEntity = (entity, fixture) => {
    if (!fixture || !entity) return entity
    return {
        ...entity,
        components: { ...entity.components, light: liveLight(entity.components?.light, fixture) }
    }
}

const signatureOf = (fixture) => (fixture ? `${fixture.colour?.r},${fixture.colour?.g},${fixture.colour?.b},${fixture.level}` : '')

// One fixture, selected out of the store's snapshot. Re-renders the caller only when
// THAT fixture's colour or level changes, not on every 10 Hz frame of the whole rig;
// and watches the store only while there is an index to follow, so an object with no
// fixture never starts the poll.
export function useLiveFixture(index, { mirror } = {}) {
    const store = mirror || getSharedLightingMirror()
    const cache = useRef({ signature: '', fixture: NOTHING })
    const select = () => {
        const snapshot = store.getSnapshot()
        const fixture = snapshot.present ? fixtureByIndex(snapshot.fixtures, index) : NOTHING
        const signature = signatureOf(fixture)
        if (signature !== cache.current.signature) cache.current = { signature, fixture }
        return cache.current.fixture
    }
    const fixture = useSyncExternalStore(store.subscribe, select, select)
    useEffect(() => { if (index != null) store.probe() }, [index, store])
    useEffect(() => (index != null ? store.watch() : undefined), [index, store])
    return fixture
}

export function useLiveLightEntity(entity, { mirror } = {}) {
    const fixture = useLiveFixture(fixtureIndexOf(entity), { mirror })
    return liveLightEntity(entity, fixture)
}

export default useLiveLightEntity
