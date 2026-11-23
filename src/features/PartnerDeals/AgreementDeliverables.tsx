import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@libs/components/ui/badge";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@libs/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { missingTierDeliverables } from "./tier-deliverables";
import type { WonDeal } from "./WonDeals";

type Work = WonDeal["tasks"][number];
export const taskStatusNames: Record<string, string> = { backlog: "Backlog", todo: "To do", in_progress: "In progress", blocked: "Blocked", done: "Done", cancelled: "Cancelled" };
export function deliveryStatus(tasks: readonly Work[]): string {
  if (!tasks.length) return "Task not linked";
  if (tasks.every(task => task.status === "done")) return "Done";
  if (tasks.some(task => task.status === "blocked")) return "Blocked";
  if (tasks.every(task => task.status === "cancelled")) return "Cancelled";
  if (tasks.some(task => task.status === "in_progress" || task.status === "done")) return "In progress";
  if (tasks.every(task => task.status === "todo" || task.status === "backlog")) return "To do";
  return "Needs review";
}
export function AgreementDeliverables({ deal, templates, onManage }: { deal: WonDeal; templates: readonly { title: string; description: string }[]; onManage?: () => void }) {
  const [filter, setFilter] = useState("all");
  const current = deal.deliverables.filter(item => !item.retiredAt);
  const missing = missingTierDeliverables(templates, deal.deliverables);
  const rows = [
    ...current.map(item => { const tasks = deal.tasks.filter(task => task.kind === "marketing" && task.deliverableId === item.id); return { ...item, tasks, status: deliveryStatus(tasks) }; }),
    ...missing.map((item, index) => ({ ...item, id: `missing-${index}`, dueDate: null, tasks: [] as Work[], status: "Not recorded" })),
  ];
  const done = rows.filter(item => item.status === "Done").length;
  const visible = rows.filter(item => filter === "all" || (filter === "open" ? item.status !== "Done" && item.status !== "Cancelled" : item.status === filter));
  return <Card>
    <CardHeader className="gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>Deliverables</CardTitle><CardDescription className="mt-2">{done} of {rows.length} complete{templates.length > 0 ? " · S27 tier checklist and agreed extras" : " · Agreed delivery work"}</CardDescription></div>
        <div className="flex flex-wrap items-center gap-2">{onManage ? <Button variant="outline" size="sm" onClick={onManage}>Manage deliverables</Button> : null}<Select value={filter} onValueChange={setFilter}><SelectTrigger aria-label="Filter deliverables" className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All deliverables</SelectItem><SelectItem value="open">Outstanding</SelectItem><SelectItem value="Blocked">Blocked</SelectItem><SelectItem value="Done">Completed</SelectItem><SelectItem value="Not recorded">Not recorded</SelectItem></SelectContent></Select></div>
      </div>
      <div role="progressbar" aria-label="Agreement delivery progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={rows.length ? Math.round(done / rows.length * 100) : 0} className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${rows.length ? done / rows.length * 100 : 0}%` }} /></div>
    </CardHeader>
    <CardContent className="space-y-0">
      {!rows.length ? <div className="py-8 text-center"><p className="font-medium">No deliverables recorded.</p><p className="mt-1 text-sm text-muted-foreground">Record the agreed commitments to track delivery here.</p></div> : !visible.length ? <p className="py-8 text-center text-muted-foreground">No deliverables match this filter.</p> : <ul className="divide-y">{visible.map(item => <li key={item.id} className="flex flex-wrap items-start justify-between gap-4 py-5 first:pt-0 last:pb-0">
        <div className="min-w-0 flex-1 basis-64"><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">{item.title}</h3><Badge variant={item.status === "Blocked" ? "destructive" : item.status === "Done" ? "default" : "secondary"}>{item.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
          <p className="mt-2 text-xs text-muted-foreground">{item.dueDate ? `Due ${item.dueDate}` : "No due date"}{item.status === "Not recorded" ? " · Included in the tier; add to the agreement to track delivery." : ""}</p>
          {item.tasks.filter(task => !task.canOpen).map(task => <p key={task.id} className="mt-2 text-sm text-muted-foreground">{task.title} · {taskStatusNames[task.status] ?? task.status}</p>)}
        </div>
        {item.tasks.filter(task => task.canOpen).map(task => <Button key={task.id} variant="outline" size="sm" asChild><Link to={`/tasks/${task.id}`} aria-label={`Open task: ${task.title}`}>Open task</Link></Button>)}
      </li>)}</ul>}
      {deal.deliverables.some(item => item.retiredAt) ? <details className="mt-6 border-t pt-4"><summary className="cursor-pointer text-sm text-muted-foreground">Retired deliverables</summary><ul className="mt-3 space-y-2 text-sm">{deal.deliverables.filter(item => item.retiredAt).map(item => <li key={item.id}>{item.title} · Retired</li>)}</ul></details> : null}
    </CardContent>
  </Card>;
}
