// Spaces the platform's own pages link to by address. The idle sweep keeps
// them however long nobody edits them (spaceStore linkedSpaceIds): a link on
// the landing or in .github/FUNDING.yml that opens nothing is a broken promise
// to every visitor who follows it. On 2026-10-20 the sweep removed `support`,
// the donation page both of them point at, because nobody had edited it in 30
// days. siteLinkedSpaces.test.js reads the landing and FUNDING.yml and fails
// when either links to a root address missing here.
const SITE_LINKED_SPACE_IDS = Object.freeze(['support', 'privacy', 'terms', 'network', 'suite', 'for-apps'])

module.exports = { SITE_LINKED_SPACE_IDS }
