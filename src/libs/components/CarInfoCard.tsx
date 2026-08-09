import { useState } from "react";
import type { CarRecord } from "@libs/lib/staticContent";

// Symmetric fan spread around the center photo — same spirit as the
// homepage PhotoCardFan, but generated so it scales to any image count.
function fanOffset(index: number, total: number) {
  const step = index - (total - 1) / 2;
  return {
    rotate: step * 8,
    x: step * 130,
    y: Math.abs(step) * Math.abs(step) * 8 + Math.abs(step) * 6,
  };
}

const CarInfoCard = ({ car }: { car: CarRecord }) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const hasPhotos = car.images.length > 0;

  return (
    <div className="relative flex items-center justify-center flex-1 w-full h-full min-h-[300px] md:min-h-[380px] select-none">
      {hasPhotos ? (
        car.images.map((src, index) => {
          const total = car.images.length;
          const fan = fanOffset(index, total);
          const isHovered = hovered === index;

          const transform = isHovered
            ? `translateX(${fan.x}px) translateY(${fan.y - 24}px) rotate(0deg) scale(1.06)`
            : `translateX(${fan.x}px) translateY(${fan.y}px) rotate(${fan.rotate}deg) scale(1)`;

          return (
            <div
              key={src}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
              style={{
                transform,
                zIndex: isHovered ? 10 : index,
                transition: "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease",
                boxShadow: isHovered ? "0 28px 50px rgba(3,9,74,0.22)" : "0 10px 24px rgba(3,9,74,0.12)",
                backgroundColor: "rgba(3,9,74,0.04)",
              }}
              className="absolute w-40 sm:w-48 md:w-56 aspect-[4/5] rounded-2xl overflow-hidden cursor-pointer"
            >
              <img
                src={src}
                alt={`${car.name} — photo ${index + 1}`}
                className="object-contain w-full h-full p-3 pointer-events-none"
                draggable={false}
              />
            </div>
          );
        })
      ) : (
        <div
          className="flex items-center justify-center w-48 md:w-56 aspect-[4/5] rounded-2xl"
          style={{ border: "1.5px dashed rgba(3,9,74,0.2)", color: "rgba(3,9,74,0.35)" }}
        >
          <span className="px-6 text-sm text-center">Photos coming soon</span>
        </div>
      )}
    </div>
  );
};

export default CarInfoCard;
