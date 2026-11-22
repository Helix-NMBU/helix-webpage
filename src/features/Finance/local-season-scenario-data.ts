import type { TaskCategory } from "../ProjectManagement/types";
import type { OrdinaryBudgetPriority } from "./project-budget-types";
export type ScenarioProject = { department: string; name: string; category: TaskCategory; entries: readonly (readonly [string, number, OrdinaryBudgetPriority])[] };
export const SCENARIO_PROJECTS: readonly ScenarioProject[] = [
  { department: "Management", name: "Competition operations", category: "operations", entries: [["Competition registration and insurance", 95000, "P1"], ["Safety and certification", 35000, "P1"], ["Team planning tools", 18000, "P2"], ["Leadership training", 12000, "P3"], ["Event reserve", 10000, "P4"]] },
  { department: "Management", name: "Member operations", category: "operations", entries: [["Workspace and meeting facilities", 45000, "P1"], ["Member onboarding", 12000, "P2"], ["Team development workshop", 10000, "P3"], ["Member apparel", 8000, "P4"]] },
  { department: "Mechanical & Production", name: "Vehicle structure", category: "production", entries: [["Chassis tubes and machining", 180000, "P1"], ["Brake systems", 65000, "P1"], ["Suspension components", 95000, "P2"], ["Aerodynamic moulds", 45000, "P3"], ["Spare tooling", 20000, "P4"]] },
  { department: "Mechanical & Production", name: "Workshop production", category: "production", entries: [["CNC fabrication", 110000, "P1"], ["Welding consumables", 35000, "P2"], ["Metrology equipment", 25000, "P3"], ["Secondary workbench", 15000, "P4"]] },
  { department: "Electronics", name: "Vehicle electronics", category: "production", entries: [["Motor controllers", 90000, "P1"], ["High-voltage safety", 70000, "P1"], ["Wiring harness", 60000, "P2"], ["Telemetry modules", 35000, "P3"], ["Electronics spares", 15000, "P4"]] },
  { department: "Electronics", name: "Electrical validation", category: "production", entries: [["Electrical test equipment", 50000, "P1"], ["Battery test fixture", 30000, "P2"], ["Validation data logging", 20000, "P3"], ["Automated test stand", 20000, "P4"]] },
  { department: "Software & Autonomous", name: "Autonomous driving", category: "production", entries: [["Onboard compute", 85000, "P1"], ["Perception sensors", 95000, "P1"], ["Simulation licences", 35000, "P2"], ["Test infrastructure", 25000, "P3"], ["Backup compute", 20000, "P4"]] },
  { department: "Software & Autonomous", name: "Telemetry platform", category: "production", entries: [["Vehicle data logging", 32000, "P1"], ["Connectivity", 18000, "P2"], ["Engineering dashboards", 15000, "P3"], ["Replay tooling", 10000, "P4"]] },
  { department: "Business & Marketing", name: "Sponsor activations", category: "marketing", entries: [["Partner deliverables", 45000, "P1"], ["Sponsor event", 25000, "P2"], ["Media production", 20000, "P3"], ["Campaign materials", 10000, "P4"]] },
  { department: "Business & Marketing", name: "Brand and recruitment", category: "marketing", entries: [["Team website", 8000, "P1"], ["Team photography", 12000, "P2"], ["Recruitment campaign", 15000, "P3"], ["Sponsor brochures", 10000, "P4"]] },
  { department: "Logistics", name: "Competition transport", category: "operations", entries: [["Vehicle freight", 90000, "P1"], ["Competition accommodation", 110000, "P1"], ["Team travel", 70000, "P2"], ["Spare-parts freight", 25000, "P3"], ["Travel contingency", 18000, "P4"]] },
  { department: "Logistics", name: "Workshop logistics", category: "operations", entries: [["Workshop storage", 18000, "P1"], ["Inventory tooling", 12000, "P2"], ["Workshop relocation", 10000, "P3"], ["Additional transport", 8000, "P4"]] },
  { department: "Finance", name: "Finance operations", category: "operations", entries: [["Team insurance", 42000, "P1"], ["Accounting software", 12000, "P1"], ["Audit and reporting", 15000, "P2"], ["Expense tooling", 8000, "P3"], ["Finance training", 6000, "P4"]] },
  { department: "Finance", name: "Funding compliance", category: "operations", entries: [["Grant reporting", 18000, "P1"], ["Funding analysis", 12000, "P2"], ["Sponsor reporting", 8000, "P3"], ["Finance workshop", 5000, "P4"]] },
];
export const SCENARIO_INCOME = [
  ["NMBU project support", 200000, "2026-08-20", "grant"],
  ["Nordic engineering partnership", 350000, "2026-09-05", "sponsor_cash"],
  ["Membership contributions", 70000, "2026-09-24", "membership"],
  ["Student innovation grant", 500000, "2026-10-10", "grant"],
  ["Alumni and supporter fund", 180000, "2026-10-27", "other"],
  ["Technology partner contribution", 340000, "2026-11-08", "sponsor_cash"],
  ["Regional business network", 220000, "2026-11-19", "sponsor_cash"],
] as const;
