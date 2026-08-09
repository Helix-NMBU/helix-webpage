import { LoginForm } from "@libs/components/LoginForm"

const GRID_LINES = `
  linear-gradient(rgba(253,253,253,0.16) 1px, transparent 1px),
  linear-gradient(90deg, rgba(253,253,253,0.16) 1px, transparent 1px),
  linear-gradient(rgba(253,253,253,0.06) 1px, transparent 1px),
  linear-gradient(90deg, rgba(253,253,253,0.06) 1px, transparent 1px)
`;
const GRID_SIZE = "120px 120px, 120px 120px, 20px 20px, 20px 20px";

export default function SponsorPortalLogin() {
  return (
    <div
      style={{ backgroundColor: "var(--background)", minHeight: "100vh", position: "relative", overflow: "hidden" }}
      className="flex items-center justify-center px-6 py-16"
    >

      {/* Blueprint grid overlay */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: GRID_LINES,
          backgroundSize: GRID_SIZE,
          maskImage: "radial-gradient(ellipse at center, rgba(0,0,0,0.9) 0%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, rgba(0,0,0,0.9) 0%, transparent 75%)",
        }}
      />

      <div className="relative flex flex-col w-full max-w-sm">

        {/* Header */}
        <h1
          className="font-bold text-center opacity-0 translate-y-[-22px] animate-[fadeInUp_0.7s_ease-out_0.22s_forwards]"
          style={{ fontSize: "clamp(28px, 4vw, 40px)", lineHeight: 1, letterSpacing: "-0.02em", color: "var(--foreground)" }}
        >
          Sponsor portal
        </h1>

        {/* Form */}
        <div className="opacity-0 translate-y-8 animate-[fadeInUp_0.6s_ease-out_0.35s_forwards]">
          <LoginForm />
        </div>
      </div>
    </div>
  )
}
