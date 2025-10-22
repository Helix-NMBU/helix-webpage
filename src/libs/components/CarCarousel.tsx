import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import CarInfoCard from "./CarInfoCard";

interface Car {
  id: number;
  name: string;
  season: string;
  image: string;
  stats: {
    focus: string;
    motor: string;
    weight: string;
  };
}

interface CarCarouselProps {
  cars: Car[];
}

const CarCarousel = ({ cars }: CarCarouselProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const nextCar = () => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % cars.length);
  };

  const prevCar = () => {
    setCurrentIndex((prevIndex) => (prevIndex - 1 + cars.length) % cars.length);
  };

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  if (cars.length === 0) {
    return <div className="text-center">No cars available</div>;
  }

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-background text-foreground overflow-visible">
      {/* full-width wrapper so arrows position relative to viewport width */}
      <div className="relative w-full px-4">
        <div className="mx-auto max-w-7xl">
          {/* Car Display (allow overflow so big background text isn't clipped) */}
          <div className="relative overflow-visible">
            <CarInfoCard car={cars[currentIndex]} />
          </div>
        </div>

        {/* Navigation Arrows: position relative to full-width wrapper so they move with screen width */}
        <button
          onClick={prevCar}
          className="absolute z-20 p-3 transition-all -translate-y-1/2 rounded-full cursor-pointer left-6 top-1/2 text-foreground"
          aria-label="Previous car"
        >
          <ChevronLeft className="w-8 h-8" />
        </button>

        <button
          onClick={nextCar}
          className="absolute z-20 p-3 transition-all -translate-y-1/2 rounded-full cursor-pointer right-6 top-1/2 text-foreground"
          aria-label="Next car"
        >
          <ChevronRight className="w-8 h-8" />
        </button>

        {/* Dot Indicators */}
        <div className="flex justify-center gap-3 mt-8">
          {cars.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`h-3 rounded-full transition-all ${
                index === currentIndex 
                  ? "w-8 bg-foreground" 
                  : "w-3 bg-primary/30 hover:bg-primary/50"
              }`}
              aria-label={`Go to car ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default CarCarousel;
