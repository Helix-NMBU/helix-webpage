import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Flip } from 'gsap/Flip'

gsap.registerPlugin(useGSAP, ScrollTrigger, Flip)

const PHOTOS = [
  { src: '/birk i bil 2.jpg',         alt: 'In the cockpit' },
  { src: '/lagbilde.jpg',             alt: 'Team photo' },
  { src: '/Silverstone.webp',          alt: 'Silverstone 2025' },
  { src: '/P1010055 1.webp',           alt: 'Race day' },
  { src: '/P1010366 1.webp',           alt: 'On track' },
  { src: '/birk i bil.webp',           alt: 'Cockpit' },
  { src: '/nav_pictures/garage.jpg',  alt: 'The garage' },
  { src: '/nav_pictures/journey.jpg', alt: 'Our journey' },
]

const EPIGRAPH_LINES = [
  'What you hear, you will probably forget.',
  'What you see, you might remember.',
  'But what you do, you will understand.',
]

const PARAGRAPHS = [
  "Helix started with a question: what if students didn't just study engineering — but built it? In 2022, a group of NMBU students decided that textbooks weren't enough. They wanted real problems, real constraints, and something real to show for it.",
  "Building a Formula Student car demands everything — late nights in the garage, arguments over suspension geometry, moments where nothing works and you have to figure out why. That pressure, that responsibility, is exactly the point. It is where engineers are made.",
  "Today, Helix is 30+ students from mechanical, electrical, and computer engineering — designing every component from scratch, competing at Formula Student events across Europe, and proving that a student team from NMBU belongs on the world stage.",
]

const CSS = `
.gallery-wrap {
  position: relative;
  width: 100%;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.gallery {
  position: relative;
  width: 100%;
  height: 100%;
  flex: none;
}
.gallery__item {
  background-position: 50% 50%;
  background-size: cover;
  flex: none;
  position: relative;
}
.gallery__item img {
  object-fit: cover;
  width: 100%;
  height: 100%;
}
.gallery--bento {
  display: grid;
  gap: 1vh;
  grid-template-columns: repeat(3, 32.5vw);
  grid-template-rows: repeat(4, 23vh);
  justify-content: center;
  align-content: center;
}
.gallery--final.gallery--bento {
  grid-template-columns: repeat(3, 100vw);
  grid-template-rows: repeat(4, 49.5vh);
  gap: 1vh;
}
.gallery--bento .gallery__item:nth-child(1) { grid-area: 1 / 1 / 3 / 2; }
.gallery--bento .gallery__item:nth-child(2) { grid-area: 1 / 2 / 2 / 3; }
.gallery--bento .gallery__item:nth-child(3) { grid-area: 2 / 2 / 4 / 3; }
.gallery--bento .gallery__item:nth-child(4) { grid-area: 1 / 3 / 3 / 4; }
.gallery--bento .gallery__item:nth-child(5) { grid-area: 3 / 1 / 4 / 2; }
.gallery--bento .gallery__item:nth-child(6) { grid-area: 3 / 3 / 5 / 4; }
.gallery--bento .gallery__item:nth-child(7) { grid-area: 4 / 1 / 5 / 2; }
.gallery--bento .gallery__item:nth-child(8) { grid-area: 4 / 2 / 5 / 3; }

/* ── Story ─────────────────────────────────────── */
.story-section {
  padding: 10rem 6vw 11rem;
  max-width: 1100px;
  margin: 0 auto;
}

.story-epigraph-section {
  width: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6rem 0;
  box-sizing: border-box;
}

.story-epigraph-label {
  font-size: clamp(0.75rem, 1.1vw, 0.9rem);
  font-weight: 400;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(0,0,0,0.35);
  margin-bottom: 2.5rem;
  text-align: center;
}

.story-epigraph {
  width: min(1200px, 92vw);
}

.story-epigraph-line {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  font-size: clamp(1.8rem, 4vw, 3.6rem);
  font-style: italic;
  font-weight: 500;
  line-height: 1.2;
  letter-spacing: -0.025em;
  margin: 0;
}

.story-epigraph-word {
  display: inline;
  color: rgba(0,0,0,0);
  will-change: color;
}

.story-epigraph-highlight {
  position: relative;
}

.story-epigraph-underline {
  position: absolute;
  bottom: 0.04em;
  left: 0;
  width: 100%;
  height: 0.07em;
  background: #002EC4;
  transform: scaleX(0);
  transform-origin: left center;
  will-change: transform;
}

.story-heading {
  text-align: center;
  margin: 0 0 6rem;
  font-size: clamp(1rem, 1.6vw, 1.15rem);
  font-weight: 400;
  line-height: 1.6;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(0,0,0,0.38);
}

.story-line-wrap {
  display: block;
  overflow: hidden;
  padding-bottom: 0.06em;
}

.story-line {
  display: block;
  will-change: transform;
}

.story-para {
  font-size: clamp(1rem, 1.7vw, 1.2rem);
  line-height: 1.82;
  color: rgba(0,0,0,0.62);
  margin-bottom: 2.4rem;
  opacity: 0;
  will-change: transform;
}

.story-para:last-of-type {
  margin-bottom: 5.5rem;
}

.story-closing {
  font-size: clamp(1.5rem, 3vw, 2.2rem);
  font-style: italic;
  font-weight: 300;
  line-height: 1.4;
  color: #07070a;
  padding-left: 2rem;
  border-left: 2.5px solid #002EC4;
  opacity: 0;
  will-change: transform;
}
`

export default function AboutPage() {
  const containerRef       = useRef<HTMLDivElement>(null)
  const galleryRef         = useRef<HTMLDivElement>(null)
  const wrapRef            = useRef<HTMLDivElement>(null)
  const epigraphSectionRef = useRef<HTMLElement>(null)
  const flipCtxRef         = useRef<ReturnType<typeof gsap.context> | null>(null)

  useGSAP(
    () => {
      const galleryEl = galleryRef.current!
      const wrapEl    = wrapRef.current!

      // ── Gallery: appear-in ──────────────────────────
      const items = galleryEl.querySelectorAll<HTMLElement>('.gallery__item')
      gsap.set(items, { opacity: 0, scale: 0.94, y: () => gsap.utils.random(12, 28) })
      gsap.to(items, {
        opacity: 1, scale: 1, y: 0,
        duration: () => gsap.utils.random(0.55, 0.9),
        ease: 'power3.out',
        stagger: { each: 0.07, from: 'random' },
        delay: 0.1,
      })

      // ── Gallery: bento → full flip on scroll ────────
      const createTween = () => {
        const items = galleryEl.querySelectorAll<HTMLElement>('.gallery__item')
        flipCtxRef.current?.revert()
        galleryEl.classList.remove('gallery--final')
        flipCtxRef.current = gsap.context(() => {
          galleryEl.classList.add('gallery--final')
          const flipState = Flip.getState(items)
          galleryEl.classList.remove('gallery--final')
          const flip = Flip.to(flipState, { simple: true, ease: 'expoScale(1, 5)' })
          gsap.timeline({
            scrollTrigger: {
              trigger: galleryEl,
              start: 'center center',
              end: '+=100%',
              scrub: true,
              pin: wrapEl,
            },
          }).add(flip)
          return () => gsap.set(items, { clearProps: 'all' })
        })
      }
      createTween()
      window.addEventListener('resize', createTween)

      // ── Epigraph: pin + uncover → read word-by-word ──
      const epigraphSection = epigraphSectionRef.current!
      const allWords = Array.from(epigraphSection.querySelectorAll<HTMLElement>('.story-epigraph-word'))
      gsap.set(allWords, { color: 'rgba(0,0,0,0)' })

      const step = 0.06
      const lookahead = 5
      const preVisible = 4  // words already dimmed when user arrives

      const epigraphTl = gsap.timeline({
        scrollTrigger: {
          trigger: epigraphSection,
          start: 'top top',
          end: '+=110%',
          pin: true,
          scrub: 1.2,
          onEnter:     () => gsap.set(allWords.slice(0, preVisible), { color: 'rgba(0,0,0,0.07)' }),
          onLeaveBack: () => gsap.set(allWords.slice(0, preVisible), { color: 'rgba(0,0,0,0)' }),
        },
      })

      // Pass 1: words after the pre-visible ones fade transparent → dimmed
      // Long duration causes overlapping fades = gradient-like rolling reveal
      epigraphTl.to(allWords.slice(preVisible), {
        color: 'rgba(0,0,0,0.07)',
        stagger: { each: step },
        ease: 'power2.out',
        duration: 0.35,
      }, 0)

      // Pass 2: each word → black, timing offset by (lookahead - preVisible)
      // so the read cursor starts immediately against the already-visible words
      allWords.forEach((word, i) => {
        const targetColor = word.classList.contains('story-epigraph-highlight') ? '#002EC4' : '#07070a'
        epigraphTl.to(word, { color: targetColor, ease: 'power2.out', duration: 0.14 },
          Math.max(0, i + lookahead - preVisible) * step)
      })

      // ── Underline draws in on "understand." ─────────
      const underlineEl = epigraphSection.querySelector<HTMLElement>('.story-epigraph-underline')
      if (underlineEl) {
        gsap.set(underlineEl, { scaleX: 0, transformOrigin: 'left center' })
        const underlineStart = Math.max(0, (allWords.length - 1) + lookahead - preVisible) * step + 0.04
        epigraphTl.to(underlineEl, { scaleX: 1, duration: 0.4, ease: 'power2.inOut' }, underlineStart)
      }

      // ── Subtitle: fade up ────────────────────────────
      gsap.from('.story-line', {
        y: 18,
        opacity: 0,
        duration: 0.85,
        ease: 'power3.out',
        scrollTrigger: { trigger: '.story-heading', start: 'top 90%' },
      })

      // ── Paragraphs: stagger in ───────────────────────
      gsap.set('.story-para', { y: 40 })
      ScrollTrigger.batch('.story-para', {
        once: true,
        start: 'top 88%',
        onEnter: (els) =>
          gsap.to(els, {
            opacity: 1, y: 0,
            duration: 0.85,
            stagger: 0.15,
            ease: 'power3.out',
            overwrite: true,
          }),
      })

      // ── Closing quote ────────────────────────────────
      gsap.set('.story-closing', { y: 32 })
      gsap.to('.story-closing', {
        opacity: 1, y: 0,
        duration: 1.1,
        ease: 'power2.out',
        scrollTrigger: { trigger: '.story-closing', start: 'top 88%' },
      })

      return () => {
        window.removeEventListener('resize', createTween)
        flipCtxRef.current?.revert()
      }
    },
    { scope: containerRef },
  )

  return (
    <div
      ref={containerRef}
      style={{ backgroundColor: '#ffffff', color: '#07070a', minHeight: '100vh' }}
    >
      <style>{CSS}</style>

      {/* Bento gallery */}
      <div className="gallery-wrap" ref={wrapRef}>
        <div className="gallery gallery--bento" ref={galleryRef}>
          {PHOTOS.map((photo, i) => (
            <div key={i} className="gallery__item">
              <img src={photo.src} alt={photo.alt} loading="lazy" />
            </div>
          ))}
        </div>
      </div>

      {/* Epigraph — pinned, word-by-word reveal */}
      <section className="story-epigraph-section" ref={epigraphSectionRef}>
        <p className="story-epigraph-label">As someone once said…</p>
        <div className="story-epigraph">
          {EPIGRAPH_LINES.map((line, i) => (
            <p key={i} className="story-epigraph-line">
              {line.split(' ').map((word, j, arr) => {
                const isHighlight = word.toLowerCase().startsWith('understand')
                if (isHighlight) return (
                  <span key={j} className="story-epigraph-word story-epigraph-highlight">
                    {word}
                    <span className="story-epigraph-underline" aria-hidden="true" />
                  </span>
                )
                return (
                  <span key={j} className="story-epigraph-word">
                    {word}{j < arr.length - 1 ? ' ' : ''}
                  </span>
                )
              })}
            </p>
          ))}
        </div>
      </section>

      {/* Story section */}
      <section className="story-section">

        <p className="story-heading">
          <span className="story-line">Built with the drive to do more.</span>
        </p>

        {PARAGRAPHS.map((text, i) => (
          <p key={i} className="story-para">{text}</p>
        ))}

        <p className="story-closing">
          It's not just about building racecars.<br />
          It's about shaping the people who will<br />
          design the future.
        </p>

      </section>
    </div>
  )
}
