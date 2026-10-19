// Models in flight. ModelObject fetches and parses a model outside any three loader, so THREE.DefaultLoadingManager (and drei's
// useProgress, which listens to it) never sees it. The camera's automatic speed (useCameraNavigation autoSpeedFor) waits while a
// model is in flight, so a hall still downloading does not fix the speed from a chair (review 2 of the standard move,
// 2026-10-13). Counted here, apart from DefaultLoadingManager: reporting to it made the V1 editor's drei <Loader/> cover the
// canvas for every model download.
// Since 2026-10-16 the count can be WATCHED (owner: "create loading animation where we will see" — the place's hall came in
// late and nothing said so): ModelLoading.jsx shows "Loading the place · 2 of 5" while a wave of loads runs. A wave starts
// when the first model of an idle room starts and ends when the last one is in the scene.
let inFlight = 0
let waveTotal = 0
let waveDone = 0
const listeners = new Set()
let snapshot = Object.freeze({ loading: 0, done: 0, total: 0 })

const emit = () => {
    snapshot = Object.freeze({ loading: inFlight, done: waveDone, total: waveTotal })
    for (const fn of listeners) fn()
}

export const modelsLoading = () => inFlight > 0

/** The wave now: { loading, done, total } — the same object until the count changes (useSyncExternalStore). */
export const getModelLoadSnapshot = () => snapshot

/** Be told when the count changes. Returns the unsubscribe. */
export function subscribeModelLoads(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
}

/** One model's load, from its start to the moment it is in the scene. Returns the end, safe to call more than once. */
export function reportModelLoad() {
    if (inFlight === 0) { waveTotal = 0; waveDone = 0 }
    inFlight += 1
    waveTotal += 1
    emit()
    let ended = false
    return () => {
        if (ended) return
        ended = true
        inFlight -= 1
        waveDone += 1
        emit()
    }
}
