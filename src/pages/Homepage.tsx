import { HeroSection, AchievementStats } from "../features/home/components";
import { Navbar } from "@libs/components/navbar/Navbar";

const Homepage = () => {
  return (
    <div>
      <Navbar />
      <HeroSection />
    </div>
  );
};

export default Homepage;
