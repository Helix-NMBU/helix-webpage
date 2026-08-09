interface TimelineRailProps {
  labels: string[]; // e.g. ["S26", "S25", "S24"], top -> bottom
  activeIndex: number;
  onSelect: (index: number) => void;
}

const ROW_HEIGHT = 48; // px, keep in sync with the h-12 rows below

const TimelineRail = ({ labels, activeIndex, onSelect }: TimelineRailProps) => {
  if (labels.length < 2) return null;

  const trackHeight = (labels.length - 1) * ROW_HEIGHT;
  const fillHeight = activeIndex * ROW_HEIGHT;

  return (
    <div className="fixed z-30 hidden -translate-y-1/2 right-8 top-1/2 xl:right-12 lg:flex">
      <div className="relative flex flex-col items-end">
        {/* Track */}
        <div
          className="absolute w-px right-[3px] top-6"
          style={{ height: trackHeight, backgroundColor: "rgba(3,9,74,0.15)" }}
          aria-hidden
        />
        {/* Progress fill */}
        <div
          className="absolute w-px right-[3px] top-6 transition-[height] duration-500 ease-out"
          style={{ height: fillHeight, backgroundColor: "#03094A" }}
          aria-hidden
        />

        {labels.map((label, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              key={label}
              onClick={() => onSelect(index)}
              className="relative flex items-center justify-end h-12 group"
              style={{ width: 120 }}
              aria-label={`Jump to ${label}`}
              aria-current={isActive}
            >
              <span
                className="mr-4 text-xs font-semibold tracking-widest uppercase transition-all duration-300"
                style={{
                  color: "#03094A",
                  opacity: isActive ? 1 : 0,
                  transform: isActive ? "translateX(0)" : "translateX(6px)",
                }}
              >
                {label}
              </span>
              <span
                className="relative rounded-full shrink-0 transition-all duration-300"
                style={{
                  width: isActive ? 10 : 7,
                  height: isActive ? 10 : 7,
                  backgroundColor: isActive ? "#03094A" : "rgba(3,9,74,0.3)",
                  boxShadow: isActive ? "0 0 0 4px rgba(3,9,74,0.15)" : "none",
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TimelineRail;
