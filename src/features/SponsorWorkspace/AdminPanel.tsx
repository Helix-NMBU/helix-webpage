import { useEffect, useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@libs/components/ui/alert";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@libs/components/ui/card";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { Switch } from "@libs/components/ui/switch";
import type { SponsorAdministration, SponsorTransport } from "./admin-types";

const blankContact = { id: "", name: "", email: "", active: true };
const blankAgreement = { tier: "bronze", startsAt: "", endsAt: "", revoked: false };
export default function AdminPanel({ request }: { request: SponsorTransport }) {
  const [data, setData] = useState<SponsorAdministration | null>(null);
  const [organizationId, setOrganizationId] = useState("");
  const [organization, setOrganization] = useState({ id: "", name: "", active: true });
  const [contact, setContact] = useState(blankContact);
  const [agreement, setAgreement] = useState(blankAgreement);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void request<SponsorAdministration>("admin", { signal: controller.signal }).then(setData).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load sponsor records.");
    });
    return () => controller.abort();
  }, [request, attempt]);
  function chooseOrganization(value: string) {
    setOrganizationId(value); setContact(blankContact); setNotice("");
    const record = data?.agreements.find((item) => item.organization_id === value);
    setAgreement(record ? { tier: record.tier, startsAt: record.starts_at.slice(0, 10), endsAt: record.ends_at.slice(0, 10), revoked: Boolean(record.revoked_at) } : blankAgreement);
  }
  async function save(event: FormEvent, change: Record<string, unknown>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      setData(await request<SponsorAdministration>("admin", { method: "POST", body: JSON.stringify(change) }));
      setNotice("Sponsor records saved.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save sponsor records."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-6" aria-labelledby="sponsor-admin-title">
    <div><h1 id="sponsor-admin-title" className="text-2xl font-semibold tracking-tight">Sponsor administration</h1><p className="mt-1 text-sm text-muted-foreground">Manage organizations, named contacts and agreements.</p></div>
    {error && <Alert variant="destructive"><AlertDescription>{error} <Button variant="outline" size="sm" onClick={() => { setError(""); setAttempt((value) => value + 1); }}>Reload records</Button></AlertDescription></Alert>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {!data ? <p role="status">Loading sponsor records…</p> : <>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Organizations</CardTitle></CardHeader><CardContent className="space-y-4">
          {data.organizations.length === 0 && <p className="text-sm text-muted-foreground">No organizations yet.</p>}
          <div className="space-y-2">{data.organizations.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm"><span>{item.name}{!item.active && " · Inactive"}</span><Button variant="outline" size="sm" onClick={() => setOrganization(item)}>Edit</Button></div>)}</div>
          <form className="space-y-3" onSubmit={(event) => void save(event, { operation: "organization", ...(organization.id ? { id: organization.id } : {}), name: organization.name, active: organization.active })}>
            <Label htmlFor="organization-name">Organization name</Label><Input id="organization-name" required maxLength={160} value={organization.name} onChange={(event) => setOrganization({ ...organization, name: event.target.value })} />
            <div className="flex items-center gap-2"><Switch id="organization-active" checked={organization.active} onCheckedChange={(value) => setOrganization({ ...organization, active: value })} /><Label htmlFor="organization-active">Active</Label></div>
            <div className="flex flex-wrap gap-2"><Button disabled={busy} type="submit">{organization.id ? "Save organization" : "Add organization"}</Button>{organization.id && <Button type="button" variant="ghost" onClick={() => setOrganization({ id: "", name: "", active: true })}>New organization</Button>}</div>
          </form>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Contacts and agreement</CardTitle></CardHeader><CardContent className="space-y-5">
          <div className="space-y-2"><Label htmlFor="manage-organization">Manage organization</Label><Select value={organizationId} onValueChange={chooseOrganization}><SelectTrigger id="manage-organization"><SelectValue placeholder="Choose an organization" /></SelectTrigger><SelectContent>{data.organizations.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
          {!organizationId ? <p className="text-sm text-muted-foreground">Choose an organization to manage its access.</p> : <>
            <div className="space-y-2">{data.contacts.filter((item) => item.organization_id === organizationId).map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm"><span className="break-all">{item.name || item.email}{!item.active && " · Inactive"}</span><Button variant="outline" size="sm" onClick={() => setContact(item)}>Edit contact</Button></div>)}</div>
            <form className="space-y-3" onSubmit={(event) => void save(event, { operation: "contact", ...(contact.id ? { id: contact.id } : {}), organizationId, name: contact.name, email: contact.email, active: contact.active })}>
              <Label htmlFor="contact-name">Contact name</Label><Input id="contact-name" maxLength={160} value={contact.name} onChange={(event) => setContact({ ...contact, name: event.target.value })} />
              <Label htmlFor="contact-email">Contact email</Label><Input id="contact-email" type="email" required maxLength={254} value={contact.email} onChange={(event) => setContact({ ...contact, email: event.target.value })} />
              <div className="flex items-center gap-2"><Switch id="contact-active" checked={contact.active} onCheckedChange={(value) => setContact({ ...contact, active: value })} /><Label htmlFor="contact-active">Contact active</Label></div>
              <p className="text-xs text-muted-foreground">Deactivation removes access on the next request. Adding a contact does not send an invitation.</p>
              <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{contact.id ? "Save contact" : "Add contact"}</Button>{contact.id && <Button type="button" variant="ghost" onClick={() => setContact(blankContact)}>New contact</Button>}</div>
            </form>
            <form className="space-y-3 border-t pt-5" onSubmit={(event) => void save(event, { operation: "agreement", organizationId, ...agreement })}>
              <Label htmlFor="agreement-tier">Agreement tier</Label><Select value={agreement.tier} onValueChange={(tier) => setAgreement({ ...agreement, tier })}><SelectTrigger id="agreement-tier"><SelectValue /></SelectTrigger><SelectContent>{["partner", "service", "bronze", "silver", "gold", "platinum", "main"].map((tier) => <SelectItem key={tier} value={tier}>{tier[0].toUpperCase() + tier.slice(1)}</SelectItem>)}</SelectContent></Select>
              <Label htmlFor="agreement-start">Starts on</Label><Input id="agreement-start" type="date" required value={agreement.startsAt} onChange={(event) => setAgreement({ ...agreement, startsAt: event.target.value })} />
              <Label htmlFor="agreement-end">Ends before</Label><Input id="agreement-end" type="date" required value={agreement.endsAt} onChange={(event) => setAgreement({ ...agreement, endsAt: event.target.value })} />
              <p className="text-xs text-muted-foreground">Dates use midnight UTC. Access ends at the start of the end date.</p>
              <div className="flex items-center gap-2"><Switch id="agreement-revoked" checked={agreement.revoked} onCheckedChange={(revoked) => setAgreement({ ...agreement, revoked })} /><Label htmlFor="agreement-revoked">Agreement revoked</Label></div>
              <Button type="submit" disabled={busy}>Save agreement</Button>
            </form>
          </>}
        </CardContent></Card>
      </div>
    </>}
  </section>;
}
