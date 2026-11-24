import { IconChevronDown, IconPlus, IconX } from "@tabler/icons-react";
import { Badge } from "@libs/components/ui/badge";
import { Button } from "@libs/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@libs/components/ui/collapsible";
import { InlineDealValue } from "./InlineDealValue";
import { sponsorPillColor } from "./deal-pill-styles";
import { tierDeliverables } from "./tier-deliverables";
import {
  editableDeal,
  sponsorLevelLabels,
  type Deal,
  type DealInput,
  type PipelineData,
} from "./types";
type Props = {
  deal: Deal;
  data: PipelineData;
  members: { id: string; name: string }[];
  busy: boolean;
  onSave: (input: DealInput) => Promise<boolean>;
  onWonEdit: () => void;
  onInvalid: (message: string) => void;
};
export function DealTermFields({
  deal,
  data,
  busy,
  onSave,
  onWonEdit,
  onInvalid,
}: Props) {
  const codes = [
    deal.seasonId,
    ...deal.contributions.map((item) => item.seasonId),
  ].map((id) => data.seasons.find((season) => season.id === id)?.code ?? "");
  const templates = tierDeliverables(
    deal.opportunityKind === "grant" ? null : deal.sponsorLevel,
    codes.some(Boolean)
      ? codes
      : [data.seasons.find((season) => season.status === "active")?.code ?? ""],
  );
  const normalize = (title: string) =>
    title.trim().replace(/\s+/g, " ").toLowerCase();
  const titles = new Set(templates.map((item) => normalize(item.title)));
  const indexed = deal.deliverables.map((item, index) => ({ item, index }));
  const packageItems = indexed.filter(({ item }) =>
    titles.has(normalize(item.title)),
  );
  const addons = indexed.filter(
    ({ item }) => !titles.has(normalize(item.title)),
  );
  const editable = data.canManage && deal.stage !== "won";
  const rows = (items: typeof indexed) => (
    <ul className="space-y-1">
      {items.map(({ item, index }) => (
        <li
          key={item.id ?? index}
          className="group flex items-center gap-2 text-sm"
        >
          <span
            className="size-1 shrink-0 rounded-full bg-muted-foreground"
            aria-hidden="true"
          />
          <InlineDealValue
            deal={deal}
            busy={busy}
            onWonEdit={onWonEdit}
            onInvalid={onInvalid}
            className="min-w-0 flex-1"
            label={`Title for deliverable ${index + 1}`}
            required
            maxLength={200}
            value={item.title}
            onSave={(title, source) => {
              const input = editableDeal(source);
              return onSave({
                ...input,
                deliverables: input.deliverables.map((entry, i) =>
                  i === index ? { ...entry, title } : entry,
                ),
              });
            }}
          />
          {editable && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={busy}
              className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={`Remove deliverable ${index + 1}`}
              onClick={() =>
                void onSave({
                  ...editableDeal(deal),
                  deliverables: editableDeal(deal).deliverables.filter(
                    (_, i) => i !== index,
                  ),
                })
              }
            >
              <IconX aria-hidden="true" />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
  return (
    <section className="space-y-3 border-t pt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Deliverables</h3>
        {editable && (
          <InlineDealValue
            label="New deliverable"
            triggerLabel="Add deliverable"
            triggerContent={<IconPlus aria-hidden="true" className="size-4" />}
            value=""
            required
            maxLength={200}
            deal={deal}
            busy={busy}
            onWonEdit={onWonEdit}
            onInvalid={onInvalid}
            onSave={(title, source) =>
              onSave({
                ...editableDeal(source),
                deliverables: [
                  ...editableDeal(source).deliverables,
                  {
                    title,
                    description: "",
                    ownerMemberId: null,
                    dueDate: null,
                  },
                ],
              })
            }
          />
        )}
      </div>
      {templates.length > 0 && (
        <Collapsible defaultOpen className="space-y-2">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="group flex w-full items-center gap-2 rounded-md py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <IconChevronDown
                aria-hidden="true"
                className="size-3.5 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90"
              />
              <Badge
                variant="outline"
                className={sponsorPillColor(deal.sponsorLevel)}
              >
                {sponsorLevelLabels[deal.sponsorLevel!] ?? deal.sponsorLevel}{" "}
                package
              </Badge>
              <span className="ml-auto text-xs text-muted-foreground">
                {packageItems.length}
              </span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pl-5">
            {packageItems.length ? (
              rows(packageItems)
            ) : (
              <p className="text-sm text-muted-foreground">
                No package deliverables.
              </p>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}
      {addons.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs text-muted-foreground">Add-ons</h4>
          {rows(addons)}
        </div>
      )}
      {!templates.length && !addons.length && (
        <p className="text-sm text-muted-foreground">
          No deliverables recorded.
        </p>
      )}
    </section>
  );
}
