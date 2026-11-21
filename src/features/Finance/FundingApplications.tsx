import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@libs/components/ui/button";
import { Badge } from "@libs/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@libs/components/ui/table";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@libs/components/ui/empty";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import {
  createFundingApplicationRepository,
  type FundingApplicationRepository,
} from "./funding-application-repository";
import type {
  FundingApplicationBudgetContext,
  FundingApplicationDetail,
  FundingApplicationQueue,
} from "./funding-application-types";
import {
  FundingApplicationAction,
  type FundingAction,
} from "./FundingApplicationAction";
import { useFundingApplicationWrite } from "./useFundingApplicationWrite";
import { projectBudgetMoney } from "./project-budget-diff";
export const FUNDING_PROPOSAL_LABELS = {
  needs_project_lead: "Needs project lead",
  awaiting_budget_approval: "Awaiting both budget approvals",
  approved: "Budget approved",
};
export function FundingApplications({
  repository: provided,
}: {
  repository?: FundingApplicationRepository;
}) {
  const repository = useMemo(
    () => provided ?? createFundingApplicationRepository(),
    [provided],
  );
  const [params, setParams] = useSearchParams();
  const [queue, setQueue] = useState<FundingApplicationQueue | null>(null),
    [detail, setDetail] = useState<FundingApplicationDetail | null>(null),
    [context, setContext] = useState<FundingApplicationBudgetContext | null>(
      null,
    ),
    [loading, setLoading] = useState(true),
    [denied, setDenied] = useState(false),
    [action, setAction] = useState<FundingAction | null>(null);
  const active = useRef(false),
    generation = useRef(0),
    selected = useRef(params.get("application")),
    dirty = useRef(false),
    saving = useRef(false),
    opener = useRef<HTMLButtonElement | null>(null),
    refreshButton = useRef<HTMLButtonElement | null>(null),
    pendingFocus = useRef(false);
  dirty.current = action !== null;
  const notify = useNotify();
  const clear = useCallback(() => {
    generation.current++;
    setQueue(null);
    setDetail(null);
    setContext(null);
    setAction(null);
    setDenied(true);
    setLoading(false);
  }, []);
  const load = useCallback(
    async (force = false) => {
      if (!active.current || saving.current) return;
      const request = ++generation.current;
      try {
        const next = await repository.queue();
        if (!active.current || request !== generation.current) return;
        if (dirty.current && !force) {
          if (queue?.viewVersion !== next.viewVersion)
            notify(
              "Funding application updated",
              "Your form is kept. Refresh before saving.",
              {
                variant: "warning",
                href: null,
                action: {
                  label: "Refresh",
                  onClick: () => {
                    if (active.current && request === generation.current)
                      void load(true);
                  },
                },
              },
            );
          return;
        }
        setQueue(next);
        setDenied(false);
        if (
          selected.current &&
          !next.applications.some((item) => item.id === selected.current)
        ) {
          selected.current = null;
          setDetail(null);
          setContext(null);
        }
        if (!selected.current && next.applications.length === 1)
          selected.current = next.applications[0].id;
        if (selected.current) {
          const [application, budgetContext] = await Promise.all([
            repository.detail(selected.current),
            repository.context(selected.current),
          ]);
          if (active.current && request === generation.current) {
            setDetail(application);
            setContext(budgetContext);
          }
        }
      } catch (error) {
        if (!active.current || request !== generation.current) return;
        const code =
          error && typeof error === "object" && "status" in error
            ? Number(error.status)
            : 0;
        if (code === 401 || code === 403) clear();
        notify(
          "Could not load funding applications",
          error instanceof Error ? error.message : "Please try again.",
          { variant: "error", href: null },
        );
      } finally {
        if (active.current && request === generation.current) setLoading(false);
      }
    },
    [repository, notify, clear, queue?.viewVersion],
  );
  const loadRef = useRef(load);
  loadRef.current = load;
  const { busy, save } = useFundingApplicationWrite(
    repository,
    () => loadRef.current(true),
    clear,
  );
  saving.current = busy;
  useEffect(() => {
    active.current = true;
    void loadRef.current();
    const refresh = () => void loadRef.current();
    window.addEventListener("focus", refresh);
    const interval = window.setInterval(refresh, 30000);
    return () => {
      active.current = false;
      generation.current++;
      window.removeEventListener("focus", refresh);
      window.clearInterval(interval);
    };
  }, [repository]);
  const restoreFocus = useCallback(() => {
    const target = opener.current?.isConnected
      ? opener.current
      : refreshButton.current;
    if (target?.disabled) {
      pendingFocus.current = true;
      return;
    }
    pendingFocus.current = false;
    target?.focus();
  }, []);
  useEffect(() => {
    if (!busy && !action && pendingFocus.current) restoreFocus();
  }, [busy, action, restoreFocus]);
  function open(mode: FundingAction, button: HTMLButtonElement) {
    opener.current = button;
    setAction(mode);
  }
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-2 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Funding applications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review application purchase conditions, record awards and manage
            mandatory purchases.
          </p>
        </div>
        <Button
          ref={refreshButton}
          variant="outline"
          disabled={busy}
          onClick={() => void load(true)}
        >
          Refresh applications
        </Button>
      </div>
      {loading && !queue ? (
        <p>Loading funding applications…</p>
      ) : !queue || queue.applications.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>
              {denied
                ? "Head of Finance access required"
                : "No funding applications"}
            </EmptyTitle>
            <EmptyDescription>
              {denied
                ? "This limited review is available to Head of Finance."
                : "Applications identified in Pipeline will appear here."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Application</TableHead>
              <TableHead>Season</TableHead>
              <TableHead>Award</TableHead>
              <TableHead>
                <span className="sr-only">Open</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queue.applications.map((item) => (
              <TableRow
                key={item.id}
                data-state={detail?.id === item.id ? "selected" : undefined}
              >
                <TableCell>{item.title}</TableCell>
                <TableCell>{item.seasonCode}</TableCell>
                <TableCell>
                  {item.award ? `Awarded ${item.award.date}` : "Not awarded"}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    disabled={busy || !!action}
                    onClick={() => {
                      selected.current = item.id;
                      setParams((previous) => {
                        const next = new URLSearchParams(previous);
                        next.set("application", item.id);
                        return next;
                      });
                      void load(true);
                    }}
                  >
                    Open {item.title}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {detail && context && (
        <section
          aria-label="Funding application details"
          className="space-y-5 rounded-xl border p-4 sm:p-6"
        >
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h2 className="text-xl font-medium">{detail.title}</h2>
              <p className="text-sm text-muted-foreground">
                {detail.seasonCode}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={busy || context.budgets.length === 0}
                onClick={(event) => open("link", event.currentTarget)}
              >
                Link budget entry
              </Button>
              <Button
                variant="outline"
                disabled={busy || context.budgets.length === 0}
                onClick={(event) => open("propose", event.currentTarget)}
              >
                Propose purchase
              </Button>
              {!detail.award && (
                <Button
                  disabled={busy}
                  onClick={(event) => open("award", event.currentTarget)}
                >
                  Record funding award
                </Button>
              )}
            </div>
          </div>
          <div>
            <h3 className="font-medium">Purchase conditions</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm">
              {detail.purchaseConditions}
            </p>
          </div>
          {detail.award ? (
            <p className="text-sm">
              Awarded {detail.award.date} · {detail.award.reference} · Recorded{" "}
              {new Date(detail.award.recordedAt).toLocaleString("en-GB")}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No award is recorded. Linked entries retain their ordinary budget
              priority.
            </p>
          )}
          <section
            aria-label="Linked purchase obligations"
            className="space-y-3"
          >
            <h3 className="font-medium">Linked purchase obligations</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project and entry</TableHead>
                  <TableHead>Approved plan</TableHead>
                  <TableHead>Obligation</TableHead>
                  <TableHead>Action or release history</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.links.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell className="whitespace-normal">
                      {link.projectName}
                      <span className="block text-sm text-muted-foreground">
                        {link.description}
                      </span>
                    </TableCell>
                    <TableCell>
                      {projectBudgetMoney(link.approvedNok)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {link.mandatory
                          ? "Mandatory P0"
                          : link.release
                            ? "Released"
                            : "Awaiting award"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-sm whitespace-normal">
                      {link.release ? (
                        `${link.release.reason} · ${new Date(link.release.recordedAt).toLocaleString("en-GB")}`
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={(event) =>
                            open({ release: link.id }, event.currentTarget)
                          }
                        >
                          {detail.award ? "Release obligation" : "Remove link"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {detail.links.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No budget entries are linked.
              </p>
            )}
          </section>
          <section aria-label="Proposed budget purchases" className="space-y-3">
            <h3 className="font-medium">Proposed budget purchases</h3>
            <p className="text-sm text-muted-foreground">
              Proposed amounts are separate from the approved plan. Project
              leads adopt changes and submit them for both budget reviews.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entry</TableHead>
                  <TableHead>Proposed plan</TableHead>
                  <TableHead>Budget review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.proposals.map((proposal) => (
                  <TableRow key={proposal.id}>
                    <TableCell className="whitespace-normal">
                      {proposal.desiredEntry.description}
                      {proposal.note && (
                        <span className="block text-sm text-muted-foreground">
                          {proposal.note}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {projectBudgetMoney(proposal.desiredEntry.plannedNok)}
                    </TableCell>
                    <TableCell>
                      {FUNDING_PROPOSAL_LABELS[proposal.approvalStatus]}
                      {proposal.mandatory && " · Awarded obligation"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        </section>
      )}
      {action && detail && context && (
        <FundingApplicationAction
          action={action}
          application={detail}
          context={context}
          busy={busy}
          restoreFocus={restoreFocus}
          onClose={() => setAction(null)}
          onSave={async (change) => {
            const result = await save(change);
            if (result) {
              setAction(null);
              dirty.current = false;
              saving.current = false;
              await load(true);
            }
            return result;
          }}
        />
      )}
    </main>
  );
}
export default FundingApplications;
