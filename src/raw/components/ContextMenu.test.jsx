import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import ContextMenu from './ContextMenu.jsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const mk = (over = {}) => {
    const run = { a: vi.fn(), b: vi.fn(), c: vi.fn(), sub: vi.fn() };
    const items = [
        { heading: 'Node' },
        { id: 'a', label: 'Enter', kb: 'I', run: run.a },
        { sep: true },
        { id: 'off', label: 'Bypass', disabled: true, run: run.b },
        { id: 'c', label: 'Copy', kb: 'Ctrl+C', run: run.c },
        { id: 'al', label: 'Align', items: [{ id: 's1', label: 'Left', run: run.sub }, { id: 's2', label: 'Top', run: vi.fn() }] },
        { id: 'del', label: 'Delete', kb: 'Del', danger: true, run: vi.fn() },
    ];
    const onClose = vi.fn();
    const ui = (p = {}) => <ContextMenu open x={10} y={10} items={items} onClose={onClose} fromKeyboard {...over} {...p} />;
    return { run, items, onClose, ui };
};
const key = (k) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    act(() => { document.dispatchEvent(e); });
    return e;
};
const active = () => document.activeElement?.textContent;

describe('ContextMenu', () => {
    it('renders role=menu in a portal with menuitems, kb hints and danger class', () => {
        const { ui } = mk();
        const { container } = render(ui());
        expect(container.querySelector('.raw-ctx')).toBeNull();
        expect(screen.getAllByRole('menu')[0].parentElement).toBe(document.body);
        expect(screen.getAllByRole('menuitem')).toHaveLength(5);
        expect(screen.getByText('Ctrl+C').className).toContain('raw-ctx-kb');
        expect(screen.getByText('Delete').closest('button').className).toContain('is-danger');
        expect(screen.getByText('Bypass').closest('button').getAttribute('aria-disabled')).toBe('true');
    });

    it('renders nothing when closed', () => {
        const { ui } = mk();
        render(ui({ open: false }));
        expect(screen.queryByRole('menu')).toBeNull();
    });

    it('clamps near the right and bottom edges by flipping', () => {
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 200, height: 300, top: 0, left: 0, right: 200, bottom: 300 });
        const { ui } = mk();
        render(ui({ x: window.innerWidth - 20, y: window.innerHeight - 20 }));
        const m = screen.getAllByRole('menu')[0];
        expect(parseFloat(m.style.left)).toBe(window.innerWidth - 20 - 200);
        expect(parseFloat(m.style.top)).toBe(window.innerHeight - 20 - 300);
    });

    it('arrow keys skip headings, separators and disabled rows; Home/End', () => {
        const { ui } = mk();
        render(ui());
        expect(active()).toBe('EnterI');
        key('ArrowDown');
        expect(active()).toBe('CopyCtrl+C');
        key('ArrowDown');
        expect(active()).toContain('Align');
        key('ArrowDown');
        expect(active()).toBe('DeleteDel');
        key('ArrowUp');
        expect(active()).toContain('Align');
        key('Home');
        expect(active()).toBe('EnterI');
        key('End');
        expect(active()).toBe('DeleteDel');
    });

    it('Enter runs the item and closes; Space too', () => {
        const { ui, run, onClose } = mk();
        render(ui());
        key('Enter');
        expect(run.a).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
        key('ArrowDown');
        key(' ');
        expect(run.c).toHaveBeenCalledTimes(1);
    });

    it('does not run a disabled row on click', () => {
        const { ui, run, onClose } = mk();
        render(ui());
        fireEvent.click(screen.getByText('Bypass'));
        expect(run.b).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('Escape closes and is preventDefault-ed and stopped', () => {
        const { ui, onClose } = mk();
        render(ui());
        const other = vi.fn();
        window.addEventListener('keydown', other);
        const e = key('Escape');
        window.removeEventListener('keydown', other);
        expect(e.defaultPrevented).toBe(true);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(other).not.toHaveBeenCalled();
    });

    it('closes on pointerdown outside, not inside', () => {
        const { ui, onClose } = mk();
        render(ui());
        fireEvent.pointerDown(screen.getByText('Enter'));
        expect(onClose).not.toHaveBeenCalled();
        fireEvent.pointerDown(document.body);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on window blur and resize', () => {
        const { ui, onClose } = mk();
        render(ui());
        act(() => { window.dispatchEvent(new Event('blur')); });
        act(() => { window.dispatchEvent(new Event('resize')); });
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('opens a submenu with ArrowRight, runs a sub item, ArrowLeft closes it', () => {
        const { ui, run, onClose } = mk();
        render(ui());
        key('ArrowDown');
        key('ArrowDown');
        key('ArrowRight');
        expect(screen.getByText('Left')).toBeTruthy();
        expect(active()).toBe('Left');
        key('ArrowLeft');
        expect(screen.queryByText('Left')).toBeNull();
        key('ArrowRight');
        key('Enter');
        expect(run.sub).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalled();
    });

    it('opens a submenu on hover and closes it when another row is hovered', () => {
        const { ui } = mk();
        render(ui({ fromKeyboard: false }));
        fireEvent.pointerEnter(screen.getByText('Align'));
        expect(screen.getByText('Top')).toBeTruthy();
        fireEvent.pointerEnter(screen.getByText('Copy'));
        expect(screen.queryByText('Top')).toBeNull();
    });

    it('restores focus to the opener on close', () => {
        const { ui } = mk();
        const btn = document.createElement('button');
        document.body.appendChild(btn);
        btn.focus();
        const { rerender } = render(ui());
        expect(active()).toBe('EnterI');
        rerender(ui({ open: false }));
        expect(document.activeElement).toBe(btn);
        btn.remove();
    });
});
