import React from "react";
import AutoplayCarousel from "./sponsorcarousel";
import teamImg from "/birk i bil 2.jpg"; 

export default function HeroSection() {
  return (
    <div>
      {/* limit section height so the top & bottom of the image are slightly cropped */}
      <section className="relative w-full h-[89vh] md:h-[50vh] lg:h-[100vh] overflow-hidden pt-0">
        <img
          src={teamImg}
          alt="Helix team - Formel Student lag"
          className="absolute inset-0 w-full h-full object-cover brightness-75 transition-opacity duration-700"
          style={{ objectPosition: '110%' }}
        />
 
        {/* single translucent overlay covering the image for consistent tint */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundColor: "rgba(0, 0, 122, 0.35)",
          }}
        />

        

        <div className="relative z-10 flex flex-col items-center justify-center h-full text-center px-6 translate-y-6 md:translate-y-10">
          <h1 className="text-white/70 text-5xl md:text-7xl lg:text-9xl font-extrabold tracking-tight leading-tight">
            HELIX NMBU
          </h1>
          <p className="mt-4 text-white max-w-2xl text-base md:text-lg">
            From campus to circuit — building ideas that move
          </p>
        </div>  
       </section>

     </div>
   );
}