import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// One right-click menu for the Nodes editor, built per target by the caller
// (di.desk's buildCtx/openCtx shape, with its keys shown on every row).
// items: { id, label, kb?, run, disabled?, danger?, hint? }
//      | { sep: true } | { heading } | { id, label, items: [...] } (one submenu level)
const MARGIN = 8;
const isRow = (it) => Boolean(it) && !it.sep && !it.heading && !it.disabled;

// Next enabled row from `from` in direction `dir`; stays put at the ends.
function nextRow(items, from, dir) {
    for (let i = from + dir; i >= 0 && i < items.length; i += dir) {
        if (isRow(items[i])) return i;
    }
    return from;
}
const lastRow = (items) => nextRow(items, items.length, -1);

function MenuList({ items, activeIndex, setRef, onRowEnter, onRowClick, subOpen, subContent }) {
    return items.map((it, i) => {
        if (it.sep) return <div key={`sep-${i}`} className="raw-ctx-sep" role="separator" />;
        if (it.heading) return <div key={`h-${i}`} className="raw-ctx-heading" role="presentation">{it.heading}</div>;
        const sub = Array.isArray(it.items);
        const cls = ['raw-ctx-item'];
        if (it.danger) cls.push('is-danger');
        if (it.disabled) cls.push('is-disabled');
        if (i === activeIndex) cls.push('is-active');
        return (
            <div key={it.id || `${it.label}-${i}`} className="raw-ctx-row">
                <button
                    type="button"
                    role="menuitem"
                    ref={(el) => setRef(i, el)}
                    className={cls.join(' ')}
                    tabIndex={-1}
                    aria-disabled={it.disabled ? 'true' : undefined}
                    aria-haspopup={sub ? 'menu' : undefined}
                    aria-expanded={sub ? subOpen === i : undefined}
                    title={it.hint || undefined}
                    onPointerEnter={() => onRowEnter(i)}
                    onClick={(e) => { e.stopPropagation(); onRowClick(i); }}
                >
                    <span className="raw-ctx-label">{it.label}</span>
                    {sub ? <span className="raw-ctx-kb" aria-hidden="true">{'▸'}</span>
                        : it.kb ? <span className="raw-ctx-kb">{it.kb}</span> : null}
                </button>
                {sub && subOpen === i ? subContent : null}
            </div>
        );
    });
}

export default function ContextMenu({ open, x = 0, y = 0, items = [], onClose, title, fromKeyboard = false }) {
    const rootRef = useRef(null);
    const subRef = useRef(null);
    const rowRefs = useRef({});
    const subRowRefs = useRef({});
    const returnFocus = useRef(null);
    const [pos, setPos] = useState({ left: x, top: y, maxHeight: null });
    const [active, setActive] = useState(-1);
    const [subOpen, setSubOpen] = useState(-1);
    const [subActive, setSubActive] = useState(-1);
    const [subPos, setSubPos] = useState({ left: 0, top: 0, side: 'right' });
    const live = useRef({});
    useEffect(() => { live.current = { items, active, subOpen, subActive, onClose }; });

    const close = useCallback(() => live.current.onClose?.(), []);

    // Reset and remember focus on open; restore it on close.
    useEffect(() => {
        if (!open) return undefined;
        returnFocus.current = document.activeElement;
        setSubOpen(-1);
        setSubActive(-1);
        setActive(fromKeyboard ? nextRow(live.current.items, -1, 1) : -1);
        return () => {
            const el = returnFocus.current;
            returnFocus.current = null;
            if (el && typeof el.focus === 'function' && document.contains(el)) el.focus();
        };
        // Only the open edge resets; items changing while open must not.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Clamp inside the viewport: flip left/up on overflow, scroll if taller.
    useLayoutEffect(() => {
        if (!open || !rootRef.current) return;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const r = rootRef.current.getBoundingClientRect();
        const maxHeight = vh - MARGIN * 2;
        const h = Math.min(r.height, maxHeight);
        let left = x;
        let top = y;
        if (left + r.width > vw - MARGIN) left = x - r.width;
        if (top + h > vh - MARGIN) top = y - h;
        left = Math.max(MARGIN, Math.min(left, vw - r.width - MARGIN));
        top = Math.max(MARGIN, Math.min(top, vh - h - MARGIN));
        setPos({ left, top, maxHeight });
    }, [open, x, y, items]);

    // The submenu is fixed (the root scrolls, so an absolute child would clip):
    // right of the root unless that leaves the viewport, then left.
    useLayoutEffect(() => {
        if (subOpen < 0 || !subRef.current || !rootRef.current) return;
        const sr = subRef.current.getBoundingClientRect();
        const rr = rootRef.current.getBoundingClientRect();
        const row = rowRefs.current[subOpen]?.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const flip = rr.right + sr.width > vw - MARGIN;
        const left = Math.max(MARGIN, flip ? rr.left - sr.width : rr.right);
        const top = Math.max(MARGIN, Math.min((row ? row.top : rr.top) - 7, vh - sr.height - MARGIN));
        setSubPos({ left, top, side: flip ? 'left' : 'right' });
    }, [subOpen]);

    // Focus follows the active row.
    useEffect(() => {
        if (!open) return;
        const el = subOpen >= 0 && subActive >= 0 ? subRowRefs.current[subActive] : rowRefs.current[active];
        if (el && typeof el.focus === 'function') el.focus();
    }, [open, active, subOpen, subActive]);

    const run = useCallback((item) => {
        if (!isRow(item)) return;
        try { item.run?.(); } finally { close(); }
    }, [close]);

    // Keys, pointer and window dismissal while open.
    useEffect(() => {
        if (!open) return undefined;
        const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
        const onKey = (e) => {
            const s = live.current;
            const inSub = s.subOpen >= 0 && s.subActive >= 0;
            const list = inSub ? s.items[s.subOpen].items : s.items;
            const cur = inSub ? s.subActive : s.active;
            const setCur = inSub ? setSubActive : setActive;
            switch (e.key) {
                case 'Escape': stop(e); close(); break;
                case 'ArrowDown': stop(e); setCur(nextRow(list, cur, 1)); break;
                case 'ArrowUp': stop(e); setCur(cur === -1 ? lastRow(list) : nextRow(list, cur, -1)); break;
                case 'Home': stop(e); setCur(nextRow(list, -1, 1)); break;
                case 'End': stop(e); setCur(lastRow(list)); break;
                case 'ArrowRight': {
                    const it = s.items[s.active];
                    if (!inSub && isRow(it) && Array.isArray(it.items)) {
                        stop(e); setSubOpen(s.active); setSubActive(nextRow(it.items, -1, 1));
                    }
                    break;
                }
                case 'ArrowLeft':
                    if (s.subOpen >= 0) { stop(e); setSubOpen(-1); setSubActive(-1); }
                    break;
                case 'Enter':
                case ' ': {
                    const it = list[cur];
                    if (!isRow(it)) break;
                    stop(e);
                    if (Array.isArray(it.items)) { setSubOpen(cur); setSubActive(nextRow(it.items, -1, 1)); } else run(it);
                    break;
                }
                default:
            }
        };
        const outside = (e) => { if (!rootRef.current?.contains(e.target)) close(); };
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('pointerdown', outside, true);
        window.addEventListener('blur', close);
        window.addEventListener('resize', close);
        window.addEventListener('scroll', outside, true);
        return () => {
            document.removeEventListener('keydown', onKey, true);
            document.removeEventListener('pointerdown', outside, true);
            window.removeEventListener('blur', close);
            window.removeEventListener('resize', close);
            window.removeEventListener('scroll', outside, true);
        };
    }, [open, close, run]);

    if (!open || typeof document === 'undefined') return null;

    const subItems = subOpen >= 0 ? items[subOpen]?.items || [] : [];
    const subContent = subOpen >= 0 ? (
        <div
            ref={subRef}
            className={`raw-ctx raw-ctx-sub is-${subPos.side}`}
            style={{ left: subPos.left, top: subPos.top }}
            role="menu"
            aria-label={items[subOpen]?.label}
        >
            <MenuList
                items={subItems}
                activeIndex={subActive}
                setRef={(i, el) => { subRowRefs.current[i] = el; }}
                onRowEnter={(i) => { if (isRow(subItems[i])) setSubActive(i); }}
                onRowClick={(i) => run(subItems[i])}
                subOpen={-1}
            />
        </div>
    ) : null;

    return createPortal(
        <div
            ref={rootRef}
            className="raw-ctx"
            role="menu"
            tabIndex={-1}
            aria-label={title || 'Menu'}
            style={{ left: pos.left, top: pos.top, maxHeight: pos.maxHeight || undefined }}
            onContextMenu={(e) => e.preventDefault()}
        >
            {title ? <div className="raw-ctx-title" role="presentation">{title}</div> : null}
            <MenuList
                items={items}
                activeIndex={active}
                setRef={(i, el) => { rowRefs.current[i] = el; }}
                onRowEnter={(i) => {
                    if (!isRow(items[i])) return;
                    setActive(i);
                    setSubActive(-1);
                    setSubOpen(Array.isArray(items[i].items) ? i : -1);
                }}
                onRowClick={(i) => {
                    const it = items[i];
                    if (!isRow(it)) return;
                    if (Array.isArray(it.items)) { setActive(i); setSubOpen(i); } else run(it);
                }}
                subOpen={subOpen}
                subContent={subContent}
            />
        </div>,
        document.body,
    );
}
