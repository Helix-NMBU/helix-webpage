import { Megaphone, Wallet, Wrench } from "lucide-react";

// Fictional workspace content for the UI preview, never an authorization policy.
export const previewTeams = [
  {
    id: "business-marketing",
    title: "Business & Marketing",
    icon: Megaphone,
    description: "Partnerships, campaigns and the Helix story.",
    sections: [
      {
        id: "partnerships",
        title: "Partnerships",
        description: "Keep sponsor conversations and next steps together.",
        columns: ["Partner", "Next step", "Status"],
        rows: [
          ["Partner A", "Review partnership proposal", "In progress"],
          ["Partner B", "Prepare introduction", "Planned"],
          ["Partner C", "Schedule a follow-up", "To review"],
        ],
      },
      {
        id: "campaigns",
        title: "Campaigns",
        description: "Plan what Helix shares and when.",
        columns: ["Campaign", "Channel", "Status"],
        rows: [
          ["Meet the team", "Social media", "In progress"],
          ["Workshop stories", "Website", "To review"],
          ["Partner spotlight", "Newsletter", "Planned"],
        ],
      },
    ],
  },
  {
    id: "finance",
    title: "Finance",
    icon: Wallet,
    description: "Budgets, expenses and financial planning.",
    sections: [
      {
        id: "budget",
        title: "Budget",
        description: "A shared view of planned spending.",
        columns: ["Budget area", "Planned amount", "Status"],
        rows: [
          ["Materials", "NOK 25,000", "In progress"],
          ["Events", "NOK 8,000", "To review"],
          ["Team equipment", "NOK 12,000", "Planned"],
        ],
      },
      {
        id: "expenses",
        title: "Expenses",
        description: "Collect claims and follow their approval.",
        columns: ["Expense", "Amount", "Status"],
        rows: [
          ["Workshop supplies", "NOK 1,240", "To review"],
          ["Event materials", "NOK 860", "To review"],
          ["Travel reimbursement", "NOK 450", "Planned"],
        ],
      },
    ],
  },
  {
    id: "mechanical-production",
    title: "Mechanical & Production",
    icon: Wrench,
    description: "Build plans, workshop activity and parts.",
    sections: [
      {
        id: "production",
        title: "Production plan",
        description: "Coordinate the next steps from design to assembly.",
        columns: ["Work item", "Stage", "Status"],
        rows: [
          ["Mounting bracket", "Design review", "To review"],
          ["Frame assembly", "Workshop preparation", "In progress"],
          ["Fit and finish", "Final inspection", "Planned"],
        ],
      },
      {
        id: "inventory",
        title: "Parts & inventory",
        description: "See which parts are ready and what needs ordering.",
        columns: ["Part", "Location", "Status"],
        rows: [
          ["Fastener kit", "Workshop shelf A", "Ready"],
          ["Aluminium stock", "Materials rack", "To review"],
          ["Bearing set", "Incoming delivery", "Planned"],
        ],
      },
    ],
  },
];

export function previewPage(pathname: string) {
  for (const team of previewTeams) {
    const section = team.sections.find(
      (item) => pathname === `/teams/${team.id}/${item.id}`,
    );
    if (section) return { team, section };
  }
  return null;
}
