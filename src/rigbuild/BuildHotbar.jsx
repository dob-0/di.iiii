// THE HOTBAR STRIP — the nine-or-ten slots at the bottom, the same markup for the rig
// Build surface (/build) and the Studio's Walk. One component, never a copy.
// The slots come from hotbar.js (hotbarSlots + arrangeSlots); the strip only draws them.
import './build.css'

export default function BuildHotbar({ slots, index, onPick }) {
    return (
        <ol className="rigbuild-hotbar" aria-label="Hotbar">
            {slots.map((s, i) => (
                <li key={s.id}>
                    <button
                        type="button"
                        className={`rigbuild-slot${i === index ? ' is-on' : ''}${s.full ? ' is-full' : ''}${s.modeOwed ? ' is-owed' : ''}`}
                        aria-pressed={i === index}
                        onClick={() => onPick(i)}
                    >
                        {s.key ? <span className="rigbuild-slot__key">{s.key}</span> : null}
                        <span className="rigbuild-slot__label rigplot-mono">{s.label}</span>
                        <span className="rigbuild-slot__count rigplot-mono">{s.ordered != null ? `${s.placed} / ${s.ordered}` : s.words}</span>
                    </button>
                </li>
            ))}
        </ol>
    )
}
