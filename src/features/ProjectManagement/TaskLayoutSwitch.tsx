import { IconLayoutKanban, IconList } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";

const layouts = [
  ["list", "List", IconList],
  ["board", "Board", IconLayoutKanban],
] as const;

export function TaskLayoutSwitch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Task layout"
      className="grid grid-cols-2 gap-2"
    >
      {layouts.map(([key, label, Icon]) => (
        <Button
          key={key}
          variant={value === key ? "secondary" : "outline"}
          aria-pressed={value === key}
          onClick={() => onChange(key)}
        >
          <Icon aria-hidden="true" className="size-4" />
          {label}
        </Button>
      ))}
    </div>
  );
}
