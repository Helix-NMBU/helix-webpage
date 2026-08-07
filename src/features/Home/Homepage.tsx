import HeroSection from "@/features/Home/components/Herosection";
import IntroSection from "@/features/Home/components/IntroSection";
import CompetitionResults from "@/features/Home/components/CompetitionResults";
import UpcomingEvents from "@/features/Home/components/UpcomingEvents";
import SponsorsSection from "@/features/Home/components/SponsorsSection";
import JoinUsSection from "@/features/Home/components/JoinUsSection";

const Homepage = () => {
  return (
    <div className="text-foreground">
      <HeroSection />
      <IntroSection />
      <CompetitionResults />
      <UpcomingEvents />
      <SponsorsSection />
      <JoinUsSection />
    </div>
  );
};

export default Homepage;
