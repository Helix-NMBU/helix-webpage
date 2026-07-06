import HeroSection from "@/features/Home/components/Herosection";
import IntroSection from "@/features/Home/components/IntroSection";
import H26Section from "@/features/Home/components/H26Section";
import SubteamsSection from "@/features/Home/components/SubteamsSection";
import UpcomingEvents from "@/features/Home/components/UpcomingEvents";
import SponsorsSection from "@/features/Home/components/SponsorsSection";
import JoinUsSection from "@/features/Home/components/JoinUsSection";

const Homepage = () => {
  return (
    <div className="bg-background text-foreground">
      <HeroSection />
      <IntroSection />
      <H26Section />
      <SubteamsSection />
      <UpcomingEvents />
      <SponsorsSection />
      <JoinUsSection />
    </div>
  );
};

export default Homepage;
