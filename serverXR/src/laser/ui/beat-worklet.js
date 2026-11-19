// The laser desk's beat listener, on the audio thread (from Emily's Jam VJ, ~/dev/jam-vj/beat-worklet.js). Every 512
// samples it reports how much energy the bass (a low-pass at 120 Hz, where the kick lives) and the whole signal carried,
// with the audio clock time, so the page can find the beat (listen.js). It runs even when the page is behind others.
/* global AudioWorkletProcessor, sampleRate, currentTime, registerProcessor -- the audio thread's own names */
class BeatListener extends AudioWorkletProcessor {
  constructor () {
    super()
    this.hop = 512
    this.n = 0
    this.bass = 0
    this.full = 0
    const w = 2 * Math.PI * 120 / sampleRate, alpha = Math.sin(w) / (2 * 0.707), c = Math.cos(w), a0 = 1 + alpha
    this.k = [(1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0, -2 * c / a0, (1 - alpha) / a0]
    this.x1 = this.x2 = this.y1 = this.y2 = 0
  }

  process (inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (!ch) return true
    const [b0, b1, b2, a1, a2] = this.k
    for (let i = 0; i < ch.length; i++) {
      const x = ch[i]
      const y = b0 * x + b1 * this.x1 + b2 * this.x2 - a1 * this.y1 - a2 * this.y2
      this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y
      this.bass += y * y
      this.full += x * x
      if (++this.n === this.hop) {
        this.port.postMessage({ t: currentTime + (i + 1) / sampleRate, bass: this.bass / this.hop, full: this.full / this.hop })
        this.n = 0; this.bass = 0; this.full = 0
      }
    }
    return true
  }
}
registerProcessor('beat-listener', BeatListener)
