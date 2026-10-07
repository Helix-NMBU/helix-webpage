import { useId, useState } from "react";
import { Button } from "@libs/components/ui/button";
import { Label } from "@libs/components/ui/label";
import { Textarea } from "@libs/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@libs/components/ui/collapsible";
import { memberText, type MemberLocale } from "./locale";

export function OptionalReferencesInput({ value, onChange, locale, disabled }: {
  value: string; onChange: (value: string) => void; locale: MemberLocale; disabled: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(Boolean(value));
  return <Collapsible className="mcv-optional-grade" open={open} onOpenChange={setOpen}>
    <CollapsibleTrigger asChild><Button variant="ghost" type="button" disabled={disabled}>
      {memberText(locale, "References (optional)")}
    </Button></CollapsibleTrigger>
    <CollapsibleContent forceMount className="mcv-optional-grade-content">
      <Label htmlFor={id}>{memberText(locale, "References")}</Label>
      <Textarea id={id} value={value} maxLength={2000} rows={3} disabled={disabled}
        placeholder={memberText(locale, "Provided on request")}
        onChange={(event) => onChange(event.target.value)} />
    </CollapsibleContent>
  </Collapsible>;
}
