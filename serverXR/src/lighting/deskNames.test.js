// F129 / S59: every control on the light desk page has an accessible name (WCAG 4.1.2, 1.3.1),
// and the scrollable fixture library can be reached by keyboard.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// A path, not new URL(): the root run (jsdom) refuses that with 'The URL must be of scheme file'.
const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'ui/index.html'), 'utf8');
const tag = (re) => [...html.matchAll(new RegExp(re.source, 'g'))].map((m) => m[0]);

describe('light desk accessible names', () => {
  it('names the dimmer limits, tempo, universe select and every zoom control', () => {
    for (const id of ['dimMaxH', 'dimMinH', 'bpm', 'gridUniverse']) {
      const [t] = tag(new RegExp(`<[a-z]+ [^>]*id="${id}"[^>]*>`));
      expect(t, id).toMatch(/aria-label="[^"]+"/);
    }
    for (const cls of ['zoom', 'zoomOut', 'zoomIn']) {
      const tags = tag(new RegExp(`<(?:input|button) [^>]*class="(?:tool )?${cls}"[^>]*>`));
      expect(tags.length, cls).toBeGreaterThan(0);
      for (const t of tags) expect(t, cls).toMatch(/aria-label="[^"]+"/);
    }
  });
  it('makes the scrollable fixture library keyboard-focusable and named', () => {
    const [t] = tag(/<div [^>]*id="libTree"[^>]*>/);
    expect(t).toMatch(/tabindex="0"/);
    expect(t).toMatch(/aria-label="[^"]+"/);
  });
});
