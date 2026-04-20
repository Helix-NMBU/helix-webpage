const helvetica: React.CSSProperties = {
  fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
};

const metrics = [
  { value: "50", label: "Members", sub: "Across all of NMBU" },
  { value: "7", label: "Subteams", sub: "From aero to electronics" },
  { value: "1", label: "Mission", sub: "Build a car. Win a race." },
];

export default function IntroSection() {
  return (
    <section className="bg-white text-black" style={helvetica}>
      <div className="px-16 md:px-32 pt-42 pb-42">

        {/* Headline row */}
        <h1
          className="font-medium"
          style={{ fontSize: "clamp(36px, 4vw, 64px)", lineHeight: 1.1 }}
        >
          One year. One car.<br />
          Fifty students, working non-stop.
        </h1>

        {/* Text + metrics row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-end mt-16">

          <div className="text-lg leading-relaxed flex flex-col gap-4 max-w-prose">
            <p className="text-black/60">
              Helix NMBU was founded in 2012 by a small group of students who wanted
              to build, not just study. Fourteen seasons later, we run a full-scale
              Formula Student program out of the Tower workshop at NMBU — an
              all-electric, student-built race car, rebuilt from scratch every year.
            </p>
            <p className="text-black/35">
              We compete against 100+ teams from universities worldwide at Formula
              Student Germany, judged on engineering design, cost, business case, and
              four dynamic events including endurance and autocross.
            </p>
          </div>

          <div className="flex justify-end">
            {metrics.map(({ value, label, sub }, i) => (
              <div
                key={label}
                className={`flex flex-col justify-between px-10 py-2 ${i !== 0 ? "border-l border-black/15" : ""}`}
              >
                <div className="flex items-end gap-3">
                  <span
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
