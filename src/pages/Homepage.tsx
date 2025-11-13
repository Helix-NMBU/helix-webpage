import AutoplayCarousel from "../libs/components/sponsorcarousel";
import HeroSection from "../libs/components/herosection";
import Frontpage from "@components//Frontpage";

const Homepage = () => {
  return (
    <div className="bg-background text-foreground">
      <HeroSection />
      {/* Sponsor carousel */}
      <section className="mt-8">
        <AutoplayCarousel />
      </section>
      <Frontpage />
    </div>
  );
};

export default Homepage;
