import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@libs/components/ui/button";
import { Label } from "@libs/components/ui/label";
import { Textarea } from "@libs/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@libs/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@libs/components/ui/dialog";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import {
  createFundingApplicationRepository,
  type FundingApplicationRepository,
} from "../Finance/funding-application-repository";
import { useFundingApplicationWrite } from "../Finance/useFundingApplicationWrite";
import type { FundingApplicationCard as Application } from "../Finance/funding-application-types";
import type { Deal, Season } from "./types";
export function FundingApplicationCard({
  deal,
  seasons,
  onChanged,
  repository: provided,
}: {
  deal: Deal;
  seasons: Season[];
  onChanged: () => Promise<void>;
  repository?: FundingApplicationRepository;
}) {
  const repository = useMemo(
    () => provided ?? createFundingApplicationRepository(),
    [provided],
  );
  const [open, setOpen] = useState(false),
    [application, setApplication] = useState<Application | null>(null),
    [loading, setLoading] = useState(false),
    [season, setSeason] = useState(
      deal.seasonId ??
        seasons.find((item) => item.status === "active")?.id ??
        "",
    ),
    [conditions, setConditions] = useState("");
  const generation = useRef(0),
    opener = useRef<HTMLButtonElement>(null),
    pendingFocus = useRef(false);
  const notify = useNotify();
  async function refresh(preserve = false) {
    const request = ++generation.current;
    setLoading(true);
    try {
      const next = await repository.card(deal.id);
      if (request !== generation.current) return;
      setApplication(next.application);
      if (next.application && !preserve) {
        setSeason(next.application.seasonId);
        setConditions(next.application.purchaseConditions);
      }
    } catch (error) {
      if (request === generation.current) {
        setOpen(false);
        notify(
          "Could not load funding application",
          error instanceof Error ? error.message : "Please try again.",
          { variant: "error", href: null },
        );
      }
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }
  const { busy, save } = useFundingApplicationWrite(
    repository,
    async () => {
      await onChanged();
      await refresh(true);
    },
    () => {
      generation.current++;
      setOpen(false);
      setApplication(null);
      setConditions("");
    },
  );
  useEffect(
    () => () => {
      generation.current++;
    },
    [repository, deal.id],
  );
  useEffect(() => {
    if (!open && !busy && pendingFocus.current) {
      pendingFocus.current = false;
      opener.current?.focus();
    }
  }, [open, busy]);
  return (
    <>
      <Button
        ref={opener}
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => {
          setOpen(true);
          void refresh();
        }}
      >
        Funding application
      </Button>
      {open && (
        <Dialog
          open
          onOpenChange={(value) => {
            if (!value && !busy) {
              generation.current++;
              setOpen(false);
            }
          }}
        >
          <DialogContent
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (busy) pendingFocus.current = true;
              else opener.current?.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle>Funding application</DialogTitle>
              <DialogDescription>
                Share this card's purchase conditions with Head of Finance.
                Recording an award is a separate Finance action.
              </DialogDescription>
            </DialogHeader>
            {loading ? (
              <p>Loading application…</p>
            ) : (
              <form
                className="space-y-4"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!season || !conditions.trim()) {
                    notify(
                      "Check the application",
                      "Choose a season and describe the purchase conditions.",
                      { variant: "error", href: null },
                    );
                    return;
                  }
                  void save({
                    action: "saveFundingApplication",
                    requestId: crypto.randomUUID(),
                    dealId: deal.id,
                    dealExpectedRevision: deal.revision,
                    expectedRevision: application?.revision ?? 0,
                    seasonId: season,
                    purchaseConditions: conditions,
                    fundingId: application?.fundingId ?? null,
                  }).then(async (result) => {
                    if (result) {
                      setOpen(false);
                      await onChanged();
                    }
                  });
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="application-season">Season</Label>
                  <Select
                    value={season}
                    disabled={busy || !!application?.award}
                    onValueChange={setSeason}
                  >
                    <SelectTrigger id="application-season">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {seasons.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="application-conditions">
                    Purchase conditions
                  </Label>
                  <Textarea
                    id="application-conditions"
                    rows={5}
                    maxLength={5000}
                    disabled={busy || !!application?.award}
                    value={conditions}
                    onChange={(event) => setConditions(event.target.value)}
                  />
                </div>
                {application?.award && (
                  <p className="text-sm text-muted-foreground">
                    Award recorded {application.award.date} ·{" "}
                    {application.award.reference}
                  </p>
                )}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button disabled={busy || !!application?.award}>
                    Save application
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
