import { useEffect, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import JoinUsSection from '../Home/components/JoinUsSection'

gsap.registerPlugin(useGSAP)

type RawMember = {
  id: number
  name: string
  department: string
  position?: string
  fieldOfStudy: string
  yearOfStudy: number | string
  seasonsInHelix: number
}

type Member = RawMember & { position: string; photo: string; mappedDept: string }

// ─── Departments (same order as Apply page) ───────────────────────────────────

const DEPARTMENTS = [
  'The Board',
  'Mechanical & Production',
  'Electronics',
  'Business & Marketing',
  'Economics',
  'Software',
] as const

// ─── Positions per department ─────────────────────────────────────────────────

const DEPT_ROLES: Record<string, string[]> = {
  'Mechanical & Production': ['Mechanical Lead', 'Structural Engineer', 'Manufacturing Engineer', 'Composites Engineer', 'Systems Engineer', 'Suspension Engineer', 'Chassis Engineer'],
  'Electronics':             ['Electrical Lead', 'PCB Design Engineer', 'BMS Engineer', 'Wiring Harness Engineer', 'Power Electronics Engineer', 'HV Systems Engineer'],
  'Business & Marketing':    ['Head of Business', 'Brand Manager', 'Social Media Manager', 'Content Creator', 'Partner Relations', 'Communications Officer'],
  'Economics':               ['CFO', 'Financial Controller', 'Budget Analyst', 'Sponsorship Manager', 'Finance Officer', 'Treasurer'],
  'Software':                ['Autonomous Systems Lead', 'ML Engineer', 'Computer Vision Engineer', 'Lead Developer', 'Full-Stack Engineer', 'Backend Developer', 'Data Engineer'],
  'Logistics':               ['Head of Logistics', 'Competition Coordinator', 'Workshop Manager', 'Travel Coordinator', 'Operations Officer'],
  'The Board':               ['President', 'Vice President', 'Board Member'],
}

const DEPT_META = { color: '#111827', bg: '#F3F4F6' }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/)
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function MemberCard({ member, index, navReady }: { member: Member; index: number; navReady: boolean }) {
  const [imgError, setImgError] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [revealed, setRevealed] = useState(false)

  // Only reveal once image is loaded, nav is ready, and card is in view
  useEffect(() => {
    if (!navReady || !imgLoaded) return
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setRevealed(true); obs.disconnect() } },
      { threshold: 0.08 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [navReady, imgLoaded])

  const meta = DEPT_META
  const delay = (index % 4) * 70
  const showSkeleton = !imgLoaded && !imgError

  const onCardEnter = () => {
    if (!ref.current) return
    gsap.to(ref.current, { y: -6, scale: 1.02, duration: 0.28, ease: 'power2.out', overwrite: true })
  }
  const onCardLeave = () => {
    if (!ref.current) return
    gsap.to(ref.current, { y: 0, scale: 1, duration: 0.32, ease: 'power2.inOut', overwrite: true })
  }

  return (
    // Wrapper is always visible so the skeleton shows immediately
    <div
      ref={ref}
      className="flex flex-col"
      style={{ willChange: 'transform', cursor: 'default' }}
      onMouseEnter={onCardEnter}
      onMouseLeave={onCardLeave}
    >
      {/* Photo */}
      <div className="relative overflow-hidden bg-gray-100" style={{ aspectRatio: '3/4' }}>
        {showSkeleton && <div className="absolute inset-0 skeleton-shimmer" />}

        {!imgError ? (
          <img
            src={member.photo}
            alt={member.name}
            loading="lazy"
            decoding="async"
            onLoad={() => setImgLoaded(true)}
            onError={() => { setImgError(true); setImgLoaded(true) }}
            className="object-cover object-top w-full h-full"
            style={{
              opacity: revealed ? 1 : 0,
              transform: revealed ? 'translateY(0)' : 'translateY(16px)',
              transition: `opacity 0.5s ease ${delay}ms, transform 0.55s ease ${delay}ms`,
            }}
          />
        ) : (
          <div
            className="flex items-center justify-center w-full h-full text-3xl font-semibold"
            style={{ backgroundColor: meta.bg, color: meta.color }}
          >
            {getInitials(member.name)}
          </div>
        )}
      </div>

      {/* Text */}
      <div className="pt-3 pb-1">
        {showSkeleton ? (
          <>
            <div className="w-3/4 h-3 mb-2 rounded skeleton-shimmer" />
            <div className="skeleton-shimmer h-2.5 w-1/2 rounded" />
          </>
        ) : (
          <div style={{
            opacity: revealed ? 1 : 0,
            transform: revealed ? 'translateY(0)' : 'translateY(8px)',
            transition: `opacity 0.4s ease ${delay + 60}ms, transform 0.4s ease ${delay + 60}ms`,
          }}>
            <p className="text-[13px] font-semibold text-gray-900 leading-snug">{member.name}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{member.position}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Department Section ───────────────────────────────────────────────────────

function DeptSection({ dept, members, navReady }: { dept: string; members: Member[]; navReady: boolean }) {
  const meta = DEPT_META
  const sectionRef = useRef<HTMLElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const lineRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sectionRef.current
    const header = headerRef.current
    const line = lineRef.current
    if (!el || !header || !line) return

    gsap.set(header, { opacity: 0, y: 12 })
    gsap.set(line, { scaleX: 0, transformOrigin: 'left center' })

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          gsap.to(header, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', clearProps: 'opacity,transform' })
          gsap.to(line, { scaleX: 1, duration: 0.6, ease: 'power2.out', delay: 0.1, clearProps: 'transform' })
          obs.disconnect()
        }
      },
      { threshold: 0.2 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  // re-run when members arrive so refs are populated
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members.length])

  if (!members.length) return null

  return (
    <section ref={sectionRef} className="mb-20">
      {/* Section header */}
      <div ref={headerRef} className="flex items-center gap-4 mb-8">
        <h2 className="text-sm font-semibold tracking-[0.12em] uppercase" style={{ color: meta.color }}>
          {dept}
        </h2>
        <div ref={lineRef} className="flex-1 h-px" style={{ backgroundColor: meta.color + '22' }} />
      </div>

      {/* Grid — max 4 per row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-10">
        {members.map((m, i) => (
          <MemberCard key={m.id} member={m} index={i} navReady={navReady} />
        ))}
      </div>
    </section>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Members() {
  const [members, setMembers] = useState<Member[]>([])
  const [activeFilter, setActiveFilter] = useState<string>('All')
  const [navReady, setNavReady] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unlock = () => setNavReady(true)
    const fallback = setTimeout(unlock, 800)
    window.addEventListener('helix:nav-closed', unlock, { once: true })
    return () => { clearTimeout(fallback); window.removeEventListener('helix:nav-closed', unlock) }
  }, [])

  useGSAP(
    () => {
      gsap.fromTo('.team-title',
        { opacity: 0, y: -22 },
        { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out', delay: 0.2, clearProps: 'opacity,transform' },
      )
      gsap.fromTo('.filter-pill',
        { opacity: 0, y: -10 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.05, ease: 'power2.out', delay: 0.38, clearProps: 'opacity,transform' },
      )
    },
    { scope: containerRef },
  )

  useEffect(() => {
    fetch('/members.json')
      .then(r => r.json())
      .then((data: RawMember[]) => {
        const deptCounters: Record<string, number> = {}
        const enriched: Member[] = data.map((m) => {
          const mappedDept = m.department
          deptCounters[mappedDept] = deptCounters[mappedDept] ?? 0
          const roles = DEPT_ROLES[mappedDept] ?? ['Team Member']
          const position = m.position?.trim() || roles[deptCounters[mappedDept] % roles.length]
          deptCounters[mappedDept]++
          // TODO: the_stig_male.png is a temporary stand-in for everyone; swap back to
          // per-member `/portrettbilder/{firstname}_{lastname}.webp` (see git history for
          // the removed slugifyName helper) once it's ready to become the missing-photo fallback.
          const photo = '/portrettbilder/the_stig_male.png'
          return { ...m, position, photo, mappedDept }
        })
        setMembers(enriched)
      })
  }, [])

  const filtered = activeFilter === 'All' ? members : members.filter(m => m.mappedDept === activeFilter)

  const BOARD_ORDER = ['Project Manager', 'Deputy Project Manager', 'Chair of the Board']

  function rank(dept: string, position: string) {
    if (dept === 'The Board') {
      const i = BOARD_ORDER.indexOf(position)
      return i === -1 ? BOARD_ORDER.length : i
    }
    return position.startsWith('Head of') ? 0 : 1
  }

  const byDept = DEPARTMENTS.reduce<Record<string, Member[]>>((acc, dept) => {
    // Leadership titles lead their department's section; sort is stable so
    // everyone else keeps their existing relative order.
    acc[dept] = filtered
      .filter(m => m.mappedDept === dept)
      .sort((a, b) => rank(dept, a.position) - rank(dept, b.position))
    return acc
  }, {})

  return (
    <div ref={containerRef} className="min-h-screen bg-white">

      {/* ── Header ── */}
      <div style={{ backgroundColor: "#002EC4" }} className="pb-20 text-white pt-36">

        <div className="px-6 mx-auto max-w-screen-2xl lg:px-12">
          <h1
            className="font-bold team-title"
            style={{ fontSize: "clamp(40px, 7vw, 110px)", lineHeight: 1, letterSpacing: "-0.02em" }}
          >
            The Team
          </h1>
        {/* ── Filter pills ── */}
        <div className="flex flex-wrap gap-2 mt-10">
          {['All', ...DEPARTMENTS].map(dept => {
            const isActive = dept === activeFilter
            return (
              <button
              key={dept}
              onClick={() => setActiveFilter(dept)}
              className="filter-pill text-[11px] font-medium px-4 py-2 rounded-full border transition-all duration-200 cursor-pointer"
              style={
                isActive
                ? { backgroundColor: '#E5E7EB', borderColor: '#002EC4', color: '#0E0E0E' }
                : { backgroundColor: 'transparent', borderColor: '#E5E7EB', color: '#E5E7EB' }
              }
              >
                {dept}
              </button>
            )
          })}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-screen-xl px-6 pb-8 mx-auto mt-8 lg:px-12">
        {DEPARTMENTS.map(dept => (
          <DeptSection key={dept} dept={dept} members={byDept[dept] ?? []} navReady={navReady} />
        ))}
      </div>
      <JoinUsSection />
    </div>
  )
}
