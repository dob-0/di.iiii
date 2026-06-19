import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import * as THREE from 'three'
import { appNavigate } from '../../utils/appNavigate.js'
import { landingContent } from './content.js'
import './landing.css'

gsap.registerPlugin(ScrollTrigger)

const panels = [
    {
        id: 'about-project',
        label: 'ABOUT WCC',
        description: 'Learn about WCC, mentorship, expert talks, and shared creative practice.',
        action: 'Read about'
    },
    {
        id: 'artist-works',
        label: 'ARTIST WORKS',
        description: 'Explore artworks created by participants.',
        action: 'Open works'
    },
    {
        id: 'exhibition',
        label: 'EXHIBITION',
        description: 'Enter the WCC: Women Creating Change virtual exhibition space.',
        action: 'Enter space',
        href: '/wcc/scene'
    }
]

const circleItems = [
    { className: 'is-hero', label: 'collective imagination' },
    { className: 'is-right', label: 'exhibition' },
    { className: 'is-top', label: 'voices' },
    { className: 'is-small-a', label: 'care' },
    { className: 'is-small-b', label: 'memory' },
    { className: 'is-small-c', label: 'resistance' },
    { className: 'is-bottom', label: 'gathering' },
    { className: 'is-dot', label: 'story' }
]

const ambientDotItems = Array.from({ length: 26 }, (_, index) => index)
const processImages = Array.from({ length: 30 }, (_, index) => ({
    src: `/wcc/process/process-${String(index + 1).padStart(2, '0')}.jpeg`,
    alt: `WCC process documentation photo ${index + 1}`
}))
const routeSectionIds = new Set(panels.filter((panel) => !panel.href).map((panel) => panel.id))

const getRouteSection = () => {
    if (typeof window === 'undefined') return null
    const section = new URLSearchParams(window.location.search).get('section')
    return routeSectionIds.has(section) ? section : null
}

const buildSectionPath = (sectionId) => {
    if (typeof window === 'undefined') return '/wcc'
    const nextUrl = new URL(window.location.href)
    if (sectionId) {
        nextUrl.searchParams.set('section', sectionId)
    } else {
        nextUrl.searchParams.delete('section')
    }
    return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
}

const handleAppLinkClick = (event, href) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) {
        return
    }
    event.preventDefault()
    appNavigate(href)
}

function WebglVeil() {
    const mountRef = useRef(null)

    useEffect(() => {
        const mount = mountRef.current
        if (!mount) return undefined

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
        camera.position.z = 5

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6))
        renderer.setClearColor(0x000000, 0)
        mount.appendChild(renderer.domElement)

        const geometry = new THREE.BufferGeometry()
        const count = 700
        const positions = new Float32Array(count * 3)
        for (let i = 0; i < count; i += 1) {
            positions[i * 3] = (Math.random() - 0.5) * 10
            positions[i * 3 + 1] = (Math.random() - 0.5) * 6
            positions[i * 3 + 2] = (Math.random() - 0.5) * 4
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

        const material = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.012,
            transparent: true,
            opacity: 0.42,
            depthWrite: false
        })
        const field = new THREE.Points(geometry, material)
        scene.add(field)

        const pointer = { x: 0, y: 0 }
        const onPointerMove = (event) => {
            pointer.x = (event.clientX / window.innerWidth - 0.5) * 0.35
            pointer.y = (event.clientY / window.innerHeight - 0.5) * 0.35
        }

        const resize = () => {
            const width = mount.clientWidth || window.innerWidth
            const height = mount.clientHeight || window.innerHeight
            camera.aspect = width / height
            camera.updateProjectionMatrix()
            renderer.setSize(width, height)
        }

        let frameId = 0
        const clock = new THREE.Clock()
        const tick = () => {
            const elapsed = clock.getElapsedTime()
            field.rotation.y = elapsed * 0.025 + pointer.x
            field.rotation.x = elapsed * 0.015 + pointer.y
            renderer.render(scene, camera)
            frameId = window.requestAnimationFrame(tick)
        }

        resize()
        tick()
        window.addEventListener('resize', resize)
        window.addEventListener('pointermove', onPointerMove)

        return () => {
            window.cancelAnimationFrame(frameId)
            window.removeEventListener('resize', resize)
            window.removeEventListener('pointermove', onPointerMove)
            geometry.dispose()
            material.dispose()
            renderer.dispose()
            renderer.domElement.remove()
        }
    }, [])

    return <div className="wcc-webgl" ref={mountRef} aria-hidden="true" />
}

function BackgroundRippleField({ ripples }) {
    return (
        <div className="wcc-ripple-field" aria-hidden="true">
            {ripples.map((ripple) => (
                <span
                    className="wcc-ripple"
                    key={ripple.id}
                    style={{
                        left: `${ripple.x}px`,
                        top: `${ripple.y}px`,
                        '--ripple-size': `${ripple.size}px`,
                        '--ripple-delay': `${ripple.delay}ms`
                    }}
                />
            ))}
        </div>
    )
}

function EnterExhibitionButton({ className = '', onEnter = null }) {
    const handleClick = (event) => {
        if (onEnter) {
            event.preventDefault()
            onEnter(event)
            return
        }
        handleAppLinkClick(event, '/wcc/scene')
    }
    return (
        <a className={`wcc-enter-button ${className}`} href="/wcc/scene" onClick={handleClick}>
            Enter exhibition
        </a>
    )
}

function LanguageSwitch({ lang, onChange }) {
    return (
        <div className="wcc-language-switch" role="group" aria-label="Language">
            <span>Language</span>
            <button type="button" className={lang === 'en' ? 'is-active' : ''} onClick={() => onChange('en')}>
                EN
            </button>
            <button type="button" className={lang === 'hy' ? 'is-active' : ''} onClick={() => onChange('hy')}>
                ՀՅ
            </button>
        </div>
    )
}

function ScrollArrow({ onClick }) {
    return (
        <button className="wcc-scroll-arrow" type="button" onClick={onClick} aria-label="Scroll to navigation">
            <span aria-hidden="true">↓</span>
        </button>
    )
}

function LandingHero({ onEnter = null }) {
    return (
        <section className="wcc-hero" aria-labelledby="wcc-title">
            <p className="wcc-hero__kicker">Creative Lab • Mentorship • Exhibition</p>
            <h1 id="wcc-title">
                <span>WCC:</span>
                <span>Women Creating Change</span>
            </h1>
            {landingContent.subtitle ? <p className="wcc-hero__subtitle">{landingContent.subtitle}</p> : null}
            <div className="wcc-hero__footer">
                <span>Scroll to navigate</span>
                <EnterExhibitionButton onEnter={onEnter} />
            </div>
        </section>
    )
}

function NavigationPanel({ panel, index, active, onOpen, onEnter = null }) {
    const handleClick = (event) => {
        if (panel.href) {
            if (onEnter) {
                event.preventDefault()
                onEnter(event)
                return
            }
            handleAppLinkClick(event, panel.href)
            return
        }
        onOpen(panel.id)
    }

    return (
        <button
            className={`wcc-nav-panel ${active ? 'is-active' : ''}`}
            type="button"
            onClick={handleClick}
            style={{ '--panel-index': index }}
        >
            <span className="wcc-nav-panel__number">{String(index + 1).padStart(2, '0')}</span>
            <span className="wcc-nav-panel__title">{panel.label}</span>
            <span className="wcc-nav-panel__description">{panel.description}</span>
            <span className="wcc-nav-panel__action">{panel.action}</span>
        </button>
    )
}

function HorizontalNavigation({ activeIndex, onActiveIndexChange, onOpen, onEnter = null, scrollerRef }) {
    const sectionRef = useRef(null)
    const trackRef = useRef(null)

    useLayoutEffect(() => {
        const section = sectionRef.current
        const track = trackRef.current
        if (!section || !track) return undefined

        const ctx = gsap.context(() => {
            const mm = gsap.matchMedia()
            mm.add('(min-width: 801px)', () => {
                gsap.to(track, {
                    x: () => `-${Math.max(0, track.scrollWidth - window.innerWidth)}px`,
                    ease: 'none',
                    scrollTrigger: {
                        trigger: section,
                        scroller: scrollerRef.current,
                        start: 'top top',
                        end: () => `+=${track.scrollWidth}`,
                        pin: true,
                        scrub: 0.65,
                        invalidateOnRefresh: true,
                        onUpdate: (self) => {
                            const next = Math.min(panels.length - 1, Math.round(self.progress * (panels.length - 1)))
                            onActiveIndexChange(next)
                        }
                    }
                })
            })
            return () => mm.revert()
        }, section)

        return () => ctx.revert()
    }, [onActiveIndexChange, scrollerRef])

    return (
        <section className="wcc-horizontal" ref={sectionRef} aria-label="Exhibition navigation">
            <div className="wcc-panel-track" ref={trackRef}>
                {panels.map((panel, index) => (
                    <NavigationPanel
                        active={activeIndex === index}
                        index={index}
                        key={panel.id}
                        onEnter={onEnter}
                        onOpen={onOpen}
                        panel={panel}
                    />
                ))}
            </div>
        </section>
    )
}

function ArtistWorks() {
    return (
        <div className="wcc-artist-works-embed">
            <iframe
                title="WCC artist works"
                src="/wcc/artist-works-land/index.html"
                sandbox="allow-scripts allow-same-origin"
            />
        </div>
    )
}

function AboutProject() {
    const [processColor, setProcessColor] = useState(false)

    return (
        <div className="wcc-text-columns wcc-text-columns--about">
            <div className="wcc-about-running-dots" aria-hidden="true">
                {Array.from({ length: 8 }, (_, index) => (
                    <span key={index} />
                ))}
            </div>
            <p>
                WCC: Women Creating Change was a contemporary art initiative designed to create a space for
                learning, dialogue, and artistic production around themes of gender equality, representation,
                self-expression, and social engagement.
            </p>
            <p>
                The project began with a series of three expert talks that introduced participants to different
                artistic practices and personal experiences related to the project&apos;s themes.
            </p>
            <p className="wcc-about-session" style={{ '--session-number': '"01"' }}>
                The first session was led by Tatev Hovakimyan, who spoke about her experience as an artist, her
                encounters with hate speech, and the ways in which she transforms personal emotions and experiences
                into artistic expression.
            </p>
            <p className="wcc-about-session" style={{ '--session-number': '"02"' }}>
                The second session featured Ani Khachikyan, who shared her experience of navigating hate speech and
                personal triggers, maintaining a work-life balance, and using performance as a form of advocacy. The
                discussion focused on how personal experiences influence artistic practice and how art can become a
                tool for visibility and social engagement.
            </p>
            <p className="wcc-about-session" style={{ '--session-number': '"03"' }}>
                The third session was conducted by Anika Krbetschek, a Berlin-based artist and curator who has also
                worked extensively in Armenia. Drawing from her experience in different cultural contexts, she
                reflected on the challenges and opportunities she encountered as a woman artist. She also shared
                personal experiences from her early years, discussing the difficulties she faced and how these
                experiences informed her professional and artistic development.
            </p>
            <p>
                Following the expert talks, participants engaged in a mentorship program focused on storytelling,
                concept development and writing, 3D modeling, and digital art practices. The mentorship phase
                supported participants in developing their ideas, strengthening their creative and technical skills,
                and translating personal experiences into artistic concepts. While some participants were taking their
                first steps in the field of art, others already had an established creative background, creating a
                diverse environment for exchange and peer learning.
            </p>
            <p>
                As a result of the mentorship process, participants conceptualized and produced original artworks
                informed by their personal perspectives and creative practices.
            </p>
            <div className={`wcc-process-gallery ${processColor ? 'is-color' : ''}`}>
                <div className="wcc-process-gallery__header">
                    <span>process documentation</span>
                    <button type="button" onClick={() => setProcessColor(true)}>
                        reveal color
                    </button>
                </div>
                <div className="wcc-process-gallery__grid">
                    {processImages.map((image, index) => (
                        <button
                            className="wcc-process-photo"
                            key={image.src}
                            type="button"
                            onClick={() => setProcessColor(true)}
                            aria-label={`Reveal process image ${index + 1} in color`}
                        >
                            <img src={image.src} alt={image.alt} />
                        </button>
                    ))}
                </div>
            </div>
            <p className="wcc-about-highlight">
                The final phase of the project focused on the digitization and presentation of the artworks. The
                project team chose to create a virtual exhibition in order to provide a safe and accessible environment
                for participants and audiences alike. Beyond serving as an exhibition format, the digital platform was
                envisioned as a valuable and long-term archive that preserves the artworks and makes them accessible
                beyond the duration of the project.
            </p>
        </div>
    )
}

function SectionReveal({ sectionId, onClose }) {
    const shellRef = useRef(null)
    if (!sectionId) return null

    const panel = panels.find((item) => item.id === sectionId)
    const contentById = {
        'artist-works': <ArtistWorks />,
        'about-project': <AboutProject />
    }

    return (
        <section className={`wcc-reveal wcc-reveal--${sectionId}`} ref={shellRef} aria-label={panel?.label || 'Section'}>
            <div className="wcc-reveal__chrome">
                <span>{panel?.label}</span>
                <button type="button" onClick={onClose}>Close</button>
            </div>
            <div className={`wcc-reveal__body wcc-reveal__body--${sectionId}`}>
                {sectionId === 'artist-works' ? null : <h2>{panel?.label}</h2>}
                {sectionId === 'about-project' || sectionId === 'artist-works' ? null : <p>{panel?.description}</p>}
                {contentById[sectionId]}
            </div>
        </section>
    )
}

export default function LandingPage({ onEnterExhibition = null, lang: controlledLang = null, onLangChange = null }) {
    const rootRef = useRef(null)
    const cursorRef = useRef(null)
    const particleLayerRef = useRef(null)
    const scrollStopTimerRef = useRef(0)
    const [activeIndex, setActiveIndex] = useState(0)
    const [openSection, setOpenSection] = useState(() => getRouteSection())
    const [ripples, setRipples] = useState([])
    const [internalLang, setInternalLang] = useState('en')
    const lang = controlledLang || internalLang
    const setLang = onLangChange || setInternalLang

    const openRouteSection = (sectionId) => {
        if (!routeSectionIds.has(sectionId)) return
        setOpenSection(sectionId)
        if (typeof window === 'undefined') return
        window.history.pushState({ wccSection: sectionId }, '', buildSectionPath(sectionId))
    }

    const closeRouteSection = () => {
        setOpenSection(null)
        if (typeof window === 'undefined') return
        if (window.history.state?.wccSection) {
            window.history.back()
            return
        }
        window.history.replaceState(window.history.state, '', buildSectionPath(null))
    }

    const scrollLanding = () => {
        const root = rootRef.current
        if (!root) return
        // A scroll (smooth or native) is already in flight — recomputing the
        // target off a mid-animation scrollTop restarts the browser's smooth
        // scroll mid-flight, which fights the ScrollTrigger-pinned nav track
        // and shows up as the panels glitching/jumping.
        if (root.classList.contains('is-scrolling')) return
        const viewport = root.clientHeight || window.innerHeight
        const targets = [viewport, viewport * 2.08, root.scrollHeight - viewport]
            .filter((value, index, values) => value > root.scrollTop + 24 && values.indexOf(value) === index)
        const nextTop = targets[0] ?? 0
        root.scrollTo({
            top: nextTop,
            behavior: 'smooth'
        })
    }

    useLayoutEffect(() => {
        const root = rootRef.current
        if (!root) return undefined

        const ctx = gsap.context(() => {
            gsap.from('.wcc-hero__kicker, .wcc-hero h1 span, .wcc-hero__subtitle, .wcc-hero__footer', {
                y: 56,
                opacity: 0,
                duration: 1.05,
                stagger: 0.08,
                ease: 'power3.out'
            })
            gsap.fromTo('.wcc-circle', {
                y: '-170vh',
                opacity: 0,
                scale: 0.78
            }, {
                y: 0,
                opacity: 1,
                scale: 1,
                duration: 2.65,
                stagger: 0.11,
                delay: 0.12,
                ease: 'elastic.out(0.62, 0.32)'
            })
            gsap.to('.wcc-circle.is-hero', {
                x: 34,
                y: -46,
                rotation: 8,
                duration: 7,
                delay: 2.6,
                ease: 'sine.inOut',
                repeat: -1,
                yoyo: true
            })
            gsap.to('.wcc-circle.is-right', {
                x: -42,
                y: 36,
                rotation: -10,
                duration: 8.5,
                delay: 2.8,
                ease: 'sine.inOut',
                repeat: -1,
                yoyo: true
            })
        }, root)

        return () => ctx.revert()
    }, [])

    useEffect(() => {
        const syncSectionFromHistory = () => {
            setOpenSection(getRouteSection())
        }
        window.addEventListener('popstate', syncSectionFromHistory)
        return () => window.removeEventListener('popstate', syncSectionFromHistory)
    }, [])

    useLayoutEffect(() => {
        if (!openSection) return undefined
        const ctx = gsap.context(() => {
            gsap.fromTo('.wcc-reveal', {
                clipPath: 'inset(0 0 100% 0)',
                opacity: 0
            }, {
                clipPath: 'inset(0 0 0% 0)',
                opacity: 1,
                duration: 0.72,
                ease: 'power3.out'
            })
            gsap.from('.wcc-reveal__body > *', {
                y: 28,
                opacity: 0,
                duration: 0.8,
                stagger: 0.08,
                delay: 0.18,
                ease: 'power3.out'
            })
        })
        return () => ctx.revert()
    }, [openSection])

    useEffect(() => {
        const cursor = cursorRef.current
        if (!cursor) return undefined
        const root = rootRef.current
        const moveX = gsap.quickTo(cursor, 'x', { duration: 0.5, ease: 'power3.out' })
        const moveY = gsap.quickTo(cursor, 'y', { duration: 0.5, ease: 'power3.out' })
        const circles = gsap.utils.toArray('.wcc-circle')
        const circleTweens = circles.map((circle, index) => ({
            xTo: gsap.quickTo(circle, 'x', { duration: 0.9 + index * 0.03, ease: 'power3.out' }),
            yTo: gsap.quickTo(circle, 'y', { duration: 0.9 + index * 0.03, ease: 'power3.out' })
        }))
        const onMove = (event) => {
            if (rootRef.current?.classList.contains('is-scrolling')) return
            moveX(event.clientX)
            moveY(event.clientY)
            const xRatio = event.clientX / window.innerWidth - 0.5
            const yRatio = event.clientY / window.innerHeight - 0.5
            circleTweens.forEach(({ xTo, yTo }, index) => {
                const depth = (index + 1) * 8
                xTo(xRatio * depth)
                yTo(yRatio * depth * -0.7)
            })
        }
        const onDown = (event) => {
            if (event.target?.closest?.('.wcc-scroll-arrow')) return
            setRipples((current) => [
                ...current.slice(-8),
                {
                    id: `${Date.now()}-${Math.random()}`,
                    x: event.clientX,
                    y: event.clientY,
                    size: gsap.utils.random(120, 360),
                    delay: gsap.utils.random(0, 120)
                }
            ])
            let dot = event.target?.closest?.('.wcc-circle, .wcc-ambient-dots span')
            if (!dot) {
                dot = [...document.querySelectorAll('.wcc-circle, .wcc-ambient-dots span')]
                    .reverse()
                    .find((item) => {
                        const rect = item.getBoundingClientRect()
                        return event.clientX >= rect.left
                            && event.clientX <= rect.right
                            && event.clientY >= rect.top
                            && event.clientY <= rect.bottom
                    })
            }
            if (!dot) return
            gsap.fromTo(dot, { scale: 0.92 }, { scale: 1.18, duration: 0.42, yoyo: true, repeat: 1, ease: 'power3.out' })
            rootRef.current?.classList.toggle('is-black-bg')

            const layer = particleLayerRef.current
            if (!layer) return
            const rect = dot.getBoundingClientRect()
            const originX = rect.left + rect.width * 0.5
            const originY = rect.top + rect.height * 0.5
            Array.from({ length: 30 }).forEach((_, index) => {
                const particle = document.createElement('span')
                const size = gsap.utils.random(7, 28)
                const pageBottom = Math.max(rootRef.current?.scrollHeight || 0, window.innerHeight)
                particle.style.width = `${size}px`
                particle.style.left = `${originX + gsap.utils.random(-rect.width * 0.32, rect.width * 0.32)}px`
                particle.style.top = `${originY + gsap.utils.random(-rect.height * 0.18, rect.height * 0.18)}px`
                layer.appendChild(particle)

                const fall = gsap.timeline({ onComplete: () => particle.remove() })
                fall.fromTo(particle, {
                    opacity: 0,
                    scale: gsap.utils.random(0.2, 0.75),
                    x: 0,
                    y: 0
                }, {
                    opacity: gsap.utils.random(0.75, 1),
                    scale: gsap.utils.random(0.7, 1.45),
                    x: gsap.utils.random(-210, 210),
                    y: pageBottom - originY + gsap.utils.random(80, 260),
                    rotation: gsap.utils.random(-220, 220),
                    duration: gsap.utils.random(4.2, 7.4),
                    delay: index * 0.012,
                    ease: 'sine.inOut'
                })
                fall.to(particle, {
                    x: `+=${gsap.utils.random(-120, 120)}`,
                    duration: gsap.utils.random(1.1, 2.2),
                    ease: 'sine.inOut',
                    repeat: 2,
                    yoyo: true
                }, 0.15)
            })
        }
        const onScroll = () => {
            if (!root) return
            root.classList.add('is-scrolling')
            window.clearTimeout(scrollStopTimerRef.current)
            scrollStopTimerRef.current = window.setTimeout(() => {
                root.classList.remove('is-scrolling')
            }, 420)
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerdown', onDown)
        root?.addEventListener('scroll', onScroll, { passive: true })
        return () => {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerdown', onDown)
            root?.removeEventListener('scroll', onScroll)
            window.clearTimeout(scrollStopTimerRef.current)
        }
    }, [])

    useEffect(() => {
        if (!ripples.length) return undefined
        const timer = window.setTimeout(() => {
            setRipples((current) => current.slice(1))
        }, 1300)
        return () => window.clearTimeout(timer)
    }, [ripples])

    return (
        <main className="wcc-landing" ref={rootRef}>
            <WebglVeil />
            <BackgroundRippleField ripples={ripples} />
            <div className="wcc-circle-field" aria-label="Interactive WCC themes">
                {circleItems.map((circle) => (
                    <button
                        className={`wcc-circle ${circle.className}`}
                        key={circle.className}
                        type="button"
                        aria-label={circle.label}
                    />
                ))}
            </div>
            <div className="wcc-ambient-dots" aria-hidden="true">
                {ambientDotItems.map((index) => (
                    <span key={index} />
                ))}
            </div>
            <div className="wcc-particle-layer" ref={particleLayerRef} aria-hidden="true" />
            <div className="wcc-cursor" ref={cursorRef} aria-hidden="true" />
            <LanguageSwitch lang={lang} onChange={setLang} />
            <ScrollArrow onClick={scrollLanding} />
            <LandingHero onEnter={onEnterExhibition} />
            <HorizontalNavigation
                activeIndex={activeIndex}
                onActiveIndexChange={setActiveIndex}
                onEnter={onEnterExhibition}
                onOpen={openRouteSection}
                scrollerRef={rootRef}
            />
            <SectionReveal sectionId={openSection} onClose={closeRouteSection} />
        </main>
    )
}
