import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Button } from "@libs/components/ui/button";
import { Toaster } from "@libs/components/ui/sonner";
import { useNotify } from "@/features/MemberPlatform/MemberNotifications";

function reloadPage() {
  window.location.reload();
}

export function DeferredPage({ load, fallback, renderToaster = false }: {
  load: () => Promise<{ default: ComponentType }>;
  fallback: ReactNode;
  renderToaster?: boolean;
}) {
  const [page, setPage] = useState<ComponentType | "failed" | null>(null);
  const notify = useNotify();

  // Render the entry as soon as its code arrives without a Suspense retry.
  useEffect(() => {
    let active = true;
    void load().then(
      ({ default: Component }) => { if (active) setPage(() => Component); },
      () => { if (active) setPage("failed"); },
    );
    return () => { active = false; };
  }, [load]);

  useEffect(() => {
    if (page !== "failed") return;
    notify("Could not load this page", "Reload the page to try again.", {
      id: "app-entry", variant: "error", href: null,
      action: { label: "Reload page", onClick: reloadPage },
    });
  }, [page, notify]);

  if (page === "failed") {
    return (
      <div className={renderToaster ? "grid min-h-screen place-items-center" : "p-6"}>
        <Button variant="outline" onClick={reloadPage}>Reload page</Button>
        {renderToaster && <Toaster theme="system" position="top-right" closeButton />}
      </div>
    );
  }
  const Page = page;
  return Page ? <Page /> : fallback;
}
