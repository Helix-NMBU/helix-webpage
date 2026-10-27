import { useId, useState, type FormEvent } from "react";
import { IconPencil } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import { ButtonGroup } from "@libs/components/ui/button-group";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@libs/components/ui/dialog";
import type { CvData } from "./types";
import { SearchableSelect } from "@libs/components/ui/searchable-select";
import { nmbuStudyFields, nmbuStudyFieldLabel } from "./nmbu-study-fields";
import { editProfilePhone, phoneCountries, saveProfilePhone, splitProfilePhone } from "./profile-phone";
import type { CountryCode } from "libphonenumber-js/min";

export type ProfileDetails = Pick<CvData, "phone" | "fieldOfStudy" | "graduationYear">;

export function EditProfileDialog({ draft, disabled, onSave }: {
  draft: CvData;
  disabled: boolean;
  onSave: (details: ProfileDetails) => Promise<boolean>;
}) {
  const id = useId();
  const notify = useNotify();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<ProfileDetails>({ phone: draft.phone, fieldOfStudy: draft.fieldOfStudy, graduationYear: draft.graduationYear });
  const [phone, setPhone] = useState(() => splitProfilePhone(draft.phone));
  const [pending, setPending] = useState(false);
  const [invalidField, setInvalidField] = useState<keyof ProfileDetails | null>(null);
  function changeOpen(next: boolean) {
    if (pending) return;
    if (next) {
      setValues({ phone: draft.phone, fieldOfStudy: draft.fieldOfStudy, graduationYear: draft.graduationYear });
      setPhone(splitProfilePhone(draft.phone));
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
    try { details.phone = saveProfilePhone(phone, values.phone); }
    catch (error) {
      invalid("phone", (error as Error).message);
      return;
    }
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
  const studyValue = nmbuStudyFieldLabel(values.fieldOfStudy);
  const studyOptions = [{ value: "", label: "Not set" }, ...nmbuStudyFields];
  if (studyValue && !studyOptions.some((option) => option.value === studyValue)) {
    // Retain existing member data that predates the catalogue selector.
    studyOptions.unshift({ value: studyValue, label: studyValue });
  }
  const country = phoneCountries.find((option) => option.value === phone.country)!;
  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><Button variant="outline" size="icon" className="mcv-profile-edit size-8 shrink-0" aria-label="Edit profile" title="Edit profile" disabled={disabled}><IconPencil aria-hidden="true" /></Button></DialogTrigger>
    <DialogContent className="sm:max-w-lg" showCloseButton={!pending}>
      <DialogHeader>
        <DialogTitle>Edit profile</DialogTitle>
        <DialogDescription>Update your personal details.</DialogDescription>
      </DialogHeader>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <fieldset disabled={pending || disabled} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={`${id}-phone`}>Phone number</Label>
            <ButtonGroup className="w-full min-w-0" aria-label="Phone number">
              <SearchableSelect label="Phone country" value={phone.country} options={phoneCountries} disabled={pending || disabled}
                triggerText={`${country.value} ${country.detail}`} className="h-9 min-h-9 w-24 shrink-0 gap-1 px-2 [&>span]:whitespace-nowrap"
                placeholder="Country" searchPlaceholder="Search countries..."
                onChange={(value) => setPhone((previous) => ({ ...previous, country: value as CountryCode, changed: true }))} />
              <Input id={`${id}-phone`} type="tel" autoComplete="tel-national" maxLength={100} className="min-w-0"
                aria-invalid={invalidField === "phone" || undefined}
                value={phone.national} onChange={(event) => setPhone((previous) => editProfilePhone(event.target.value, previous))} />
            </ButtonGroup>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-fieldOfStudy`}>Field of study</Label>
            <SearchableSelect id={`${id}-fieldOfStudy`} label="Field of study" value={studyValue} options={studyOptions}
              placeholder="Select field of study" searchPlaceholder="Search fields of study..." disabled={pending || disabled}
              onChange={(value) => setValues((previous) => ({ ...previous, fieldOfStudy: value }))} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-graduationYear`}>Graduation year</Label>
            <Input id={`${id}-graduationYear`} autoComplete="off" inputMode="numeric" maxLength={4} value={values.graduationYear}
              aria-invalid={invalidField === "graduationYear" || undefined}
              onChange={(event) => setValues((previous) => ({ ...previous, graduationYear: event.target.value }))} />
          </div>
        </fieldset>
        <DialogFooter className="mt-6">
          <DialogClose asChild><Button type="button" variant="outline" disabled={pending}>Cancel</Button></DialogClose>
          <Button type="submit" disabled={pending || disabled}>{pending ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
