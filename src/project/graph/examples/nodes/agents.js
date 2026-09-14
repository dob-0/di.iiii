// agents — language models and working sessions as nodes (4 palette types).
import { exampleBuilder, live } from './helpers.js'

export const agentsExamples = [
    {
        typeId: 'agent',
        title: 'Agent',
        story: 'Chat with Claude, as a node — Title is wired; the transcript lives server-side (ai_chats/ai_messages), never in the document.',
        build: () => {
            const b = exampleBuilder('agent')
            b.place('value.string', 'title', 0, 0, { label: 'String · title', values: { value: 'Notes' } })
            b.place('agent', 'chat', 1, 0, { label: 'Agent' })
            b.link('title', 'out', 'chat', 'title')
            return b.result()
        },
        expect: []
    },
    {
        typeId: 'agent.keeper',
        title: 'Keeper',
        story: 'A model you name by endpoint, not an account — Prompt is wired; Endpoint/Model/System are settings, not ports (nothing upstream should repoint the keeper mid-graph). Reply and Busy publish while it answers.',
        build: () => {
            const b = exampleBuilder('agent.keeper')
            b.place('value.string', 'ask', 0, 0, { label: 'String · prompt', values: { value: 'What time is the run-through?' } })
            b.place('agent.keeper', 'keeper', 1, 0, {
                label: 'Keeper',
                values: { endpoint: 'http://localhost:8090', model: 'granite-4.0-h-1b' }
            })
            b.link('ask', 'out', 'keeper', 'prompt')
            return b.result()
        },
        expect: [live('reply', 'string', 'Seven, doors at six-thirty.'), live('busy', 'boolean', false)]
    },
    {
        typeId: 'work.agent',
        title: 'Agent Run',
        story: 'Launches a headless `claude -p` session — Prompt is wired from Work Status\'s Summary, never Trigger, so placing this example never launches a real process. Status/Running/Result publish while it runs.',
        build: () => {
            const b = exampleBuilder('work.agent')
            b.place('work.status', 'status', 0, 0, { label: 'Work Status' })
            b.place('work.agent', 'run', 1, 0, { label: 'Agent Run' })
            b.link('status', 'summary', 'run', 'prompt')
            return b.result()
        },
        expect: [
            live('status', 'string', 'running'),
            live('running', 'boolean', true),
            live('result', 'string', '')
        ]
    },
    {
        typeId: 'work.status',
        title: 'Work Status',
        story: 'Every session, worktree and open PR, local-dev only — Summary is wired into a Text panel so the count reads on the canvas.',
        build: () => {
            const b = exampleBuilder('work.status')
            b.place('work.status', 'status', 0, 0, { label: 'Work Status' })
            b.place('view.text', 'readout', 1, 0, { label: 'Text panel' })
            b.link('status', 'summary', 'readout', 'content')
            return b.result()
        },
        expect: [
            live('running', 'number', 2),
            live('dirty', 'boolean', true),
            live('openPrs', 'number', 5),
            live('summary', 'string', '2 sessions, 5 open PRs')
        ]
    }
]
