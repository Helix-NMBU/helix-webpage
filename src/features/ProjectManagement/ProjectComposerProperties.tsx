import { useState, type Dispatch, type SetStateAction, type ReactNode } from "react";
import { Button } from "@libs/components/ui/button";
import { Checkbox } from "@libs/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@libs/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@libs/components/ui/select";
import { AssigneePicker } from "./TaskAssignees";
import { PriorityGlyph } from "./PriorityGlyph";
import { ProjectDatePicker } from "./ProjectDatePicker";
import {
  CATEGORY_LABELS,
  ORGANIZATION_DEPARTMENTS,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  type ProjectInput,
  type ProjectMember,
  type TaskCategory,
} from "./types";

function PropertyChoice({
  id,
  label,
  value,
  options,
  onChange,
  disabled,
  icon,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled: boolean;
  icon?: ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        aria-label={label}
        className="h-8 gap-2 rounded-full bg-muted/40 px-3 shadow-none [&>svg:last-child]:hidden"
      >
        {icon}
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ProjectComposerProperties({
  draft,
  setDraft,
  members,
  busy,
}: {
  draft: ProjectInput;
  setDraft: Dispatch<SetStateAction<ProjectInput>>;
  members: ProjectMember[];
  busy: boolean;
}) {
  const [departmentsOpen, setDepartmentsOpen] = useState(false);
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 pb-5 pt-1">
      <PropertyChoice
        id="project-priority"
        label="Priority"
        value={draft.priority ?? "normal"}
        options={TASK_PRIORITIES.map((value) => ({
          value,
          label: value === "normal" ? "Medium" : value[0].toUpperCase() + value.slice(1),
        }))}
        icon={<PriorityGlyph priority={draft.priority ?? "normal"} />}
        disabled={busy}
        onChange={(value) =>
          setDraft({
            ...draft,
            priority: value as ProjectInput["priority"],
          })
        }
      />
      {members.length > 0 && (
        <div className="max-w-56 [&>button]:h-8 [&>button]:w-auto [&>button]:rounded-full [&>button]:bg-muted/40">
          <AssigneePicker
            id="project-leads"
            triggerLabel="Choose project leads"
            assignmentRole="lead"
            members={members}
            value={draft.leadIds ?? []}
            disabled={busy}
            onChange={(leadIds) => setDraft({ ...draft, leadIds })}
          />
        </div>
      )}
      <PropertyChoice
        id="project-category"
        label="Area"
        value={draft.category}
        options={TASK_CATEGORIES.map((value) => ({
          value,
          label: CATEGORY_LABELS[value],
        }))}
        disabled={busy}
        onChange={(value) => setDraft({ ...draft, category: value as TaskCategory })}
      />
      <Popover open={departmentsOpen} onOpenChange={setDepartmentsOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            className="h-8 max-w-64 rounded-full bg-muted/40 px-3 font-normal shadow-none"
            aria-label="Departments"
          >
            <span className="truncate">
              {draft.departments.length === 1
                ? draft.departments[0]
                : draft.departments.length
                  ? `${draft.departments.length} departments`
                  : "Departments"}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-2">
          <div id="project-departments" role="group" aria-label="Project departments">
            {ORGANIZATION_DEPARTMENTS.map((name) => (
              <label
                key={name}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
              >
                <Checkbox
                  checked={draft.departments.includes(name)}
                  disabled={busy}
                  aria-label={name}
                  onCheckedChange={(checked) =>
                    setDraft((previous) => ({
                      ...previous,
                      departments:
                        checked === true
                          ? [...previous.departments, name]
                          : previous.departments.filter((value) => value !== name),
                    }))
                  }
                />
                {name}
              </label>
            ))}
          </div>
          <div className="mt-2 flex justify-end border-t pt-2">
            <Button type="button" size="sm" onClick={() => setDepartmentsOpen(false)}>
              Done
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <ProjectDatePicker
        id="project-start"
        label="Start date"
        value={draft.startDate ?? null}
        maximum={draft.deadline ?? "2100-12-31"}
        disabled={busy}
        onChange={(startDate) => setDraft({ ...draft, startDate })}
      />
      <ProjectDatePicker
        id="project-deadline"
        label="Target date"
        value={draft.deadline}
        minimum={draft.startDate ?? "2000-01-01"}
        disabled={busy}
        onChange={(deadline) => setDraft({ ...draft, deadline })}
      />
    </div>
  );
}
