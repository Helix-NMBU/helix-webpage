import type { ReactNode } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@libs/components/ui/collapsible";

export function PropertyWidget({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <Collapsible defaultOpen className="rounded-xl border bg-card">
    <div className="flex items-center justify-between gap-2 px-4 py-3">
      <CollapsibleTrigger className="group flex items-center gap-1.5 text-sm font-medium text-muted-foreground" aria-label={`Toggle ${title}`}>
        {title}<IconChevronDown aria-hidden="true" className="size-3 transition-transform group-data-[state=closed]:-rotate-90" />
      </CollapsibleTrigger>
      {action}
    </div>
    <CollapsibleContent className="px-4 pb-4">{children}</CollapsibleContent>
  </Collapsible>;
}
