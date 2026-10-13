import { STATUS_LABELS, type NovelaStatus } from "@fruti/shared";
import { Badge } from "@/components/ui/badge";

const VARIANT: Record<NovelaStatus, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  DRAFT: "outline",
  SCRIPTING: "warning",
  SCRIPT_READY: "secondary",
  DESIGNING: "warning",
  DESIGN_READY: "secondary",
  PRODUCING: "default",
  PAUSED: "outline",
  COMPLETED: "success",
  FAILED: "destructive",
};

export function StatusBadge({ status }: { status: NovelaStatus }) {
  return <Badge variant={VARIANT[status]}>{STATUS_LABELS[status]}</Badge>;
}

const CHAPTER_LABELS: Record<string, string> = {
  PENDING: "Sin guion",
  SCRIPTED: "Guion listo",
  QUEUED: "En cola",
  RENDERING: "Produciendo",
  DONE: "Listo",
  FAILED: "Error",
};

export function ChapterBadge({ status, stale }: { status: string; stale?: boolean }) {
  if (stale) return <Badge variant="warning">Guion editado</Badge>;
  const v = status === "DONE" ? "success" : status === "FAILED" ? "destructive" : status === "RENDERING" || status === "QUEUED" ? "default" : "outline";
  return <Badge variant={v}>{CHAPTER_LABELS[status] ?? status}</Badge>;
}
