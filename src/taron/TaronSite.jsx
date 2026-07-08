import { useEffect, useRef, useState } from 'react'
import { taronContent } from './content.js'
import './taron.css'

const prefersReducedMotion = () => typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

// A photograph that materialises from coarse pixel blocks when it scrolls into
// view — pixels become photos, page-wide. Handles any aspect ratio by
// emulating object-fit: cover during the pixelated passes.
function PixelImage({ src, alt }) {
    const wrapRef = useRef(null)
    const canvasRef = useRef(null)
    const [resolved, setResolved] = useState(() => prefersReducedMotion())

    useEffect(() => {
        if (resolved) return undefined
        const wrap = wrapRef.current
        if (!wrap || typeof IntersectionObserver === 'undefined') {
            setResolved(true)
            return undefined
        }
        let cancelled = false
        let timer = 0
        const observer = new IntersectionObserver((entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return
            observer.disconnect()
            const img = new Image()
            img.src = src
            const start = () => {
                if (cancelled) return
                const canvas = canvasRef.current
                if (!canvas || !img.naturalWidth) {
                    setResolved(true)
                    return
                }
                const rect = wrap.getBoundingClientRect()
                const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
                canvas.width = Math.max(2, Math.round(rect.width * dpr))
                canvas.height = Math.max(2, Math.round(rect.height * dpr))
                const ctx = canvas.getContext('2d')
                // object-fit: cover crop of the source, whatever its ratio
                const boxRatio = canvas.width / canvas.height
                const imgRatio = img.naturalWidth / img.naturalHeight
                let sx = 0
                let sy = 0
                let sw = img.naturalWidth
                let sh = img.naturalHeight
                if (imgRatio > boxRatio) {
                    sw = sh * boxRatio
                    sx = (img.naturalWidth - sw) / 2
                } else {
                    sh = sw / boxRatio
                    sy = (img.naturalHeight - sh) / 2
                }
                const small = document.createElement('canvas')
                const smallCtx = small.getContext('2d')
                const steps = [56, 32, 18, 10, 5, 2.5, 1]
                let index = 0
                const drawStep = () => {
                    if (cancelled) return
                    const factor = steps[index]
                    small.width = Math.max(1, Math.round(canvas.width / factor))
                    small.height = Math.max(1, Math.round(canvas.height / factor))
                    smallCtx.imageSmoothingEnabled = true
                    smallCtx.drawImage(img, sx, sy, sw, sh, 0, 0, small.width, small.height)
                    ctx.imageSmoothingEnabled = false
                    ctx.clearRect(0, 0, canvas.width, canvas.height)
                    ctx.drawImage(small, 0, 0, canvas.width, canvas.height)
                    index += 1
                    if (index < steps.length) {
                        timer = window.setTimeout(drawStep, 95)
                    } else {
                        setResolved(true)
                    }
                }
                drawStep()
            }
            if (img.decode) {
                img.decode().then(start).catch(start)
            } else {
                img.onload = start
                img.onerror = () => setResolved(true)
            }
        }, { threshold: 0.15 })
        observer.observe(wrap)
        return () => {
            cancelled = true
            window.clearTimeout(timer)
            observer.disconnect()
        }
    }, [src, resolved])

    return (
        <span className={`tg-pixel-img${resolved ? ' is-resolved' : ''}`} ref={wrapRef}>
            <canvas className="tg-pixel-img__canvas" ref={canvasRef} aria-hidden="true" />
            <img src={src} alt={alt} loading="lazy" />
        </span>
    )
}

// Fades children up once they scroll into view; instant when reduced motion.
function useRevealOnScroll(rootRef) {
    useEffect(() => {
        const root = rootRef.current
        if (!root) return undefined
        const targets = root.querySelectorAll('[data-reveal]')
        if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
            targets.forEach((el) => el.classList.add('is-visible'))
            return undefined
        }
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible')
                    observer.unobserve(entry.target)
                }
            })
        }, { threshold: 0.12 })
        targets.forEach((el) => observer.observe(el))
        return () => observer.disconnect()
    }, [rootRef])
}

export default function TaronSite() {
    const rootRef = useRef(null)
    const nameRef = useRef(null)
    const shatterRef = useRef(null)
    const thumbsRef = useRef([])
    const runningRef = useRef(false)
    useRevealOnScroll(rootRef)
    const { name, statement, about, portrait, works, columns, indexHeading, index, contact } = taronContent

    // Preload the photo thumbs — they are what the name's pixels turn into.
    useEffect(() => {
        let cancelled = false
        Promise.all(works.map((work) => new Promise((resolve) => {
            const img = new Image()
            img.onload = () => resolve(img)
            img.onerror = () => resolve(null)
            img.src = work.thumb
        }))).then((images) => {
            if (!cancelled) thumbsRef.current = images.filter(Boolean)
        })
        return () => { cancelled = true }
    }, [works])

    const scrollToWorks = (behavior) => {
        const scroller = rootRef.current
        const worksEl = scroller?.querySelector('.tg-works')
        if (!scroller || !worksEl) return
        scroller.scrollTo({ top: worksEl.offsetTop - 24, behavior })
    }

    // Scene 1 → scene 2, SOOT-style. The written name is a cloud of photographs
    // seen from far away: at frame zero every photo projects exactly onto one
    // pixel of the lettering. Clicking flies the camera forward through the
    // cloud — the pixels open into photographs that swell and stream past —
    // and it lands on the portfolio grid.
    const openPhotos = () => {
        const scroller = rootRef.current
        const nameEl = nameRef.current
        const canvas = shatterRef.current
        const thumbs = thumbsRef.current
        if (prefersReducedMotion() || !scroller || !nameEl || !canvas || !thumbs.length) {
            scrollToWorks(prefersReducedMotion() ? 'auto' : 'smooth')
            return
        }
        if (runningRef.current) return
        runningRef.current = true

        const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
        const box = canvas.getBoundingClientRect()
        canvas.width = Math.max(2, Math.round(box.width * dpr))
        canvas.height = Math.max(2, Math.round(box.height * dpr))
        const ctx = canvas.getContext('2d', { willReadFrequently: true })

        // Redraw the written name into the canvas at the same spot, then read
        // its pixels back: every opaque cell seeds one photograph in the cloud.
        ctx.fillStyle = '#ffffff'
        ctx.textBaseline = 'top'
        let fontPx = 100
        nameEl.querySelectorAll('span').forEach((span) => {
            const rect = span.getBoundingClientRect()
            fontPx = parseFloat(getComputedStyle(span).fontSize)
            ctx.font = `${fontPx * dpr}px "Geist Pixel"`
            ctx.fillText(span.textContent.toUpperCase(), rect.left * dpr, rect.top * dpr)
        })

        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        const opaqueAt = (px, py) => px >= 0 && py >= 0 && px < canvas.width && py < canvas.height
            && data[(py * canvas.width + px) * 4 + 3] > 128
        const cellHit = (x, y, size) => {
            const q = Math.max(1, size >> 2)
            const mid = size >> 1
            let hits = 0
            if (opaqueAt(x + mid, y + mid)) hits += 1
            if (opaqueAt(x + q, y + q)) hits += 1
            if (opaqueAt(x + size - q, y + q)) hits += 1
            if (opaqueAt(x + q, y + size - q)) hits += 1
            if (opaqueAt(x + size - q, y + size - q)) hits += 1
            return hits >= 2
        }
        const cell = Math.max(7, Math.round((fontPx * dpr) / 14))
        const cells = []
        for (let y = 0; y + cell <= canvas.height; y += cell) {
            for (let x = 0; x + cell <= canvas.width; x += cell) {
                if (cellHit(x, y, cell)) cells.push({ x, y })
            }
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        // Perspective camera: world position chosen so each photo projects
        // exactly onto its text cell at t = 0, at cell size. Depth is random,
        // so the flight reveals that the flat word was a deep cloud all along.
        const FOCAL = 900 * dpr
        const centreX = canvas.width / 2
        const centreY = canvas.height / 2
        const keep = Math.min(1, 480 / cells.length)
        const particles = []
        cells.forEach((c, i) => {
            if (Math.random() > keep) return
            const depth = 420 + Math.random() * 1280
            const scale0 = depth / FOCAL
            particles.push({
                worldX: (c.x + cell / 2 - centreX) * scale0,
                worldY: (c.y + cell / 2 - centreY) * scale0,
                depth,
                size: cell * 2 * scale0,
                img: thumbs[i % thumbs.length],
                spin: (Math.random() - 0.5) * 0.6,
                driftX: (Math.random() - 0.5) * 0.14,
                driftY: (Math.random() - 0.5) * 0.14
            })
        })
        particles.sort((a, b) => b.depth - a.depth)
        nameEl.style.opacity = '0'
        canvas.style.background = '#050505'

        const DURATION = 1900
        const HOLD = 160 // the word hangs for a beat before the dive
        const CAM_END = 1850
        const easeIn = (u) => u * u * (0.55 + 0.45 * u)
        const started = performance.now()
        let scrolled = false
        const tick = (now) => {
            const t = now - started
            const u = Math.min(Math.max((t - HOLD) / (DURATION - HOLD), 0), 1)
            const camZ = CAM_END * easeIn(u)
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            particles.forEach((p) => {
                const dz = p.depth - camZ
                if (dz < 28) return
                const s = FOCAL / dz
                const px = centreX + (p.worldX + p.driftX * t * (p.depth / 900)) * s
                const py = centreY + (p.worldY + p.driftY * t * (p.depth / 900)) * s
                const w = p.size * s
                if (px + w < 0 || px - w > canvas.width || py + w < 0 || py - w > canvas.height) return
                ctx.save()
                ctx.translate(px, py)
                ctx.rotate(p.spin * u)
                ctx.drawImage(p.img, -w / 2, -w / 2, w, w)
                ctx.restore()
            })
            if (!scrolled && t > 300) {
                scrolled = true
                // the jump happens behind the opaque particle field
                scrollToWorks('auto')
            }
            // fade the field out over the arriving grid
            canvas.style.opacity = String(Math.min(1, Math.max(0, (DURATION - t) / 420)))
            if (t < DURATION) {
                window.requestAnimationFrame(tick)
            } else {
                ctx.clearRect(0, 0, canvas.width, canvas.height)
                canvas.style.background = ''
                canvas.style.opacity = ''
                nameEl.style.opacity = ''
                runningRef.current = false
            }
        }
        window.requestAnimationFrame(tick)
    }

    return (
        <main className="tg-site" ref={rootRef}>
            {/* Scene 1: only the written name. */}
            <section className="tg-hero">
                <button
                    className="tg-hero__name"
                    type="button"
                    ref={nameRef}
                    onClick={openPhotos}
                    aria-label={`${name.join(' ')} — open the photographs`}
                >
                    <span>{name[0]}</span>
                    <span>{name[1]}</span>
                </button>
            </section>

            {/* Scene 2: the photographs. */}
            <section className="tg-works" aria-label="Selected work">
                {works.map((work) => (
                    <figure
                        className="tg-work"
                        key={work.id}
                        data-reveal
                        style={{ '--col': work.col, '--span': work.span, '--ratio': work.ratio }}
                    >
                        <PixelImage src={work.image} alt={work.alt} />
                    </figure>
                ))}
            </section>

            <section className="tg-statement" id="tg-statement" data-reveal>
                <p className="tg-statement__eyebrow">About</p>
                <h2 className="tg-statement__line">{statement}</h2>
                <div className="tg-statement__row">
                    <div className="tg-statement__copy">
                        {about.map((paragraph) => (
                            <p key={paragraph.slice(0, 24)}>{paragraph}</p>
                        ))}
                    </div>
                    <img className="tg-statement__portrait" src={portrait.src} alt={portrait.alt} loading="lazy" />
                </div>
            </section>

            <section className="tg-columns" data-reveal>
                {columns.map((column) => (
                    <div className="tg-column" key={column.heading}>
                        <h3>{column.heading}</h3>
                        {column.groups.map((group) => (
                            <ul key={group[0]}>
                                {group.map((item) => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>
                        ))}
                    </div>
                ))}
            </section>

            <section className="tg-index" data-reveal>
                <h3 className="tg-index__heading">{indexHeading}</h3>
                <ul>
                    {index.map((entry) => (
                        <li key={`${entry.label}-${entry.year}`}>
                            <span className="tg-index__label">{entry.label}</span>
                            <span className="tg-index__year">{entry.year}</span>
                        </li>
                    ))}
                </ul>
            </section>

            <footer className="tg-footer" id="tg-contact" aria-label="Contact">
                <a className="tg-footer__email" href={`mailto:${contact.email}`}>Email</a>
                <a className="tg-footer__instagram" href={contact.instagram} target="_blank" rel="noreferrer">
                    {contact.instagramLabel}
                </a>
                <p className="tg-footer__signoff">{contact.signoff}</p>
            </footer>

            <canvas className="tg-shatter" ref={shatterRef} aria-hidden="true" />
        </main>
    )
}
