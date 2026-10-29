// The one table of browser-tab titles (F125, S19). Before it, ~35 of 74
// captured pages read the index.html default "di.iiii — public spaces on the
// open web" — every Studio view, Admin, chat, tools — so several open tabs
// looked identical and a screen reader announced the wrong page (WCAG 2.4.2).
//
// Shape follows the rule already used by the pages that did set a title:
// "<this page> — <where it sits> — di.iiii", most specific first, always ending
// in the brand. Words come from docs/ai/vocabulary.md (space, project).
// S13's message layer is not on dev yet; when it lands, these strings move into
// it and only this file changes — callers pass a route, never a sentence.
export const BRAND_TITLE = 'di.iiii'

const join = (...parts) => parts.filter(Boolean).join(' — ')

// A route name -> title. `parts` carries the names a route knows (space,
// project, section); missing parts are simply left out, never "undefined".
export const PAGE_TITLES = {
    'studio-spaces': () => join('Spaces', 'Studio', BRAND_TITLE),
    'studio-hub': ({ space }) => join('Projects', space, 'Studio', BRAND_TITLE),
    'studio-project': ({ project, space }) => join(project || 'Project', 'Studio', space, BRAND_TITLE),
    'studio-director': ({ space }) => join('Director', space, 'Studio', BRAND_TITLE),
    chat: () => join('Chat', BRAND_TITLE),
    tools: () => join('Tools', BRAND_TITLE),
    admin: ({ section }) => join(section, 'Admin', BRAND_TITLE)
}

export function pageTitle(route, parts = {}) {
    const build = PAGE_TITLES[route]
    return build ? build(parts) : null
}
