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
          style={{ objectPosition: '10% 110%' }}
        />
 
         <div className="relative z-10 flex flex-col items-center justify-center h-full text-center px-6 translate-y-6 md:translate-y-10">
           <h1 className="text-white/70 text-5xl md:text-7xl lg:text-9xl font-extrabold tracking-tight leading-tight">
             HELIX NMBU
           </h1>
           <p className="mt-4 text-white max-w-2xl text-base md:text-lg">
             From campus to circuit — building ideas that move
           </p>
       
         </div>
 
         {/* top gradient (92px) so the image fades from the same overlay color used at the bottom */}
         <div
           className="pointer-events-none absolute top-0 left-0 right-0 h-[92px]"
           style={{
             backgroundImage: "linear-gradient(to bottom, #00007A, rgba(0,0,0,0))",
           }}
         />

         {/* overlay container stays absolute so text sits over the image (bottom overlay) */}
         <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: "linear-gradient(to top, #00007A 5%, rgba(0,0,0,0) 40%)",
          }}
        />
       </section>
     </div>
   );
}