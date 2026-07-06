import { LoginForm } from "@libs/components/LoginForm"

export default function SponsorPortalLogin() {
  return (
    <div style={{ backgroundColor: "#FDFDFD", minHeight: "100vh", display: "grid" }} className="lg:grid-cols-2">

      {/* Left — form panel */}
      <div className="flex flex-col px-6 pt-36 pb-16 lg:px-16">
        <div className="max-w-sm w-full mx-auto flex flex-col flex-1">

          {/* Header */}
          <p
            className="mb-4 text-xs tracking-widest uppercase opacity-0 translate-y-[-14px] animate-[fadeInUp_0.6s_ease-out_0.1s_forwards]"
            style={{ color: "rgba(0,0,0,0.35)" }}
          >
            Sponsor portal
          </p>
          <h1
            className="mb-12 font-medium opacity-0 translate-y-[-22px] animate-[fadeInUp_0.7s_ease-out_0.22s_forwards]"
            style={{ fontSize: "clamp(36px, 5vw, 72px)", lineHeight: 1, letterSpacing: "-0.02em", color: "#03094A" }}
          >
            Sign in
          </h1>

          {/* Form */}
          <div className="opacity-0 translate-y-8 animate-[fadeInUp_0.6s_ease-out_0.35s_forwards]">
            <LoginForm />
          </div>
        </div>
      </div>

      {/* Right — image panel */}
      <div className="relative hidden lg:block">
        <img
          src="/nav_pictures/partners.jpg"
          alt="Partners"
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>
    </div>
  )
}
