// /support — the words, in one place, so the page and "Ask di" say the same thing.
//
// GitHub Sponsors is the chosen way to give money (owner's pick, 2026-11). The
// account is not open yet: SPONSORS_URL stays null until the owner names it, and
// the page then says so instead of linking to a dead end. .github/FUNDING.yml
// still names `polar: di-iiii`, which answers 404 (checked 2026-11-09); that line
// is not repeated here.
export const SPONSORS_URL = null // e.g. 'https://github.com/sponsors/<account>' — the owner's pick

export const SUPPORT_LEDE = 'di.iiii is free to use and the code is open (AGPL-3.0). If it is useful to you, there are four ways to help the work go on.'

export const SUPPORT_SECTIONS = [
    {
        id: 'give',
        heading: 'Give money',
        paragraphs: [
            'GitHub Sponsors is the way we chose: it takes nothing for itself, so the whole amount arrives, and it needs a GitHub account, which most people who use di.iiii already have.',
        ],
    },
    {
        id: 'use',
        heading: 'Use it and show it',
        paragraphs: [
            'Make a space, hand out its address, and tell the people who would want one. A space opened by a stranger does more for the work than a coin.',
        ],
    },
    {
        id: 'report',
        heading: 'Tell us what breaks',
        paragraphs: [
            'Found a mistake or a missing piece? Open an issue on GitHub (github.com/dob-0/di.iiii) or write to info@thedi.studio.',
        ],
    },
    {
        id: 'code',
        heading: 'Add code or words',
        paragraphs: [
            'The code is open. Read CONTRIBUTING.md in the repository, make a branch, and open a pull request. Wiki articles and translations count as much as code.',
        ],
    },
]

// The same text as search passages (src/askdi/askSources.js).
export const SUPPORT_PASSAGES = [{
    id: 'page:support',
    title: 'How to support di.iiii',
    url: '/support',
    summary: SUPPORT_LEDE,
    tags: 'support donate sponsor sponsors funding money give help contribute',
    paragraphs: [SUPPORT_LEDE, ...SUPPORT_SECTIONS.flatMap((s) => [s.heading + '.', ...s.paragraphs])],
}]
