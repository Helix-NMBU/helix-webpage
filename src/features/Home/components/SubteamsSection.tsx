import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const subteams = [
  { name: "Mechanical & Production", members: 12 },
  { name: "Autonomous & Software", members: 10 },
  { name: "Business & Marketing", members: 7 },
  { name: "Electronics", members: 8 },
  { name: "Economics", members: 5 },
  { name: "Logistics", members: 4 },
];

export default function SubteamsSection() {
  const containerRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.from(".subteams-header", {
        y: 40,
        opacity: 0,
        duration: 0.9,
        ease: "power3.out",
        scrollTrigger: {
          trigger: ".subteams-header",
          start: "top 85%",
        },
      });

      gsap.set(".subteam-card", { opacity: 0, y: 40 });

      ScrollTrigger.batch(".subteam-card", {
        onEnter: (elements) => {
          gsap.to(elements, {
            y: 0,
            opacity: 1,
            duration: 0.65,
            stagger: 0.08,
            ease: "power3.out",
          });
        },
        start: "top 88%",
        once: true,
      });
    },
    { scope: containerRef }
  );

  return (
    <section ref={containerRef} style={{ backgroundColor: "#00007A" }} className="text-white">
      <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 py-24">

        <h2
          className="subteams-header font-bold mb-16"
          style={{ fontSize: "clamp(40px, 6vw, 96px)", lineHeight: 1, letterSpacing: "-0.02em" }}
        >
          Fifty people.<br />Seven disciplines.
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border-l border-t border-white/20">
          {subteams.map((team, i) => (
            <div
              key={team.name}
              className="subteam-card group border-r border-b border-white/20 px-8 py-10 flex flex-col justify-between gap-6 min-h-48 cursor-pointer hover:bg-white/5 transition-colors"
            >
              <span className="text-xs tracking-widest" style={{ color: "#63e4ca" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h3
                    className="font-bold mb-1"
                    style={{ fontSize: "clamp(20px, 2.2vw, 32px)", lineHeight: 1.1 }}
                  >
                    {team.name.includes("&") ? (
                      <>
                        {team.name.slice(0, team.name.indexOf("&") + 1)}
                        <br />
                        {team.name.slice(team.name.indexOf("&") + 1).trimStart()}
                      </>
                    ) : (
                      team.name
                    )}
                  </h3>
                  <p className="text-xs uppercase tracking-widest text-white/40">
                    {team.members} members
                  </p>
                </div>
                <div className="shrink-0 w-10 h-10 rounded-full border border-white/30 flex items-center justify-center group-hover:border-white transition-colors">
                  <span className="text-sm">→</span>
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
