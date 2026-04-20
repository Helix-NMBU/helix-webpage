import HeroSection from "@/features/Home/components/Herosection";
import IntroSection from "@/features/Home/components/IntroSection";
import H26Section from "@/features/Home/components/H26Section";
import UpcomingEvents from "@/features/Home/components/UpcomingEvents";
import SponsorsSection from "@/features/Home/components/SponsorsSection";
import JoinUsSection from "@/features/Home/components/JoinUsSection";
import { useRef, useEffect, useState } from "react";

const Homepage = () => {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      {
        threshold: 0.1,
      }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => {
      if (sectionRef.current) {
        observer.unobserve(sectionRef.current);
      }
    };
  }, []);

  return (
    <div className="bg-background text-foreground">
      <HeroSection />

      <IntroSection />
      <H26Section />
      <UpcomingEvents />
      <SponsorsSection />
      <JoinUsSection />
    </div>
  );
};

export default Homepage;
