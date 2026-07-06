import { useState } from "react";

const PHOTOS = [
  { src: "/nav_pictures/garage.jpg", alt: "In the garage" },
  { src: "/birk i bil.jpg", alt: "Driver in the car" },
  { src: "/nav_pictures/silverstone.jpg", alt: "Silverstone" },
  { src: "/lagbilde_1.jpg", alt: "Team photo" },
  { src: "/formula-student uk.avif", alt: "Formula Student UK" },
];

const FAN: { rotate: number; x: number; y: number }[] = [
  { rotate: -18, x: -380, y: 50 },
  { rotate:  -9, x: -190, y: 16 },
  { rotate:   0, x:    0, y:  0 },
  { rotate:   9, x:  190, y: 16 },
  { rotate:  18, x:  380, y: 50 },
];

export default function PhotoCardFan() {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className="relative flex items-end justify-center h-[520px] md:h-[680px] select-none overflow-visible">
      {PHOTOS.map((photo, i) => {
        const fan = FAN[i];
        const isHovered = hovered === i;

        const transform = isHovered
          ? `translateX(${fan.x}px) translateY(-50px) rotate(0deg) scale(1.06)`
          : `translateX(${fan.x}px) translateY(${fan.y}px) rotate(${fan.rotate}deg) scale(1)`;

        return (
          <div
            key={photo.src}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={{
              transform,
              zIndex: isHovered ? 10 : i,
              transition: "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease",
              boxShadow: isHovered
                ? "0 32px 60px rgba(0,0,0,0.32)"
                : "0 10px 30px rgba(0,0,0,0.18)",
            }}
            className="absolute w-52 md:w-68 aspect-[9/16] rounded-2xl overflow-hidden cursor-pointer bg-black/10"
          >
            <img
              src={photo.src}
              alt={photo.alt}
              className="w-full h-full object-cover pointer-events-none"
              draggable={false}
            />
          </div>
        );
      })}
    </div>
  );
}
