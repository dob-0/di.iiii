/**
 * How far a move reaches — the whole safety model in one word per move.
 *
 * The rule this encodes: read freely, ask before anything that opens a door.
 * The asymmetry is the point. A wrong read costs a minute. A wrong publish
 * cannot be taken back — the pitch deck was fixed upstream in one commit and
 * is still live in two forked repositories three weeks later.
 *
 * The full map of what is public in this estate, and why each of these is on
 * the list, is di-atlas/PUBLIC_PRIVATE.md.
 */

/** Reads. Changes nothing, shows nothing to anyone new. */
export const READ = 'read'
/** Writes, but only where the caller can already reach. No new audience. */
export const PRIVATE = 'private'
/** Opens a door: a new audience can now see, edit, or reach something. */
export const PUBLIC = 'public'

export const REACHES = [READ, PRIVATE, PUBLIC]

/**
 * Refusing is the default.
 *
 * A caller that never wired up a confirm gets its public moves refused, not
 * performed. This is deliberate and it is the single most important line in
 * the SDK: an agent handed a token, with nobody watching, must not be able to
 * publish by omission. Opting IN to publishing is a decision someone makes;
 * opting out must never be something they forget.
 */
export const refuseByDefault = async (intent) => {
    throw new PublicMoveRefused(intent)
}

export class PublicMoveRefused extends Error {
    constructor(intent) {
        super(
            `${intent.move} would open a door and nothing confirmed it.\n` +
            `  ${intent.opens}\n` +
            `  Pass confirm: (intent) => true to connect(), or answer the prompt in your agent.`
        )
        this.name = 'PublicMoveRefused'
        this.code = 'public_move_refused'
        this.intent = intent
    }
}

/**
 * Ask, then act — never the reverse. The confirm callback is given the whole
 * intent (which move, which arguments, and a sentence saying who will be able
 * to see what) and must return true. Anything else — false, undefined, a
 * thrown error — refuses.
 */
export const reachOf = (move, args) => (typeof move.reach === 'function' ? move.reach(args) : move.reach)

export const guard = async ({ move, args, confirm }) => {
    // Some moves are only public depending on their arguments — creating a
    // space is private unless you asked for isPublic in the same breath. The
    // reach has to be read from the call, not from the name.
    const reach = reachOf(move, args)
    if (reach !== PUBLIC) return
    const intent = {
        move: move.name,
        reach,
        args,
        // Written for a person reading it in a hurry, because that is when a
        // door gets opened by accident.
        opens: typeof move.opens === 'function' ? move.opens(args) : String(move.opens || 'unknown')
    }
    const answer = await (confirm || refuseByDefault)(intent)
    if (answer !== true) throw new PublicMoveRefused(intent)
}
