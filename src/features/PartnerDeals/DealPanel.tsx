import { useState, type Ref } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@libs/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@libs/components/ui/dialog";
import { Button } from "@libs/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@libs/components/ui/select";
import {
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@libs/components/ui/sheet";
import { LinkedPurchases } from "./LinkedPurchases";
import { InlineDealFields } from "./InlineDealFields";
import { InlineDealValue } from "./InlineDealValue";
import { DealTermFields } from "./DealTermFields";
import { DealReviewSummary } from "./DealReviewSummary";
import { dealPresentation } from "./deal-presentation";
import {
  editableDeal,
  stageLabels,
  stages,
  type Deal,
  type DealInput,
  type DealStage,
  type PipelineData,
} from "./types";

type Props = {
  deal: Deal;
  data: PipelineData;
  members: { id: string; name: string }[];
  busy: boolean;
  onSave: (input: DealInput) => Promise<boolean>;
  onMove: (stage: DealStage) => void;
  latestConflict: Deal | null;
  onDismissConflict: () => void;
  stageControlRef?: Ref<HTMLButtonElement>;
  onWonEdit: () => void;
  onInvalid: (message: string) => void;
  onChanged: () => Promise<void>;
};

export function DealPanel({
  deal,
  data,
  members,
  busy,
  onSave,
  onMove,
  latestConflict,
  onDismissConflict,
  onWonEdit,
  onInvalid,
  onChanged,
  stageControlRef,
}: Props) {
  const [attempt, setAttempt] = useState<DealInput | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);
  async function save(input: DealInput) {
    setAttempt(input);
    const saved = await onSave(input);
    if (saved) {
      setAttempt(null);
      onDismissConflict();
    }
    return saved;
  }
  async function saveReviewed() {
    if (!attempt || !latestConflict || busy) return;
    if (await save({ ...attempt, expectedRevision: latestConflict.revision }))
      setEditorVersion((version) => version + 1);
  }
  const value = (
    label: string,
    key:
      | "title"
      | "contactName"
      | "contactEmail"
      | "startsOn"
      | "endsOn"
      | "agreementLink"
      | "negotiationNotes"
      | "partnerNotes",
    options: {
      type?: "text" | "email" | "url" | "date";
      multiline?: boolean;
      placeholder?: string;
      className?: string;
      required?: boolean;
      maxLength?: number;
      autoSave?: boolean;
    } = {},
  ) => (
    <InlineDealValue
      key={`${key}:${editorVersion}`}
      label={label}
      deal={deal}
      value={
        deal[key] ??
        (key === "partnerNotes"
          ? deal.contributions
              .filter((item) => item.description.trim())
              .map((item) => `- ${item.description}`)
              .join("\n")
          : "")
      }
      busy={busy || !data.canManage}
      onWonEdit={onWonEdit}
      onInvalid={onInvalid}
      {...options}
      onSave={(next, source) =>
        save({
          ...editableDeal(source),
          [key]: key === "startsOn" || key === "endsOn" ? next || null : next,
        })
      }
    />
  );
  const summary = dealPresentation(deal, data, members);
  const grant = deal.opportunityKind === "grant";
  const label = (stage: DealStage) =>
    grant && stage === "won" ? "Approved" : stageLabels[stage];
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <SheetHeader className="shrink-0 gap-3 border-b p-6 pr-14">
          <p className="text-xs text-muted-foreground">
            {deal.organizationName}
          </p>
          <SheetTitle className="sr-only">{deal.title}</SheetTitle>
          {value(grant ? "Grant name" : "Deal name", "title", {
            required: true,
            maxLength: 200,
            className: "text-xl font-semibold leading-snug",
          })}
          <SheetDescription className="sr-only">
            {grant ? "Grant" : "Deal"} details for {deal.organizationName}
          </SheetDescription>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-2xl font-semibold tracking-tight tabular-nums">
              {summary.cash ?? summary.inKind ?? "Value not set"}
            </p>
            <Badge variant="secondary">
              {deal.cancelledAt ? "Cancelled" : label(deal.stage)}
            </Badge>
          </div>
        </SheetHeader>
        <div className="min-h-0 space-y-6 overflow-y-auto p-6">
          <section className="space-y-3" aria-label="Opportunity properties">
            <h3 className="text-sm font-medium">Details</h3>
            {deal.stage !== "won" && (
              <Select
                value={deal.stage}
                disabled={busy || !data.canManage}
                onValueChange={(value) => onMove(value as DealStage)}
              >
                <SelectTrigger
                  ref={stageControlRef}
                  aria-label={`Stage for ${deal.title}`}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {label(stage)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Type</span>
              <Select
                value={deal.opportunityKind ?? "deal"}
                disabled={busy || !data.canManage || deal.stage === "won"}
                onValueChange={(kind) => {
                  const input = editableDeal(deal);
                  void save({
                    ...input,
                    opportunityKind: kind as "deal" | "grant",
                    ...(kind === "grant"
                      ? {
                          sponsorLevel: null,
                          contributions: input.contributions.map((item) => ({
                            ...item,
                            invoiceDate: null,
                          })),
                        }
                      : {}),
                  });
                }}
              >
                <SelectTrigger
                  aria-label="Opportunity type"
                  size="sm"
                  className="w-auto border-transparent shadow-none"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deal">Deal</SelectItem>
                  <SelectItem value="grant">Grant</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <InlineDealFields
              key={editorVersion}
              deal={deal}
              data={data}
              members={members}
              busy={busy || !data.canManage}
              onSave={save}
              onWonEdit={onWonEdit}
              onInvalid={onInvalid}
            />
          </section>
          <section className="space-y-3 border-t pt-5">
            <h3 className="text-sm font-medium">Contact & agreement</h3>
            <dl className="grid grid-cols-2 gap-x-5 gap-y-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Contact name</dt>
                <dd>
                  {value("Contact name", "contactName", {
                    maxLength: 160,
                    autoSave: true,
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Email</dt>
                <dd>
                  {value("Contact email", "contactEmail", {
                    type: "email",
                    maxLength: 254,
                    autoSave: true,
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Start date</dt>
                <dd>{value("Start date", "startsOn", { type: "date" })}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">End date</dt>
                <dd>{value("End date", "endsOn", { type: "date" })}</dd>
              </div>
              <div className="col-span-2 min-w-0">
                <dt className="text-xs text-muted-foreground">
                  Agreement link
                </dt>
                <dd>
                  {value("Agreement link", "agreementLink", {
                    type: "url",
                    placeholder: "Add agreement link…",
                  })}
                </dd>
              </div>
            </dl>
          </section>
          {!grant && <section className="space-y-2 border-t pt-5">
            <h3 className="text-sm font-medium">Negotiation notes</h3>
            {value("Negotiation notes", "negotiationNotes", {
              multiline: true,
              maxLength: 2000,
              placeholder: "Add notes…",
            })}
          </section>}
          {!grant && <section className="space-y-2 border-t pt-5">
            <h3 className="text-sm font-medium">Partner contributions</h3>
            {value("Partner contributions", "partnerNotes", {
              multiline: true,
              maxLength: 8000,
              placeholder: "List what the partner will provide…",
            })}
          </section>}
          <DealTermFields
            key={editorVersion}
            deal={deal}
            data={data}
            members={members}
            busy={busy || !data.canManage}
            onSave={save}
            onWonEdit={onWonEdit}
            onInvalid={onInvalid}
          />
          {deal.financeReviews?.length ? (
            <dl className="border-t pt-5 text-sm">
              <dt className="text-xs text-muted-foreground">Finance review</dt>
              <dd className="mt-1 font-medium">
                {deal.financeReviews.some((review) => review.status === "stale")
                  ? "Needs review"
                  : deal.financeReviews.some(
                        (review) => review.status === "pending",
                      )
                    ? "Pending"
                    : "Resolved"}
              </dd>
            </dl>
          ) : null}
          {data.canManage && (
            <section className="border-t pt-5">
              <LinkedPurchases
                deal={deal}
                seasons={data.seasons}
                onChanged={onChanged}
              />
            </section>
          )}
          {(deal.agreementLink || deal.stage === "won") && (
            <div className="flex flex-wrap gap-4 border-t pt-5">
              {deal.agreementLink && (
                <a
                  href={deal.agreementLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary underline underline-offset-4"
                >
                  Open agreement file
                </a>
              )}
              {deal.stage === "won" && (
                <Link
                  to={`/partner-deals?deal=${encodeURIComponent(deal.id)}`}
                  className="text-sm font-medium text-primary underline underline-offset-4"
                >
                  Open agreement
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
      {latestConflict && attempt && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) onDismissConflict();
          }}
        >
          <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Review the latest deal</DialogTitle>
              <DialogDescription>
                Compare the saved deal with your unsaved edits. Saving your
                edits replaces the saved values shown here.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <DealReviewSummary
                title="Latest saved"
                input={latestConflict}
                data={data}
                members={members}
              />
              <DealReviewSummary
                title="Your edits"
                input={attempt}
                data={data}
                members={members}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onDismissConflict}
              >
                Keep reviewing
              </Button>
              {latestConflict.stage !== "won" && (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveReviewed()}
                >
                  Save my edits
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
