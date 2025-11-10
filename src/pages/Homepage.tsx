import AutoplayCarousel from "../libs/components/sponsorcarousel";
import HeroSection from "../libs/components/herosection";

const Homepage = () => {
  return (
    <div className="bg-background text-foreground">
      <HeroSection />
      {/* Sponsor carousel */}
      <section className="mt-8">
        <AutoplayCarousel />
      </section>
    </div>
  );
};

export default Homepage;
