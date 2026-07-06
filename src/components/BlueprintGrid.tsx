export default function BlueprintGrid() {
  const gridSize = 40;

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.35 }}
      preserveAspectRatio="none"
    >
      <defs>
        <pattern id="grid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
          <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke="#ffffff" strokeWidth="0.5" strokeOpacity="0.4"/>
        </pattern>
        <pattern id="major-grid" width={gridSize * 5} height={gridSize * 5} patternUnits="userSpaceOnUse">
          <rect width={gridSize * 5} height={gridSize * 5} fill="url(#grid)" />
          <path d={`M ${gridSize * 5} 0 L 0 0 0 ${gridSize * 5}`} fill="none" stroke="#ffffff" strokeWidth="1.5"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#major-grid)" />
    </svg>
  );
}
