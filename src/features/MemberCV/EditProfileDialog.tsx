import { useId, useState, type FormEvent } from "react";
import { Button } from "@libs/components/ui/button";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Alert, AlertDescription } from "@libs/components/ui/alert";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@libs/components/ui/dialog";
import type { CvData } from "./types";

export type ProfileDetails = Pick<CvData, "fullName" | "phone" | "fieldOfStudy" | "graduationYear">;

export function EditProfileDialog({ draft, disabled, saveError, onSave }: {
  draft: CvData;
  disabled: boolean;
  saveError: string | null;
  onSave: (details: ProfileDetails) => Promise<boolean>;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<ProfileDetails>({ fullName: draft.fullName, phone: draft.phone, fieldOfStudy: draft.fieldOfStudy, graduationYear: draft.graduationYear });
  const [pending, setPending] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  function changeOpen(next: boolean) {
    if (pending) return;
    if (next) {
      setValues({ fullName: draft.fullName, phone: draft.phone, fieldOfStudy: draft.fieldOfStudy, graduationYear: draft.graduationYear });
      setValidation(null);
      setFailed(false);
    }
    setOpen(next);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || disabled) return;
    const details = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()])) as ProfileDetails;
    if (!details.fullName) { setValidation("Enter your name."); return; }
    if (details.graduationYear && !/^(19|20|21)\d{2}$/.test(details.graduationYear)) {
      setValidation("Enter a four-digit graduation year."); return;
    }
    setValidation(null);
    setFailed(false);
    setPending(true);
    try {
      if (await onSave(details)) setOpen(false);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }
  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><Button variant="outline" size="sm" disabled={disabled}>Edit</Button></DialogTrigger>
    <DialogContent className="sm:max-w-lg" showCloseButton={!pending}>
      <DialogHeader>
        <DialogTitle>Edit profile</DialogTitle>
        <DialogDescription>Update your personal details.</DialogDescription>
      </DialogHeader>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <fieldset disabled={pending || disabled} className="grid gap-4">
          {([
            ["fullName", "Name", "text", 500, "name"],
            ["phone", "Phone number", "tel", 100, "tel"],
            ["fieldOfStudy", "Field of study", "text", 500, "off"],
            ["graduationYear", "Graduation year", "text", 4, "off"],
          ] as const).map(([key, label, type, maxLength, autoComplete]) => <div key={key} className="grid gap-2">
            <Label htmlFor={`${id}-${key}`}>{label}</Label>
            <Input id={`${id}-${key}`} type={type} autoComplete={autoComplete} maxLength={maxLength}
              inputMode={key === "graduationYear" ? "numeric" : undefined}
              value={values[key]} onChange={(event) => setValues((previous) => ({ ...previous, [key]: event.target.value }))} />
          </div>)}
        </fieldset>
        {(validation || failed) && <Alert variant="destructive" className="mt-4" role="alert">
          <AlertDescription>{validation || saveError || "Could not save your profile. Please try again."}</AlertDescription>
        </Alert>}
        <DialogFooter className="mt-6">
          <DialogClose asChild><Button type="button" variant="outline" disabled={pending}>Cancel</Button></DialogClose>
          <Button type="submit" disabled={pending || disabled}>{pending ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
