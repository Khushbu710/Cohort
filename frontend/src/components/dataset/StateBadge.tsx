import { Badge } from "@/components/ui/badge";
import type { DatasetLifecycleState } from "@cohort/shared";

const LABELS: Record<DatasetLifecycleState, string> = {
  OPEN: "Open",
  FROZEN: "Frozen",
  REVEALED: "Revealed",
};

const VARIANTS: Record<DatasetLifecycleState, "default" | "secondary" | "outline"> = {
  OPEN: "default",
  FROZEN: "secondary",
  REVEALED: "outline",
};

export function StateBadge({ state }: { state: DatasetLifecycleState }) {
  return <Badge variant={VARIANTS[state]}>{LABELS[state]}</Badge>;
}
