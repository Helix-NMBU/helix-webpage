import { useEffect, useMemo, useRef, useState } from "react";
import { IconCheck } from "@tabler/icons-react";
import { Badge } from "@libs/components/ui/badge";
import { Button } from "@libs/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@libs/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@libs/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@libs/components/ui/select";
import { formatOreNb, parseNokToOre } from "../Finance/money";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { dealBudgetLinksRepository } from "./deal-budget-links-repository";
import type {
  DealBudgetLinks,
  DealBudgetLinksRepository,
} from "./deal-budget-links-types";
import type { Deal, Season } from "./types";
export function LinkedPurchases({
  deal,
  onChanged,
  repository: provided,
}: {
  deal: Deal;
  seasons: Season[];
  onChanged: () => Promise<void>;
  repository?: DealBudgetLinksRepository;
}) {
  const repository = useMemo(
    () => provided ?? dealBudgetLinksRepository(),
    [provided],
  );
  const [data, setData] = useState<DealBudgetLinks | null>(null),
    [open, setOpen] = useState(false),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [search, setSearch] = useState(""),
    [department, setDepartment] = useState("__all__"),
    [selectedOnly, setSelectedOnly] = useState(false);
  const generation = useRef(0),
    working = useRef(false),
    pending = useRef<{ key: string; id: string } | null>(null),
    selection = useRef(selected);
  selection.current = selected;
  const notify = useNotify();
  const searchInput = useRef<HTMLInputElement>(null);
  const latestData = useRef(data);
  latestData.current = data;
  const opener = useRef<HTMLButtonElement>(null),
    pendingFocus = useRef(false);
  useEffect(() => {
    const trigger = opener.current;
    if (!open && !busy && pendingFocus.current && trigger && !trigger.disabled) {
      trigger.focus();
      pendingFocus.current = document.activeElement !== trigger;
    }
  }, [open, busy]);
  function clear() {
    generation.current++;
    setData(null);
    setSelected([]);
    setOpen(false);
    setBusy(false);
    working.current = false;
  }
  async function load(preserve = false) {
    const operation = ++generation.current;
    setLoading(true);
    try {
      const next = await repository.load(deal.id);
      if (operation !== generation.current) return;
      if (preserve && latestData.current) {
        const ids = new Set(next.entries.map((entry) => entry.entryId));
        const retained = latestData.current.entries
          .filter(
            (entry) =>
              selection.current.includes(entry.entryId) &&
              !ids.has(entry.entryId),
          )
          .map((entry) => ({ ...entry, unavailable: true }));
        setData({ ...next, entries: [...next.entries, ...retained] });
      } else setData(next);
      if (!preserve)
        setSelected(
          next.entries
            .filter((entry) => entry.selected)
            .map((entry) => entry.entryId),
        );
    } catch (error) {
      if (operation !== generation.current) return;
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403) clear();
      notify(
        "Could not load budget entries",
        error instanceof Error ? error.message : "Please try again.",
        {
          variant: "error",
          href: null,
          action: { label: "Retry", onClick: () => void load(preserve) },
        },
      );
    } finally {
      if (operation === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load(open);
    const stop = repository.watchSession?.(() => {
      clear();
    });
    return () => {
      generation.current++;
      stop?.();
    };
  }, [repository, deal.id, deal.revision]);
  async function save() {
    if (!data || working.current || data.locked) return;
    const entries = data.entries
      .filter((entry) => selection.current.includes(entry.entryId))
      .map(({ entryId, budgetRevision }) => ({ entryId, budgetRevision }));
    const input = {
      action: "saveDealBudgetLinks" as const,
      dealId: deal.id,
      dealExpectedRevision: data.dealRevision,
      applicationExpectedRevision: data.applicationRevision,
      entries,
    };
    const key = JSON.stringify(input);
    if (pending.current?.key !== key)
      pending.current = { key, id: crypto.randomUUID() };
    const operation = ++generation.current;
    working.current = true;
    setBusy(true);
    try {
      await repository.save({ ...input, requestId: pending.current.id });
      if (operation !== generation.current) return;
      pending.current = null;
      setOpen(false);
      await onChanged();
      await load();
    } catch (error) {
      if (operation !== generation.current) return;
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403) clear();
      notify(
        "Could not update budget links",
        error instanceof Error ? error.message : "Please try again.",
        {
          variant: "error",
          href: null,
          ...(status === 409
            ? { action: { label: "Refresh", onClick: () => void load(true) } }
            : {}),
        },
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  const linked = data?.entries.filter((entry) => entry.selected) ?? [];
  const dirty =
    !!data &&
    [...selected].sort().join(",") !==
      data.entries
        .filter((entry) => entry.selected)
        .map((entry) => entry.entryId)
        .sort()
        .join(",");
  const departments = [
    ...new Set((data?.entries ?? []).map((entry) => entry.departmentName)),
  ].sort((a, b) => a.localeCompare(b));
  const query = search.trim().toLowerCase();
  const visible = (data?.entries ?? []).filter(
    (entry) =>
      (department === "__all__" || entry.departmentName === department) &&
      (!selectedOnly || selected.includes(entry.entryId)) &&
      [entry.description, entry.projectName, entry.departmentName].some(
        (value) => value.toLowerCase().includes(query),
      ),
  );
  const groups = new Map<string, typeof visible>();
  for (const entry of visible) {
    const group = groups.get(entry.projectBudgetId) ?? [];
    group.push(entry);
    groups.set(entry.projectBudgetId, group);
  }
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Linked budget entries</h3>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          setOpen(next);
          if (next) {
            setSearch("");
            setDepartment("__all__");
            setSelectedOnly(false);
            void load();
          }
        }}
      >
        <DialogTrigger asChild>
          <Button
            ref={opener}
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            className="w-full justify-between font-normal"
            aria-label="Manage linked budget entries"
          >
            <span>{data?.locked ? "View linked entries" : linked.length ? "Manage links" : "Select budget entries"}</span>
            <span className="text-xs text-muted-foreground">
              {linked.length} linked
            </span>
          </Button>
        </DialogTrigger>
        <DialogContent
          className="flex h-[min(44rem,85svh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
          showCloseButton={!busy}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            searchInput.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            pendingFocus.current = true;
            const trigger = opener.current;
            // The save can finish before React removes the trigger's disabled state.
            if (trigger && !trigger.disabled) {
              trigger.focus();
              pendingFocus.current = document.activeElement !== trigger;
            }
          }}
        >
          <DialogHeader className="shrink-0 border-b px-6 pb-4 pt-5 pr-14">
            <DialogTitle>
              {data?.locked ? "Linked budget entries" : "Link budget entries"}
            </DialogTitle>
            <DialogDescription>
              Search budgeted entries across all projects
              {data?.seasonCode ? ` in ${data.seasonCode}` : ""} for{" "}
              {deal.title}.
            </DialogDescription>
          </DialogHeader>
          <Command shouldFilter={false} className="min-h-0 flex-1 rounded-none">
            <div className="grid shrink-0 gap-3 border-b px-6 py-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
              <div className="rounded-md border [&>div]:border-0">
                <CommandInput
                  ref={searchInput}
                  aria-label="Find budget entries"
                  placeholder="Search entries, projects or departments…"
                  value={search}
                  onValueChange={setSearch}
                />
              </div>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger
                  aria-label="Filter by department"
                  className="h-full min-h-10 w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All departments</SelectItem>
                  {departments.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-2">
              <span className="text-xs text-muted-foreground">
                {visible.length} {visible.length === 1 ? "entry" : "entries"}
              </span>
              <Button
                type="button"
                size="sm"
                variant={selectedOnly ? "secondary" : "ghost"}
                aria-pressed={selectedOnly}
                onClick={() => setSelectedOnly((value) => !value)}
              >
                Selected only
              </Button>
            </div>
            <CommandList
              className="min-h-0 max-h-none flex-1 overscroll-contain px-3 pb-3"
              aria-busy={loading}
            >
              <CommandEmpty>
                {loading
                  ? "Loading entries…"
                  : "No budget entries match your filters."}
              </CommandEmpty>
              {[...groups].map(([id, entries]) => (
                <CommandGroup key={id} heading={entries[0].projectName}>
                  {entries.map((entry) => (
                    <CommandItem
                      key={entry.entryId}
                      value={entry.entryId}
                      disabled={
                        busy ||
                        loading ||
                        data?.locked ||
                        (entry.unavailable && !selected.includes(entry.entryId))
                      }
                      className="gap-3 px-3 py-3"
                      onSelect={() =>
                        setSelected((current) =>
                          current.includes(entry.entryId)
                            ? current.filter((id) => id !== entry.entryId)
                            : [...current, entry.entryId],
                        )
                      }
                      aria-label={`${selected.includes(entry.entryId) ? "Selected: " : ""}${entry.description} · ${entry.projectName}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`flex size-4 shrink-0 items-center justify-center rounded border ${selected.includes(entry.entryId) ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50"}`}
                      >
                        {selected.includes(entry.entryId) && (
                          <IconCheck className="size-3" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block whitespace-normal text-sm">
                          {entry.description}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {entry.departmentName}
                          {entry.unavailable
                            ? " · Unavailable"
                            : !entry.approved
                              ? " · Awaiting approval"
                              : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-xs tabular-nums">
                        NOK {formatOreNb(parseNokToOre(entry.plannedNok) ?? 0n)}
                      </span>
                      <Badge variant="outline" className="shrink-0">
                        {entry.priority}
                      </Badge>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
          <DialogFooter className="shrink-0 items-center gap-3 border-t px-6 py-4">
            <span className="mr-auto text-sm text-muted-foreground">
              {selected.length} selected
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Close
            </Button>
            {!data?.locked && (
              <Button
                type="button"
                size="sm"
                disabled={busy || loading || !dirty}
                onClick={() => void save()}
              >
                Apply
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <p className="text-xs text-muted-foreground">
        {data?.locked
          ? "These budget links are locked and cannot be changed."
          : `Add or unlink budget entries until this ${deal.opportunityKind === "grant" ? "grant is Approved" : "deal is Won"}. Confirming will lock the links and set the entries to P0.`}
      </p>
      {linked.length > 0 && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {linked.map((entry) => (
            <li
              key={entry.entryId}
              className="flex items-center justify-between gap-2"
            >
              <span className="min-w-0 truncate">{entry.description}</span>
              <span className="shrink-0">{entry.priority}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
