import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Link } from "react-router-dom";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const carouselImages = [
  { src: "/P1010055 1.png", alt: "Race day" },
  { src: "/peder.png", alt: "Garage" },
  { src: "/tilt.png", alt: "Helix car" },
  { src: "/cost.png", alt: "Cost event" },
];

const CYCLE_MS = 4000;

function ImageCarousel() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % carouselImages.length);
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="intro-carousel relative w-full max-w-lg mx-auto lg:mx-0 aspect-[4/5] overflow-hidden rounded-2xl bg-black/5">
      {carouselImages.map((img, i) => (
        <img
          key={img.src}
          src={img.src}
          alt={img.alt}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ease-in-out ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}

      <div className="absolute bottom-5 left-5 flex gap-1.5">
        {carouselImages.map((img, i) => (
          <span
            key={img.src}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              i === index ? "w-6 bg-white" : "w-1.5 bg-white/40"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export default function IntroSection() {
  const containerRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.from(".intro-carousel", {
        opacity: 0,
        scale: 0.96,
        duration: 1,
        ease: "power3.out",
        scrollTrigger: {
          trigger: ".intro-carousel",
          start: "top 85%",
        },
      });

      gsap.from(".intro-text > *", {
        y: 30,
        opacity: 0,
        duration: 0.8,
        stagger: 0.15,
        ease: "power2.out",
        scrollTrigger: {
          trigger: ".intro-text",
          start: "top 82%",
        },
      });
    },
    { scope: containerRef }
  );

  return (
    <section ref={containerRef} className="text-black bg-white">
      <div className="px-6 py-24 mx-auto max-w-screen-2xl lg:px-12 md:py-32">
        <div className="grid items-center grid-cols-1 gap-12 lg:grid-cols-[0.85fr_1fr] lg:gap-20">
          <ImageCarousel />

          <div className="flex flex-col gap-6 intro-text max-w-prose">
            <p className="text-xs tracking-widest uppercase text-black/40">
              What is Helix
            </p>
            <h2
              className="font-medium"
              style={{ fontSize: "clamp(32px, 3.4vw, 52px)", lineHeight: 1.1 }}
            >
              One year. One car.<br />
              Fifty students.
            </h2>
            <p className="text-lg leading-relaxed text-black/60">
              Helix NMBU was founded in 2022. We run a full-scale Formula Student
              program out of the Tower workshop at NMBU, designing and building an
              all-electric race car from scratch every season.
            </p>
            <p className="text-lg leading-relaxed text-black/35">
              Every summer we take the car to Formula Student events across Europe,
              including Silverstone and Meppen, competing against other university
              teams on engineering, cost, business case, and dynamic events like
              endurance and autocross.
            </p>
            <Link
              to="/garage"
              className="w-fit text-sm uppercase tracking-widest border-b border-black/30 pb-0.5 hover:border-black transition-colors"
            >
              Our story →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
