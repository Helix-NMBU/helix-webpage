import { useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// Real circuit outlines, traced from the venue's official track maps
// (public/circuits/*.svg) — decorative silhouettes, drawn white and revealed on row hover.
const TRACKS = {
  meppen: {
    viewBox: '0 0 1417.23 1760.15',
    path: 'M45.6 1300.43l-0.58 -2.75c-11.07,-56.37 3.34,-110 34.59,-152.5 30.94,-42.08 78.47,-73.13 134.01,-84.85l3.21 -0.67 723.8 -142.09c41.88,-8.22 67.76,-25.08 82.47,-46.36 18.19,-26.32 20.25,-60.62 14.6,-94.14 -4.49,-26.7 -16,-52.49 -35.89,-75.3 -18.51,-21.2 -44.4,-39.98 -78.81,-54.76 -71.11,-30.54 -119.41,-74.85 -153.28,-133.23 -33.24,-57.27 -52.1,-127.53 -64.91,-211.36 -7.91,-51.77 -6.83,-91.25 1.93,-122.8 9.17,-33 26.46,-56.92 50.47,-76.52 25.63,-20.92 61.74,-33.21 99.07,-38.22 41.52,-5.56 85.21,-2.19 117.59,8.28 50.9,16.45 92.52,47.29 124.7,88.48 33.57,42.97 56.73,97.16 69.28,157.88l140.93 681.96c4.56,22.07 1.44,41.69 -7.63,57.23 -9.64,16.5 -25.66,28.01 -46.13,32.73 -1.56,0.36 -2.9,0.7 -4.02,1.01 -13.08,3.65 -22.54,9.57 -27.69,17.51 -4.92,7.59 -6.21,17.9 -3.25,30.74 0.3,1.3 0.58,2.43 0.85,3.39 2.63,9.43 4.95,18.54 6.96,27.32 22.43,97.89 14.37,179.44 -14.32,240.95 -29.39,63.02 -80.19,105 -142.22,122.29 -3.64,1.01 -7.12,1.9 -10.44,2.66l-281.91 64.6c-52.74,12.08 -94.56,-6.82 -118.42,-37.55 -9.79,-12.61 -16.52,-27.32 -19.71,-42.78 -3.18,-15.47 -2.75,-31.69 1.77,-47.31 10.65,-36.8 43.55,-69.78 104.76,-80.52l217.96 -38.25c30.34,-5.33 54.19,-14.68 71.3,-26.97 15.82,-11.35 25.8,-25.22 29.67,-40.61 3.93,-15.58 1.77,-33.28 -6.75,-52.08 -9.95,-21.98 -28.38,-45.21 -55.72,-68.31 -4.66,-3.94 -9.3,-7.67 -13.92,-11.18 -50.08,-38.15 -98.51,-52.55 -142.93,-46.89 -44.39,5.65 -85.7,31.46 -121.42,73.73 -3.47,4.11 -6.89,8.37 -10.24,12.77 -36.8,48.32 -73.56,73.81 -110.58,77.16 -38.07,3.45 -74.21,-16.15 -108.8,-58.07 -9.04,-10.96 -17.83,-19.49 -26.31,-25.66 -11.32,-8.25 -21.93,-12.19 -31.74,-12.08 -9.46,0.12 -18.9,4.12 -28.18,11.78 -6.19,5.1 -12.25,11.75 -18.17,19.87 -13.19,18.11 -18.45,35.04 -19.12,52.74 -0.71,18.81 3.67,39.73 9.45,63.95l24.15 101.29c3.36,14.1 5.97,27.77 7.88,41.01 9.54,66.18 0.25,118.9 -20.3,155.63 -46.57,83.23 -150.73,94.55 -225.38,42.38 -32.32,-22.59 -57.87,-58.56 -67.14,-102.52l-55.49 -263.01zm33.88 -9.48c0.4,2.02 0.36,1.9 0.45,2.34l55.49 263.01c7.27,34.49 27.39,63.16 52.86,80.96 57.4,40.11 138.43,34.14 174.71,-30.7 17.02,-30.43 24.53,-75.71 16.17,-133.66 -1.7,-11.82 -4.13,-24.43 -7.33,-37.85l-24.15 -101.29c-6.35,-26.63 -11.15,-49.95 -10.27,-73.3 0.93,-24.47 8.04,-47.64 25.86,-72.1 7.69,-10.57 15.77,-19.37 24.2,-26.32 15.53,-12.82 32.27,-19.53 50.02,-19.74 17.42,-0.21 35.07,5.92 52.75,18.8 10.91,7.94 21.85,18.48 32.77,31.71 26.75,32.43 52.88,47.76 78.58,45.43 26.76,-2.43 55.29,-23.42 85.87,-63.57 3.72,-4.89 7.5,-9.6 11.33,-14.14 41.38,-48.97 90.28,-79 143.81,-85.82 53.51,-6.81 110.73,9.68 168.61,53.76 5.1,3.89 10.2,7.98 15.29,12.28 31.46,26.58 53.01,54.06 65.06,80.67 11.87,26.22 14.67,51.72 8.81,75.01 -5.91,23.48 -20.47,44.16 -43.26,60.53 -21.44,15.39 -50.16,26.9 -85.73,33.14l-217.96 38.26c-45.88,8.05 -69.94,30.71 -77.16,55.66 -2.89,10 -3.15,20.48 -1.07,30.55 2.07,10.08 6.55,19.78 13.11,28.23 16.2,20.85 45.33,33.51 82.85,24.92l281.91 -64.6c3.19,-0.74 6.17,-1.49 8.93,-2.26 52.07,-14.51 94.82,-49.97 119.7,-103.33 25.59,-54.86 32.53,-128.63 11.99,-218.29 -1.99,-8.65 -4.17,-17.26 -6.55,-25.81 -0.51,-1.84 -0.93,-3.47 -1.26,-4.9 -5.21,-22.58 -2.11,-41.98 8.05,-57.66 9.93,-15.32 26.24,-26.21 47.74,-32.2 2,-0.56 3.84,-1.03 5.53,-1.42 10.7,-2.47 18.89,-8.18 23.61,-16.26 4.83,-8.27 6.36,-19.38 3.65,-32.51l-140.93 -681.95c-11.47,-55.51 -32.39,-104.72 -62.55,-143.33 -27.94,-35.76 -63.93,-62.49 -107.82,-76.67 -27.74,-8.98 -65.7,-11.8 -102.2,-6.9 -31.48,4.22 -61.36,14.11 -81.63,30.66 -18.49,15.09 -31.79,33.44 -38.8,58.67 -7.41,26.69 -8.12,61.43 -0.97,108.24 12.2,79.8 29.83,146.13 60.52,199.01 30.05,51.78 73.13,91.19 136.8,118.53 39.37,16.9 69.4,38.87 91.3,63.96 24.47,28.04 38.61,59.76 44.14,92.6 6.98,41.48 3.85,84.77 -20.37,119.82 -19.69,28.49 -52.7,50.73 -104.58,60.92l-726.6 142.63c-46.89,9.89 -86.91,35.96 -112.86,71.25 -25.65,34.87 -37.48,78.85 -28.42,125.03z',
    mode: 'fill' as const,
  },
  silverstone: {
    viewBox: '0 0 425.6861 327.11162',
    path: 'm25.198 30.229c-0.31456 1.0094-0.61942 2.0209-0.91904 3.0341-7.834 29.626-14.076 59.7-19.349 89.878-2.535 14.71-1.4856 31.043 8.2385 43.106 10.041 12.782 21.82 24.306 34.577 34.354 5.1918 4.5054 12.826 4.0455 18.004-0.22327 6.4174-3.2681 10.111-11.816 5.677-18.13-5.8251-10.346-19.237-11.651-26.639-20.171-5.6049-6.4993 0.19048-15.56 6.5585-18.909 45.445-27.169 91.127-54.08 137.35-79.839 5.1495-2.9902 10.946-2.7674 16.099-0.0654 10.1 4.7029 20.624 10.845 26.727 20.5 0.0808 3.862-6.0487 2.961-8.6128 3.5071-8.2501 0.97774-17.512-2.1461-25.203 1.9076-4.99 4.9203-0.70564 12.71 0.60533 18.304 4.8212 16.032 13.674 31.093 14.992 47.993-0.24271 16.885-12.901 30.252-16.443 46.332-0.84301 13.01 8.7895 23.588 15.052 34.056 14.712 22.13 31.592 42.83 45.602 65.396 5.8177 10.093 14.253 22.064 27.225 21.989 11.47 0.59815 25.629-0.96669 32.419-11.47 3.6727-5.7698-0.13079-12.116-1.8021-17.732 2.7607-4.9306 10.108-5.2048 14.709-7.9877 20.668-8.6102 40.531-19.776 63.083-22.553 9.496-1.5148 20.474-3.8364 25.382-13.169 4.2381-8.1269 5.1636-18.83-1.0634-26.27-21.629-32.654-51.613-58.448-77.982-87.076-17.562-18.913-36.653-36.457-53.119-56.32-9.2011-11.84-6.159-30.331-18.353-40.334-7.1588-4.9033-16.375-4.6729-24.132-1.3651-9.4575 4.7376-20.293 1.5097-28.217-4.6666-8.7547-6.032-17.465-16.33-29.387-13.706-8.8381 1.3902-17.885 3.6991-26.562 0.60162-35.41-9.071-71.544-19.259-108.45-17.175-10.471 0.0557-19.533 7.548-22.868 17.252-1.2385 2.9204-2.2695 5.9229-3.2131 8.951z',
    mode: 'stroke' as const,
  },
};

const GRID_LINES = `
  linear-gradient(rgba(253,253,253,0.16) 1px, transparent 1px),
  linear-gradient(90deg, rgba(253,253,253,0.16) 1px, transparent 1px),
  linear-gradient(rgba(253,253,253,0.06) 1px, transparent 1px),
  linear-gradient(90deg, rgba(253,253,253,0.06) 1px, transparent 1px)
`;
const GRID_SIZE = "120px 120px, 120px 120px, 20px 20px, 20px 20px";

// Tracks lie flat (rotateX) then spin around their own vertical axis (rotateZ,
// applied inside that tilted frame) — a turntable, not a flipping card.
const CSS = `
@keyframes turntable-spin {
  from { transform: rotateZ(0deg); }
  to   { transform: rotateZ(360deg); }
}
.turntable-spin {
  animation: turntable-spin 6s linear infinite;
}
`;

const results = [
  {
    year: "2026",
    event: "Formula Future",
    flag: "/flags/de.svg",
    flagAlt: "Germany",
    location: "Meppen, Germany",
    track: TRACKS.meppen,
    score: "244.74",
    placing: "P5",
  },
  {
    year: "2025",
    event: "FSUK",
    flag: "/flags/gb.svg",
    flagAlt: "United Kingdom",
    location: "Silverstone, UK",
    track: TRACKS.silverstone,
    score: "151.3",
    placing: "P45",
  },
  {
    year: "2024",
    event: "FSUK",
    flag: "/flags/gb.svg",
    flagAlt: "United Kingdom",
    location: "Silverstone, UK",
    track: TRACKS.silverstone,
    score: "20.7",
    placing: "P50",
  },
];

export default function CompetitionResults() {
  const containerRef = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useGSAP(
    () => {
      gsap.from(".results-header > *", {
        y: 28,
        opacity: 0,
        duration: 0.75,
        stagger: 0.12,
        ease: "power3.out",
        scrollTrigger: {
          trigger: ".results-header",
          start: "top 85%",
        },
      });

      gsap.from(".result-row", {
        y: 24,
        opacity: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: "power2.out",
        scrollTrigger: {
          trigger: ".result-row",
          start: "top 88%",
        },
      });
    },
    { scope: containerRef }
  );

  return (
    <section ref={containerRef} className="relative overflow-hidden bg-background text-foreground">
      <style>{CSS}</style>
      <div className="relative px-6 py-24 mx-auto max-w-screen-2xl lg:px-12">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-16">
          {/* Table */}
          <div className="w-full min-w-0 lg:w-1/2">
            {/* Header — matches the label + heading style used across the other sections */}
            <div className="mb-16 results-header">
              <p className="mb-4 text-xs tracking-widest text-white uppercase">
                Competition history
              </p>
              <h2
                className="font-medium"
                style={{ fontSize: "clamp(36px, 4vw, 64px)", lineHeight: 1.05 }}
              >
                Where we've competed.
              </h2>
            </div>

            <div className="items-center hidden gap-8 pb-4 text-xs tracking-widest text-white uppercase border-b md:flex border-foreground/10">
              <span className="w-16 shrink-0">Year</span>
              <span className="flex-1">Event</span>
              <span className="w-40 shrink-0">Location</span>
            </div>

            <div className="flex flex-col">
              {results.map((row, i) => (
                <div
                  key={i}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseLeave={() => setActiveIndex(0)}
                  className="flex items-center gap-4 px-4 py-6 -mx-4 transition-colors duration-200 border-b result-row sm:gap-8 border-foreground/10 hover:bg-white/10"
                >
                  <span className="w-12 text-sm tracking-widest text-white uppercase sm:w-16 sm:text-sm shrink-0">
                    {row.year}
                  </span>

                  <div className="flex flex-col flex-1 gap-0.5 min-w-0">
                    <span
                      className="flex items-center gap-3 font-bold text-white uppercase truncate"
                      style={{ fontSize: "clamp(20px, 4.5vw, 28px)" }}
                    >
                      {row.event}
                      <img
                        src={row.flag}
                        alt={row.flagAlt}
                        className="h-[0.7em] w-auto rounded-[2px] shrink-0"
                      />
                    </span>
                    <span className="text-sm text-white sm:text-sm md:hidden">
                      {row.location}
                    </span>
                  </div>

                  <span className="hidden w-40 text-sm text-white md:block shrink-0">
                    {row.location}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Circuit stage — a card that fills the column, revealing the track outline + stats on row hover */}
          <div
            className="relative items-center justify-center flex-1 hidden overflow-hidden border lg:flex rounded-2xl border-white/10 bg-white/5"
            style={{ perspective: "1200px" }}
          >
            {results.map((row, i) => (
              <div
                key={i}
                className="absolute flex flex-col items-center gap-10 transition-opacity duration-500"
                style={{ opacity: activeIndex === i ? 1 : 0 }}
              >
                <div className="flex items-center justify-center h-48" style={{ transformStyle: "preserve-3d" }}>
                  <div style={{ transformStyle: "preserve-3d", transform: "rotateX(62deg)" }}>
                    <div className="turntable-spin" style={{ transformStyle: "preserve-3d" }}>
                      <svg viewBox={row.track.viewBox} width="240" height="240">
                        <path
                          d={row.track.path}
                          fill={row.track.mode === 'fill' ? '#ffffff' : 'none'}
                          stroke={row.track.mode === 'stroke' ? '#ffffff' : 'none'}
                          strokeWidth={row.track.mode === 'stroke' ? 7.5 : 0}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="flex gap-12">
                  <div className="text-center">
                    <p className="mb-1 text-xs tracking-widest text-white uppercase">
                      Overall score
                    </p>
                    <p className="text-3xl font-medium" style={{ letterSpacing: "-0.02em" }}>
                      {row.score}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="mb-1 text-xs tracking-widest text-white uppercase">
                      Overall placing
                    </p>
                    <p className="text-3xl font-medium" style={{ letterSpacing: "-0.02em" }}>
                      {row.placing}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
