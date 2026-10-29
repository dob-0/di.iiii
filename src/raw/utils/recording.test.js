import { describe, expect, it, vi } from 'vitest'
import {
    RECORDER_BITS_PER_SECOND, RECORDER_MIME_TYPES,
    audioTracksOf, drawPicture, fileStamp, formatSeconds, pickRecorderMimeType, pictureMediaOf, pictureSizeOf, takeFileName,
} from './recording.js'

const AT = new Date('2026-10-21T14:03:07.456Z')

describe('pickRecorderMimeType', () => {
    it('tries vp9, then vp8, then plain WebM, at 6 Mbps', () => {
        expect(RECORDER_MIME_TYPES).toEqual(['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'])
        expect(RECORDER_BITS_PER_SECOND).toBe(6_000_000)
        expect(pickRecorderMimeType(() => true)).toBe('video/webm;codecs=vp9,opus')
        expect(pickRecorderMimeType((type) => !type.includes('vp9'))).toBe('video/webm;codecs=vp8,opus')
        expect(pickRecorderMimeType((type) => type === 'video/webm')).toBe('video/webm')
    })

    it('answers empty (the browser chooses) when nothing is supported or the check throws', () => {
        expect(pickRecorderMimeType(() => false)).toBe('')
        expect(pickRecorderMimeType(() => { throw new Error('no') })).toBe('')
        expect(pickRecorderMimeType(undefined)).toBe('')
    })
})

describe('takeFileName', () => {
    it('names a take by kind, source and the second it was taken', () => {
        expect(fileStamp(AT)).toBe('2026-10-21T14-03-07')
        expect(takeFileName({ kind: 'still', source: 'Scene', date: AT })).toBe('still-scene-2026-10-21T14-03-07.png')
        expect(takeFileName({ kind: 'recording', source: 'Picture Out', date: AT })).toBe('recording-picture-out-2026-10-21T14-03-07.webm')
    })

    it('drops a missing or unspellable source rather than leaving a gap', () => {
        expect(takeFileName({ kind: 'still', source: '', date: AT })).toBe('still-2026-10-21T14-03-07.png')
        expect(takeFileName({ kind: 'still', source: '***', date: AT })).toBe('still-2026-10-21T14-03-07.png')
        expect(takeFileName({ kind: 'still', source: 'Café ↯ Wall', date: AT })).toBe('still-cafe-wall-2026-10-21T14-03-07.png')
    })

    it('never writes a colon, and says undated for a bad date', () => {
        expect(takeFileName({ date: AT })).not.toContain(':')
        expect(fileStamp('not a date')).toBe('undated')
    })
})

describe('pictures', () => {
    it('finds the pixels behind a live texture and their size', () => {
        const video = { videoWidth: 640, videoHeight: 360 }
        expect(pictureMediaOf({ image: video })).toBe(video)
        expect(pictureMediaOf(null)).toBeNull()
        expect(pictureMediaOf('texture-id')).toBeNull()
        expect(pictureSizeOf(video)).toEqual({ width: 640, height: 360 })
        expect(pictureSizeOf({ videoWidth: 0, videoHeight: 0 })).toBeNull()
    })

    it('draws at the picture size, and refuses a picture with no frame yet', () => {
        const drawImage = vi.fn()
        const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }) }
        expect(drawPicture({ videoWidth: 0, videoHeight: 0 }, canvas)).toBe(false)
        expect(drawImage).not.toHaveBeenCalled()
        const media = { width: 320, height: 200 }
        expect(drawPicture(media, canvas)).toBe(true)
        expect(canvas).toMatchObject({ width: 320, height: 200 })
        expect(drawImage).toHaveBeenCalledWith(media, 0, 0, 320, 200)
    })

    it('reports false when drawing throws (an undecoded video)', () => {
        const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: () => { throw new Error('InvalidState') } }) }
        expect(drawPicture({ width: 2, height: 2 }, canvas)).toBe(false)
    })
})

describe('audioTracksOf', () => {
    it('takes live audio tracks from a MediaStream or a holder of one', () => {
        const live = { kind: 'audio', readyState: 'live' }
        const ended = { kind: 'audio', readyState: 'ended' }
        const stream = { getAudioTracks: () => [live, ended] }
        expect(audioTracksOf(stream)).toEqual([live])
        expect(audioTracksOf({ stream })).toEqual([live])
        expect(audioTracksOf(0.4)).toEqual([])
        expect(audioTracksOf(null)).toEqual([])
    })
})

describe('formatSeconds', () => {
    it('reads as minutes and seconds', () => {
        expect(formatSeconds(0)).toBe('0:00')
        expect(formatSeconds(75.9)).toBe('1:15')
        expect(formatSeconds(-3)).toBe('0:00')
    })
})
