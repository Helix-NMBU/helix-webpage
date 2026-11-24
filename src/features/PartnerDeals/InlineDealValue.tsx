import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconCheck, IconX } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import { DatePicker } from "@libs/components/ui/date-picker";
import { Input } from "@libs/components/ui/input";
import { Textarea } from "@libs/components/ui/textarea";
import { cn } from "@libs/lib/utils";
import type { Deal } from "./types";

type Props = {
  label: string;
  value: string;
  deal: Deal;
  busy: boolean;
  onSave: (value: string, source: Deal) => Promise<boolean>;
  onWonEdit: () => void;
  onInvalid: (message: string) => void;
  placeholder?: string;
  displayValue?: string;
  type?: "text" | "email" | "url" | "date";
  multiline?: boolean;
  required?: boolean;
  maxLength?: number;
  inputMode?: "decimal";
  className?: string;
  triggerContent?: ReactNode;
  triggerLabel?: string;
  autoSave?: boolean;
};

// Each editor keeps the revision it opened on. A refresh cannot silently replace
// the source of an unsaved field edit.
export function InlineDealValue({
  label,
  value,
  deal,
  busy,
  onSave,
  onWonEdit,
  onInvalid,
  placeholder = "Not specified",
  displayValue,
  type = "text",
  multiline = false,
  required = false,
  maxLength,
  inputMode,
  className,
  triggerContent,
  triggerLabel,
  autoSave = false,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [source, setSource] = useState(deal);
  const [saving, setSaving] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const savingRef = useRef(false);
  const disabled = busy || saving;
  useEffect(() => {
    if (returnFocus.current && !editing && !disabled) {
      returnFocus.current = false;
      trigger.current?.focus();
    }
  }, [editing, disabled]);
  function close() {
    if (!autoSave) returnFocus.current = true;
    setEditing(false);
  }
  async function save() {
    if (disabled || savingRef.current) return;
    const next = draft.trim();
    if (required && !next) {
      onInvalid(`Enter ${label.toLowerCase()}.`);
      return;
    }
    if (next && type === "url" && !/^https?:\/\//i.test(next)) {
      onInvalid("Enter a link starting with https:// or http://.");
      return;
    }
    if (next && type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      onInvalid("Enter a valid email address.");
      return;
    }
    if (next === value) {
      close();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      if (await onSave(next, source)) close();
    } catch (error) {
      onInvalid(error instanceof Error ? error.message : "Please try again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  if (type === "date")
    return (
      <DatePicker
        label={label}
        value={value || null}
        placeholder={placeholder}
        disabled={busy}
        className={className}
        onOpen={() => setSource(deal)}
        onError={(error) =>
          onInvalid(
            error instanceof Error ? error.message : "Please try again.",
          )
        }
        onChange={(next) => {
          if (deal.stage === "won") {
            onWonEdit();
            return Promise.resolve(false);
          }
          return onSave(next ?? "", source);
        }}
      />
    );
  if (autoSave)
    return (
      <Input
        aria-label={label}
        data-inline-deal-editor={editing ? "" : undefined}
        type={type}
        maxLength={maxLength}
        disabled={disabled}
        readOnly={deal.stage === "won"}
        value={editing ? draft : value}
        placeholder={placeholder}
        className={cn(
          "h-8 border-transparent bg-transparent px-1 shadow-none hover:border-input focus-visible:border-input",
          className,
        )}
        onFocus={() => {
          if (!editing) {
            setSource(deal);
            setDraft(value);
          }
        }}
        onChange={(event) => {
          if (!editing) setSource(deal);
          setDraft(event.target.value);
          setEditing(true);
        }}
        onBlur={() => {
          if (editing) void save();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void save();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  if (!editing)
    return (
      <button
        ref={trigger}
        type="button"
        disabled={busy}
        aria-label={triggerLabel ?? `Edit ${label} for ${deal.title}`}
        className={cn(
          "block min-h-6 min-w-0 max-w-full rounded px-1 py-0.5 text-left break-words whitespace-pre-wrap outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring",
          !value && "text-muted-foreground",
          className,
        )}
        onClick={() => {
          if (deal.stage === "won") {
            onWonEdit();
            return;
          }
          setSource(deal);
          setDraft(value);
          setEditing(true);
        }}
      >
        {triggerContent ?? displayValue ?? (value || placeholder)}
      </button>
    );
  const controlProps = {
    autoFocus: true,
    "aria-label": label,
    value: draft,
    disabled,
    maxLength,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setDraft(event.target.value),
  };
  return (
    <form
      data-inline-deal-editor=""
      noValidate
      className={cn("min-w-0 space-y-2", className)}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
        if (
          multiline &&
          event.key === "Enter" &&
          (event.metaKey || event.ctrlKey)
        ) {
          event.preventDefault();
          void save();
        }
      }}
    >
      {multiline ? (
        <Textarea
          {...controlProps}
          rows={3}
          className="min-h-20 resize-y text-sm"
        />
      ) : (
        <Input
          {...controlProps}
          type={type}
          required={required}
          inputMode={inputMode}
          className="h-8 text-sm"
        />
      )}
      <div className="flex justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={disabled}
          aria-label={`Cancel ${label}`}
          onClick={close}
        >
          <IconX aria-hidden="true" />
        </Button>
        <Button
          type="submit"
          variant="outline"
          size="icon-xs"
          disabled={disabled}
          aria-label={`Save ${label}`}
        >
          <IconCheck aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}
