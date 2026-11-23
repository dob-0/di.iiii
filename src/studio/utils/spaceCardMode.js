// How a space card with no cover picture is drawn on /spaces.
//
//   still (default) — a calm still with the space's name; the 3D opens in one
//                     step, by pressing the picture (SpaceCardLive).
//   live            — the earlier behaviour: each card boots a hidden copy of
//                     the whole app to take its own picture (336 requests,
//                     2 MB on /spaces, UX audit F136). Kept as a mode:
//                     `?previews=live` on /spaces, or
//                     localStorage['dii:space-card-previews'] = 'live'.
export const SPACE_CARD_PREVIEWS_KEY = 'dii:space-card-previews'

export const spaceCardPreviewMode = (win = typeof window !== 'undefined' ? window : null) => {
    try {
        if (new URLSearchParams(win?.location?.search || '').get('previews') === 'live') return 'live'
        if (win?.localStorage?.getItem(SPACE_CARD_PREVIEWS_KEY) === 'live') return 'live'
    } catch { /* storage may be blocked; the default is the safe answer */ }
    return 'still'
}
