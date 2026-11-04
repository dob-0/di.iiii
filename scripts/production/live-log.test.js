import { describe, it, expect } from 'vitest';
import { collect, render, splice, unsplice, START, END } from './live-log.mjs';

const m = (id, t, text, extra = {}) => ({ key: `-1:${id}`, message_id: id, t, sent: t, sender: 'A', kind: 'text', text, ...extra });

describe('live-log', () => {
    it('keeps the newest save of an edited message and drops joins and stickers', () => {
        const out = collect([m(1, '2026-11-04T08:00:00Z', 'old'), m(1, '2026-11-04T08:01:00Z', 'new'),
            m(2, '2026-11-04T09:00:00Z', '[new_chat_participant]', { kind: 'other' }), m(3, '2026-11-04T07:00:00Z', 'first')]);
        expect(out.map((x) => x.text)).toEqual(['first', 'new']);
    });
    it('escapes text, links urls, groups by local day newest first', () => {
        const html = render([m(1, '2026-11-03T21:00:00Z', 'a <b> https://x.y/z'), m(2, '2026-11-04T08:00:00Z', 'b')], { now: '2026-11-04T09:00:00Z' });
        expect(html).toContain('&lt;b&gt;');
        expect(html).toContain('<a href="https://x.y/z">');
        expect(html.indexOf('5 Nov')).toBeLessThan(html.indexOf('4 Nov')); // 21:00Z = 01:00 +04 next day
    });
    it('splices once, replaces on the next run, and removes cleanly', () => {
        const page = '<main><p class="nav"><a href="#now">Now</a></p><h2>One</h2><p>x</p><h2>Two</h2></main>';
        const a = splice(page, '<section>v1</section>');
        expect(a.indexOf(START)).toBeLessThan(a.indexOf('<h2>Two'));
        expect(a).toContain('href="#live"');
        const b = splice(a, '<section>v2</section>');
        expect(b.split(START).length).toBe(2);
        expect(b).toContain('v2'); expect(b).not.toContain('v1');
        expect(unsplice(b)).toBe(page);
        expect(b.indexOf(END)).toBeGreaterThan(0);
    });
});
