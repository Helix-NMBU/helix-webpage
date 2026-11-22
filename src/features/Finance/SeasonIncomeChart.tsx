import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@libs/components/ui/chart";
import { Card, CardContent } from "@libs/components/ui/card";
import { Badge } from "@libs/components/ui/badge";
import { coverageLevels } from "./budget-dashboard-model";
import { seasonIncomeForecast, type IncomeSeries } from "./season-income-forecast";
import { formatOre } from "./money";
import { projectBudgetMoney } from "./project-budget-diff";
import type { FinancingView, PublicBudgets } from "./types";

const money = (ore: bigint) => projectBudgetMoney(formatOre(ore));
const day = (date: string) => Date.parse(`${date}T12:00:00Z`);
const compactMoney = (nok: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(nok);
const monthLabel = (timestamp: number) => new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(timestamp);
const chartConfig = {
  received: { label: "Received", color: "var(--primary)" },
  high: { label: "Realistic", theme: { light: "oklch(0.52 0.14 160)", dark: "oklch(0.75 0.15 160)" } },
  medium: { label: "Moderate", theme: { light: "oklch(0.65 0.16 65)", dark: "oklch(0.8 0.15 75)" } },
  low: { label: "Optimistic", theme: { light: "oklch(0.55 0.2 305)", dark: "oklch(0.75 0.18 305)" } },
} satisfies ChartConfig;

export function SeasonIncomeChart({ budgets, financing, today }: { budgets: PublicBudgets; financing: FinancingView; today: string }) {
  const season = budgets.seasonCode ?? financing.seasonCode ?? "";
  const forecast = seasonIncomeForecast(financing, season, today);
  const { income } = forecast;
  const levels = coverageLevels(budgets);
  const max = [...levels.map(level => level.amountOre), income.plottedOre, forecast.low, 10000n].reduce((a, b) => a > b ? a : b);
  const ceiling = max + max / 8n;
  const data = forecast.points.map(point => ({ timestamp: day(point.date), date: point.date,
    ...Object.fromEntries((["received", "high", "medium", "low"] as const).flatMap(key => [[key, point[key] === null ? null : Number(point[key]) / 100], [`${key}Ore`, point[key]?.toString() ?? null]])),
  }));
  const monthTicks = Array.from({ length: 13 }, (_, index) => Date.UTC(Number(income.startDate.slice(0, 4)), 7 + index, 1, 12));
  const description = `August to August. Income through ${income.throughDate}: ${money(income.plottedOre)}. ${levels.map(level => `${level.name}, ${level.priorities}: ${money(level.amountOre)}`).join(". ")}. Goals use approved allocations. Forecasts through ${forecast.horizonDate} use planned invoice dates and full cash values from the Business & Marketing pipeline; Realistic includes High confidence; Moderate includes High + Medium; Optimistic includes High + Medium + Low. Straight projections connect current receipts to the 30-day total. Projected income does not mark goals as reached.${forecast.hasForecast ? ` 30-day forecasts: Realistic ${money(forecast.high)}; Moderate ${money(forecast.medium)}; Optimistic ${money(forecast.low)}.` : ""}`;
  const goalColor = (amount: bigint) => amount > 0n && income.plottedOre >= amount ? "var(--success)" : "var(--muted-foreground)";
  const distinctLevels = levels.filter((level, index) => level.amountOre > 0n && levels.findIndex(other => other.amountOre === level.amountOre) === index);
  return <Card size="sm" className="gap-3">
    <CardContent className="gap-3">
      <h2 className="sr-only">Season income</h2>
      <div>
        <p className="mb-2 text-xs text-muted-foreground">NOK</p>
        <ChartContainer config={chartConfig} className="h-[340px] w-full aspect-auto">
          <LineChart accessibilityLayer data={data} title={`Season income and pipeline forecasts for ${season}`} desc={description} margin={{ top: 16, right: 100, bottom: 8, left: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="timestamp" type="number" scale="time" domain={[day(income.startDate), day(income.endDate)]} ticks={monthTicks} tickFormatter={monthLabel} tickLine={false} axisLine={false} tickMargin={12} interval={0} />
            <YAxis domain={[0, Number(ceiling) / 100]} tickFormatter={compactMoney} tickLine={false} axisLine={false} width={64} tickMargin={10} />
            <ChartTooltip filterNull cursor={{ stroke: "var(--border)" }} content={<ChartTooltipContent hideIndicator labelFormatter={(_label, payload) => payload[0]?.payload.date ?? ""} formatter={(_value, _name, entry) => {
              const key = String(entry.dataKey) as IncomeSeries;
              return <div className="flex w-full items-center justify-between gap-4"><span className="text-muted-foreground">{chartConfig[key].label}</span><span className="font-medium tabular-nums">{money(BigInt(entry.payload[`${key}Ore`]))}</span></div>;
            }} />} />
            <ChartLegend itemSorter={item => ["received", "high", "medium", "low"].indexOf(String(item.dataKey))} content={<ChartLegendContent />} />
            {distinctLevels.map(level => {
              const color = goalColor(level.amountOre);
              const matches = levels.filter(other => other.amountOre === level.amountOre);
              const label = matches.map(other => matches.length === 1 ? other.name : other.name === "Baseline" ? "Base" : other.name.replace("Level ", "L")).join(" / ");
              return <ReferenceLine key={level.name} y={Number(level.amountOre) / 100} stroke={color} strokeWidth={1} strokeOpacity={0.35} strokeDasharray="5 5" label={{ value: label, position: "right", fill: color, fillOpacity: 0.6, fontSize: 11 }} />;
            })}
            {forecast.hasForecast ? (["low", "medium", "high"] as const).map(key => <Line key={key} dataKey={key} type="linear" stroke={`var(--color-${key})`} strokeWidth={2} strokeDasharray="6 4" dot={false} activeDot={false} isAnimationActive={false} />) : null}
            <Line dataKey="received" type="monotoneX" stroke="var(--color-received)" strokeWidth={3} dot={false} activeDot={false} isAnimationActive={false} />
            <ReferenceDot x={day(income.throughDate)} y={Number(income.plottedOre) / 100} r={4} fill="var(--color-received)" stroke="var(--card)" strokeWidth={2} />
          </LineChart>
        </ChartContainer>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{levels.map(level => {
        const covered = level.amountOre > 0n && income.plottedOre >= level.amountOre;
        const shortfall = level.amountOre > income.plottedOre ? level.amountOre - income.plottedOre : 0n;
        return <div key={level.name} className="space-y-1 rounded-lg border p-3"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-medium">{level.name}</h3>{covered ? <Badge variant="secondary" className="bg-[var(--success)] text-[var(--success-foreground)]">Reached</Badge> : null}</div><p className="text-lg font-semibold tabular-nums">{money(level.amountOre)}</p><p className="text-xs text-muted-foreground">{level.priorities}{level.amountOre === 0n ? " · No approved allocation" : covered ? null : ` · ${money(shortfall)} to go`}</p></div>;
      })}</div>
      {income.unplacedCount > 0 ? <p className="text-xs text-muted-foreground">{money(income.unplacedOre)} received without a date in the elapsed season is not plotted.</p> : null}
      {forecast.undatedCount + forecast.overdueCount + forecast.unclassifiedCount > 0 ? <p className="text-xs text-muted-foreground">Not projected: {[forecast.undatedCount ? `${forecast.undatedCount} without an invoice date` : null, forecast.overdueCount ? `${forecast.overdueCount} due or overdue` : null, forecast.unclassifiedCount ? `${forecast.unclassifiedCount} without confidence` : null].filter(Boolean).join(" · ")}.</p> : null}
    </CardContent>
  </Card>;
}
