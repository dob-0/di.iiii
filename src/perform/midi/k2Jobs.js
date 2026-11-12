// What each K2 control does NOW, in the short words of describeAction, for one console and one
// effective map. ONE source: the layout panel (K2LayoutPanel.jsx) and the controller window
// (K2Window.jsx, over the k2Channel snapshot) both read it, so the two can never disagree.
import { describeAction, shortMatch } from './deckBinding.js'
import { K2_CHANNEL, XONE_K2_CONTROLS } from './xoneK2.js'

export const entryOf = (map, control) => (Array.isArray(map) ? map : []).find((entry) => entry?.match
    && entry.match.kind === control.kind && entry.match.number === control.number
    && (!entry.match.channel || entry.match.channel === K2_CHANNEL))

/** The short job of one sheet control: 'not used' for a free control with no learned entry. */
export const jobOf = (item, map, current, fxEffect = 0) => {
    const unused = (current?.free || []).includes(item.control) && !entryOf(map, item)
    return unused ? 'not used' : describeAction(entryOf(map, item), { fxEffect })
}

/** The full readout line: control name, its message, its job. */
export const lineOf = (item, map, current, fxEffect = 0) => `${item.control} · ${shortMatch(item)} · ${jobOf(item, map, current, fxEffect)}`

/** { control name: short job } for every control of the sheet. */
export const jobsFor = (map, current, fxEffect = 0) => Object.fromEntries(XONE_K2_CONTROLS.map((item) => [item.control, jobOf(item, map, current, fxEffect)]))

/** { control name: full readout line } for every control of the sheet. */
export const linesFor = (map, current, fxEffect = 0) => Object.fromEntries(XONE_K2_CONTROLS.map((item) => [item.control, lineOf(item, map, current, fxEffect)]))
