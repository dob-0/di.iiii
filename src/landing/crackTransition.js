// The inverse of enterFlight's "Step inside": that one glides a camera
// forward, smooth and continuous. This one is what the owner asked for on
// the route below it — Spaces, "where you go what built and create
// yourself" — a break, not a glide: the whole screen splits into shards
// from a point and grows past the frame, in the eyes, all at once, then the
// destination is reached. Pure DOM/CSS, no WebGL: Spaces is a real page
// change (a different surface entirely, not a camera move within this one),
// so the shards cover what is on screen and fly apart rather than trying to
// render the destination underneath them.
//
// "Not the same play twice" (his words) is load-bearing, not decoration —
// origin point, shard count and each shard's angle/spread/distance/rotation
// are re-rolled on every call, so no two visits crack the same way.
const DURATION_MS = 640

export function crackAway({ reducedMotion = false, onDone } = {}) {
  if (typeof document === 'undefined') { onDone?.(); return () => {} }
  if (reducedMotion) { onDone?.(); return () => {} }

  const overlay = document.createElement('div')
  overlay.className = 'lp-crack-overlay'
  overlay.setAttribute('aria-hidden', 'true')

  const originX = 20 + Math.random() * 60
  const originY = 20 + Math.random() * 60
  overlay.style.setProperty('--ox', `${originX}%`)
  overlay.style.setProperty('--oy', `${originY}%`)

  const shardCount = 7 + Math.floor(Math.random() * 6) // 7–12: varies every time
  const rotationBias = Math.random() < 0.5 ? -1 : 1
  for (let i = 0; i < shardCount; i += 1) {
    const shard = document.createElement('div')
    shard.className = 'lp-crack-shard'
    const angle = (360 / shardCount) * i + (Math.random() * 18 - 9)
    const spread = 26 + Math.random() * 30
    const rad = (deg) => (deg * Math.PI) / 180
    const pt = (deg, r) => `${50 + Math.cos(rad(deg)) * r}% ${50 + Math.sin(rad(deg)) * r}%`
    shard.style.clipPath = `polygon(50% 50%, ${pt(angle - spread / 2, 78)}, ${pt(angle, 95)}, ${pt(angle + spread / 2, 78)})`
    // Each shard already covers the full viewport (clipped to its wedge), so
    // scaling it up is what carries it past the frame — this only needs to
    // add a modest directional drift, not travel the distance itself. The
    // first version used 55-110vmax here with translate as the OUTER
    // transform function, multiplying it by the scale and flinging every
    // shard thousands of pixels off-screen before the first visible frame.
    const dist = 6 + Math.random() * 14
    const rot = rotationBias * (10 + Math.random() * 30)
    shard.style.setProperty('--tx', `${Math.cos(rad(angle)) * dist}vmax`)
    shard.style.setProperty('--ty', `${Math.sin(rad(angle)) * dist}vmax`)
    shard.style.setProperty('--rot', `${rot}deg`)
    shard.style.setProperty('--shard-deg', `${angle + 90}deg`)
    shard.style.transitionDelay = `${Math.random() * 90}ms`
    overlay.appendChild(shard)
  }

  document.body.appendChild(overlay)
  // Force layout so the shards paint at rest before the class flips them
  // to their grown, flung state — without this the browser is free to
  // coalesce both states into one frame and nothing visibly cracks.
  void overlay.offsetHeight
  requestAnimationFrame(() => overlay.classList.add('is-live'))

  let cancelled = false
  const timer = window.setTimeout(() => {
    if (cancelled) return
    onDone?.()
  }, DURATION_MS)

  return () => {
    if (cancelled) return
    cancelled = true
    window.clearTimeout(timer)
    overlay.remove()
  }
}
