import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

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
      gsap.from(".hero-line", {
        y: 60,
        opacity: 0,
        duration: 1,
        stagger: 0.15,
        ease: "power3.out",
        delay: 0.2,
      });
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
    </div>
  );
}
