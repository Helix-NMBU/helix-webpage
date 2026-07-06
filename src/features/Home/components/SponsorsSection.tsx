import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import SponsorCarousel from "./Sponsorcarousel";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export default function SponsorsSection() {
  const containerRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.from(".sponsors-header > *", {
        y: 30,
        opacity: 0,
        duration: 0.8,
        stagger: 0.12,
        ease: "power3.out",
        scrollTrigger: {
          trigger: ".sponsors-header",
          start: "top 85%",
        },
      });
    },
    { scope: containerRef }
  );

  return (
    <section ref={containerRef} className="text-black bg-white border-t border-black/8">
      <div className="sponsors-header px-6 pt-24 pb-6 mx-auto max-w-screen-2xl lg:px-12">
        <p className="mb-4 text-xs tracking-widest uppercase text-black/40">Partners</p>
        <h2
          className="max-w-2xl font-medium"
          style={{ fontSize: "clamp(36px, 4vw, 64px)", lineHeight: 1.05 }}
        >
          Driven by passion,<br />
          <span className="italic text-background">accelerated</span> by the industry.
        </h2>
        <p className="mt-6 text-lg leading-relaxed text-black/50 max-w-prose">
          We couldn't build what we build without the companies who believe in us.
          Our sponsors provide funding, materials, software, and mentorship that
          make every season possible.
        </p>
      </div>
      <SponsorCarousel />
    </section>
  );
}
