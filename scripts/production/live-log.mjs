#!/usr/bin/env node
/**
 * live-log.mjs — a production page that follows its group chat by itself (owner 2026-11-04, ledger N2121:
 * "we need real time tracking of the project").
 *
 * What it does, each run:
 *   1. reads every message di.bo saved for ONE Telegram group (inbox <day>/groups/<chat>/messages.jsonl, all days),
 *      keeps the newest copy of each message (an edit replaces the first save; key = chat:message_id);
 *   2. renders them as one section — newest day first, each line: local time, sender, text; photos and
 *      videos as small pictures (photo: shrunk; video: one frame), other files by name;
 *   3. puts that section into the project's page (presentation code file index.html) between
 *      <!--live:start--> and <!--live:end--> (added after the first section on the first run, with a nav link);
 *   4. writes the page to the install (dev by default) through the API with the stored login
 *      (~/.config/di/credentials.json; token never printed) — only when the section changed.
 *
 * The page stays private when its space is private; the section is marked PRIVATE.
 *
 *   node scripts/production/live-log.mjs --project what-we-have --chat -1004449920523 [--tier dev] [--dry-run [--out file.html]]
 *        [--inbox /mnt/data/footage/inbox] [--tz Asia/Yerevan] [--title "The group, live"]
 *
 * Exit: 0 written or unchanged · 1 install refused · 2 usage · 3 inbox unreadable.
 * Undo: the section sits between its two markers; `--remove` takes it (and the nav link) out again.
 */
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const START = '<!--live:start-->';
export const END = '<!--live:end-->';
const NAV = '<a href="#live">Live</a>';

export function esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

/** newest save of each message wins (an edit is saved again under the same key) */
export function collect(lines) {
    const byKey = new Map();
    for (const m of lines) {
        if (!m || !m.key) continue;
        const prev = byKey.get(m.key);
        if (!prev || String(m.t) >= String(prev.t)) byKey.set(m.key, m);
    }
    return [...byKey.values()]
        .filter((m) => m.kind !== 'other' && m.kind !== 'sticker')
        .sort((a, b) => String(a.sent).localeCompare(String(b.sent)) || (a.message_id - b.message_id));
}

function localParts(iso, tz) {
    const d = new Date(iso);
    const f = (o) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...o }).format(d);
    return { day: f({ year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-'),
        dayLabel: f({ weekday: 'short', day: 'numeric', month: 'short' }), time: f({ hour: '2-digit', minute: '2-digit', hour12: false }) };
}

/** pictures: { [file name]: data URI } — made by the caller; render stays pure */
export function render(messages, { tz = 'Asia/Yerevan', pictures = {}, title = 'The group, live', now = new Date().toISOString() } = {}) {
    const days = new Map();
    for (const m of messages) {
        const p = localParts(m.sent, tz);
        if (!days.has(p.day)) days.set(p.day, { label: p.dayLabel, items: [] });
        days.get(p.day).items.push({ m, time: p.time });
    }
    const last = messages.length ? localParts(messages[messages.length - 1].sent, tz) : null;
    const out = [
        `<section id="live"><style>ul.live li{overflow-wrap:anywhere}ul.live img{display:block;margin-top:6px}</style><h2>${esc(title)} <span class="tag priv">PRIVATE</span></h2>`,
        `<p class="mut">Follows the ReA group by itself (di.bo saves it, live-log.mjs writes it here). ${messages.length} messages; `
            + `last ${last ? esc(`${last.dayLabel} ${last.time}`) : '—'}; written ${esc(localParts(now, tz).dayLabel + ' ' + localParts(now, tz).time)}. Newest day first.</p>`,
    ];
    for (const [, d] of [...days.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
        out.push(`<h3>${esc(d.label)} · ${d.items.length}</h3><ul class="live">`);
        for (const { m, time } of d.items) {
            const file = m.file?.name;
            const pic = file && pictures[file];
            const text = m.text ? esc(m.text).replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>') : '';
            const media = pic ? `<br><img src="${pic}" alt="${esc(m.kind)} ${esc(file)}" loading="lazy" style="max-width:100%;max-height:${m.kind === 'photo' && m.text && m.text.length > 200 ? 900 : 260}px">`
                : file ? ` <span class="mut">[${esc(m.kind)}: ${esc(file)}]</span>` : '';
            const edit = m.kind && m.edited ? ' <span class="mut">(edited)</span>' : '';
            out.push(`<li><span class="mut">${esc(time)}</span> <b>${esc(m.sender)}</b>${edit} ${text}${media}</li>`);
        }
        out.push('</ul>');
    }
    out.push('</section>');
    return out.join('\n');
}

/** put the section between the markers; first time: after the first </section> or before the 2nd <h2> */
export function splice(page, section) {
    const block = `${START}\n${section}\n${END}`;
    let html;
    if (page.includes(START) && page.includes(END)) {
        html = page.slice(0, page.indexOf(START)) + block + page.slice(page.indexOf(END) + END.length);
    } else {
        const h2s = [...page.matchAll(/<h2[\s>]/g)];
        const at = h2s.length > 1 ? h2s[1].index : page.lastIndexOf('</main>');
        if (at < 0) throw new Error('page has no place for the live section');
        html = page.slice(0, at) + block + '\n' + page.slice(at);
    }
    if (!html.includes(NAV)) html = html.replace(/(<(?:p|div|nav)[^>]*class="nav"[^>]*>)/, `$1${NAV}`);
    return html;
}

export function unsplice(page) {
    if (!page.includes(START)) return page;
    return (page.slice(0, page.indexOf(START)) + page.slice(page.indexOf(END) + END.length).replace(/^\n/, '')).replace(NAV, '');
}

function args(argv) {
    const a = { tier: 'dev', inbox: process.env.DIBO_INBOX_ROOT || '/mnt/data/footage/inbox', tz: 'Asia/Yerevan', title: 'The group, live' };
    for (let i = 0; i < argv.length; i++) {
        const k = argv[i];
        if (k === '--dry-run') a.dryRun = true; else if (k === '--remove') a.remove = true;
        else if (k.startsWith('--')) a[k.slice(2)] = argv[++i];
    }
    return a;
}

function readInbox(root, chat) {
    if (!existsSync(root)) { console.error(`live-log: inbox ${root} unreadable`); process.exit(3); }
    const lines = []; const dirOf = {};
    for (const day of readdirSync(root).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()) {
        const dir = join(root, day, 'groups', String(chat));
        const f = join(dir, 'messages.jsonl');
        if (!existsSync(f)) continue;
        for (const l of readFileSync(f, 'utf8').split('\n')) {
            if (!l.trim()) continue;
            try { const m = JSON.parse(l); lines.push(m); if (m.file?.name) dirOf[m.file.name] = dir; } catch { /* a half-written last line: next run */ }
        }
    }
    return { lines, dirOf };
}

/** small JPEG thumbnails, cached by file name; the stage plan (long caption) stays readable */
function makePictures(messages, dirOf, cacheDir) {
    mkdirSync(cacheDir, { recursive: true });
    const pics = {};
    for (const m of messages) {
        const name = m.file?.name; if (!name || !dirOf[name]) continue;
        if (!['photo', 'video', 'video_note'].includes(m.kind) && !/\.(jpe?g|png|mov|mp4)$/i.test(name)) continue;
        const big = m.kind === 'photo' && m.text && m.text.length > 200;
        const out = join(cacheDir, `${name}.${big ? 'big' : 'sm'}.jpg`);
        const src = join(dirOf[name], name);
        try {
            if (!existsSync(out)) {
                if (/\.(mov|mp4)$/i.test(name) || m.kind.startsWith('video')) {
                    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '1', '-i', src, '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '6', out], { stdio: 'ignore', timeout: 60000 });
                } else {
                    execFileSync('magick', [src, '-auto-orient', '-resize', big ? '1400x1400>' : '420x420>', '-quality', big ? '82' : '68', out], { stdio: 'ignore', timeout: 60000 });
                }
            }
            pics[name] = 'data:image/jpeg;base64,' + readFileSync(out).toString('base64');
        } catch { /* no picture: the line keeps the file name */ }
    }
    return pics;
}

async function main() {
    const a = args(process.argv.slice(2));
    if (!a.project || (!a.chat && !a.remove)) { console.error('usage: live-log.mjs --project <id> --chat <telegram group id> [--tier dev] [--dry-run] [--remove]'); process.exit(2); }
    const cred = JSON.parse(readFileSync(join(homedir(), '.config/di/credentials.json'), 'utf8'))[a.tier];
    if (!cred?.token) { console.error(`live-log: no stored login for ${a.tier} (run: di whoami)`); process.exit(1); }
    const base = cred.base.replace(/\/$/, '');
    const H = { Authorization: `Bearer ${cred.token}`, 'User-Agent': 'di-live-log', 'Content-Type': 'application/json' };
    const route = `/api/projects/${encodeURIComponent(a.project)}/document`;
    const got = await fetch(base + route, { headers: H });
    if (!got.ok) { console.error(`live-log: GET ${route} -> ${got.status}`); process.exit(1); }
    const body = await got.json(); const doc = body.document ?? body;
    const files = doc.presentationState?.codeFiles; const idx = files?.findIndex((f) => f.name === 'index.html');
    if (!files || idx < 0) { console.error('live-log: project has no code page index.html'); process.exit(1); }
    const page = files[idx].content;
    let next;
    if (a.remove) next = unsplice(page);
    else {
        const { lines, dirOf } = readInbox(a.inbox, a.chat);
        const msgs = collect(lines);
        const pictures = makePictures(msgs, dirOf, join(homedir(), '.cache/di/live-log', String(a.chat)));
        const section = render(msgs, { tz: a.tz, pictures, title: a.title });
        const oldBlock = page.includes(START) ? page.slice(page.indexOf(START), page.indexOf(END)) : '';
        const strip = (s) => s.replace(/written [^.]*\./, '');
        if (strip(oldBlock) === strip(`${START}\n${section}\n`)) { console.log(`live-log: unchanged (${msgs.length} messages)`); return; }
        next = splice(page, section);
        console.log(`live-log: ${msgs.length} messages, ${Object.keys(pictures).length} pictures, page ${page.length} -> ${next.length} chars`);
    }
    if (a.dryRun) { const out = a.out || join(tmpdir(), `live-log-${a.project}.html`); writeFileSync(out, next); console.log(`live-log: dry run, page in ${out}`); return; }
    files[idx] = { ...files[idx], content: next };
    const put = await fetch(base + route, { method: 'PUT', headers: H, body: JSON.stringify(doc) });
    if (!put.ok) { console.error(`live-log: PUT -> ${put.status}`); process.exit(1); }
    const check = await (await fetch(base + route, { headers: H })).text();
    console.log(`live-log: written to ${a.tier} (${put.status}); check sha ${createHash('sha1').update(next).digest('hex').slice(0, 8)} present: ${check.includes(a.remove ? '' : START)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error('live-log:', e.message); process.exit(1); });
