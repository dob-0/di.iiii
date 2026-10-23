// Turns people.json into one page + one di-space manifest per person. Run
// from the repo root:
//   node spaces/network/build.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderRoom, renderOrganisation } from './room-template.mjs'
import { renderIndex } from './index-template.mjs'
import { renderConstellation } from './constellation-template.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REL = path.relative(process.cwd(), HERE).split(path.sep).join('/') || '.'
const { people, organisations = [] } = JSON.parse(fs.readFileSync(path.join(HERE, 'people.json'), 'utf8'))

fs.mkdirSync(path.join(HERE, 'pages'), { recursive: true })

// The index is generated from the same roster as the rooms and shares their
// stylesheet and field. It used to be a hand-kept file, which is how it came
// to carry a second design — and counts in its opening sentence that no
// longer matched the roster underneath it.
fs.writeFileSync(path.join(HERE, 'code/index.html'), renderIndex(people, organisations))

// The constellation is the same roster on one ring. It was hand-kept too,
// and drifted the same way — a name and a role the data had already
// corrected, in a design nothing else on the space uses.
fs.writeFileSync(path.join(HERE, 'pages/constellation.html'), renderConstellation(people))

const written = []
const entries = [
  ...people.map((p) => ({ slug: p.slug, label: p.name, html: renderRoom(p, people) })),
  ...organisations.map((o) => ({ slug: o.slug, label: o.name, html: renderOrganisation(o) })),
]
for (const e of entries) {
  fs.writeFileSync(path.join(HERE, `pages/${e.slug}.html`), e.html)
  fs.writeFileSync(path.join(HERE, `di-space.${e.slug}.json`), JSON.stringify({
    $schema: 'https://di-studio.xyz/schemas/di-space.schema.json',
    spaceId: 'network',
    // ids are global across di.iiii and two of these names are already wcc
    // project ids; the slug is what the address shows.
    projectId: `network-${e.slug}`,
    slug: e.slug,
    label: e.label,
    mode: 'code',
    entry: `${REL}/pages/${e.slug}.html`,
    include: [],
    assets: [],
    publish: false,
  }, null, 2) + '\n')
  written.push(e.slug)
}

// The catalogue is the door: every person in people.json gets a room by
// construction (the loop above), so the only thing worth checking is that
// the loop actually ran for all of them — no separate roster to fall out of
// sync with.
const missing = entries.filter((e) => !written.includes(e.slug)).map((e) => e.slug)
console.log(`${people.length} rooms and ${organisations.length} organisations written under ${REL}/pages/`)
if (missing.length || written.length !== entries.length) {
  console.error(`did not get a page: ${missing.join(', ') || '(count mismatch)'}`)
  process.exitCode = 1
}
