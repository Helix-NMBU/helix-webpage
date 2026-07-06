import { Link } from 'react-router-dom'
import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'

export default function NotFound() {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    gsap.from(containerRef.current, {
      opacity: 0,
      y: 24,
      duration: 0.6,
      ease: 'power2.out',
    })
  }, { scope: containerRef })

  return (
    <main className="flex min-h-[80vh] items-center justify-center px-6">
      <div ref={containerRef} className="text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground mb-4">
          404
        </p>
        <h1 className="text-4xl font-bold mb-4">Page not found</h1>
        <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to="/"
          className="inline-block bg-foreground text-background px-6 py-3 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity"
        >
          Back to home
        </Link>
      </div>
    </main>
  )
}
