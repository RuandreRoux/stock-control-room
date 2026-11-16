import { AlertTriangle, CheckCircle2, Circle, CircleDashed, Clock } from "lucide-react";
import type { Analysis } from "@/lib/logic";

/** One plain-language status per line. Colour is always paired with an icon and a label. */
export function StatusPill({ a }: { a: Analysis }) {
  let icon = <Circle size={14} strokeWidth={1.75} className="text-ink-400" aria-hidden />;
  let label = "To do";
  let tone = "bg-ink-50 border-ink-100";

  if (a.status === "mismatch") {
    icon = <AlertTriangle size={14} strokeWidth={1.75} className="text-danger" aria-hidden />;
    label = "Count mismatch";
    tone = "bg-danger/10 border-danger/30";
  } else if (a.status === "outstanding") {
    icon = <Clock size={14} strokeWidth={1.75} className="text-warn" aria-hidden />;
    label = `${a.outstanding} not captured`;
    tone = "bg-warn/10 border-warn/40";
  } else if (a.status === "over") {
    icon = <AlertTriangle size={14} strokeWidth={1.75} className="text-warn" aria-hidden />;
    label = `Over-captured by ${Math.abs(a.outstanding ?? 0)}`;
    tone = "bg-warn/10 border-warn/40";
  } else if (a.status === "balanced") {
    icon = <CheckCircle2 size={14} strokeWidth={1.75} className="text-brand" aria-hidden />;
    label = "Balanced";
    tone = "bg-brand-50 border-brand-100";
  } else if (a.status === "progress") {
    icon = <CircleDashed size={14} strokeWidth={1.75} className="text-sea" aria-hidden />;
    label = a.outstanding !== null && a.outstanding > 0 ? `${a.outstanding} to capture` : "In progress";
    tone = "bg-sea-100/60 border-sea-100";
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[12px] font-semibold text-ink-800 ${tone}`}
    >
      {icon}
      {label}
    </span>
  );
}
