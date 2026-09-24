import { useLightingMirror } from '../../rigMirror/useLightingMirror.js'
import '../styles/studio-coach.css'

// The Lights switch can be ON, the desk right there, and still draw NOTHING —
// a desk with zero fixtures patched mirrors an empty room, which reads
// exactly like the switch doing nothing at all (walked, not guessed: pressing
// it "produces no visible change" was the finding). This is the one line that
// tells a person why: the room is not wrong, there is simply nothing patched
// yet to mirror. Reuses StudioCoachMarks' own pill (`.studio-coach`) rather
// than inventing a second hint style — it just isn't a dismiss-once tutorial
// step, so it carries no close button and shows for as long as the state
// that explains it holds.
export default function RigMirrorHint({ on = false, mirror } = {}) {
    const rig = useLightingMirror({ enabled: on, mirror })
    if (!on || !rig.present || rig.fixtures.length > 0) return null
    return (
        <div className="studio-coach" role="status">
            <span className="studio-coach-label">no lights patched yet — add them in Light</span>
        </div>
    )
}
