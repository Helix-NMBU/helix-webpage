import { Link } from "react-router-dom";

const helvetica: React.CSSProperties = {
  fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
};

export default function H26Section() {
  return (
    <section style={{ backgroundColor: "#00007A", ...helvetica }} className="text-white">
      <div className="px-16 md:px-32 py-24 grid grid-cols-1 md:grid-cols-2 gap-16 items-end">

        {/* Left: text */}
        <div className="flex flex-col gap-8">
          <p className="text-xs uppercase tracking-widest text-white/40">Season 2026</p>
          <h2
            className="font-medium"
            style={{ fontSize: "clamp(72px, 12vw, 180px)", lineHeight: 0.9, letterSpacing: "-0.03em" }}
          >
            H26
          </h2>
          <p className="text-lg text-white/60 max-w-md leading-relaxed">
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

        {/* Right: car image */}
        <div className="flex justify-end">
          <img
            src="/lagbilde_2025.JPG"
            alt="H26 race car"
            className="w-full max-w-lg object-cover opacity-90"
          />
        </div>

      </div>
    </section>
  );
}
