// A made-up Monitor map of 65 nodes (3 tiers, 8 machines, 20 agents, 14 spaces, 6 shows, 14 repos) for the overlap
// check and its test: the same shape the server's buildMap sends, with long and short names.
const words = ['aylmo', 'studio-mac', 'di-mac', 'r-di', 'ponyo', 'eter', 'kiara', 'platina', 'moxir', 'cinema-house', 'bassiani', 'light-festival', 'muth', 'projector-room', 'hosq']
const name = (kind, i) => `${kind === 'agent' ? 'chat' : kind === 'repo' ? 'repo' : kind === 'show' ? 'show' : 'space'}-${words[i % words.length]}-${i}`

export const demoMap = (total = 65) => {
    const nodes = []
    const edges = []
    const add = (kind, count, label, state = 'ok') => {
        const ids = []
        for (let i = 0; i < count && nodes.length < total; i += 1) {
            const id = `${kind}:${i}`
            ids.push(id)
            nodes.push({ id, kind, label: label(i), state: i % 7 === 3 ? 'warn' : i % 11 === 5 ? 'off' : state })
        }
        return ids
    }
    const tiers = add('tier', 3, (i) => ['dev', 'prod', 'local'][i])
    const machines = add('machine', 8, (i) => words[i])
    const agents = add('agent', 20, (i) => name('agent', i))
    const spaces = add('space', 14, (i) => name('space', i))
    const shows = add('show', 6, (i) => name('show', i))
    const repos = add('repo', 14, (i) => name('repo', i))
    machines.forEach((m, i) => edges.push({ from: m, to: tiers[i % tiers.length], kind: 'runs' }))
    agents.forEach((a, i) => edges.push({ from: a, to: machines[i % machines.length], kind: 'on' }))
    spaces.forEach((s, i) => edges.push({ from: s, to: tiers[i % tiers.length], kind: 'serves' }))
    shows.forEach((s, i) => edges.push({ from: s, to: machines[(i * 3) % machines.length], kind: 'runs' }))
    repos.forEach((r, i) => edges.push({ from: r, to: tiers[i % tiers.length], kind: 'deploys' }))
    return { nodes, edges }
}
