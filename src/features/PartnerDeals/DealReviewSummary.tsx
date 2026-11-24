import { formatOreNb } from "../Finance/money";
import { confidenceLabels, dealConfidence } from "./confidence";
import {
  sponsorLevelLabels,
  stageLabels,
  type Deal,
  type DealInput,
  type PipelineData,
} from "./types";

export function DealReviewSummary({
  title,
  input,
  data,
  members,
}: {
  title: string;
  input: Deal | DealInput;
  data: PipelineData;
  members: { id: string; name: string }[];
}) {
  const member = (id: string | null | undefined) =>
    members.find((item) => item.id === id)?.name ?? "Unassigned";
  const confidence = dealConfidence(input.probability);
  const fields = [
    ["Name", input.title],
    ["Type", input.opportunityKind === "grant" ? "Grant" : "Deal"],
    [
      "Company",
      data.organizations.find((item) => item.id === input.organizationId)?.name,
    ],
    ["Stage", stageLabels[input.stage]],
    ["Assignee", member(input.ownerMemberId)],
    ["Season", data.seasons.find((item) => item.id === input.seasonId)?.code],
    [
      "Sponsor level",
      input.sponsorLevel ? sponsorLevelLabels[input.sponsorLevel] : null,
    ],
    ["Confidence", confidence ? confidenceLabels[confidence] : null],
    ["Follow-up", input.followUpOn],
    ["Contact", input.contactName],
    ["Email", input.contactEmail],
    ["Start date", input.startsOn],
    ["End date", input.endsOn],
    ["Agreement link", input.agreementLink],
    ["Notes", input.negotiationNotes],
    ["Partner contributions", input.partnerNotes],
  ];
  return (
    <section className="space-y-3 rounded-lg border p-3 text-sm">
      <h3 className="font-semibold">{title}</h3>
      <dl className="space-y-2">
        {fields.filter(([name]) => input.opportunityKind !== "grant" || !["Sponsor level", "Notes", "Partner contributions"].includes(name!)).map(([name, value]) => (
          <div key={name}>
            <dt className="text-xs text-muted-foreground">{name}</dt>
            <dd className="whitespace-pre-wrap break-words">
              {value || "Not set"}
            </dd>
          </div>
        ))}
      </dl>
      <h4 className="font-medium">Contributions</h4>
      {input.contributions.length ? (
        input.contributions.map((item, index) => (
          <p key={item.id ?? index}>
            {data.seasons.find((season) => season.id === item.seasonId)?.code} ·{" "}
            {item.kind} ·{" "}
            {item.amountOre
              ? `NOK ${formatOreNb(BigInt(item.amountOre))}`
              : "Not estimated"}{" "}
            · {item.description}
            {item.invoiceDate ? ` · ${item.invoiceDate}` : ""}
          </p>
        ))
      ) : (
        <p>None</p>
      )}
      <h4 className="font-medium">Deliverables</h4>
      {input.deliverables.length ? (
        input.deliverables.map((item, index) => (
          <p key={item.id ?? index}>
            {item.title} · {item.description} · {member(item.ownerMemberId)} ·{" "}
            {item.dueDate || "No due date"}
          </p>
        ))
      ) : (
        <p>None</p>
      )}
    </section>
  );
}
