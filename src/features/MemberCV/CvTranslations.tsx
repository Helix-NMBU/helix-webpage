import { createContext, useContext, useId, type ReactNode } from "react";
import { Button } from "@libs/components/ui/button";
import { Label } from "@libs/components/ui/label";
import { Textarea } from "@libs/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@libs/components/ui/popover";
import type { CvData, CvTranslations } from "./types";

const TranslationsContext = createContext<{ draft: CvData; disabled: boolean; onChange: (value: CvTranslations) => void } | null>(null);
export function CvTranslationsProvider({ draft, disabled, onChange, children }: {
  draft: CvData; disabled: boolean; onChange: (value: CvTranslations) => void; children: ReactNode;
}) {
  return <TranslationsContext.Provider value={{ draft, disabled, onChange }}>{children}</TranslationsContext.Provider>;
}

export function FieldTranslations({ path, label, value, maxLength = 500 }: { path?: string; label: string; value: string; maxLength?: number }) {
  const context = useContext(TranslationsContext);
  const id = useId();
  if (!context || !path) return null;
  const source = context.draft.cvLanguage ?? "en";
  const target = source === "en" ? "nb" : "en";
  const sourceName = source === "en" ? "English" : "Norwegian";
  const targetName = target === "en" ? "English" : "Norwegian";
  const translated = context.draft.translations?.[target]?.[path] ?? "";
  return <Popover>
    <PopoverTrigger asChild><Button type="button" variant="ghost" size="sm" disabled={context.disabled} className="cv-translations-trigger" aria-label={`Translations for ${label}`}>Translations</Button></PopoverTrigger>
    <PopoverContent className="mcv-profile-menu w-80 space-y-3 p-4" align="end">
      <p className="text-sm font-medium">{label}</p>
      <div className="space-y-1"><p className="text-xs text-muted-foreground">Original · {sourceName}</p><p className="whitespace-pre-wrap break-words text-sm">{value || "No text entered"}</p></div>
      <div className="grid gap-2">
        <Label htmlFor={id}>{targetName}</Label>
        <Textarea id={id} value={translated} maxLength={maxLength} disabled={context.disabled} rows={4}
          onChange={(event) => context.onChange({ ...context.draft.translations, [target]: { ...context.draft.translations?.[target], [path]: event.target.value } })} />
      </div>
      <p className="text-xs text-muted-foreground">If left blank, the original text is used.</p>
    </PopoverContent>
  </Popover>;
}
