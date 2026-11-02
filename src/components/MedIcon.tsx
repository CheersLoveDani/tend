import { COLORS } from "../lib/meds";

interface Props {
  icon: string;
  color: string;
  size?: number;
  /** Drawn without the soft round backdrop (for pickers). */
  bare?: boolean;
}

const OUTLINE = "color-mix(in srgb, var(--bark) 55%, transparent)";

/** A medication drawn as its shape, in its colour. Shapes sit in a 24×24 box. */
export function MedIcon({ icon, color, size = 40, bare }: Props) {
  const [a, b] = COLORS[color] ?? COLORS.white;
  const line = { stroke: OUTLINE, strokeWidth: 1.1, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  const shape = (() => {
    switch (icon) {
      case "oval":
        return (
          <g transform="rotate(-30 12 12)">
            <ellipse cx="12" cy="12" rx="8.5" ry="5.2" fill={a} {...line} />
            <path d="M12 7.6v8.8" {...line} fill="none" />
          </g>
        );
      case "capsule":
        return (
          <g transform="rotate(-40 12 12)">
            <path d="M12 7.5H8a4.5 4.5 0 0 0 0 9h4Z" fill={a} {...line} />
            <path d="M12 7.5h4a4.5 4.5 0 0 1 0 9h-4Z" fill={b} {...line} />
          </g>
        );
      case "split":
        return (
          <g>
            <path d="M12 4a8 8 0 0 0 0 16Z" fill={a} {...line} />
            <path d="M12 4a8 8 0 0 1 0 16Z" fill={b} {...line} />
          </g>
        );
      case "drop":
        return <path d="M12 3.5c3.6 4.6 5.8 7.8 5.8 10.6a5.8 5.8 0 0 1-11.6 0c0-2.8 2.2-6 5.8-10.6Z" fill={a} {...line} />;
      case "bottle":
        return (
          <g>
            <rect x="9" y="3.5" width="6" height="3" rx="1" fill={b} {...line} />
            <path d="M8.5 6.5h7v2l1.5 2V19a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19v-8.5l1.5-2Z" fill={a} {...line} />
            <path d="M7 13h10" {...line} fill="none" />
          </g>
        );
      case "syringe":
        return (
          <g transform="rotate(45 12 12)">
            <rect x="9" y="6" width="6" height="11" rx="1" fill={a} {...line} />
            <path d="M9 9.5h3M9 12h3M9 14.5h3" {...line} fill="none" />
            <path d="M12 17v4.5M10 3.5h4M12 3.5V6" {...line} fill="none" />
            <rect x="9.6" y="6" width="4.8" height="2" fill={b} stroke="none" />
          </g>
        );
      case "inhaler":
        return (
          <g>
            <rect x="9" y="3.5" width="5.5" height="11" rx="2" fill={b} {...line} />
            <path d="M7.5 13.5h7.5a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H9.5a2 2 0 0 1-2-2Z" fill={a} {...line} />
            <path d="M17 16.5h2.5v3H17" fill={a} {...line} />
          </g>
        );
      case "spray":
        return (
          <g>
            <path d="M10.5 3.5h3l.5 4h-4Z" fill={b} {...line} />
            <rect x="8.5" y="7.5" width="7" height="2.5" rx="1" fill={b} {...line} />
            <rect x="7.5" y="10" width="9" height="10.5" rx="2.5" fill={a} {...line} />
          </g>
        );
      case "patch":
        return (
          <g>
            <rect x="4.5" y="4.5" width="15" height="15" rx="4" fill={a} {...line} />
            <rect x="8.5" y="8.5" width="7" height="7" rx="1.5" fill={b} {...line} />
          </g>
        );
      case "sachet":
        return (
          <g>
            <path d="M5.5 5 7 4l1.5 1L10 4l1.5 1L13 4l1.5 1L16 4l1.5 1L19 4v16l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1L7 20l-1.5-1Z" fill={a} {...line} />
            <path d="M9 10h6M9 13h4" {...line} fill="none" />
          </g>
        );
      case "tube":
        return (
          <g transform="rotate(-35 12 12)">
            <path d="M7 5.5h10l-1.5 11h-7Z" fill={a} {...line} />
            <rect x="9.5" y="16.5" width="5" height="3.5" rx="1" fill={b} {...line} />
          </g>
        );
      case "spoon":
        return (
          <g transform="rotate(-35 12 12)">
            <ellipse cx="12" cy="7.5" rx="4.2" ry="4.8" fill={a} {...line} />
            <path d="M12 12.3v8.2" stroke={b} strokeWidth="2.4" strokeLinecap="round" />
          </g>
        );
      default:
        return (
          <g>
            <circle cx="12" cy="12" r="7.5" fill={a} {...line} />
            <path d="M8.2 12h7.6" {...line} fill="none" />
          </g>
        );
    }
  })();

  return (
    <span
      className={`med-icon ${bare ? "is-bare" : ""}`}
      style={{ width: size, height: size, ["--med-tint" as string]: a }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width={bare ? size : size * 0.72} height={bare ? size : size * 0.72}>
        {shape}
      </svg>
    </span>
  );
}
