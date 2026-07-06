import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Link } from "react-router-dom";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export default function H26Section() {
  const containerRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.from(".h26-left > *", {
        x: -32,
        opacity: 0,
        duration: 0.85,
        stagger: 0.1,
        ease: "power3.out",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 78%",
        },
      });

      gsap.from(".h26-image", {
        x: 40,
        opacity: 0,
        duration: 1,
        ease: "power3.out",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 78%",
        },
      });
    },
    { scope: containerRef }
  );

  return (
    <section ref={containerRef} className="text-white">
      <div className="grid items-end grid-cols-1 gap-16 px-6 py-24 mx-auto max-w-screen-2xl lg:px-12 md:grid-cols-2">

        <div className="h26-left flex flex-col gap-8">
          <p className="text-xs tracking-widest uppercase text-white/40">Season 2026</p>
          <h2
            className="font-medium"
            style={{ fontSize: "clamp(72px, 12vw, 180px)", lineHeight: 0.9, letterSpacing: "-0.03em" }}
          >
            H26
          </h2>
          <p className="max-w-md text-lg leading-relaxed text-white/60">
            Our fourteenth car. All-electric, built from scratch by forty engineers
            in the Tower workshop at NMBU. Designed to compete at Formula Student
            Germany 2026.
          </p>
          <Link
            to="/garage"
            className="w-fit text-sm uppercase tracking-widest border-b border-white/30 pb-0.5 hover:border-white transition-colors"
          >
            Explore the build →
          </Link>
        </div>

        <div className="flex justify-end">
          <img
            src="/lagbilde_2025.JPG"
            alt="H26 race car"
            className="h26-image object-cover w-full max-w-lg opacity-90"
            onLoad={() => ScrollTrigger.refresh()}
          />
        </div>

      </div>
    </section>
  );
}
