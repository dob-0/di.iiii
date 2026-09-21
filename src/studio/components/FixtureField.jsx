import { useLightingMirror } from '../../rigMirror/useLightingMirror.js'

// THE ONE INSPECTOR FIELD of "a lamp that knows which lamp it is": the fixture's
// index on the lighting desk, and nothing else (never universe/address — those are
// the machine's, see docs/architecture/LIGHTING_DESK.md).
//
// When the desk is running on this machine the field is its own list, `3.Back left`,
// so nobody types a number they have to go and look up. When it is not — every hosted
// di.iiii — it is a plain number, because the number is still the whole truth and a
// project authored on the road is patched later at the venue. Clearing either sends
// `null`, which the schema reads as "no fixture" and drops from the document.

const asIndex = (value) => {
    const index = Number(value)
    return Number.isInteger(index) && index > 0 ? index : null
}

// The desk's own order is patch order; a person looks a lamp up by its number.
const deskChoices = (fixtures = []) => {
    const seen = new Map()
    for (const fixture of fixtures) {
        const index = asIndex(fixture?.index)
        if (index == null || seen.has(index)) continue
        seen.set(index, { index, name: fixture.name || '' })
    }
    return [...seen.values()].sort((a, b) => a.index - b.index)
}

export default function FixtureField({ label = 'Fixture', value, onChange, mirror }) {
    const rig = useLightingMirror({ enabled: true, mirror })
    const index = asIndex(value)
    const choices = rig.present ? deskChoices(rig.fixtures) : []

    if (choices.length) {
        const known = choices.some((choice) => choice.index === index)
        return (
            <div className="insp-field">
                <label className="insp-label">{label}</label>
                <select
                    className="insp-select"
                    aria-label={label}
                    value={index ?? ''}
                    onChange={(e) => onChange?.(asIndex(e.target.value))}
                >
                    <option value="">— none —</option>
                    {choices.map((choice) => (
                        <option key={choice.index} value={choice.index}>{choice.index}.{choice.name}</option>
                    ))}
                    {index != null && !known ? <option value={index}>{index}. not patched</option> : null}
                </select>
            </div>
        )
    }

    return (
        <div className="insp-field">
            <label className="insp-label">{label}</label>
            <input
                type="number"
                className="insp-input"
                aria-label={label}
                inputMode="numeric"
                min={1}
                step={1}
                placeholder="number on the desk"
                value={index ?? ''}
                onChange={(e) => onChange?.(asIndex(e.target.value))}
            />
        </div>
    )
}
