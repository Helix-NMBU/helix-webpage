import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Link } from "react-router-dom";
import { FlipWords } from "@/components/ui/shadcn-io/flip-words";

gsap.registerPlugin(useGSAP);

const heading: React.CSSProperties = {
  fontWeight: 600,
  fontSize: "clamp(24px, 15vw, 150px)",
  lineHeight: 0.9,
};

export default function HeroText() {
  const containerRef = useRef<HTMLDivElement>(null);
  const words = ["engineers", "innovators", "creators"];

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
    <div ref={containerRef} className="relative z-10 flex items-center h-full">
      <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 w-full pb-16 pt-8">
        <p className="hero-line text-left text-white whitespace-nowrap" style={heading}>
          Accelerating the
        </p>
        <p className="hero-line text-left text-white whitespace-nowrap" style={heading}>
          next generation
        </p>
        <div
          className="hero-line overflow-visible text-left text-white whitespace-nowrap"
          style={heading}
        >
          of{" "}
          <FlipWords
            words={words}
            duration={5000}
            letterDelay={0.02}
            wordDelay={0.1}
            style={{ color: "#aaebdf", fontStyle: "italic", fontWeight: 300 }}
          />
        </div>
        <p className="hero-sub text-left text-white/80 mt-10 max-w-2xl text-base sm:text-lg font-normal">
          Helix is NMBU's Formula Student team. Every year, students design, build and
          race a single-seat race car. - from a blank sheet to the grid.
        </p>
        <div className="hero-cta flex gap-4 mt-10">
          <Link
            to="/about"
            className="px-6 py-3 bg-white text-black text-sm font-medium hover:bg-white/90 transition-colors"
          >
            Explore our Mission
          </Link>
          <Link
            to="/contact"
            className="px-6 py-3 border border-white text-white text-sm font-medium hover:bg-white/10 transition-colors"
          >
            Get in Touch
          </Link>
        </div>
      </div>
    </div>
  );
}
