import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Link } from "react-router-dom";

gsap.registerPlugin(useGSAP);

const heading: React.CSSProperties = {
  fontWeight: 600,
  fontSize: "clamp(26px, 9vw, 104px)",
  lineHeight: 0.95,
};

export default function HeroText() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline({ delay: 0.2 });
      tl.from(".hero-line", {
        y: 60,
        opacity: 0,
        duration: 1,
        stagger: 0.15,
        ease: "power3.out",
      })
        .from(
          ".hero-sub",
          { y: 24, opacity: 0, duration: 0.85, ease: "power2.out" },
          "-=0.5"
        )
        .from(
          ".hero-cta",
          { y: 16, opacity: 0, duration: 0.7, ease: "power2.out" },
          "-=0.45"
        );
    },
    { scope: containerRef }
  );

  return (
    <div ref={containerRef} className="relative z-10 h-full">
      {/* Headline — anchored a little below center */}
      <div
        className="absolute inset-x-0 px-6 mx-auto lg:px-12 max-w-screen-2xl"
        style={{ top: "52%", transform: "translateY(-50%)" }}
      >
        <p className="text-left text-white hero-line" style={heading}>
          Accelerating the
        </p>
        <p className="text-left text-white hero-line" style={heading}>
          next generation
        </p>
        <p className="text-left text-white hero-line" style={heading}>
          of engineers
        </p>
      </div>

      {/* Secondary copy + CTAs — tucked into the bottom-right corner */}
      <div className="absolute right-6 lg:right-12 bottom-10 lg:bottom-14 max-w-[260px] sm:max-w-sm text-left">
        <p className="text-sm font-normal text-white hero-sub sm:text-base">
          NMBU's Formula Student team: blank sheet to the grid, every year.
        </p>
        <div className="mt-7 hero-cta">
          <Link
            to="/garage"
            className="inline-block rounded-sm px-6 py-3 bg-[var(--background)] text-white text-lg font-regular hover:brightness-110 transition-[filter] text-center"
          >
            Explore
          </Link>
        </div>
      </div>
    </div>
  );
}
