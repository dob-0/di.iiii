// Pure validation for the in-app Wiki single-source-of-truth (src/wiki/wikiContent.js).
// Kept side-effect free so it can be unit tested (see src/wiki-sync.test.js) and reused
// by the CLI gate (scripts/check-wiki-sync.mjs).

const REQUIRED_ARTICLE_FIELDS = ['id', 'category', 'title', 'summary', 'body', 'tags', 'updated']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0

const isValidBody = (body) => {
    if (!Array.isArray(body) || body.length === 0) return false
    return body.every((block) => {
        if (typeof block === 'string') return block.trim().length > 0
        if (block && Array.isArray(block.list)) {
            return block.list.length > 0 && block.list.every(isNonEmptyString)
        }
        return false
    })
}

// Returns a list of human-readable error strings; empty list means the wiki is consistent.
export const collectWikiSyncErrors = ({ articles, categories, highlightIds }) => {
    const errors = []

    if (!Array.isArray(articles) || articles.length === 0) {
        errors.push('WIKI_ARTICLES is empty or not an array.')
        return errors
    }
    if (!Array.isArray(categories) || categories.length === 0) {
        errors.push('WIKI_CATEGORIES is empty or not an array.')
        return errors
    }

    const categorySet = new Set(categories)
    const seenIds = new Set()

    for (const article of articles) {
        const label = isNonEmptyString(article?.id) ? article.id : '(article with missing id)'

        for (const field of REQUIRED_ARTICLE_FIELDS) {
            if (!(field in article)) {
                errors.push(`Article "${label}" is missing required field: ${field}`)
            }
        }

        if (isNonEmptyString(article?.id)) {
            if (seenIds.has(article.id)) errors.push(`Duplicate article id: ${article.id}`)
            seenIds.add(article.id)
            if (article.id !== article.id.toLowerCase() || /\s/.test(article.id)) {
                errors.push(`Article id should be lowercase kebab-case: ${article.id}`)
            }
        } else {
            errors.push('Found an article with a missing or empty id.')
        }

        if (!isNonEmptyString(article?.title)) errors.push(`Article "${label}" has an empty title.`)
        if (!isNonEmptyString(article?.summary)) errors.push(`Article "${label}" has an empty summary.`)
        if (!categorySet.has(article?.category)) {
            errors.push(`Article "${label}" has unknown category "${article?.category}" (not in WIKI_CATEGORIES).`)
        }
        if (!ISO_DATE.test(article?.updated ?? '')) {
            errors.push(`Article "${label}" has an invalid \`updated\` date (expected YYYY-MM-DD): ${article?.updated}`)
        }
        if (!Array.isArray(article?.tags) || article.tags.length === 0) {
            errors.push(`Article "${label}" must have at least one tag.`)
        }
        if (!isValidBody(article?.body)) {
            errors.push(`Article "${label}" has a malformed body (need non-empty paragraphs or { list: [...] } blocks).`)
        }
    }

    if (!Array.isArray(highlightIds) || highlightIds.length === 0) {
        errors.push('WIKI_HIGHLIGHT_IDS is empty — the landing page would have no highlights.')
    } else {
        for (const id of highlightIds) {
            if (!seenIds.has(id)) {
                errors.push(`WIKI_HIGHLIGHT_IDS references "${id}" which is not a real article id (it would silently vanish from the landing).`)
            }
        }
    }

    return errors
}
