import { useStore } from "../lib/store";
import type { MedView } from "../lib/api";
import { MedIcon } from "./MedIcon";

interface Props {
  /** Opens the medication, where "Got a new pack" lives. */
  onOpenMed: (id: string) => void;
}

const runsOut = (m: MedView) =>
  m.daysLeft == null || m.schedule.kind === "asNeeded"
    ? `${m.name} is running low`
    : m.daysLeft <= 0
      ? `${m.name} runs out today`
      : `${m.name} runs out in ~${m.daysLeft} ${m.daysLeft === 1 ? "day" : "days"}`;

/** One calm line when a medication is running low. Renders nothing otherwise. */
export function LowStockLine({ onOpenMed }: Props) {
  const { snap } = useStore();
  const low = (snap?.meds ?? []).filter((m) => m.low && !m.paused).sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));
  if (low.length === 0) return null;
  const first = low[0];
  const text = low.length === 1 ? runsOut(first) : `${runsOut(first)}, and ${low.length - 1} more ${low.length === 2 ? "is" : "are"} low`;
  return (
    <button className="low-stock" onClick={() => onOpenMed(first.id)}>
      <MedIcon icon={first.icon} color={first.color} size={24} />
      <span className="low-stock-text">{text}</span>
      <span className="low-stock-action">Add stock</span>
    </button>
  );
}
