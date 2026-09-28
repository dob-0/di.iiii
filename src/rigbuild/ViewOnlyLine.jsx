import { VIEW_ONLY_SENTENCE } from './rigToolAccess.js'

// The one line a read-only rig page carries (rigToolAccess.js): what the page is, and the
// door to changing it. Nothing else on the page says "you cannot" — the controls that
// would write are simply not offered.
export default function ViewOnlyLine() {
    return (
        <p className="rigplot-viewonly rigplot-mono" role="note">
            {VIEW_ONLY_SENTENCE} <a href="/login">Sign in</a>
        </p>
    )
}
