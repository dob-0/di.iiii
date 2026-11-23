// "Ask di" — the public sources, gathered. Loaded only when a visitor first
// opens the box (a dynamic import), so no page pays for it before that.
import { WIKI_ARTICLES } from '../wiki/wikiContent.js'
import aboutMd from '../../docs/ai/public/about.md?raw'
import wordsMd from '../../docs/ai/public/words.md?raw'
import setupMd from '../../docs/ai/public/setup.md?raw'
import { buildPassages } from './askIndex.js'
import { createAsk } from './askSearch.js'
import { SUPPORT_PASSAGES } from '../pages/supportContent.js'

export const ASK_DOCS = [
    { file: 'about', url: '/ai/about.md', title: 'What di.iiii is', source: aboutMd },
    { file: 'words', url: '/ai/words.md', title: 'Words', source: wordsMd },
    { file: 'setup', url: '/ai/setup', title: 'Connect an assistant', source: setupMd },
]

export const askPassages = () => buildPassages({ articles: WIKI_ARTICLES, docs: ASK_DOCS, pages: SUPPORT_PASSAGES })
export const createPublicAsk = () => createAsk(askPassages())
