// A sandboxed srcdoc iframe (see snapshotEntry.jsx, and
// scripts/wcc-page-snapshot.mjs) has an opaque origin, and
// history.pushState/replaceState throw a SecurityError for ANY url there —
// even one that round-trips to the same nominal path — because there is no
// concrete origin left to compare it against. The deep link is the only part
// of a route-section change that cannot exist in that context; the caller's
// own state update must still go through. Same tradeoff
// presentationPreviewDocument.js already makes for localStorage.
export const safeHistoryCall = (fn) => {
    try {
        fn()
        return true
    } catch {
        return false
    }
}
