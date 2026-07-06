import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const metrics = [
  { value: "50", label: "Members", sub: "Across all of NMBU" },
  { value: "7", label: "Subteams", sub: "From aero to electronics" },
  { value: "1", label: "Mission", sub: "Build a car. Win a race." },
];

export default function IntroSection() {
  const containerRef = useRef<HTMLElement>(null);
  const numRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useGSAP(
    () => {
      gsap.from(".intro-headline", {
        y: 40,
        opacity: 0,
        duration: 0.9,
        ease: "power3.out",
        scrollTrigger: {
          trigger: ".intro-headline",
          start: "top 85%",
        },
      });

      gsap.from(".intro-para", {
        y: 30,
        opacity: 0,
        duration: 0.8,
        stagger: 0.18,
        ease: "power2.out",
        scrollTrigger: {
          trigger: ".intro-text",
          start: "top 82%",
        },
      });

      gsap.from(".intro-metrics", {
        y: 30,
        opacity: 0,
        duration: 0.8,
        ease: "power2.out",
        scrollTrigger: {
          trigger: ".intro-metrics",
          start: "top 85%",
        },
      });

      numRefs.current.forEach((el, i) => {
        if (!el) return;
        const target = parseInt(metrics[i].value, 10);
        el.textContent = "0";
        const counter = { val: 0 };
        gsap.to(counter, {
          val: target,
          duration: 1.6,
          ease: "power2.out",
          snap: { val: 1 },
          onUpdate() {
            if (el) el.textContent = String(Math.round(counter.val));
          },
          scrollTrigger: {
            trigger: ".intro-metrics",
            start: "top 85%",
          },
        });
      });
    },
    { scope: containerRef }
  );

  return (
    <section ref={containerRef} className="bg-white text-black">
      <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 pt-42 pb-42">
        <h1
          className="intro-headline font-medium"
          style={{ fontSize: "clamp(36px, 4vw, 64px)", lineHeight: 1.1 }}
        >
          One year. One car.<br />
          Fifty students, working non-stop.
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-end mt-16">
          <div className="intro-text text-lg leading-relaxed flex flex-col gap-4 max-w-prose">
            <p className="intro-para text-black/60">
              Helix NMBU was founded in 2012 by a small group of students who wanted
              to build, not just study. Fourteen seasons later, we run a full-scale
              Formula Student program out of the Tower workshop at NMBU — an
              all-electric, student-built race car, rebuilt from scratch every year.
            </p>
            <p className="intro-para text-black/35">
              We compete against 100+ teams from universities worldwide at Formula
              Student Germany, judged on engineering design, cost, business case, and
              four dynamic events including endurance and autocross.
            </p>
          </div>

          <div className="intro-metrics flex justify-end">
            {metrics.map(({ value, label }, i) => (
              <div
                key={label}
                className={`flex flex-col justify-between px-10 py-2 ${
                  i !== 0 ? "border-l border-black/15" : ""
                }`}
              >
                <div className="flex items-end gap-3">
                  <span
                    ref={(el) => {
                      numRefs.current[i] = el;
                    }}
                    className="text-7xl md:text-8xl font-medium"
                    style={{ letterSpacing: "-0.03em", color: "#00007A" }}
                  >
                    {value}
                  </span>
                  <span className="text-xs text-black/50 uppercase tracking-widest leading-tight mb-2">
                    {label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
