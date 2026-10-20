import { useCallback, useEffect, useRef } from 'react';

// A long press is the finger's right-click (touch and pen only: the mouse has a
// real right button). Modelled on the Art-Net desk's bank-list press
// (artnet-desk/desk/ui/app.js): movement or an early lift cancels it, and the
// click that follows the lift is swallowed so the press does not also "tap".
export const LONG_PRESS_MS = 550;
export const LONG_PRESS_MOVE_PX = 10;
export const LONG_PRESS_CLICK_SUPPRESS_MS = 700;

export function useLongPress(onLongPress, { delay = LONG_PRESS_MS, moveTolerance = LONG_PRESS_MOVE_PX } = {}) {
    const timer = useRef(null);
    const start = useRef(null);
    const suppressUntil = useRef(0);
    const cb = useRef(onLongPress);
    useEffect(() => { cb.current = onLongPress; });

    const cancel = useCallback(() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        start.current = null;
    }, []);

    useEffect(() => cancel, [cancel]);

    const onPointerDown = useCallback((e) => {
        if (e.pointerType === 'mouse' || (e.button != null && e.button !== 0)) return;
        cancel();
        const { clientX, clientY, target } = e;
        start.current = { x: clientX, y: clientY };
        timer.current = setTimeout(() => {
            timer.current = null;
            start.current = null;
            suppressUntil.current = Date.now() + LONG_PRESS_CLICK_SUPPRESS_MS;
            cb.current?.({ clientX, clientY, target });
        }, delay);
    }, [cancel, delay]);

    const onPointerMove = useCallback((e) => {
        const s = start.current;
        if (!s) return;
        if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > moveTolerance) cancel();
    }, [cancel, moveTolerance]);

    const onClickCapture = useCallback((e) => {
        if (Date.now() < suppressUntil.current) {
            suppressUntil.current = 0;
            e.preventDefault();
            e.stopPropagation();
        }
    }, []);

    return {
        onPointerDown,
        onPointerMove,
        onPointerUp: cancel,
        onPointerCancel: cancel,
        onScroll: cancel,
        onClickCapture,
    };
}

export default useLongPress;
