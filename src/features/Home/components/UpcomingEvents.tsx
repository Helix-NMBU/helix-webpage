import { Link } from "react-router-dom";

const helvetica: React.CSSProperties = {
  fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
};

// TODO: replace with real data fetched from backend/CMS
const events = [
  {
    id: "formula-student-germany-2026",
    date: "Aug 2026",
    title: "Formula Student Germany",
    location: "Hockenheimring, Germany",
    description: "The main competition of the season. Four dynamic events and three static disciplines judged against 100+ teams.",
  },
  {
    id: "shakedown-2026",
    date: "May 2026",
    title: "Shakedown & Testing",
    location: "NMBU Campus, Ås",
    description: "First full-car test run of the H26 on the campus grounds before transport to Germany.",
  },
  {
    id: "spring-recruitment-2026",
    date: "Mar 2026",
    title: "Spring Recruitment",
    location: "NMBU, Ås",
    description: "Open recruitment for new members across all subteams. All disciplines welcome.",
  },
];

export default function UpcomingEvents() {
  return (
    <section className="bg-white text-black" style={helvetica}>
      <div className="px-16 md:px-32 py-24">

        <div className="mb-16">
          <p className="text-xs uppercase tracking-widest text-black/40 mb-4">Upcoming events</p>
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
              className="group flex items-center gap-8 py-8 border-b border-black/10 transition-colors duration-200 hover:bg-black/[0.02] -mx-4 px-4"
            >
              {/* Date */}
              <span className="text-xs uppercase tracking-widest text-black/35 w-20 shrink-0">
                {date}
              </span>

              {/* Title + location */}
              <div className="flex flex-col gap-1 flex-1">
                <span
                  className="font-medium transition-colors duration-200 group-hover:text-[#00007A]"
                  style={{ fontSize: "clamp(18px, 2vw, 28px)" }}
                >
                  {title}
                </span>
                <span className="text-sm text-black/40">{location}</span>
              </div>

              {/* Description — hidden on small, visible md+ */}
              <p className="hidden md:block text-sm text-black/40 leading-relaxed max-w-xs">
                {description}
              </p>

              {/* Arrow */}
              <span className="text-black/20 group-hover:text-[#00007A] group-hover:translate-x-1 transition-all duration-200 text-lg shrink-0">
                →
              </span>
            </Link>
          ))}
        </div>

      </div>
    </section>
  );
}
