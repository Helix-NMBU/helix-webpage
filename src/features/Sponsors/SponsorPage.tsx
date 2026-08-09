import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { loadSponsors, type SponsorRecord } from "../../libs/lib/staticContent";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const tierConfig = [
  { key: "Main"    as const, label: "Main",    itemClass: "w-full",                                                 cardHeightClass: "h-[140px] md:h-[200px]" },
  { key: "Gold"    as const, label: "Gold",    itemClass: "w-full md:w-[calc(33.333%-2rem)]",                       cardHeightClass: "h-[150px]" },
  { key: "Silver"  as const, label: "Silver",  itemClass: "w-[calc(50%-1.5rem)] md:w-[calc(33.333%-2rem)]",         cardHeightClass: "h-[120px]" },
  { key: "Bronze"  as const, label: "Bronze",  itemClass: "w-[calc(50%-1.5rem)] md:w-[calc(20%-2.4rem)]",           cardHeightClass: "h-[110px]" },
  { key: "Service" as const, label: "Service", itemClass: "w-[calc(50%-1.5rem)] md:w-[calc(20%-2.4rem)]",           cardHeightClass: "h-[100px]" },
];

const SponsorPage = () => {
  const [sponsors, setSponsors] = useState<SponsorRecord[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    loadSponsors().then(setSponsors).catch(console.error);
  }, []);

  // Hero heading — runs once on mount
  useGSAP(() => {
    if (!headingRef.current) return;
    gsap.from(headingRef.current, {
      y: 50,
      opacity: 0,
      duration: 1,
      ease: "power3.out",
      delay: 0.1,
    });
  }, { scope: containerRef });

  // Tier + logo animations — reruns after sponsors data arrives
  useGSAP(() => {
    if (!sponsors.length) return;

    // Tier headings slide in from left
    gsap.utils.toArray<HTMLElement>(".tier-heading", containerRef.current).forEach((el) => {
      gsap.from(el, {
        x: -24,
        opacity: 0,
        duration: 0.6,
        ease: "power2.out",
        scrollTrigger: {
          trigger: el,
          start: "top 88%",
          toggleActions: "play none none none",
        },
      });
    });

    // Dividers grow from left
    gsap.utils.toArray<HTMLElement>(".tier-divider", containerRef.current).forEach((el) => {
      gsap.from(el, {
        scaleX: 0,
        transformOrigin: "left center",
        duration: 0.8,
        ease: "power2.out",
        scrollTrigger: {
          trigger: el,
          start: "top 88%",
          toggleActions: "play none none none",
        },
      });
    });

    // Logos fade + lift in as batches
    ScrollTrigger.batch(".logo-item", {
      onEnter: (elements) => {
        gsap.from(elements, {
          opacity: 0,
          y: 24,
          duration: 0.55,
          ease: "power2.out",
          stagger: 0.07,
          overwrite: true,
        });
      },
      start: "top 92%",
      once: true,
    });
  }, { scope: containerRef, dependencies: [sponsors], revertOnUpdate: true });

  return (
    <div ref={containerRef} style={{ overflowX: 'hidden' }}>
      {/* Hero header */}
      <div style={{ backgroundColor: "#002EC4" }} className="text-white pt-36 pb-20">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12">
          <h1
            ref={headingRef}
            className="font-bold"
            style={{ fontSize: "clamp(40px, 7vw, 110px)", lineHeight: 1, letterSpacing: "-0.02em" }}
          >
            Built with our<br />partners.
          </h1>
        </div>
      </div>

      {/* Sponsor tiers */}
      <div className="bg-white pb-32">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12">
          {tierConfig.map(({ key, label, itemClass, cardHeightClass }) => {
            const tierSponsors = sponsors.filter((s) => s.category === key);
            if (!tierSponsors.length) return null;

            return (
              <div key={key} className="pt-20">
                {/* Tier header */}
                <div className="flex items-center gap-6 mb-8">
                  <h2
                    className="tier-heading font-bold shrink-0"
                    style={{ fontSize: "clamp(22px, 2.5vw, 40px)", lineHeight: 1, color: "#002EC4" }}
                  >
                    {label}
                  </h2>
                  <hr className="tier-divider flex-1 border-black/10" />
                </div>

                {/* Sponsor grid */}
                <div className="flex flex-wrap justify-center gap-12">
                  {tierSponsors.map((sponsor) => (
                    <div
                      key={sponsor.id}
                      className={`logo-item flex items-center justify-center ${itemClass} ${cardHeightClass}`}
                    >
                      {sponsor.image ? (
                        sponsor.link ? (
                          <a href={sponsor.link} target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-85 flex items-center justify-center w-full h-full">
                            <img
                              src={sponsor.image}
                              alt={sponsor.name}
                              className={`object-contain w-full h-full ${sponsor.logoSize ?? ""}`}
                              style={{ filter: "brightness(0)" }}
                            />
                          </a>
                        ) : (
                          <img
                            src={sponsor.image}
                            alt={sponsor.name}
                            className={`object-contain w-full h-full ${sponsor.logoSize ?? ""}`}
                            style={{ filter: "brightness(0)" }}
                          />
                        )
                      ) : (
                        <span className="font-medium text-sm text-center text-black">{sponsor.name}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SponsorPage;
