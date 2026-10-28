// The address a visitor reaches a space by: its slug when it has one (/dilijan-camp), else its id. Every link a visitor
// sees to a space uses it, so a space that moved shows its new address everywhere (owner 2026-10-25: "keep only this").
// The id still opens the space, so an old link keeps working. Pure.
export const spaceAddressOf = (space, spaceId = space?.id) => (
    typeof space?.slug === 'string' && space.slug.trim() ? space.slug.trim() : spaceId
)
