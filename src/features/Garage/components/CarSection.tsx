import { forwardRef, useEffect, useRef, useState } from "react";
import type { CarRecord } from "@libs/lib/staticContent";

interface CarSectionProps {
  car: CarRecord;
  index: number;
}

const CarSection = forwardRef<HTMLElement, CarSectionProps>(({ car, index }, ref) => {
  const [revealed, setRevealed] = useState(false);
  const localRef = useRef<HTMLElement | null>(null);
  const imageOnRight = index % 2 === 1;

  useEffect(() => {
    const el = localRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          obs.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const setRefs = (el: HTMLElement | null) => {
    localRef.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) (ref as React.MutableRefObject<HTMLElement | null>).current = el;
  };

  const hasPhotos = car.images.length > 0;

  return (
    <section
      ref={setRefs}
      className="relative flex items-center w-full min-h-screen px-6 py-24 mx-auto scroll-mt-36 max-w-screen-2xl lg:px-12"
    >
      <div className="grid items-center w-full gap-12 lg:grid-cols-2 lg:gap-20">
        {/* Image */}
        <div
          className={`relative ${imageOnRight ? "lg:order-2" : "lg:order-1"}`}
          style={{
            opacity: revealed ? 1 : 0,
            transform: revealed ? "translateY(0)" : "translateY(24px)",
            transition: "opacity 0.7s ease, transform 0.7s ease",
          }}
        >
          <div className="relative flex items-center justify-center w-full aspect-[16/9]">
            {hasPhotos ? (
              <img
                src={car.images[0]}
                alt={car.name}
                className="object-contain w-full h-full"
                draggable={false}
              />
            ) : (
              <div
                className="flex items-center justify-center px-6 mx-10 text-sm text-center border-1.5 rounded-2xl aspect-[16/9]"
                style={{ borderStyle: "dashed", borderColor: "rgba(3,9,74,0.2)", color: "rgba(3,9,74,0.35)" }}
              >
                Photos coming soon
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div
          className={imageOnRight ? "lg:order-1" : "lg:order-2"}
          style={{
            opacity: revealed ? 1 : 0,
            transform: revealed ? "translateY(0)" : "translateY(24px)",
            transition: "opacity 0.7s ease 0.12s, transform 0.7s ease 0.12s",
          }}
        >
          <div className="mb-5">
            <span
              className="px-3 py-1 text-[11px] font-semibold tracking-widest uppercase rounded-full"
              style={{ backgroundColor: "rgba(3,9,74,0.08)", color: "#03094A" }}
            >
              {car.class}
            </span>
          </div>

          <h2
            className="mb-6 font-medium"
            style={{ fontSize: "clamp(36px, 5.5vw, 76px)", lineHeight: 1.02, color: "var(--background)" }}
          >
            {car.name}
          </h2>

          <p className="mb-8 text-base leading-relaxed max-w-xl md:text-lg" style={{ color: "rgba(12,12,12,0.72)" }}>
            {car.description}
          </p>

          <div className="grid grid-cols-3 gap-6 pt-6" style={{ borderTop: "1px solid rgba(3,9,74,0.12)" }}>
            <Detail label="Focus" value={car.stats.focus} />
            <Detail label="Engine" value={car.stats.engine} />
            <Detail label="Weight" value={car.stats.weight} />
          </div>
        </div>
      </div>
    </section>
  );
});

CarSection.displayName = "CarSection";

const Detail = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="mb-1.5 text-[11px] tracking-widest uppercase" style={{ color: "rgba(3,9,74,0.45)" }}>
      {label}
    </p>
    <p className="text-sm font-semibold md:text-base" style={{ color: "#0C0C0C" }}>
      {value}
    </p>
  </div>
);

export default CarSection;
