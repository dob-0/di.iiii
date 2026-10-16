import useRememberedOpen from '../utils/rememberedOpen.js'
import { CHIP, PANEL, ACTIVE, INK } from './chromeStyle.js'

// DISPLAY: the view page's rarely-needed switches (layers, Inside / Free, Low / High) behind one small chip in the scene
// bar. Closed at first load; what a viewer opens is remembered for that viewer only (rememberedOpen.js).
// Every item of the menu is one width and sits on one left edge, whatever wraps it (the Move control brings its own wrapper).
// `:not(style)`: the rule's own <style> element is a child of the panel too; `>*` made it display:flex and the CSS text showed in the menu (owner's screenshot 2026-10-15 06:4x).
const ITEM_RULE = '.scene-display>:not(style){display:flex;width:100%;min-width:0}.scene-display button,.scene-display a{width:100%;justify-content:flex-start}.scene-display [role="group"]{flex-direction:column}'
export default function DisplayChip({ children }) {
    const [open, toggle] = useRememberedOpen('display')
    return (
        <div style={{ position: 'relative', flex: '0 0 auto' }}>
            <button type="button" data-testid="display-chip" aria-expanded={open} aria-controls="scene-display" onClick={toggle}
                title="Layers, camera inside the building, light renderer" style={{ ...CHIP, color: open ? ACTIVE : INK }}>
                Display <span aria-hidden="true" style={{ opacity: 0.7 }}>{open ? '▾' : '▸'}</span>
            </button>
            {open ? (
                <div id="scene-display" className="scene-display" data-testid="scene-display" style={{ ...PANEL, left: 0, right: 'auto', width: 'min(14rem, calc(100vw - 2rem))', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 'var(--di-space-1, 3px)', padding: 'var(--di-space-1, 3px)' }}>
                    <style>{ITEM_RULE}</style>
                    {children}
                </div>
            ) : null}
        </div>
    )
}
