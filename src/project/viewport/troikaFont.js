// The one font every drei/troika <Text> in a scene must name explicitly.
//
// Left without a `font` prop, troika-three-text resolves glyphs through
// unicode-font-resolver, which fetches its index JSONs AND the actual .woff
// files from cdn.jsdelivr.net at render time — so on a local install with no
// network every 3D label silently painted nothing, while the wiki promised
// the page loads nothing from anywhere else. Inter is already vendored for
// the 2D UI (base.css @font-face); this is the same face as a static-weight
// woff troika can parse. Characters outside latin still fall back to the
// resolver when the network exists, and degrade to the vendored face's
// coverage when it does not.
export const TROIKA_FONT_URL = '/fonts/inter-regular.woff'
