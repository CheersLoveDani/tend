import { lookOf, type MedLook } from "../lib/medLook";
import { MedArt } from "./MedArt";

interface Props {
  icon: string;
  color: string;
  look?: MedLook | null;
  size?: number;
  /** Drawn without the soft round backdrop (for pickers). */
  bare?: boolean;
}

/** A medication drawn as it really looks, on a soft tinted circle. */
export function MedIcon({ icon, color, look, size = 40, bare }: Props) {
  const l = lookOf({ icon, color, look });
  const tint = l.kind === "drops" ? l.colors[2] : l.colors[0];
  return (
    <span className={`med-icon ${bare ? "is-bare" : ""}`} style={{ width: size, height: size, ["--med-tint" as string]: tint }} aria-hidden>
      <MedArt look={l} size={bare ? size : size * 0.84} />
    </span>
  );
}
