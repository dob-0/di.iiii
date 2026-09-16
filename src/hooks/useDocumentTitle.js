import { useEffect } from 'react'

// The one place the browser tab title is set. Every page used to either leave
// it alone (silently inheriting index.html's "di.iiii — public spaces on the
// open web" — every route, every tab, the same words) or hand-roll the same
// four-line effect (TermsPage, PrivacyPage, ForAppsPage, before this hook
// existed). See docs/ai/vocabulary.md's naming rule: a SPACE's own name is
// the one name a visitor sees for it — tab, heading, card, preview — and a
// PROJECT's name shows only when you are inside that project.
//
// `title` is falsy (null, '', while data is still loading) to mean "leave the
// title exactly as it is" — never blank it or fall back to a hardcoded
// default here, because the caller may be deliberately silent (the platform's
// own space, 'main', keeps the index.html default; a loading project should
// not flash an empty tab before its real title is known).
export default function useDocumentTitle(title) {
    useEffect(() => {
        if (!title) return undefined
        const previous = document.title
        document.title = title
        return () => { document.title = previous }
    }, [title])
}
