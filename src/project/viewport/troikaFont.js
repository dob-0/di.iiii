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
import { configureTextBuilder } from 'troika-three-text'

export const TROIKA_FONT_URL = '/fonts/inter-regular.woff'

// Characters Inter does not carry — Armenian first of all — go to troika's
// unicode-font-resolver, which fetches its index and font files from
// cdn.jsdelivr.net unless told otherwise. Told otherwise: public/unicode-fonts
// carries the Armenian block and two weights of Noto Sans Armenian, so a
// label in Armenian paints with no internet. Scripts not vendored there still
// reach the CDN when one exists (the resolver falls back on a miss). Must run
// before the first font request, which is why it sits at module level here.
// Absolute on purpose: the resolver fetches from inside a blob worker, where a
// root-relative URL has no base to resolve against and fails to parse.
const UNICODE_FONTS_URL = typeof location !== 'undefined' && location.origin && location.origin !== 'null'
    ? `${location.origin}/unicode-fonts`
    : '/unicode-fonts'
configureTextBuilder({ unicodeFontsURL: UNICODE_FONTS_URL })
