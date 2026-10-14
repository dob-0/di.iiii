// Models in flight. ModelObject fetches and parses a model outside any three loader, so THREE.DefaultLoadingManager (and drei's
// useProgress, which listens to it) never sees it. The camera's automatic speed (useCameraNavigation autoSpeedFor) waits while a
// model is in flight, so a hall still downloading does not fix the speed from a chair (review 2 of the standard move,
// 2026-10-13). Counted here, apart from DefaultLoadingManager: reporting to it made the V1 editor's drei <Loader/> cover the
// canvas for every model download.
let inFlight = 0

export const modelsLoading = () => inFlight > 0

/** One model's load, from its start to the moment it is in the scene. Returns the end, safe to call more than once. */
export function reportModelLoad() {
    inFlight += 1
    let ended = false
    return () => { if (!ended) { ended = true; inFlight -= 1 } }
}
