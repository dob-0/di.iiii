import { spaceName } from './spaceNames.js'

// Who can see a space, said in words a person reads once. The switch names the
// question ("Anyone with the link can see it"); the line under it says what
// the answer means today. Going public is the one direction that asks first:
// it shows the space to people outside, and a slip of the finger should not.

export const VISIBILITY_SWITCH_LABEL = 'Anyone with the link can see it'

export const visibilityLine = (space) => (space?.isPublic
    ? 'On: anyone with the link can open this space, without signing in.'
    : 'Off: only you and the people you invite can open this space.')

// A private project stays members-only inside a public space (wiki
// "private-projects"), so the question promises no more than that.
export const goPublicQuestion = (space) => ({
    title: `Make “${spaceName(space)}” public?`,
    body: 'Anyone with the link will see this space and every project in it that is not private, without signing in. You can make it private again at any time.',
    confirmLabel: 'Make it public',
    cancelLabel: 'Keep it private'
})
