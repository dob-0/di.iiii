// THE LIVE WALL, the pure half. Owner N3853 / N3855: "we dont want that screen is move; yes scenes work
// but visuals not connected". The room's wall is a box with a still picture on it; a plane entity with
// `components.surface` is the platform's own live screen (liveScreen.js, LiveScreens.jsx). This file says
// WHEN a room view mounts those sources and how a viewer turns the second picture off. No DOM, no three.js.
//
// The switch belongs to the viewer: it lives in this browser's localStorage, never in the document, so an
// operator can turn the second picture off when frames matter (a live source costs one more decode and one
// texture upload per frame, capped by liveScreen.js). Off: the room draws the still picture, as before.

export const LIVE_WALL_KEY = 'di.room.liveWall'

const isScreen = (entity) => entity?.type === 'plane'
    && typeof entity.components?.surface?.surfaceId === 'string'
    && entity.components.surface.surfaceId !== ''

// A screen that is drawn: a hidden entity (runtime.visible false, the `wall-live --mode still` undo) is not one.
export const isDrawnScreen = (entity) => isScreen(entity) && entity.components?.runtime?.visible !== false

export const hasLiveWall = (entities) => Array.isArray(entities) && entities.some(isDrawnScreen)

// The gate. Nothing is mounted and nothing runs unless the room has a drawn screen AND the viewer's switch is on.
export const liveWallMounts = (entities, on) => Boolean(on) && hasLiveWall(entities)

// The entities a room view draws. Switch off: the screens are left out, so the still picture under them shows.
export const entitiesForWall = (entities, on) => (on || !hasLiveWall(entities) ? entities : entities.filter((entity) => !isScreen(entity)))

// Stored as 'off' only: absent, unreadable or anything else is the default, on.
export const readLiveWall = (storage = globalThis.localStorage) => {
    try {
        return storage?.getItem(LIVE_WALL_KEY) !== 'off'
    } catch {
        return true
    }
}

export const writeLiveWall = (on, storage = globalThis.localStorage) => {
    try {
        if (on) storage?.removeItem(LIVE_WALL_KEY)
        else storage?.setItem(LIVE_WALL_KEY, 'off')
    } catch {
        // a private window: the switch still works for this page view
    }
}
