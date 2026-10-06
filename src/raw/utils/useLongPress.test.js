import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useLongPress } from './useLongPress.js';

function Probe({ onLongPress, onClick }) {
    const lp = useLongPress(onLongPress);
    return React.createElement('div', { 'data-testid': 't', ...lp },
        React.createElement('button', { onClick }, 'b'));
}
const press = (type = 'touch', x = 50, y = 60) => fireEvent.pointerDown(
    screen.getByTestId('t'),
    { pointerType: type, clientX: x, clientY: y, button: 0 },
);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('useLongPress', () => {
    it('fires after 550 ms for touch with coordinates and target', () => {
        const fn = vi.fn();
        render(React.createElement(Probe, { onLongPress: fn }));
        press('touch');
        vi.advanceTimersByTime(549);
        expect(fn).not.toHaveBeenCalled();
        vi.advanceTimersByTime(2);
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn.mock.calls[0][0]).toMatchObject({ clientX: 50, clientY: 60 });
        expect(fn.mock.calls[0][0].target).toBe(screen.getByTestId('t'));
    });

    it('fires for pen, never for mouse', () => {
        const fn = vi.fn();
        render(React.createElement(Probe, { onLongPress: fn }));
        press('mouse');
        vi.advanceTimersByTime(2000);
        expect(fn).not.toHaveBeenCalled();
        press('pen');
        vi.advanceTimersByTime(600);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('cancels on a move over 10 px but not under', () => {
        const fn = vi.fn();
        render(React.createElement(Probe, { onLongPress: fn }));
        press();
        fireEvent.pointerMove(screen.getByTestId('t'), { clientX: 55, clientY: 63 });
        vi.advanceTimersByTime(600);
        expect(fn).toHaveBeenCalledTimes(1);
        press();
        fireEvent.pointerMove(screen.getByTestId('t'), { clientX: 70, clientY: 60 });
        vi.advanceTimersByTime(600);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('cancels on early pointerup and on scroll', () => {
        const fn = vi.fn();
        render(React.createElement(Probe, { onLongPress: fn }));
        press();
        vi.advanceTimersByTime(300);
        fireEvent.pointerUp(screen.getByTestId('t'));
        vi.advanceTimersByTime(600);
        press();
        fireEvent.scroll(screen.getByTestId('t'));
        vi.advanceTimersByTime(600);
        expect(fn).not.toHaveBeenCalled();
    });

    it('swallows the click after the lift, then lets clicks through', () => {
        const fn = vi.fn();
        const click = vi.fn();
        render(React.createElement(Probe, { onLongPress: fn, onClick: click }));
        press();
        vi.advanceTimersByTime(560);
        fireEvent.pointerUp(screen.getByTestId('t'));
        fireEvent.click(screen.getByText('b'));
        expect(click).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText('b'));
        expect(click).toHaveBeenCalledTimes(1);
    });

    it('the click suppression expires after 700 ms', () => {
        const click = vi.fn();
        render(React.createElement(Probe, { onLongPress: vi.fn(), onClick: click }));
        press();
        vi.advanceTimersByTime(560);
        vi.advanceTimersByTime(701);
        fireEvent.click(screen.getByText('b'));
        expect(click).toHaveBeenCalledTimes(1);
    });
});
