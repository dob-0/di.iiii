// Kept out of AuthGate.jsx on purpose: AuthGate is lazy-loaded so public routes
// (landing, viewer) never pay for MUI + AccountButton. Importing a constant from
// it would eagerly pull that whole chunk into the entry bundle and quietly undo
// the split — so the shared values live here, where there is nothing to load.

// What to do when a session has no scope on the required space.
//   redirect — bounce to the space's public live view. Right for viewer
//              surfaces: a visitor following a shared link wants the work.
//   explain  — say why and offer both doors. Right for editor lanes, where a
//              silent replace()-bounce reads as the app malfunctioning and Back
//              cannot even undo it.
export const OUT_OF_SCOPE_REDIRECT = 'redirect'
export const OUT_OF_SCOPE_EXPLAIN = 'explain'
