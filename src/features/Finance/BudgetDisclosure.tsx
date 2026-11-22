import { useState, type ReactNode } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@libs/components/ui/collapsible";

/** Keep child forms mounted so closing a section cannot discard an upload or edit. */
export function BudgetDisclosure({ label, children, compact, locked = false }: {
  label: string;
  children: ReactNode;
  compact: boolean;
  locked?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!compact) return <>{children}</>;
  return <Collapsible open={open} onOpenChange={setOpen} className="min-w-0 border-t">
    <CollapsibleTrigger asChild>
      <Button variant="ghost" disabled={locked} className="group h-auto w-full justify-between gap-3 rounded-none px-0 py-3 text-left text-sm font-medium hover:bg-transparent">
        {label}<IconChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </Button>
    </CollapsibleTrigger>
    <CollapsibleContent forceMount hidden={!open} className="min-w-0 pb-4">{children}</CollapsibleContent>
  </Collapsible>;
}
