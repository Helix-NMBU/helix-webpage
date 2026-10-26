import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@libs/components/ui/card";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Switch } from "@libs/components/ui/switch";
import { Skeleton } from "@libs/components/ui/skeleton";
import { EmailHtmlFrame } from "./EmailHtmlFrame";
import { useMemberAccount } from "./MemberAccountContext";
import { useMemberFeatureAccess } from "./MemberFeatureAccess";
import { useNotify } from "./MemberNotifications";
import { emailSignatureRequest } from "./email-signature-api";
import { parseSignatureSettings, renderSignature, type SignatureSettings, type SignatureSnapshot } from "./email-signature";

export function EmailSignatureSettings() {
  const access = useMemberFeatureAccess();
  const account = useMemberAccount();
  const notify = useNotify();
  const owner = useRef<string | null>(access.authUserId);
  owner.current = access.authUserId;
  const isAdmin = access.member?.roles.some((role) => role.key === "platform_administrator") ?? false;
  const [saved, setSaved] = useState<SignatureSnapshot | null>(null);
  const [draft, setDraft] = useState<SignatureSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await emailSignatureRequest(owner);
      setSaved(result);
      setDraft(result.settings);
    } catch (error) {
      notify("Could not load signature", error instanceof Error ? error.message : "Please try again.", {
        id: "email-signature-load", variant: "error", href: null,
        action: { label: "Try again", onClick: () => void load() },
      });
    } finally { setLoading(false); }
  }, [notify]);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!draft || !saved) return;
    setBusy(true);
    try {
      const settings = parseSignatureSettings(draft);
      const result = await emailSignatureRequest(owner, { settings, revision: saved.revision });
      setSaved(result);
      setDraft(result.settings);
      notify("Email signature saved", "New messages, replies, and forwards will use the shared signature.", { href: null });
    } catch (error) {
      notify("Could not save signature", error instanceof Error ? error.message : "Please try again.", { variant: "error", href: null });
    } finally { setBusy(false); }
  }

  let preview = saved?.signature ?? { html: "", text: "" };
  if (draft) {
    try { preview = renderSignature(parseSignatureSettings({ ...draft, enabled: true }), { name: account?.name ?? "", email: account?.email ?? "", role: account?.helixRole ?? "" }); }
    catch { /* Keep the last saved preview while a field is incomplete. Save validates every field. */ }
  }
  const changed = JSON.stringify(draft) !== JSON.stringify(saved?.settings);

  return <Card id="email-signature" className="scroll-mt-8 shadow-none">
    <CardHeader>
      <CardTitle className="text-base">Email signature</CardTitle>
      <CardDescription>{isAdmin ? "Manage the shared signature for every member. Changes apply when a message is sent." : "Your signature is managed by Platform Administrators and uses your member profile."}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-6">
      {loading ? <div role="status" aria-label="Loading signature"><Skeleton className="h-32 w-full" /></div> : !draft ? <Button variant="outline" onClick={() => void load()}>Reload signature</Button> : <>
        {isAdmin ? <form className="space-y-6" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <fieldset disabled={busy} className="space-y-6">
            <div className="flex items-center justify-between gap-4"><Label htmlFor="signature-enabled">Include signature in outgoing emails</Label><Switch id="signature-enabled" checked={draft.enabled} onCheckedChange={(enabled) => setDraft({ ...draft, enabled })} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="signature-logo">Organization logo URL</Label><Input id="signature-logo" type="url" placeholder="https://.../logo.png" value={draft.logoUrl} onChange={(event) => setDraft({ ...draft, logoUrl: event.target.value })} /><p className="text-xs text-muted-foreground">Use a publicly accessible HTTPS image so recipients can see it.</p></div>
              <div className="space-y-2"><Label htmlFor="signature-logo-alt">Logo description</Label><Input id="signature-logo-alt" value={draft.logoAlt} onChange={(event) => setDraft({ ...draft, logoAlt: event.target.value })} /></div>
            </div>
            <div className="space-y-3">
              <div className="space-y-1"><h3 className="text-sm font-medium">Signature text</h3><p className="text-xs leading-5 text-muted-foreground">Use {"{member.name}"}, {"{member.role}"}, and {"{member.email}"}. The role comes from the member's Helix role. Empty lines are omitted.</p></div>
              {draft.lines.map((line, index) => <div key={index} className="flex items-center gap-2">
                <Input aria-label={`Signature line ${index + 1}`} value={line.text} maxLength={400} onChange={(event) => setDraft({ ...draft, lines: draft.lines.map((item, i) => i === index ? { ...item, text: event.target.value } : item) })} />
                <Input aria-label={`Color for line ${index + 1}`} type="color" value={line.color} className="w-12 shrink-0 p-1" onChange={(event) => setDraft({ ...draft, lines: draft.lines.map((item, i) => i === index ? { ...item, color: event.target.value } : item) })} />
                <Button type="button" variant="ghost" size="sm" aria-label={`Remove line ${index + 1}`} onClick={() => setDraft({ ...draft, lines: draft.lines.filter((_, i) => i !== index) })}>Remove</Button>
              </div>)}
              <Button type="button" variant="outline" size="sm" disabled={draft.lines.length >= 12} onClick={() => setDraft({ ...draft, lines: [...draft.lines, { text: "", color: "#202124" }] })}>Add text line</Button>
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Website and social links</h3>
              {draft.links.map((link, index) => <div key={index} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_2fr_auto]">
                <Input aria-label={`Link ${index + 1} label`} placeholder="LinkedIn" value={link.label} onChange={(event) => setDraft({ ...draft, links: draft.links.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} />
                <Input aria-label={`Link ${index + 1} URL`} type="url" placeholder="https://..." value={link.url} className="col-start-1 row-start-2 sm:col-auto sm:row-auto" onChange={(event) => setDraft({ ...draft, links: draft.links.map((item, i) => i === index ? { ...item, url: event.target.value } : item) })} />
                <Button type="button" variant="ghost" size="sm" className="col-start-2 row-start-1 sm:col-auto sm:row-auto" aria-label={`Remove link ${index + 1}`} onClick={() => setDraft({ ...draft, links: draft.links.filter((_, i) => i !== index) })}>Remove</Button>
              </div>)}
              <div className="flex flex-wrap items-center gap-4"><Button type="button" variant="outline" size="sm" disabled={draft.links.length >= 8} onClick={() => setDraft({ ...draft, links: [...draft.links, { label: "", url: "" }] })}>Add link</Button><Label htmlFor="signature-link-color">Link color</Label><Input id="signature-link-color" type="color" value={draft.linkColor} className="w-12 p-1" onChange={(event) => setDraft({ ...draft, linkColor: event.target.value })} /></div>
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || !changed}>{busy ? "Saving…" : "Save signature"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => void load()}>Reload saved signature</Button></div>
        </form> : <p className="text-sm text-muted-foreground">{draft.enabled ? "Included in new messages, replies, and forwards." : "The shared signature is currently disabled."}</p>}
        <div className="space-y-2"><h3 className="text-sm font-medium">Preview for {account?.name || "your account"}</h3><div className="flex h-60 overflow-hidden rounded-md border bg-white"><EmailHtmlFrame html={preview.html} plainText={preview.text} /></div></div>
      </>}
    </CardContent>
  </Card>;
}
