import type { CarRecord } from "@libs/lib/staticContent";
import CarInfoCard from "./CarInfoCard";

interface CarCarouselProps {
  cars: CarRecord[]; // already sorted oldest -> newest
  currentIndex: number;
  onSelect: (index: number) => void;
}

// "24/25" -> "S25", "23/24" -> "S24"
function seasonLabel(season: string): string {
  const end = season.split("/").pop()?.trim();
  return end ? `S${end}` : season;
}

const CarCarousel = ({ cars, currentIndex, onSelect }: CarCarouselProps) => {
  if (cars.length === 0) {
    return (
      <div className="flex items-center justify-center flex-1" style={{ color: "rgba(3,9,74,0.5)" }}>
        No cars available
      </div>
    );
  }

  const currentCar = cars[Math.min(currentIndex, cars.length - 1)];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Gallery stage */}
      <div className="flex-1 min-h-0">
        <CarInfoCard car={currentCar} />
      </div>

      {/* Stats — floating just above the season menu */}
      <div
        className="flex items-center justify-center gap-8 px-8 py-4 mx-auto mt-6 bg-white rounded-2xl shrink-0 sm:gap-12"
        style={{ border: "1.5px solid rgba(3,9,74,0.1)", boxShadow: "0 16px 32px rgba(3,9,74,0.12)" }}
      >
        <Stat label="Focus" value={currentCar.stats.focus} />
        <div className="w-px h-8" style={{ backgroundColor: "rgba(3,9,74,0.12)" }} />
        <Stat label="Engine" value={currentCar.stats.engine} />
        <div className="w-px h-8" style={{ backgroundColor: "rgba(3,9,74,0.12)" }} />
        <Stat label="Weight" value={currentCar.stats.weight} />
      </div>

      {/* Bottom interactive menu: switch between seasons */}
      <div className="flex justify-center mt-4 shrink-0">
        <div
          className="flex max-w-full gap-2 p-1.5 overflow-x-auto rounded-full"
          style={{ border: "1.5px solid rgba(3,9,74,0.12)", backgroundColor: "rgba(3,9,74,0.03)" }}
        >
          {cars.map((car, index) => {
            const isActive = index === currentIndex;
            return (
              <button
                key={car.id}
                onClick={() => onSelect(index)}
                className="px-6 py-2.5 rounded-full whitespace-nowrap text-sm font-semibold transition-colors duration-200"
                style={
                  isActive
                    ? { backgroundColor: "#03094A", color: "#FDFDFD" }
                    : { backgroundColor: "transparent", color: "rgba(3,9,74,0.55)" }
                }
                aria-current={isActive}
              >
                {seasonLabel(car.season)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="text-center">
    <p className="mb-1 text-xs tracking-widest uppercase" style={{ color: "rgba(3,9,74,0.45)" }}>
      {label}
    </p>
    <p className="text-sm font-semibold" style={{ color: "#0C0C0C" }}>
      {value}
    </p>
  </div>
);

export default CarCarousel;
