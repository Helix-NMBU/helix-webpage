import { dealConfidence, type DealConfidence } from "./confidence";

export const dealPropertyPill =
  "h-7 min-h-7 w-auto max-w-44 gap-1.5 rounded-full border px-2.5 py-0 text-xs leading-none font-normal shadow-none data-[size=sm]:h-7 data-[size=default]:h-7 [&>svg:last-child]:hidden [&_span]:truncate";

const confidenceColors: Record<DealConfidence, string> = {
  low: "border-orange-500/25 bg-orange-500/10 text-orange-800 dark:text-orange-300",
  medium:
    "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  high: "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
};
export function confidencePillColor(value: number | null | undefined) {
  const confidence = dealConfidence(value);
  return confidence ? confidenceColors[confidence] : "bg-muted/40";
}

const sponsorColors: Record<string, string> = {
  partner: "border-blue-500/25 bg-blue-500/10 text-blue-800 dark:text-blue-300",
  service: "border-cyan-500/25 bg-cyan-500/10 text-cyan-800 dark:text-cyan-300",
  bronze:
    "border-orange-600/25 bg-orange-600/10 text-orange-900 dark:text-orange-300",
  silver:
    "border-slate-400/40 bg-slate-400/15 text-slate-700 dark:text-slate-200",
  gold: "border-yellow-500/30 bg-yellow-500/15 text-yellow-900 dark:text-yellow-300",
  platinum:
    "border-violet-500/25 bg-violet-500/10 text-violet-800 dark:text-violet-300",
  main: "border-indigo-500/25 bg-indigo-500/10 text-indigo-800 dark:text-indigo-300",
};
export function sponsorPillColor(level: string | null | undefined) {
  return level ? (sponsorColors[level] ?? "bg-muted/40") : "bg-muted/40";
}
