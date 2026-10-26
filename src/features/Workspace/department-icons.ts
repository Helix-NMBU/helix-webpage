import {
  IconBriefcase,
  IconTools,
  IconCpu,
  IconCode,
  IconSpeakerphone,
  IconTruckDelivery,
  IconWallet,
  IconUserSquare,
  type TablerIcon,
} from "@tabler/icons-react";

const departmentIcons: Record<string, TablerIcon> = {
  Management: IconBriefcase,
  "Mechanical & Production": IconTools,
  Electronics: IconCpu,
  "Software & Autonomous": IconCode,
  "Business & Marketing": IconSpeakerphone,
  Logistics: IconTruckDelivery,
  Finance: IconWallet,
};

export function getDepartmentIcon(name: string): TablerIcon {
  return departmentIcons[name] ?? IconUserSquare;
}
