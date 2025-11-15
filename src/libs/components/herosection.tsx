import React from "react";
import AutoplayCarousel from "./sponsorcarousel";
import teamImg from "/lagbilde.jpg"; 
import { FlipWords } from "@/components/ui/shadcn-io/flip-words";

export default function HeroSection() {
  const words = ["Engineers", "Designers", "Innovators", "People"];
  return (
    <div>
      {/* limit section height so the top & bottom of the image are slightly cropped */}
      <section className="relative w-full h-[100vh] overflow-hidden pt-0">
        <img
          src={teamImg}
          alt="Helix team - Formel Student lag"
          className="absolute inset-0 object-cover w-full h-full transition-opacity duration-700 brightness-75"
          style={{ objectPosition: '40%' }}
        />
 
        {/* single translucent overlay covering the image for consistent tint */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundColor: "rgba(0, 0, 122, 0.60)",
          }}
        />

        <div className="relative z-10 flex items-center h-full">
          <div className="container px-4 mx-auto md:px-8 lg:px-16">
            <p className="text-3xl font-bold text-white md:text-5xl lg:text-7xl"> The Future Depends On</p>
            <div className="overflow-visible text-3xl font-bold leading-tight md:text-5xl lg:text-7xl">
              Talented
              <FlipWords
              words={words}
              duration={2000}
              letterDelay={0.05}
              wordDelay={0.3}
              className="bg-gradient-to-r from-[#2be2c3] via-[#a3f9eb] to-[#4B32FF] bg-clip-text text-transparent leading-normal"
              />
            </div>
            <div className="flex items-center gap-8 mt-4">
              <p className="text-xl italic font-light text-white md:text-2xl lg:text-3xl">- We shape them</p>
            </div>
          </div>
        </div>
      </section>
     </div>
   );
}