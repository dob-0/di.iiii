// Every word this surface says, in both languages, in one file.
//
// Armenian first and English under it, everywhere, without exception: the
// children at the camp are Armenian speakers and some of the mentors standing
// behind them are not. A surface that picks one of those two audiences makes
// the other one ask somebody what a button does, and a child who has to ask
// what a button does has stopped making things.
//
// Kept as data rather than as strings inside components so the whole
// vocabulary can be read — and corrected by somebody who actually speaks
// Armenian — without opening a single .jsx file.

export const say = (hy, en) => ({ hy, en })

export const WORDS = {
    add: say('ԱՎԵԼԱՑՆԵԼ', 'add'),
    colour: say('ԳՈՒՅՆ', 'colour'),
    photo: say('ՆԿԱՐ', 'photo'),
    talk: say('ԽՈՍԵԼ', 'talk'),
    nameQuestion: say('ի՞նչ է քո անունը', 'what is your name?'),
    nameDone: say('պատրաստ է', 'done'),
    nameSkip: say('հետո', 'later'),
    namePlaceholder: say('քո անունը', 'your name'),
    tapFirst: say('նախ դիպչիր մի բանի', 'tap something first'),
    startHere: say('դիր քո նկարը սենյակում', 'put your photo in the room'),
    close: say('փակել', 'close'),
    sending: say('ուղարկվում է…', 'sending…'),
    photoFailed: say('այս նկարը չընդունվեց։ փորձիր ուրիշը', 'that photo would not go in — try another one'),
    loading: say('բացվում է…', 'opening…'),
    chatPlaceholder: say('գրիր մի բան', 'say something'),
    chatSend: say('ուղարկել', 'send'),
    chatEmpty: say('դեռ ոչ ոք ոչինչ չի ասել', 'nobody has said anything yet')
}

// WHOSE ROOM THIS IS.
//
// The camp's projects are titled with the child's own name — `ՄԱՐԳԱՐԻՏԱ ·
// Margarita`, `ԺԱՆԱ · Zhana`. Same separator this file uses everywhere else, so
// a title splits into the same two lines every other word on this surface has.
// A title with no separator is shown whole on the Armenian line rather than
// guessed at: a room belonging to somebody called `Team 3` should say `Team 3`
// and let a mentor notice that it has not been named yet.
//
// Read from the project's own title, never derived from the project id —
// `team-3` is an address, not a person.
export const splitTitle = (title = '') => {
    const text = String(title || '').trim()
    if (!text) return null
    const parts = text.split('·').map((part) => part.trim()).filter(Boolean)
    if (parts.length >= 2) return { hy: parts[0], en: parts.slice(1).join(' · ') }
    return { hy: text, en: '' }
}

// The five shapes, in the order a hand reaches for them. Types are the
// project document's own entity types (src/shared/projectSchema.js) — this
// list renames nothing, it only chooses which five of the nineteen a child is
// offered and what they are called out loud.
export const SHAPES = [
    { type: 'box', ...say('ԽՈՐԱՆԱՐԴ', 'cube') },
    { type: 'sphere', ...say('ԳՆԴԱԿ', 'ball') },
    { type: 'cone', ...say('ԿՈՆ', 'cone') },
    { type: 'cylinder', ...say('ԳԼԱՆ', 'tube') },
    { type: 'torus', ...say('ՕՂԱԿ', 'ring') }
]

// The five camp door hues, then black/white/warm neutrals.
//
// The doors are how the camp is signposted in the building itself, so a room
// that keeps its maker's colour is legible from across the showcase without
// anybody reading a label. Do not add a sixth hue to this row without moving
// a door.
export const COLOURS = [
    { hex: '#DCC9FF', ...say('ՄԱՆՈՒՇԱԿ', 'violet') },
    { hex: '#EE8866', ...say('ՆԱՐՆՋԱԳՈՒՅՆ', 'orange') },
    { hex: '#EEDD88', ...say('ԴԵՂԻՆ', 'yellow') },
    { hex: '#44BB99', ...say('ԿԱՆԱՉ', 'green') },
    { hex: '#FFAABB', ...say('ՎԱՐԴԱԳՈՒՅՆ', 'pink') },
    { hex: '#FFFFFF', ...say('ՍՊԻՏԱԿ', 'white') },
    { hex: '#E8DCC8', ...say('ԱՎԱԶ', 'sand') },
    { hex: '#9A8C7A', ...say('ՄՈԽՐԱԳՈՒՅՆ', 'grey') },
    { hex: '#2B2A28', ...say('ՍԵՎ', 'black') }
]

// The name written into the document for a thing a child made. It shows on the
// chip over the object here, and it is what a mentor reads in the Raw
// outliner — so it carries both languages rather than choosing one.
export const nameForShape = (type) => {
    const shape = SHAPES.find((entry) => entry.type === type)
    return shape ? `${shape.hy} · ${shape.en}` : null
}
