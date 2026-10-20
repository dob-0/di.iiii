import { deskCues } from '../../rigbuild/cueRun.js'

// "Play" in the scene editor = the desk's GO on this cue: hand the desk the project's cue list (as the cards page does) and go to
// this cue's place in it. Where no desk answers, it says so in the error (the editor shows it).
export async function playScene(document, cue) {
    const cues = document?.mappingState?.cues || []
    const list = cues.filter((c) => typeof c.lightLook === 'string' && c.lightLook)
    const index = list.findIndex((c) => c.id === cue?.id)
    if (index < 0) throw new Error('this scene has no look to play')
    await deskCues.load(document?.projectMeta?.id, cues, document?.mappingState?.loop === true, true)
    await deskCues.go(index)
}
