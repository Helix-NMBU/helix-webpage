import { Link } from "react-router-dom";

const helvetica: React.CSSProperties = {
  fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
};

export default function JoinUsSection() {
  return (
    <section style={{ backgroundColor: "#00007A", ...helvetica }} className="text-white">
      <div className="px-16 md:px-32 py-28">

        <p className="text-xs uppercase tracking-widest text-white/40 mb-8">Join the team</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-start">

          {/* Left: heading */}
          <h2
            className="font-medium"
            style={{ fontSize: "clamp(40px, 5vw, 80px)", lineHeight: 1.0, letterSpacing: "-0.02em" }}
          >
            Become a part<br />of something<br /><span style={{ color: "#aaebdf", fontStyle: "italic", fontWeight: 300 }}>meaningful.</span>
          </h2>

          {/* Right: paragraph + buttons */}
          <div className="flex flex-col gap-8 justify-between h-full">
            <p className="text-lg text-white/60 leading-relaxed">
              Every autumn we recruit new members across all disciplines — mechanical,
              electrical, software, business, and more. No prior experience required.
              Just the drive to build.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                to="/apply"
                className="inline-block px-8 py-4 bg-white text-black text-sm uppercase tracking-widest font-medium hover:bg-white/90 transition-colors text-center"
              >
                Apply to Helix 27
              </Link>
              <Link
                to="/members"
                className="inline-block px-8 py-4 border border-white/30 text-white text-sm uppercase tracking-widest font-medium hover:border-white transition-colors text-center"
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
