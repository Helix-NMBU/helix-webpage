import AutoplayCarousel from "@libs/components/Sponsorcarousel";
import HeroSection from "@libs/components/Herosection";
import Frontpage from "@libs/components/Frontpage";
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
      <Frontpage />
      <section ref={sectionRef} className="relative z-30">
        <div className="px-4 mx-auto max-w">
          <p className={`mb-6 text-3xl text-center lg:text-5xl transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
             style={{ transitionDelay: isVisible ? '0.1s' : '0s' }}>Driven by passion,</p>
          <p className={`mb-10 text-lg italic font-light text-center lg:text-3xl text-accent transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
             style={{ transitionDelay: isVisible ? '0.2s' : '0s' }}>Accelerated by the industry</p>
          <div className={`transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
               style={{ transitionDelay: isVisible ? '0.3s' : '0s' }}>
            <AutoplayCarousel />
          </div>
        </div>
      </section>
    </div>
  );
};

export default Homepage;
