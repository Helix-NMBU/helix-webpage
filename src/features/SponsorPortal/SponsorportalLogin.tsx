import { EclipseOverlay } from "@components//EclipseOverlay"
import { LoginForm } from "@libs/components/LoginForm"
import { Link } from "react-router-dom"

export default function SponsorPortalLogin() {
  return (
    <div className="inset-0 grid bg-menu-background min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <EclipseOverlay /> 
          <Link to="/">
            <div className="absolute z-10 flex items-center justify-center w-20 h-20 border-2 cursor-pointer border-white/60 rounded-2xl top-8 right-8 hover:border-accent">
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white transition-colors duration-200">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </div>
          </Link>
        <div className="flex items-center justify-center flex-1">
          <div className="z-10 w-full max-w-xs opacity-0 translate-y-8 animate-[fadeInUp_0.8s_ease-out_0.2s_forwards]">
            <LoginForm />
          </div>
        </div>
      </div>
      <div className="relative hidden bg-muted lg:block">
        <img
          src="/nav_pictures/partners.jpg"
          alt="Image"
          className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.9]"
        />
      </div>
    </div>
  )
}
