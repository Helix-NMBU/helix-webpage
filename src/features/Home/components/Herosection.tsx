import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import HeroText from "./HeroText";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export default function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      // Ken Burns drift so the photo never feels static behind the headline.
      gsap.fromTo(
        bgRef.current,
        { scale: 1.18, yPercent: -2 },
        { scale: 1.06, yPercent: 0, duration: 5, ease: "power1.out" }
      );

      // Gentle parallax: the photo drifts slower than the page as you scroll past it.
      gsap.to(bgRef.current, {
        yPercent: 10,
        ease: "none",
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });
    },
    { scope: sectionRef }
  );

  return (
    <section
      ref={sectionRef}
      className="relative w-full h-[100vh] overflow-hidden"
    >
      <div
        ref={bgRef}
        className="absolute inset-0 bg-no-repeat bg-cover will-change-transform"
        style={{
          backgroundImage: "url('/lagbilde.jpg')",
          backgroundPosition: "center 42%",
        }}
      />
      {/* Slight dim so the white nav/headline stay legible over the photo. */}
      <div className="absolute inset-0 bg-black/35" />
      <HeroText />
    </section>
  );
}
