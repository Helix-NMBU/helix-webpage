import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const events = [
  {
    id: "graskurs-del-1-2026",
    date: "19 Aug 2026",
    title: "Graskurs Del 1",
    location: "NMBU, Ås",
    description:
      "Meet the clubs and societies that make student life at NMBU unique. Come say hi to Helix!",
  },
  {
    id: "info-meeting-2026",
    date: "20 Aug 2026",
    title: "Info Meeting",
    location: "NMBU, Ås",
    description:
      "Curious about Helix? Join us for at our projects, and what it takes to build a Formula Student team from the ground up.",
  },
  {
    id: "spring-recruitment-deadline-2026",
    date: "1 Sep 2026",
    title: "Spring Recruitment Deadline",
    location: "NMBU, Ås",
    description:
      "Last call to apply for the Spring recruitment. Get your application in before the deadline to be considered.",
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
    <section ref={containerRef} className="text-black bg-white">
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
            <div
              key={id}
              className="event-row flex items-center gap-8 py-8 border-b border-black/10 -mx-4 px-4"
            >
              <span className="w-20 text-xs tracking-widest uppercase text-black/35 shrink-0">
                {date}
              </span>

              <div className="flex flex-col flex-1 gap-1">
                <span
                  className="font-medium"
                  style={{ fontSize: "clamp(18px, 2vw, 28px)" }}
                >
                  {title}
                </span>
                <span className="text-sm text-black/40">{location}</span>
              </div>

              <p className="hidden max-w-xs text-sm leading-relaxed md:block text-black/40">
                {description}
              </p>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
