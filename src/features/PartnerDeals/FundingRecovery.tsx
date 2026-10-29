import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@libs/components/ui/button";
import { memberSessionToken } from "../MemberCV/session";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { useMemberAccount } from "../MemberPlatform/MemberAccountContext";

type Candidate = { id: string; revision: number; reference: string; status: string; amountOre: string; expectedDate: string | null };
type CandidateResult = { contributionId: string; amountOre: string; linkedFundingId: string | null; candidates: Candidate[] };
export interface FundingRecoveryApi {
  candidates(contributionId: string): Promise<CandidateResult>;
  link(contributionId: string, fundingId: string): Promise<void>;
  unlink(contributionId: string): Promise<void>;
  approveSeparate(contributionId: string, candidates: Candidate[]): Promise<void>;
}
function amount(value: string) { const ore = BigInt(value); return `${(ore / 100n).toString()},${String(ore % 100n).padStart(2, "0")} NOK`; }
function apiFor(owner: { current: string | null }): FundingRecoveryApi {
  async function request(query: string, payload?: unknown) {
    const token = await memberSessionToken(owner);
    const response = await fetch(`/api/partner-deals${query}`, { method: payload ? "POST" : "GET", cache: "no-store", headers: { Authorization: `Bearer ${token}`, ...(payload ? { "Content-Type": "application/json" } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(body.error || "Could not update sponsor funding.");
    return body;
  }
  return {
    candidates: async contributionId => await request(`?view=fundingCandidates&contributionId=${encodeURIComponent(contributionId)}`) as CandidateResult,
    link: async (contributionId, fundingId) => { await request("", { action: "linkFunding", contributionId, fundingId }); },
    unlink: async contributionId => { await request("", { action: "unlinkFunding", contributionId }); },
    approveSeparate: async (contributionId, snapshot) => { await request("", { action: "approveSeparateFunding", contributionId, snapshot, confirmed: true }); },
  };
}
/** Render only for an authenticated pipeline user; the server independently requires finance access. */
export function FundingRecovery({ contributionId, api, onResolved }: { contributionId: string; api?: FundingRecoveryApi; onResolved?: () => void }) {
  const notify = useNotify();
  const account = useMemberAccount();
  const tokenOwner = useRef<string | null>(null);
  const generation = useRef(0);
  const [result, setResult] = useState<CandidateResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const load = useCallback(async () => {
    const id = ++generation.current;
    setResult(null); setAcknowledged(false); setBusy(true);
    try { const next = await (api ?? apiFor(tokenOwner)).candidates(contributionId); if (generation.current === id) setResult(next); }
    catch (error) { if (generation.current === id) notify("Could not load funding", error instanceof Error ? error.message : "Please try again.", { variant: "error", action: { label: "Try again", onClick: () => { void load(); } } }); }
    finally { if (generation.current === id) setBusy(false); }
  }, [api, contributionId, notify]);
  useEffect(() => { tokenOwner.current = null; void load(); return () => { generation.current++; }; }, [load, account?.email]);
  const act = async (operation: () => Promise<void>, message: string) => {
    setBusy(true);
    try { await operation(); notify(message, "", { variant: "success" }); onResolved?.(); await load(); }
    catch (error) { setResult(null); notify("Could not update funding", error instanceof Error ? error.message : "Please try again.", { variant: "error", action: { label: "Reload funding", onClick: () => { void load(); } } }); }
    finally { setBusy(false); }
  };
  const client = api ?? apiFor(tokenOwner);
  return <section className="space-y-3" aria-label="Review sponsor funding">
    <h3 className="font-semibold">Review existing funding</h3>
    {result?.linkedFundingId ? <div className="space-y-2"><p>A funding record is linked to this contribution.</p><Button type="button" variant="outline" disabled={busy} onClick={() => void act(() => client.unlink(contributionId), "Funding link removed")}>Remove funding link</Button></div> : null}
    {result && !result.linkedFundingId && result.candidates.length === 0 ? <p>No matching funding records found.</p> : null}
    {result && !result.linkedFundingId && result.candidates.length ? <>
      <p>Review these existing records before linking one or creating a separate record for this deal.</p>
      <ul className="space-y-2">{result.candidates.map(candidate => <li className="rounded-md border p-3" key={candidate.id}>
        <p>{candidate.reference} · {candidate.status} · {amount(candidate.amountOre)}</p>
        {candidate.expectedDate ? <p>Expected payment: {candidate.expectedDate}</p> : null}
        <Button type="button" variant="outline" disabled={busy || candidate.amountOre !== result.amountOre || !["secured", "received"].includes(candidate.status)} onClick={() => void act(() => client.link(contributionId, candidate.id), "Funding linked")}>Link this record</Button>
      </li>)}</ul>
      <label className="flex items-start gap-2"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} /> <span>I reviewed these records and confirm this agreement needs a separate funding record.</span></label>
      <Button type="button" variant="outline" disabled={busy || !acknowledged} onClick={() => void act(() => client.approveSeparate(contributionId, result.candidates), "Separate funding approved")}>Approve separate funding</Button>
    </> : null}
  </section>;
}
