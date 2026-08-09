import { useEffect, useRef, useState } from "react";
import { loadCars, type CarRecord } from "@libs/lib/staticContent";
import CarSection from "./components/CarSection";
import TimelineRail from "./components/TimelineRail";

const GRID_LINES = `
  linear-gradient(rgba(3,9,74,0.07) 1px, transparent 1px),
  linear-gradient(90deg, rgba(3,9,74,0.07) 1px, transparent 1px),
  linear-gradient(rgba(3,9,74,0.025) 1px, transparent 1px),
  linear-gradient(90deg, rgba(3,9,74,0.025) 1px, transparent 1px)
`;
const GRID_SIZE = "120px 120px, 120px 120px, 20px 20px, 20px 20px";

// "24/25" -> 25, "23/24" -> 24
function seasonEndYear(season: string): number {
  const end = season.split("/").pop()?.trim();
  const year = end ? parseInt(end, 10) : NaN;
  return Number.isNaN(year) ? 0 : year;
}

// "24/25" -> "S25"
function seasonLabel(season: string): string {
  const end = season.split("/").pop()?.trim();
  return end ? `S${end}` : season;
}

const Garage = () => {
  const [cars, setCars] = useState<CarRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    loadCars()
      .then((data) => setCars(data))
      .catch((error) => console.error("Error loading cars:", error))
      .finally(() => setLoading(false));
  }, []);

  // Newest to oldest, top to bottom
  const sortedCars = [...cars].sort((a, b) => seasonEndYear(b.season) - seasonEndYear(a.season));

  useEffect(() => {
    if (sortedCars.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = sectionRefs.current.findIndex((el) => el === entry.target);
            if (index !== -1) setActiveIndex(index);
          }
        });
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );

    sectionRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedCars.length]);

  const handleSelect = (index: number) => {
    sectionRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="relative flex flex-col min-h-screen overflow-hidden bg-white" style={{ color: "#0C0C0C" }}>
      {/* Subtle blueprint grid overlay, fixed so it reads as one continuous sheet behind the scroll */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: GRID_LINES,
          backgroundSize: GRID_SIZE,
          maskImage: "radial-gradient(ellipse at center, rgba(0,0,0,0.9) 0%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, rgba(0,0,0,0.9) 0%, transparent 75%)",
        }}
      />

      <div style={{ backgroundColor: "#002EC4" }} className="relative text-white pt-36 pb-20">
        <div className="px-6 mx-auto max-w-screen-2xl lg:px-12">
          <h1
            className="font-bold"
            style={{ fontSize: "clamp(40px, 7vw, 110px)", lineHeight: 1, letterSpacing: "-0.02em" }}
          >
            The Garage
          </h1>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <div className="text-xl" style={{ color: "rgba(3,9,74,0.45)" }}>
            Loading cars...
          </div>
        </div>
      ) : (
        <div className="relative">
          {sortedCars.map((car, index) => (
            <CarSection
              key={car.id}
              car={car}
              index={index}
              ref={(el) => {
                sectionRefs.current[index] = el;
              }}
            />
          ))}
        </div>
      )}

      <TimelineRail
        labels={sortedCars.map((car) => seasonLabel(car.season))}
        activeIndex={activeIndex}
        onSelect={handleSelect}
      />
    </div>
  );
};

export default Garage;
