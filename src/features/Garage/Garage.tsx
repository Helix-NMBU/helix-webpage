import CarCarousel from "@libs/components/CarCarousel";
import { useEffect, useState } from "react";
import { loadCars, type CarRecord } from "@libs/lib/staticContent";

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

const Garage = () => {
  const [cars, setCars] = useState<CarRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    loadCars()
      .then((data) => {
        setCars(data);
      })
      .catch((error) => {
        console.error("Error loading cars:", error);
      })
      .finally(() => setLoading(false));
  }, []);

  // Oldest to newest, left to right
  const sortedCars = [...cars].sort((a, b) => seasonEndYear(a.season) - seasonEndYear(b.season));
  // Default to the newest season until the visitor picks one
  const currentIndex = selectedIndex ?? Math.max(sortedCars.length - 1, 0);
  const currentCar = sortedCars[currentIndex];

  return (
    <div className="relative flex flex-col min-h-screen overflow-hidden bg-white" style={{ color: "#0C0C0C" }}>
      {/* Subtle blueprint grid overlay */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: GRID_LINES,
          backgroundSize: GRID_SIZE,
          maskImage: "radial-gradient(ellipse at center, rgba(0,0,0,0.9) 0%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, rgba(0,0,0,0.9) 0%, transparent 75%)",
        }}
      />

      <div className="relative flex flex-col flex-1 w-full min-h-0 px-6 pt-36 pb-16 mx-auto max-w-screen-2xl lg:px-12">
        <div className="mb-10 shrink-0 opacity-0 translate-y-[-16px] animate-[fadeInUp_0.7s_ease-out_0.1s_forwards]">
          <p className="mb-4 text-xs tracking-widest uppercase" style={{ color: "rgba(3,9,74,0.4)" }}>
            The garage
          </p>
          <h1 className="font-medium" style={{ fontSize: "clamp(36px, 5vw, 72px)", lineHeight: 1.05, color: "#03094A" }}>
            {currentCar ? currentCar.name : "Every car we've raced."}
          </h1>
        </div>

        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <div className="text-xl" style={{ color: "rgba(3,9,74,0.45)" }}>
              Loading cars...
            </div>
          </div>
        ) : (
          <CarCarousel cars={sortedCars} currentIndex={currentIndex} onSelect={setSelectedIndex} />
        )}
      </div>
    </div>
  );
};

export default Garage;
