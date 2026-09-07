/**
 * argv → { _: [words], flags: {} }. Pure, so it can be tested without running
 * the CLI — cli.mjs executes its command on import.
 *
 * A flag named here takes the next token as its value; every other `--flag`
 * is a boolean and consumes nothing, which is what lets `--lan`, `--verbose`
 * and `--no-open` sit anywhere on the line.
 */
export const parseArgs = (argv) => {
    const args = { _: [], flags: {} }
    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i]
        if (!token.startsWith('--')) { args._.push(token); continue }
        const name = token.slice(2)
        if (name === 'port') { args.flags.port = argv[++i]; continue }
        if (name === 'out') { args.flags.out = argv[++i]; continue }
        if (name === 'from') { args.flags.from = argv[++i]; continue }
        if (name === 'as') { args.flags.as = argv[++i]; continue }
        if (name === 'remote') { args.flags.remote = argv[++i]; continue }
        if (name === 'key') { args.flags.key = argv[++i]; continue }
        args.flags[name] = true
    }
    return args
}
