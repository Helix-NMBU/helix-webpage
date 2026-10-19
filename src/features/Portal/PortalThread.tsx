import { useEffect, useState } from "react";
import { Paperclip } from "lucide-react";
import { supabase } from "@libs/lib/utils";
import { Alert, AlertDescription } from "@libs/components/ui/alert";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent } from "@libs/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@libs/components/ui/dialog";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Textarea } from "@libs/components/ui/textarea";
import "./portal.css";

type Message = { id: string; body: string; attachment_paths: string[]; created_at: string; sender_user_id: string };

export function PortalThread({ organizationId, entityType, entityId, title, open, onClose }: { organizationId: string; entityType: "request" | "opportunity" | "response" | "engagement"; entityId: string; title: string; open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!supabase || !open) return;
    const { data, error: loadError } = await supabase.from("portal_messages").select("id,body,attachment_paths,created_at,sender_user_id").eq("organization_id", organizationId).eq("entity_type", entityType).eq("entity_id", entityId).order("created_at");
    if (loadError) setError(loadError.message); else setMessages((data ?? []) as Message[]);
  };
  useEffect(() => { void load(); }, [entityId, entityType, open, organizationId]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault(); if (!supabase) return;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const paths: string[] = [];
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${organizationId}/${entityType}/${entityId}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("portal-attachments").upload(path, file);
      if (uploadError) { setError(uploadError.message); return; }
      paths.push(path);
    }
    const { error: insertError } = await supabase.from("portal_messages").insert({ organization_id: organizationId, entity_type: entityType, entity_id: entityId, sender_user_id: userData.user.id, body, attachment_paths: paths });
    if (insertError) setError(insertError.message); else { setBody(""); setFiles([]); await load(); }
  };

  const openAttachment = async (path: string) => {
    if (!supabase) return;
    const { data, error: signError } = await supabase.storage.from("portal-attachments").createSignedUrl(path, 900);
    if (signError) setError(signError.message); else if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}><DialogContent className="portal-root max-h-[88svh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>Conversation with Helix</DialogDescription></DialogHeader>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<div className="my-2 grid gap-3">{messages.map((message) => <Card key={message.id} className="gap-3 py-4"><CardContent className="grid gap-2 px-4"><p className="m-0">{message.body}</p><small className="text-muted-foreground">{new Date(message.created_at).toLocaleString()}</small>{message.attachment_paths.map((path) => <Button variant="outline" size="sm" className="w-fit" key={path} onClick={() => void openAttachment(path)}><Paperclip /> {path.split("/").pop()}</Button>)}</CardContent></Card>)}{!messages.length && <Card className="border-dashed py-6 text-center text-sm text-muted-foreground">No messages yet.</Card>}</div><form className="grid gap-4" onSubmit={send}><div className="grid gap-2"><Label htmlFor="portal-reply">Reply</Label><Textarea id="portal-reply" required value={body} onChange={(event) => setBody(event.target.value)} /></div><div className="grid gap-2"><Label htmlFor="portal-attachments">Attachments, up to 10 MB each</Label><Input id="portal-attachments" type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></div><Button>Send message</Button></form></DialogContent></Dialog>;
}
