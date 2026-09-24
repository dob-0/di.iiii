// THE CUE STRIP — the cues of this project, inside the 3D scene.
//
// The whole control is a row of names. A cue is a named state of the show, and
// the only two things a person needs at the moment of taking one are which one
// it is and where to put a finger. Everything else about a cue — what it
// captures, what light it carries, how long it holds — is the projection
// tool's business, and this deliberately does not repeat it.
//
// It draws nothing when the project has no cues: an empty strip in the control
// cluster would be a permanent row of chrome charging every project for a
// feature most of them never use.
//
// The container and button classes come from whoever hosts it, so the strip
// wears the cluster's chrome on a desktop and the phone bar's on a phone
// rather than introducing a third look.
export default function StudioCueStrip({
    cues = [],
    liveCueId = null,
    onFire,
    className = '',
    buttonClassName = '',
    label = 'Cues'
}) {
    if (!cues.length) return null

    return (
        <div className={className} role="group" aria-label={label}>
            {cues.map((cue, index) => {
                const name = cue.name || `Cue ${index + 1}`
                return (
                    <button
                        key={cue.id}
                        type="button"
                        className={`${buttonClassName}${cue.id === liveCueId ? ' active is-active' : ''}`}
                        onClick={() => onFire?.(cue)}
                        aria-pressed={cue.id === liveCueId}
                        title={cue.key ? `Take ${name} — key ${cue.key}` : `Take ${name}`}
                    >
                        {cue.key ? <span className="scue-key">{cue.key}</span> : null}
                        {name}
                    </button>
                )
            })}
        </div>
    )
}
