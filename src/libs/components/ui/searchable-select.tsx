import { useId, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "./button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { cn } from "@libs/lib/utils";

export type SearchableOption = { value: string; label: string; keywords?: string[]; detail?: string };

// shadcn's Popover + Command combobox composition, shared by profile selectors.
export function SearchableSelect({ id, label, value, options, onChange, placeholder, searchPlaceholder, disabled, triggerText, className }: {
  id?: string;
  label: string;
  value: string;
  options: SearchableOption[];
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  disabled?: boolean;
  triggerText?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const popupId = useId();
  const selected = options.find((option) => option.value === value);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button id={id} type="button" variant="outline" role="combobox" aria-label={label}
        aria-expanded={open} aria-controls={open ? popupId : undefined} aria-haspopup="dialog"
        disabled={disabled} className={cn("h-auto min-h-9 w-full min-w-0 justify-between font-normal", className)}>
        <span className={cn("min-w-0 text-left whitespace-normal", !selected && "text-muted-foreground")}>{triggerText ?? selected?.label ?? placeholder}</span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    <PopoverContent id={popupId} aria-label={`${label} options`} className="w-[var(--radix-popover-trigger-width)] min-w-64 max-w-[calc(100vw-2rem)] p-0" align="start">
      <Command label={label}>
        <CommandInput placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
        <CommandList className="max-h-64 overscroll-contain">
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup>
            {options.map((option) => <CommandItem key={option.value} value={option.value || "__not_set__"}
              keywords={[option.label, ...(option.keywords ?? []), option.detail ?? ""]}
              onSelect={() => { onChange(option.value); setOpen(false); }}>
              <Check className={cn("size-4 shrink-0", value === option.value ? "opacity-100" : "opacity-0")} aria-hidden="true" />
              <span className="min-w-0 flex-1 whitespace-normal">{option.label}</span>
              {option.detail && <span className="shrink-0 text-muted-foreground">{option.detail}</span>}
            </CommandItem>)}
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}
