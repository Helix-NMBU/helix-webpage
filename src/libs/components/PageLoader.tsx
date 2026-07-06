import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

gsap.registerPlugin(useGSAP);

interface PageLoaderProps {
  onComplete: () => void;
}

export function PageLoader({ onComplete }: PageLoaderProps) {
  const curtainRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);

  useGSAP(() => {
    const tl = gsap.timeline({
      onComplete,
    });

    // Logo eases in from slightly below, fading up
    tl.fromTo(
      logoRef.current,
      { autoAlpha: 0, y: 18, scale: 0.92 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.9, ease: "power3.out" }
    )
    // Hold a beat
    .to(logoRef.current, { duration: 0.55 })
    // Logo fades up slightly as curtain begins to lift
    .to(
      logoRef.current,
      { autoAlpha: 0, y: -12, duration: 0.45, ease: "power2.in" },
      "-=0.05"
    )
    // Curtain slides up to reveal the page
    .to(
      curtainRef.current,
      { yPercent: -100, duration: 0.85, ease: "power2.inOut" },
      "-=0.1"
    );
  }, { scope: curtainRef });

  return (
    <div
      ref={curtainRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "#002EC4",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        willChange: "transform",
      }}
    >
      <img
        ref={logoRef}
        src="/Helixspiral.png"
        alt="Helix"
        style={{
          width: "min(220px, 45vw)",
          opacity: 0,
          willChange: "transform, opacity",
          userSelect: "none",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
