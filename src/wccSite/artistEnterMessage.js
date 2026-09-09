// Guard for the artist-works iframe -> WccExperience postMessage channel.
// Returns the projectId to enter, or null when the message must be ignored.
// The origin check is the security boundary: without it, any embedded or
// window.open'd page could drive WCC navigation by posting the right shape.
export function readArtistEnterMessage(event, expectedOrigin) {
    if (!event || event.origin !== expectedOrigin) return null
    if (event.data?.type !== 'dii-wcc-artist-enter') return null
    return event.data?.projectId || null
}
