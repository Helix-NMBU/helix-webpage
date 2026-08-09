import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Link } from "react-router-dom";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export default function JoinUsSection() {
  const containerRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.from(".join-label", {
        y: 20,
        opacity: 0,
        duration: 0.6,
        ease: "power2.out",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 80%",
        },
      });

      gsap.from(".join-heading", {
        y: 44,
        opacity: 0,
        duration: 0.95,
        ease: "power3.out",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 75%",
        },
      });

      gsap.from(".join-content > *", {
        y: 30,
        opacity: 0,
        duration: 0.8,
        stagger: 0.14,
        ease: "power2.out",
        scrollTrigger: {
          trigger: ".join-content",
          start: "top 82%",
        },
      });
    },
    { scope: containerRef }
  );

  return (
    <section ref={containerRef} style={{ backgroundColor: "#080808" }} className="text-white">
      <div className="px-6 mx-auto max-w-screen-2xl lg:px-12 py-28">

        <p className="mb-8 text-xs tracking-widest uppercase join-label text-white/40">
          Join the team
        </p>

        <div className="grid items-start grid-cols-1 gap-16 md:grid-cols-2">

          <h2
            className="font-medium join-heading"
            style={{ fontSize: "clamp(40px, 5vw, 80px)", lineHeight: 1.0, letterSpacing: "-0.02em" }}
          >
            Become a part<br />of the&nbsp;
            <span style={{ color: "#002EC4", fontStyle: "italic", fontWeight: 500 }}>
              team.
            </span>
          </h2>

          <div className="flex flex-col justify-between h-full gap-8 join-content">
            <p className="text-lg leading-relaxed text-white/80">
              Every autumn we recruit new members across all disciplines: mechanical,
              electrical, software, business, and more. No prior experience required.
              Just the drive to build.
            </p>

            <div className="flex flex-col gap-4 sm:flex-row">
              <Link
                to="/apply"
                onClick={() => window.scrollTo(0, 0)}
                className="inline-block px-8 py-4 text-sm font-medium tracking-widest text-center uppercase transition-colors border rounded-2xl bg-background text-foreground hover:bg-secondary hover:text-background"
              >
                Apply to Helix S27
              </Link>
              <Link
                to="/members"
                className="inline-block px-8 py-4 text-sm font-medium tracking-widest text-center uppercase transition-colors border rounded-2xl border-secondary text-secondary hover:bg-secondary hover:text-background"
              >
                Meet the team
              </Link>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
