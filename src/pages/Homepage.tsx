import AutoplayCarousel from "../libs/components/sponsorcarousel";
import HeroSection from "../libs/components/herosection";
import Frontpage from "@components//Frontpage";

const Homepage = () => {
  return (
    <div className="bg-background text-foreground">
      <HeroSection />

      {/* Gradient that extends downward from the bottom of the hero into the sponsor area */}
      <div className="hero-bottom-gradient" aria-hidden="true" />

      {/* Sponsor carousel - place content above the gradient */}
      <section className="relative z-30 -mt-65 pt-8">
        <div className="max-w mx-auto px-4">
          <h1 className="mb-6 text-3xl text-center font-bold">Accelerated by our partners</h1>
          <AutoplayCarousel />
        </div>
      </section>

      <Frontpage />
    </div>
  );
};

export default Homepage;
