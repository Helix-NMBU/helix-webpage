const helvetica: React.CSSProperties = {
  fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
};

export default function WhereToFindUs() {
  return (
    <section className="bg-white text-black" style={helvetica}>
      <div className="px-16 md:px-32 py-24 grid grid-cols-1 md:grid-cols-2 gap-16 items-start">

        {/* Left: text */}
        <div className="flex flex-col gap-6">
          <p className="text-xs uppercase tracking-widest text-black/40">Location</p>
          <h2
            className="font-medium"
            style={{ fontSize: "clamp(36px, 4vw, 64px)", lineHeight: 1.05 }}
          >
            We work out of<br />the Tower.
          </h2>
          <p className="text-lg text-black/60 leading-relaxed max-w-md">
            Our workshop is on the NMBU campus in Ås — a 45-minute train ride from
            Oslo. The Tower is where the car is designed, welded, wired, and tested,
            year after year.
          </p>
          <div className="flex flex-col gap-1 text-sm text-black/40 mt-2">
            <span>Kajaveien 7</span>
            <span>1433 Ås, Norway</span>
            <a
              href="https://maps.google.com/?q=Kajaveien+7,+1433+Ås"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 w-fit uppercase tracking-widest text-xs border-b border-black/20 pb-0.5 hover:border-black/60 transition-colors"
            >
              Open in Maps →
            </a>
          </div>
        </div>

        {/* Right: image */}
        <div>
          <img
            src="/lagbilde_1.jpg"
            alt="Helix NMBU workshop"
            className="w-full object-cover"
          />
        </div>

      </div>
    </section>
  );
}
