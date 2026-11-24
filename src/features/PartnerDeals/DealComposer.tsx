import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type Ref,
} from "react";
import { Badge } from "@libs/components/ui/badge";
import { Button } from "@libs/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@libs/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@libs/components/ui/dialog";
import { DatePicker } from "@libs/components/ui/date-picker";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@libs/components/ui/popover";
import { SearchableSelect } from "@libs/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@libs/components/ui/select";
import { Switch } from "@libs/components/ui/switch";
import { Textarea } from "@libs/components/ui/textarea";
import { formatOreNb, parseNokToOre } from "../Finance/money";
import {
  confidenceLabels,
  confidenceValues,
  dealConfidences,
  type DealConfidence,
} from "./confidence";
import { withTierDeliverables } from "./sponsor-tier-terms";
import {
  sponsorLevelLabels,
  sponsorLevels,
  stageLabels,
  stages,
  type DealInput,
  type DealStage,
  type OpportunityKind,
  type PipelineData,
} from "./types";

import {
  confidencePillColor,
  dealPropertyPill,
  sponsorPillColor,
} from "./deal-pill-styles";

const chipClass = `${dealPropertyPill} bg-muted/40`;

function PropertyChoice({
  label,
  value,
  options,
  onChange,
  color,
}: {
  label: string;
  color?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        aria-label={label}
        className={`${chipClass} ${color ?? ""}`}
      >
        <SelectValue>
          {options.find((option) => option.value === value)?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {label === "Sponsor level" && option.value !== "__none__" ? (
              <Badge
                variant="outline"
                className={sponsorPillColor(option.value)}
              >
                {option.label}
              </Badge>
            ) : label === "Confidence" && option.value !== "__none__" ? (
              <Badge
                variant="outline"
                className={confidencePillColor(
                  confidenceValues[option.value as DealConfidence],
                )}
              >
                {option.label}
              </Badge>
            ) : (
              option.label
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function valueChipLabel(value: string) {
  try {
    const parsed = parseNokToOre(value);
    return parsed !== null && parsed > 0n
      ? `NOK ${formatOreNb(parsed)}`
      : "Value";
  } catch {
    return "Value";
  }
}

type Props = {
  kind: OpportunityKind;
  defaultStage: DealStage;
  data: PipelineData;
  members: { id: string; name: string }[];
  busy: boolean;
  submitRef?: Ref<HTMLButtonElement>;
  onClose: () => void;
  onReturnFocus: () => void;
  onSave: (
    input: DealInput,
    stage: DealStage,
    createMore: boolean,
    companyName: string,
  ) => Promise<boolean>;
  onCreatePartner: (name: string) => Promise<string | null>;
  onInvalid: (message: string) => void;
};

export function DealComposer({
  kind,
  defaultStage,
  data,
  members,
  busy,
  submitRef,
  onClose,
  onReturnFocus,
  onSave,
  onCreatePartner,
  onInvalid,
}: Props) {
  const id = useId();
  const titleInput = useRef<HTMLTextAreaElement>(null);
  const pendingFocus = useRef(false);
  const saving = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [stage, setStage] = useState(defaultStage);
  const [companyId, setCompanyId] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyOpen, setCompanyOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [seasonId, setSeasonId] = useState(
    data.seasons.find((season) => season.status === "active")?.id ?? "",
  );
  const [amount, setAmount] = useState("");
  const [amountOpen, setAmountOpen] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState("");
  const [confidence, setConfidence] = useState<DealConfidence | "">("");
  const [sponsorLevel, setSponsorLevel] = useState("");
  const [createMore, setCreateMore] = useState(false);
  const disabled = busy || submitting;
  const grant = kind === "grant";
  const kindLabel = grant ? "grant" : "deal";
  const company =
    newCompany ||
    data.organizations.find((organization) => organization.id === companyId)
      ?.name ||
    companyName;
  const searchName = search.trim();
  const canCreateCompany =
    searchName.length > 0 &&
    !data.organizations.some(
      (organization) =>
        organization.name.trim().toLowerCase() === searchName.toLowerCase(),
    );
  const labelForStage = (value: DealStage) =>
    grant && value === "won" ? "Approved" : stageLabels[value];
  const amountLabel = grant && valueChipLabel(amount) === "Value" ? "Grant value" : valueChipLabel(amount);

  useEffect(() => {
    if (pendingFocus.current && !disabled) {
      pendingFocus.current = false;
      titleInput.current?.focus();
    }
  }, [disabled]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving.current || disabled) return;
    try {
      if (!title.trim()) throw new Error(`Enter a ${kindLabel} name.`);
      if (!companyId && !newCompany)
        throw new Error("Choose or add a company.");
      const parsed = parseNokToOre(amount);
      if (amount.trim() && (parsed === null || parsed <= 0n))
        throw new Error("Enter a positive value, or leave it empty.");
      if (parsed !== null && !seasonId)
        throw new Error("Choose a season for the contribution.");
      if (!grant && stage === "won" && parsed !== null && !invoiceDate)
        throw new Error(
          "Set the invoice date before confirming this deal as won.",
        );
      saving.current = true;
      setSubmitting(true);
      let organizationId = companyId;
      if (newCompany) {
        const created = await onCreatePartner(newCompany);
        if (!created) return;
        organizationId = created;
        setCompanyId(created);
        setCompanyName(newCompany);
        setNewCompany("");
      }
      const keepOpen = createMore && stage !== "won";
      const saved = await onSave(
        withTierDeliverables(
          {
            opportunityKind: kind,
            organizationId,
            title: title.trim(),
            stage: stage === "won" ? "proposal" : stage,
            seasonId: seasonId || null,
            ownerMemberId: ownerId || null,
            sponsorLevel: grant ? null : sponsorLevel || null,
            probability: confidence ? confidenceValues[confidence] : null,
            contactName: "",
            contactEmail: "",
            startsOn: null,
            endsOn: null,
            agreementLink: "",
            negotiationNotes: grant ? "" : notes.trim(),
            contributions:
              parsed === null
                ? []
                : [
                    {
                      seasonId,
                      kind: "cash",
                      description: "",
                      amountOre: parsed.toString(),
                      invoiceDate: grant ? null : invoiceDate || null,
                    },
                  ],
            deliverables: [],
            partnerNotes: "",
          },
          data,
        ),
        stage,
        keepOpen,
        company || "",
      );
      if (saved && keepOpen) {
        pendingFocus.current = true;
        setTitle("");
        setNotes("");
        setAmount("");
        setInvoiceDate("");
      }
    } catch (error) {
      onInvalid(
        error instanceof Error
          ? error.message
          : "Check the opportunity details.",
      );
    } finally {
      saving.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !disabled) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90svh] gap-0 overflow-y-auto rounded-2xl bg-card p-0 sm:max-w-3xl"
        showCloseButton={!disabled}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleInput.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onReturnFocus();
        }}
      >
        <DialogHeader className="px-6 pb-2 pt-5 pr-16">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium tracking-wide text-muted-foreground">
              HELIX
            </span>
            <span aria-hidden="true" className="text-muted-foreground">
              /
            </span>
            <DialogTitle className="text-sm font-normal">
              New {kindLabel}
            </DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            Add a {kindLabel} to {labelForStage(stage)}. Enter a name and
            company. Other properties are optional.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} noValidate>
          <fieldset disabled={disabled}>
            <div className="space-y-2 px-6 pb-2 pt-4">
              <Label htmlFor="new-opportunity-title" className="sr-only">
                {grant ? "Grant name" : "Deal name"}
              </Label>
              <Textarea
                ref={titleInput}
                id="new-opportunity-title"
                required
                maxLength={200}
                rows={1}
                placeholder={grant ? "Grant name" : "Deal name"}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="min-h-9 resize-none border-0 bg-transparent p-0 text-xl font-medium shadow-none focus-visible:ring-0 md:text-xl dark:bg-transparent"
              />
              {!grant && <><Label htmlFor="new-opportunity-notes" className="sr-only">
                Negotiation notes
              </Label>
              <Textarea
                id="new-opportunity-notes"
                rows={3}
                maxLength={2000}
                placeholder="Add notes…"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="min-h-24 resize-y border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
              /></>}
            </div>
            <div className="flex flex-wrap items-center gap-2 px-6 py-3">
              <PropertyChoice
                label="Stage"
                value={stage}
                options={stages.map((value) => ({
                  value,
                  label: labelForStage(value),
                }))}
                onChange={(value) => setStage(value as DealStage)}
              />
              <Popover
                open={companyOpen}
                onOpenChange={(open) => {
                  setCompanyOpen(open);
                  if (open) setSearch("");
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label="Company"
                    className={chipClass}
                    title={company || "Company (required)"}
                  >
                    <span className="truncate">{company || "Company"}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-80 p-0"
                  aria-label="Choose a company"
                >
                  <Command label="Company">
                    <CommandInput
                      aria-label="Search or add a company"
                      placeholder="Search or add a company…"
                      maxLength={200}
                      value={search}
                      onValueChange={setSearch}
                    />
                    <CommandList>
                      <CommandEmpty>No companies found.</CommandEmpty>
                      <CommandGroup>
                        {data.organizations.map((organization) => (
                          <CommandItem
                            key={organization.id}
                            value={organization.id}
                            keywords={[organization.name]}
                            onSelect={() => {
                              setCompanyId(organization.id);
                              setCompanyName(organization.name);
                              setNewCompany("");
                              setCompanyOpen(false);
                            }}
                          >
                            {organization.name}
                          </CommandItem>
                        ))}
                        {canCreateCompany && (
                          <CommandItem
                            value="__new_company__"
                            keywords={[searchName]}
                            onSelect={() => {
                              setNewCompany(searchName);
                              setCompanyId("");
                              setCompanyOpen(false);
                            }}
                          >
                            Create company "{searchName}"
                          </CommandItem>
                        )}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <SearchableSelect
                label="Helix owner"
                value={ownerId}
                options={[
                  { value: "", label: "Unassigned" },
                  ...members.map((member) => ({
                    value: member.id,
                    label: member.name,
                  })),
                ]}
                onChange={setOwnerId}
                placeholder="Assignee"
                triggerText={ownerId ? undefined : "Assignee"}
                searchPlaceholder="Find someone…"
                className={`${chipClass} [&_svg]:hidden`}
              />
              <PropertyChoice
                label="Deal season"
                value={seasonId || "__none__"}
                options={[
                  { value: "__none__", label: "Season" },
                  ...data.seasons.map((season) => ({
                    value: season.id,
                    label: season.code,
                  })),
                ]}
                onChange={(value) =>
                  setSeasonId(value === "__none__" ? "" : value)
                }
              />
              <Popover open={amountOpen} onOpenChange={setAmountOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={grant ? "Grant value" : "Deal value"}
                    className={chipClass}
                  >
                    {amountLabel}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 space-y-3">
                  <Label htmlFor={`${id}-amount`}>
                    {grant ? "Grant value (NOK)" : "Deal value (NOK)"}
                  </Label>
                  <Input
                    id={`${id}-amount`}
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0.00"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        setAmountOpen(false);
                      }
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional cash contribution
                    {seasonId
                      ? ` for ${data.seasons.find((season) => season.id === seasonId)?.code}`
                      : ""}
                    .
                  </p>
                </PopoverContent>
              </Popover>
              {!grant && stage === "won" && amount.trim() && (
                <DatePicker
                  label="Invoice date"
                  value={invoiceDate || null}
                  onChange={(date) => setInvoiceDate(date ?? "")}
                  placeholder="Invoice date"
                  className={chipClass}
                />
              )}
              <PropertyChoice
                label="Confidence"
                value={confidence || "__none__"}
                color={confidencePillColor(
                  confidence ? confidenceValues[confidence] : null,
                )}
                options={[
                  { value: "__none__", label: "Confidence" },
                  ...dealConfidences.map((value) => ({
                    value,
                    label: confidenceLabels[value],
                  })),
                ]}
                onChange={(value) =>
                  setConfidence(
                    value === "__none__" ? "" : (value as DealConfidence),
                  )
                }
              />
              {!grant && (
                <PropertyChoice
                  label="Sponsor level"
                  value={sponsorLevel || "__none__"}
                  color={sponsorPillColor(sponsorLevel)}
                  options={[
                    { value: "__none__", label: "Sponsor level" },
                    ...sponsorLevels.map((value) => ({
                      value,
                      label: sponsorLevelLabels[value],
                    })),
                  ]}
                  onChange={(value) =>
                    setSponsorLevel(value === "__none__" ? "" : value)
                  }
                />
              )}
            </div>
            <div className="flex items-center justify-end gap-4 px-6 pb-5 pt-3">
              {stage !== "won" && (
                <div className="flex items-center gap-2">
                  <Switch
                    id={`${id}-create-more`}
                    checked={createMore}
                    onCheckedChange={setCreateMore}
                  />
                  <Label
                    htmlFor={`${id}-create-more`}
                    className="text-xs font-normal text-muted-foreground"
                  >
                    Create more
                  </Label>
                </div>
              )}
              <Button
                ref={submitRef}
                type="submit"
                className="rounded-full"
                disabled={
                  disabled || !title.trim() || (!companyId && !newCompany)
                }
              >
                {stage === "won"
                  ? grant
                    ? "Review as approved"
                    : "Review as won"
                  : `Create ${kindLabel}`}
              </Button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
