import SponsorCarousel from "./Sponsorcarousel";

const helvetica: React.CSSProperties = {
  fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
};

export default function SponsorsSection() {
  return (
    <section className="bg-white text-black border-t border-black/8" style={helvetica}>
      <div className="px-16 md:px-32 pt-24 pb-12">
        <p className="text-xs uppercase tracking-widest text-black/40 mb-4">Partners</p>
        <h2
          className="font-medium max-w-2xl"
          style={{ fontSize: "clamp(36px, 4vw, 64px)", lineHeight: 1.05 }}
        >
          Driven by passion,<br />accelerated by the industry.
        </h2>
        <p className="text-lg text-black/50 mt-6 max-w-prose leading-relaxed">
          We couldn't build what we build without the companies who believe in us.
          Our sponsors provide funding, materials, software, and mentorship that
          make every season possible.
        </p>
      </div>
      <SponsorCarousel />
    </section>
  );
}
