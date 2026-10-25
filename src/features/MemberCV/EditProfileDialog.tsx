import { useId, useState, type FormEvent } from "react";
import { Button } from "@libs/components/ui/button";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@libs/components/ui/dialog";
import type { CvData } from "./types";

export type ProfileDetails = Pick<CvData, "fullName" | "phone" | "fieldOfStudy" | "graduationYear">;

export function EditProfileDialog({ draft, disabled, onSave }: {
  draft: CvData;
  disabled: boolean;
  onSave: (details: ProfileDetails) => Promise<boolean>;
}) {
  const id = useId();
  const notify = useNotify();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<ProfileDetails>({ fullName: draft.fullName, phone: draft.phone, fieldOfStudy: draft.fieldOfStudy, graduationYear: draft.graduationYear });
  const [pending, setPending] = useState(false);
  const [invalidField, setInvalidField] = useState<keyof ProfileDetails | null>(null);
  function changeOpen(next: boolean) {
    if (pending) return;
    if (next) {
      setValues({ fullName: draft.fullName, phone: draft.phone, fieldOfStudy: draft.fieldOfStudy, graduationYear: draft.graduationYear });
      setInvalidField(null);
    }
    setOpen(next);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || disabled) return;
    const details = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()])) as ProfileDetails;
    function invalid(field: keyof ProfileDetails, message: string) {
      setInvalidField(field);
      document.getElementById(`${id}-${field}`)?.focus();
      notify("Check your profile", message, { id: "profile-validation", variant: "error" });
    }
    if (!details.fullName) { invalid("fullName", "Enter your name."); return; }
    if (details.graduationYear && !/^(19|20|21)\d{2}$/.test(details.graduationYear)) {
      invalid("graduationYear", "Enter a four-digit graduation year."); return;
    }
    setInvalidField(null);
    setPending(true);
    try {
      if (await onSave(details)) setOpen(false);
    } catch {
      notify("Profile could not be saved", "Please try again. Your input has been kept.", { variant: "error" });
    } finally {
      setPending(false);
    }
  }
  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><Button variant="outline" size="sm" className="mcv-profile-edit" disabled={disabled}>Edit</Button></DialogTrigger>
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
              aria-invalid={invalidField === key || undefined}
              value={values[key]} onChange={(event) => setValues((previous) => ({ ...previous, [key]: event.target.value }))} />
          </div>)}
        </fieldset>
        <DialogFooter className="mt-6">
          <DialogClose asChild><Button type="button" variant="outline" disabled={pending}>Cancel</Button></DialogClose>
          <Button type="submit" disabled={pending || disabled}>{pending ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
