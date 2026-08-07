import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Link } from "react-router-dom";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const events = [
  {
    id: "formula-student-germany-2026",
    date: "Aug 2026",
    title: "Formula Student Germany",
    location: "Hockenheimring, Germany",
    description:
      "The main competition of the season. Four dynamic events and three static disciplines judged against 100+ teams.",
  },
  {
    id: "shakedown-2026",
    date: "May 2026",
    title: "Shakedown & Testing",
    location: "NMBU Campus, Ås",
    description:
      "First full-car test run of the H26 on the campus grounds before transport to Germany.",
  },
  {
    id: "spring-recruitment-2026",
    date: "Mar 2026",
    title: "Spring Recruitment",
    location: "NMBU, Ås",
    description:
      "Open recruitment for new members across all subteams. All disciplines welcome.",
  },
];

export default function UpcomingEvents() {
  const containerRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.from(".events-header > *", {
        y: 28,
        opacity: 0,
        duration: 0.75,
        stagger: 0.12,
        ease: "power3.out",
        scrollTrigger: {
          trigger: ".events-header",
          start: "top 85%",
        },
      });

      gsap.from(".event-row", {
        y: 24,
        opacity: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: "power2.out",
        scrollTrigger: {
          trigger: ".event-row",
          start: "top 88%",
        },
      });
    },
    { scope: containerRef }
  );

  return (
    <section ref={containerRef} className="bg-white text-black">
      <div className="px-6 py-24 mx-auto max-w-screen-2xl lg:px-12">

        <div className="mb-16 events-header">
          <p className="mb-4 text-xs tracking-widest uppercase text-black/40">Upcoming events</p>
          <h2
            className="font-medium"
            style={{ fontSize: "clamp(36px, 4vw, 64px)", lineHeight: 1.05 }}
          >
            Where to find us.
          </h2>
        </div>

        <div className="flex flex-col border-t border-black/10">
          {events.map(({ id, date, title, location, description }) => (
            <Link
              key={id}
              to={`/events/${id}`}
              className="event-row group flex items-center gap-8 py-8 border-b border-black/10 transition-colors duration-200 hover:bg-black/[0.02] -mx-4 px-4"
            >
              <span className="w-20 text-xs tracking-widest uppercase text-black/35 shrink-0">
                {date}
              </span>

              <div className="flex flex-col flex-1 gap-1">
                <span
                  className="font-medium transition-colors duration-200 group-hover:text-black/50"
                  style={{ fontSize: "clamp(18px, 2vw, 28px)" }}
                >
                  {title}
                </span>
                <span className="text-sm text-black/40">{location}</span>
              </div>

              <p className="hidden max-w-xs text-sm leading-relaxed md:block text-black/40">
                {description}
              </p>

              <span className="text-black/20 group-hover:text-black/50 group-hover:translate-x-1 transition-all duration-200 text-lg shrink-0">
                →
              </span>
            </Link>
          ))}
        </div>

      </div>
    </section>
  );
}
