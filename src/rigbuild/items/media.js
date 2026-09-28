// THE MAKERS' OWN PICTURES AND PAPERS — verification, photos and documents for every item
// card. docs/architecture/RIG_BUILD.md §13.8.
//
// Owner, 2026-09-28: "we need to also real images of each device … you check all eq from
// list right ? and also find the documentation's and attach it". So each item carries:
//   - a VERIFICATION: is the rental house's code printed on the maker's own page
//     (confirmed), the same product under another code (probable), not traced and shown on a
//     named stand-in (equivalent), or not known — with the evidence URL and the date;
//   - the maker's PHOTOS and DOCUMENTS (manual, DMX chart, datasheet, safety sheet).
//
// The law (the owner's standing rule 7; owner 2026-09-28: "yes look to keep copyrights just
// links also ok"): makers' photos and manuals are copyrighted. A file is KEPT only where the
// maker offers that very file for download (`offer: 'download'` — a manual PDF on a downloads
// page); everything else (a product photo on a shop page, terms unclear) is a dated LINK
// (`offer: 'link'`), never stored. A kept file is INTERNAL REFERENCE on the studio's own
// install only. The repository (public, AGPL) holds METADATA — source URL, sha256, size, date,
// status, and the id the file has in the local install's space asset store. The bytes are fetched by scripts/rigbuild/fetch-equipment-media.mjs
// (which checks each sha256) into a folder outside the repository and uploaded to the LOCAL
// install only; the script refuses any other address. On a hosted tier the files are simply
// not there: the card says so and links the maker's page instead.
//
// Pure: no React, no fetch. The card, the script and the tests share it.

import media from './media.json'
import { DOC_KINDS } from './mediaRules.js'

export { DOC_KINDS, MEDIA_KINDS, OFFERS, STATUSES, isLocalApi, mediaProblems } from './mediaRules.js'

export const MEDIA = media


/** The badge's words: short, and what the status means in plain terms. */
export const STATUS_WORDS = {
    confirmed: { badge: 'confirmed', means: 'the rental code is printed on the maker\'s own page' },
    probable: { badge: 'probable', means: 'the same product is on the maker\'s page under a different code' },
    equivalent: { badge: 'equivalent', means: 'the rental code was not traced; what is shown is a named stand-in, not the rental unit' },
    unknown: { badge: 'unknown', means: 'not traced, and no stand-in named' }
}

export const DOC_WORDS = { manual: 'user manual', 'dmx-chart': 'DMX chart', datasheet: 'datasheet', safety: 'safety' }

const entryOf = (id) => (id && media.items?.[id]) || null

/** The verification of an item id, or null. */
export const verificationOf = (id) => entryOf(id)?.verification || null

/** Every media entry of an item, in the file's order. */
export const mediaOf = (id) => entryOf(id)?.media || []

/** The maker's photos of an item (the rental unit's maker first, then an equivalent's). */
export const photosOf = (id) => mediaOf(id)
    .filter((m) => m.kind === 'photo')
    .sort((a, b) => Number(Boolean(a.equivalent)) - Number(Boolean(b.equivalent)))

/** Documents of an item, grouped in DOC_KINDS order. */
export const documentsOf = (id) => {
    const list = mediaOf(id).filter((m) => DOC_KINDS.includes(m.kind))
    return DOC_KINDS.flatMap((k) => list.filter((m) => m.kind === k))
}

/** Where the local install serves a stored file: its space asset route. Null for a link, or a file never stored. */
export const assetUrl = (apiBase, entry, store = media.store) => {
    if (entry?.offer !== 'download' || !entry?.asset || !store?.space) return null
    return `${String(apiBase || '').replace(/\/+$/, '')}/api/spaces/${encodeURIComponent(store.space)}/assets/${encodeURIComponent(entry.asset)}`
}

/** The line every maker's file carries on the card. */
export const rightsLine = (entry) => {
    const what = entry.kind === 'photo' ? 'image' : 'document'
    if (entry.offer === 'link') return `© ${entry.maker} — manufacturer's ${what}, linked (not copied), ${entry.page || entry.url}, checked ${entry.checked}`
    return `© ${entry.maker} — manufacturer's ${what}, internal reference, source ${entry.url}, fetched ${entry.fetched || 'not yet'}`
}

