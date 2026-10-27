export function ProgressRing({
  done,
  total,
  percent,
  label,
  showTotal = true,
  valueFormat = "percent",
}: {
  done: number;
  total: number;
  percent: number;
  label: string;
  showTotal?: boolean;
  valueFormat?: "percent" | "count";
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-2 text-xs text-muted-foreground"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${done} of ${total} tasks complete`}
      aria-label={`${label}: ${done} of ${total} tasks complete, ${percent}%`}
    >
      <svg viewBox="0 0 20 20" className="size-4 -rotate-90" aria-hidden="true">
        <circle
          cx="10"
          cy="10"
          r="8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-muted-foreground/30"
        />
        <circle
          cx="10"
          cy="10"
          r="8"
          fill="none"
          stroke="var(--progress-completed)"
          strokeWidth="2"
          pathLength="100"
          strokeDasharray={`${percent} 100`}
          strokeLinecap="round"
        />
      </svg>
      <span
        className={`tabular-nums ${showTotal ? "" : "font-medium text-foreground"}`}
      >
        {valueFormat === "count" ? (
          `${done}/${total}`
        ) : (
          <>
            {percent}% {showTotal && <span className="ml-1">of {total}</span>}
          </>
        )}
      </span>
    </span>
  );
}
