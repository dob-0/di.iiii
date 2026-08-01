// Who sees the director panel. Mirrors src/studio/utils/graphViewFlag.js —
// a flag in its own file so the gate is one grep away, not buried in a render.
//
// The piece itself has no interface on purpose: the audience is mostly not VR
// literate and a 45-second work cannot afford to teach a control scheme. The
// panel is authoring furniture and must never appear in front of a visitor.
//
// `?director` exists because dev-only is not enough in practice: timing has to
// be judged on the actual headset or phone, which runs the deployed build. The
// query param is deliberately not sticky — reload without it and the piece is
// bare again, so a panel can't be left open at an exhibition by accident.
export const DIRECTOR_QUERY_PARAM = 'director'

export const isDirectorEnabled = (search = typeof window === 'undefined' ? '' : window.location.search) => {
    if (import.meta.env.DEV) return true
    try {
        return new URLSearchParams(search).has(DIRECTOR_QUERY_PARAM)
    } catch {
        return false
    }
}
