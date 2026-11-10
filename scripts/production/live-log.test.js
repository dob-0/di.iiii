// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

// The timer runs this every 2 min. A hub that is down (5xx, Cloudflare 530, no network) is the hub's state: logged, exit 0, the next tick retries.
// A fault of ours (no login, 4xx, no code page) stays exit 1. Measured on aylmo 11-09: 13 failures in 26 min, all 503/530, one outage.
describe('live-log against a hub that answers badly', () => {
    const script = fileURLToPath(new URL('./live-log.mjs', import.meta.url));
    const run = async (status) => {
        const home = mkdtempSync(join(tmpdir(), 'live-log-home-'));
        mkdirSync(join(home, '.config/di'), { recursive: true });
        const server = http.createServer((_req, res) => { res.statusCode = status; res.end('x'); });
        await new Promise((r) => server.listen(0, '127.0.0.1', r));
        const base = status === 'refused' ? 'http://127.0.0.1:9' : `http://127.0.0.1:${server.address().port}`;
        writeFileSync(join(home, '.config/di/credentials.json'), JSON.stringify({ dev: { token: 't', base } }));
        const out = await new Promise((resolve) => {
            const c = spawn(process.execPath, [script, '--project', 'p', '--chat', '-1', '--tier', 'dev'], { env: { ...process.env, HOME: home } });
            let err = ''; c.stderr.on('data', (d) => { err += d; }); c.on('close', (code) => resolve({ code, err }));
        });
        server.close(); rmSync(home, { recursive: true, force: true });
        return out;
    };
    for (const status of [502, 503, 504, 530, 429]) {
        it(`HTTP ${status} is hub-down: exit 0 and says so`, async () => {
            const r = await run(status);
            expect(r.err).toContain('hub-down');
            expect(r.code).toBe(0);
        });
    }
    it('connection refused is hub-down: exit 0', async () => { const r = await run('refused'); expect(r.err).toContain('hub-down'); expect(r.code).toBe(0); });
    for (const status of [401, 403, 404, 500]) {
        it(`HTTP ${status} stays a failure: exit 1`, async () => { expect((await run(status)).code).toBe(1); });
    }
});
