// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect, render, splice, unsplice, START, END, HUB_DOWN_MAX_TICKS, classifyFailure } from './live-log.mjs';

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
// A fault of ours (no login, 4xx, no code page) stays exit 1. Measured on the timer's machine on 11-09: 13 failures in 26 min, all 503/530, one outage.
describe('live-log against a hub that answers badly', () => {
    const script = fileURLToPath(new URL('./live-log.mjs', import.meta.url));
    const stateFile = (home) => join(home, '.cache/di/live-log/hub-down-p--1.json');
    const run = async (status, { seed, keepHome, home: given } = {}) => {
        const home = given || mkdtempSync(join(tmpdir(), 'live-log-home-'));
        mkdirSync(join(home, '.config/di'), { recursive: true });
        if (seed !== undefined) { mkdirSync(join(home, '.cache/di/live-log'), { recursive: true }); writeFileSync(stateFile(home), typeof seed === 'string' ? seed : JSON.stringify(seed)); }
        const server = http.createServer((_req, res) => { res.statusCode = status; res.end('x'); });
        await new Promise((r) => server.listen(0, '127.0.0.1', r));
        const base = status === 'refused' ? 'http://127.0.0.1:9' : status === 'dns' ? 'http://no-such-host.invalid' : `http://127.0.0.1:${server.address().port}`;
        writeFileSync(join(home, '.config/di/credentials.json'), JSON.stringify({ dev: { token: 't', base } }));
        const out = await new Promise((resolve) => {
            const c = spawn(process.execPath, [script, '--project', 'p', '--chat', '-1', '--tier', 'dev'], { env: { ...process.env, HOME: home } });
            let err = ''; c.stderr.on('data', (d) => { err += d; }); c.on('close', (code) => resolve({ code, err }));
        });
        server.close();
        if (keepHome) return { ...out, home };
        rmSync(home, { recursive: true, force: true });
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

    // The quiet period is bounded: timer = OnUnitActiveSec=2min, so 15 ticks in a row = about 30 min, then exit 1 with the stamp since when.
    it('the limit is 15 ticks (2-minute timer = 30 minutes)', () => { expect(HUB_DOWN_MAX_TICKS).toBe(15); });
    it('a tick that is hub-down counts in a state file and stays exit 0 below the limit', async () => {
        const r = await run(503, { keepHome: true });
        const st = JSON.parse(readFileSync(stateFile(r.home), 'utf8'));
        rmSync(r.home, { recursive: true, force: true });
        expect(r.code).toBe(0); expect(st.count).toBe(1); expect(Number.isFinite(Date.parse(st.since))).toBe(true);
    });
    it('the 15th hub-down tick in a row exits 1 with one line that says since when', async () => {
        const since = '2026-11-10T04:00:00.000Z';
        const r = await run(503, { seed: { count: HUB_DOWN_MAX_TICKS - 1, since } });
        expect(r.code).toBe(1);
        expect(r.err).toContain(since);
        expect(r.err.trim().split('\n').filter((l) => l.includes('hub-down')).length).toBe(1);
    });
    it('a DNS failure (ENOTFOUND on a dead host) is bounded the same way', async () => {
        expect((await run('dns')).code).toBe(0);
        const r = await run('dns', { seed: { count: HUB_DOWN_MAX_TICKS - 1, since: '2026-11-10T04:00:00.000Z' } });
        expect(r.code).toBe(1); expect(r.err).toContain('2026-11-10T04:00:00.000Z');
    });
    it('a refused connection is bounded the same way', async () => {
        expect((await run('refused', { seed: { count: HUB_DOWN_MAX_TICKS - 1, since: '2026-11-10T04:00:00.000Z' } })).code).toBe(1);
    });
    for (const [label, seed] of [['a string count', { count: 'abc', since: 'x' }], ['an object count', { count: { x: 1 }, since: 5 }], ['a negative count', { count: -50 }],
        ['a NaN-like count', { count: null }], ['a non-JSON file', '{{{not json'], ['a JSON array', '[1,2]'], ['an empty file', '']]) {
        it(`${label} in the state file neither crashes nor silences: counts from 0, exit 0`, async () => {
            const r = await run(503, { seed, keepHome: true });
            const st = JSON.parse(readFileSync(stateFile(r.home), 'utf8'));
            rmSync(r.home, { recursive: true, force: true });
            expect(r.code).toBe(0); expect(st.count).toBe(1); expect(Number.isFinite(Date.parse(st.since))).toBe(true);
        });
    }
    it('a huge count in the state file is loud at once, not silent', async () => {
        expect((await run(503, { seed: { count: 1e9, since: '2026-11-10T04:00:00.000Z' } })).code).toBe(1);
    });
    it('a success resets the count (the state file is gone)', async () => {
        const home = mkdtempSync(join(tmpdir(), 'live-log-ok-'));
        mkdirSync(join(home, '.config/di'), { recursive: true }); mkdirSync(join(home, '.cache/di/live-log'), { recursive: true });
        writeFileSync(stateFile(home), JSON.stringify({ count: 14, since: '2026-11-10T04:00:00.000Z' }));
        const doc = { presentationState: { codeFiles: [{ name: 'index.html', content: `<main>${START}\n<section>x</section>\n${END}</main>` }] } };
        const server = http.createServer((_q, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ document: doc })); });
        await new Promise((r) => server.listen(0, '127.0.0.1', r));
        writeFileSync(join(home, '.config/di/credentials.json'), JSON.stringify({ dev: { token: 't', base: `http://127.0.0.1:${server.address().port}` } }));
        const inbox = join(home, 'inbox'); mkdirSync(inbox);
        const out = await new Promise((resolve) => {
            const c = spawn(process.execPath, [script, '--project', 'p', '--chat', '-1', '--tier', 'dev', '--inbox', inbox], { env: { ...process.env, HOME: home } });
            let err = ''; c.stderr.on('data', (d) => { err += d; }); c.on('close', (code) => resolve({ code, err }));
        });
        server.close();
        const gone = !existsSync(stateFile(home)); rmSync(home, { recursive: true, force: true });
        expect(out.code).toBe(0); expect(gone).toBe(true);
    });
    it('an unwritable state place is loud (exit 1), never an endless quiet', async () => {
        const home = mkdtempSync(join(tmpdir(), 'live-log-ro-'));
        mkdirSync(join(home, '.cache/di'), { recursive: true }); writeFileSync(join(home, '.cache/di/live-log'), 'a file where a folder should be');
        const r = await run(503, { home });
        rmSync(home, { recursive: true, force: true });
        expect(r.code).toBe(1); expect(r.err).toContain('state');
    });
});

// Every code and status has one class. hub-down = the hub or the network is away (retry, bounded); failure = ours (exit 1 at once).
// The classifier reads only the status. A thrown network error has no status and is hub-down by that rule (hubFetch catches every thrown error);
// the rows with a code say so: the code is not read, an unknown code gives the same answer.
describe('classifyFailure: the class of every status and of "no status"', () => {
    const table = [
        [{ status: 429 }, 'hub-down'], [{ status: 502 }, 'hub-down'], [{ status: 503 }, 'hub-down'], [{ status: 504 }, 'hub-down'], [{ status: 530 }, 'hub-down'],
        [{ status: 521 }, 'hub-down'], [{ status: 522 }, 'hub-down'], [{ status: 523 }, 'hub-down'], [{ status: 524 }, 'hub-down'],
        [{ status: 401 }, 'failure'], [{ status: 403 }, 'failure'], [{ status: 404 }, 'failure'], [{ status: 500 }, 'failure'], [{ status: 400 }, 'failure'],
        [{ code: 'ENOTFOUND' }, 'hub-down'], [{ code: 'NOT_A_REAL_CODE' }, 'hub-down'], [{ code: 'EAI_AGAIN' }, 'hub-down'], [{ code: 'ECONNREFUSED' }, 'hub-down'], [{ code: 'ECONNRESET' }, 'hub-down'],
        [{ code: 'ETIMEDOUT' }, 'hub-down'], [{ code: 'UND_ERR_CONNECT_TIMEOUT' }, 'hub-down'], [{ code: 'ENETUNREACH' }, 'hub-down'], [{ code: undefined }, 'hub-down'],
    ];
    for (const [input, cls] of table) it(`${input.status === undefined ? `no status (code ${input.code} is not read)` : `status ${input.status}`} -> ${cls}`, () => { expect(classifyFailure(input)).toBe(cls); });
});

// Finding rr-hubdown 1-3: the state after every kind of tick. A run that reached the hub clears the count; --dry-run never writes state.
describe('live-log: the hub-down count after each kind of run (process tests)', () => {
    const script = fileURLToPath(new URL('./live-log.mjs', import.meta.url));
    const stateFile = (home) => join(home, '.cache/di/live-log/hub-down-p--1.json');
    const current = `<main>${START}\n${render([], {})}\n${END}</main>`; // what the script itself would write for an empty inbox
    // doc: the code files the hub returns; status: what the hub answers (200 = the doc); extra: more arguments; inbox: false = a path that does not exist
    const go = async ({ seed, doc = { presentationState: { codeFiles: [{ name: 'index.html', content: current }] } }, status = 200, putStatus = 200, extra = [], inbox = true }) => {
        const home = mkdtempSync(join(tmpdir(), 'live-log-st-'));
        mkdirSync(join(home, '.config/di'), { recursive: true }); mkdirSync(join(home, '.cache/di/live-log'), { recursive: true });
        if (seed !== undefined) writeFileSync(stateFile(home), JSON.stringify(seed));
        const server = http.createServer((q, res) => { res.statusCode = q.method === 'PUT' ? putStatus : status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ document: doc })); });
        await new Promise((r) => server.listen(0, '127.0.0.1', r));
        writeFileSync(join(home, '.config/di/credentials.json'), JSON.stringify({ dev: { token: 't', base: `http://127.0.0.1:${server.address().port}` } }));
        const ib = join(home, 'inbox'); if (inbox) mkdirSync(ib);
        const out = await new Promise((resolve) => {
            const c = spawn(process.execPath, [script, '--project', 'p', '--chat', '-1', '--tier', 'dev', '--inbox', ib, ...extra], { env: { ...process.env, HOME: home } });
            let o = ''; let err = ''; c.stdout.on('data', (d) => { o += d; }); c.stderr.on('data', (d) => { err += d; }); c.on('close', (code) => resolve({ code, out: o, err }));
        });
        server.close();
        const state = existsSync(stateFile(home)) ? JSON.parse(readFileSync(stateFile(home), 'utf8')) : null;
        rmSync(home, { recursive: true, force: true });
        return { ...out, state };
    };
    const seed10 = { count: 10, since: '2026-11-10T04:00:00.000Z' };
    it('the page is already current: prints unchanged and the count is cleared', async () => {
        const r = await go({ seed: seed10 });
        expect(r.code).toBe(0); expect(r.out).toContain('unchanged'); expect(r.state).toBeNull();
    });
    it('no code page (exit 1): the hub was reached, the count is cleared', async () => {
        const r = await go({ seed: seed10, doc: { presentationState: { codeFiles: [] } } });
        expect(r.code).toBe(1); expect(r.err).toContain('no code page'); expect(r.state).toBeNull();
    });
    it('inbox unreadable (exit 3): the hub was reached, the count is cleared', async () => {
        const r = await go({ seed: seed10, inbox: false });
        expect(r.code).toBe(3); expect(r.state).toBeNull();
    });
    it('--dry-run on a current page never clears the count', async () => {
        const r = await go({ seed: seed10, extra: ['--dry-run'] });
        expect(r.code).toBe(0); expect(r.state).toEqual(seed10);
    });
    it('--dry-run against a hub that is down never writes the count', async () => {
        const r = await go({ seed: seed10, status: 503, extra: ['--dry-run'] });
        expect(r.code).toBe(0); expect(r.state).toEqual(seed10);
    });
    it('--dry-run with no state file never creates one', async () => {
        const r = await go({ status: 503, extra: ['--dry-run'] });
        expect(r.code).toBe(0); expect(r.state).toBeNull();
    });
    it('a garbage since is not printed: the loud line carries a real date', async () => {
        const r = await go({ seed: { count: 14, since: 'not a date <x>' }, status: 503 });
        expect(r.code).toBe(1); expect(r.err).not.toContain('not a date');
        expect(Number.isFinite(Date.parse(r.err.match(/since (\S+) /)[1]))).toBe(true);
        expect(r.state.since).not.toBe('not a date <x>');
    });
    it('a float count is floored: 13.5 is 13, the tick makes 14', async () => {
        const r = await go({ seed: { count: 13.5, since: '2026-11-10T04:00:00.000Z' }, status: 503 });
        expect(r.code).toBe(0); expect(r.state.count).toBe(14);
    });
    // Decision (round f3): the hub is DOWN when there is no answer or the answer is in HUB_DOWN_STATUS; any other answer (401, 403, 404, 500 ...) means the hub
    // is UP and refuses us: a fault of ours, exit 1, and the count of hub-down ticks in a row is over, so it is cleared.
    for (const st of [401, 403, 404, 500]) {
        it(`first GET answers ${st}: the hub is up and refuses, exit 1, the count is cleared`, async () => {
            const r = await go({ seed: seed10, status: st });
            expect(r.code).toBe(1); expect(r.err).toContain('GET'); expect(r.err).not.toContain('hub-down'); expect(r.state).toBeNull();
        });
    }
    it('first GET answers 503: still hub-down, the count goes on', async () => {
        const r = await go({ seed: seed10, status: 503 });
        expect(r.code).toBe(0); expect(r.state.count).toBe(11);
    });
    it('the hub answered, then a step throws (page has no place): exit 1, the count is cleared', async () => {
        const r = await go({ seed: seed10, doc: { presentationState: { codeFiles: [{ name: 'index.html', content: '<p>no main here</p>' }] } } });
        expect(r.code).toBe(1); expect(r.err).toContain('no place'); expect(r.state).toBeNull();
    });
    it('PUT answers 500: the hub is up and refuses, exit 1, the count is cleared', async () => {
        const r = await go({ seed: seed10, doc: { presentationState: { codeFiles: [{ name: 'index.html', content: '<main></main>' }] } }, putStatus: 500 });
        expect(r.code).toBe(1); expect(r.err).toContain('PUT -> 500'); expect(r.state).toBeNull();
    });
    it('GET fine but PUT is hub-down tick after tick: the count still grows and the 15th tick fails', async () => {
        const doc = { presentationState: { codeFiles: [{ name: 'index.html', content: '<main></main>' }] } };
        const r = await go({ seed: { count: 14, since: '2026-11-10T04:00:00.000Z' }, doc, putStatus: 503 });
        expect(r.code).toBe(1); expect(r.err).toContain('hub-down since'); expect(r.state.count).toBe(15);
    });
    it('--dry-run, hub down, stored 15: the line says "would be 16", not stored; the file stays 15', async () => {
        const seed15 = { count: 15, since: '2026-11-10T04:00:00.000Z' };
        const r = await go({ seed: seed15, status: 503, extra: ['--dry-run'] });
        expect(r.code).toBe(1); expect(r.err).toContain('would be 16'); expect(r.err).toContain('not stored'); expect(r.state).toEqual(seed15);
    });
    it('--dry-run, hub down, below the limit: the line says "would be", not stored', async () => {
        const r = await go({ seed: seed10, status: 503, extra: ['--dry-run'] });
        expect(r.code).toBe(0); expect(r.err).toContain('would be 11 of 15'); expect(r.err).toContain('not stored'); expect(r.state).toEqual(seed10);
    });
    it('a real run says the plain count (no "would be")', async () => {
        const r = await go({ seed: seed10, status: 503 });
        expect(r.err).toContain('(11 of 15 ticks)'); expect(r.err).not.toContain('would be');
    });
});
