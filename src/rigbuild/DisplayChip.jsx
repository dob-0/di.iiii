import useRememberedOpen from '../utils/rememberedOpen.js'
import { CHIP, PANEL, ACTIVE, INK } from './chromeStyle.js'

// DISPLAY: the view page's rarely-needed switches (layers, Inside / Free, Low / High) behind one small chip in the scene
// bar. Closed at first load; what a viewer opens is remembered for that viewer only (rememberedOpen.js).
export default function DisplayChip({ children }) {
    const [open, toggle] = useRememberedOpen('display')
    return (
        <div style={{ position: 'relative', flex: '0 0 auto' }}>
            <button type="button" data-testid="display-chip" aria-expanded={open} aria-controls="scene-display" onClick={toggle}
                title="Layers, camera inside the building, light renderer" style={{ ...CHIP, color: open ? ACTIVE : INK }}>
                Display <span aria-hidden="true" style={{ opacity: 0.7 }}>{open ? '▾' : '▸'}</span>
            </button>
            {open ? (
                <div id="scene-display" style={{ ...PANEL, left: 'auto', right: 0, minWidth: 'min(14rem, calc(100vw - 2rem))', display: 'flex', flexDirection: 'column', gap: 'var(--di-space-2, 7px)', padding: 'var(--di-space-2, 7px)' }}>
                    {children}
                </div>
            ) : null}
        </div>
    )
}
