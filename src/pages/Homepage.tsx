import AutoplayCarousel from "../libs/components/sponsorcarousel";
import HeroSection from "../libs/components/herosection";
import Frontpage from "@components//Frontpage";

const Homepage = () => {
  return (
    <div className="bg-background text-foreground">
      <HeroSection />
      <Frontpage />
      <section className="relative z-30 pt-20">
        <div className="px-4 mx-auto max-w">
          <p className="mb-6 text-3xl text-center lg:text-5xl">Driven by passion,</p>
          <p className="mb-10 text-lg italic font-light text-center lg:text-3xl text-accent">Accelerated by the industry</p>
          <AutoplayCarousel />
        </div>
      </section>
    </div>
  );
};

export default Homepage;
