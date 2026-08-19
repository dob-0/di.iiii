// Studio's node-graph view is a new, unfinished integration — gated to dev
// builds only so it can never reach a real Studio user until the open
// product questions (selection coupling, rollout audience) are actually
// decided. import.meta.env.DEV is false in every production build
// regardless of any runtime/localStorage state, so this is a hard
// off-switch, not just a default.
export const isGraphViewEnabled = () => Boolean(import.meta.env.DEV)
