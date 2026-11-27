import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@libs/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@libs/components/ui/dialog";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { useFinanceAccess } from "../MemberPlatform/FinanceAccess";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { INCOME_CATEGORIES, INCOME_METHODS, INCOME_REFERENCE_MAX, INCOME_SOURCE_MAX, parseIncomeChange, similarIncomeField, type IncomeInput } from "./income-receipts";
import { osloToday } from "./money";
import { FinanceRequestError } from "./repository";
import type { FinanceFieldError } from "./types";

const sourceExamples: Record<IncomeInput["category"], string> = {
  "": "e.g. member name, buyer, or sale event",
  membership_dues: "e.g. member name or S27 dues batch",
  sales: "e.g. welcome event merch or equipment sale",
  donations: "e.g. an alumnus or supporter",
  other_income: "e.g. name of the payer or event",
};

function startingFields(today: string): IncomeInput {
  return { category: "", source: "", amountNok: "", receivedOn: today, method: "", reference: "" };
}

export function RegisterIncomeDialog({ seasonCode }: { seasonCode: string }) {
  const session = useFinanceAccess();
  const notify = useNotify();
  const id = useId();
  const today = session.today ?? osloToday();
  const [open, setOpen] = useState(false);
  const [formSeason, setFormSeason] = useState(seasonCode);
  const [fields, setFields] = useState(() => startingFields(today));
  const [errors, setErrors] = useState<FinanceFieldError[]>([]);
  const [similar, setSimilar] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);

  const setFormDirty = session.setFormDirty;
  useEffect(() => {
    setFormDirty?.(id, open && dirty);
    return () => setFormDirty?.(id, false);
  }, [dirty, id, open, setFormDirty]);

  function change<K extends keyof IncomeInput>(field: K, value: IncomeInput[K]) {
    setFields(current => ({ ...current, [field]: value }));
    setDirty(true);
    setSimilar(false);
    setErrors(current => current.filter(error => error.field !== field));
  }

  function changeOpen(next: boolean) {
    if (inFlight.current) return;
    if (next) {
      setFormSeason(seasonCode);
      setFields(startingFields(today));
      setErrors([]);
      setDirty(false);
      setSimilar(false);
      request.current = null;
    }
    setOpen(next);
  }

  function fieldError(field: keyof IncomeInput) {
    const message = errors.find(error => error.field === field)?.message;
    return message && <p id={`${id}-${field}-error`} className="text-xs text-destructive">{message}</p>;
  }

  function fieldProps(field: keyof IncomeInput) {
    const invalid = errors.some(error => error.field === field);
    return {
      id: `${id}-${field}`,
      "aria-invalid": invalid || undefined,
      "aria-describedby": invalid ? `${id}-${field}-error` : undefined,
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const body = { action: "registerIncome", seasonCode: formSeason, ...fields };
    const parsed = parseIncomeChange(body, today);
    if (!parsed.change) {
      setErrors(parsed.errors);
      document.getElementById(`${id}-${parsed.errors[0].field}`)?.focus();
      return;
    }

    const fingerprint = JSON.stringify(parsed.change);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    inFlight.current = true;
    setSaving(true);
    try {
      await session.mutate({ ...body, requestId: request.current.id, [similarIncomeField]: similar });
      setOpen(false);
      notify("Income registered", `The payment was added to ${formSeason} received income.`, { variant: "success", href: null });
    } catch (error) {
      if (error instanceof FinanceRequestError && error.errors.some(issue => issue.field === similarIncomeField)) {
        setSimilar(true);
        notify("Possible duplicate payment", error.message, {
          variant: "warning", href: null,
          action: { label: "Review entry", onClick: () => document.getElementById(`${id}-source`)?.focus() },
        });
        return;
      }
      if (error instanceof FinanceRequestError && error.errors.length) {
        setErrors(error.errors);
        requestAnimationFrame(() => document.getElementById(`${id}-${error.errors[0].field}`)?.focus());
      }
      notify("Could not register income", error instanceof Error ? error.message : "Try again.", { variant: "error", href: null });
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><Button type="button" size="sm">Register income</Button></DialogTrigger>
    <DialogContent
      className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg"
      showCloseButton={!saving}
      onEscapeKeyDown={event => { if (inFlight.current) event.preventDefault(); }}
      onInteractOutside={event => event.preventDefault()}
    >
      <DialogHeader className="pr-8">
        <DialogTitle>Register income</DialogTitle>
        <DialogDescription>Record a payment received for {formSeason}.</DialogDescription>
      </DialogHeader>
      <form className="space-y-5" noValidate onSubmit={event => { void submit(event); }}>
        <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${id}-category`}>Income type</Label>
            <Select value={fields.category} onValueChange={value => change("category", value as IncomeInput["category"])} disabled={saving} required>
              <SelectTrigger {...fieldProps("category")} className="w-full"><SelectValue placeholder="Choose a type" /></SelectTrigger>
              <SelectContent>{Object.entries(INCOME_CATEGORIES).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
            {fieldError("category")}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${id}-source`}>Source</Label>
            <Input {...fieldProps("source")} value={fields.source} onChange={event => change("source", event.target.value)} placeholder={sourceExamples[fields.category]} maxLength={INCOME_SOURCE_MAX} required />
            {fieldError("source")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-amountNok`}>Amount (NOK)</Label>
            <Input {...fieldProps("amountNok")} value={fields.amountNok} onChange={event => change("amountNok", event.target.value)} inputMode="decimal" placeholder="0.00" maxLength={30} required />
            {fieldError("amountNok")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-receivedOn`}>Date received</Label>
            <Input {...fieldProps("receivedOn")} type="date" value={fields.receivedOn} onChange={event => change("receivedOn", event.target.value)} max={today} required />
            {fieldError("receivedOn")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-method`}>Payment method</Label>
            <Select value={fields.method} onValueChange={value => change("method", value as IncomeInput["method"])} disabled={saving} required>
              <SelectTrigger {...fieldProps("method")} className="w-full"><SelectValue placeholder="Choose a method" /></SelectTrigger>
              <SelectContent>{Object.entries(INCOME_METHODS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
            {fieldError("method")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-reference`}>Transaction ID <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input {...fieldProps("reference")} value={fields.reference} onChange={event => change("reference", event.target.value)} maxLength={INCOME_REFERENCE_MAX} />
            {fieldError("reference")}
          </div>
        </fieldset>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => changeOpen(false)}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Registering…" : similar ? "Register anyway" : "Register income"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
