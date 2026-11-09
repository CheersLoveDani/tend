import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { addMonths, endOfMonth, format, getDaysInMonth, parseISO, startOfMonth } from "date-fns";
import { useStore } from "../lib/store";
import { Chevron, Close } from "../components/Icons";
import { AutoHeight } from "../components/AutoHeight";
import { WEATHERS, weatherOf, type Weather } from "../lib/weather";
import {
  dailyMoods,
  daysInMonth,
  daysWithin,
  monthlyTrend,
  monthReport,
  monthSummary,
  nearestWeather,
  reasonStats,
  reasonText,
  weekdayPattern,
  weekdaySentence,
  type DayMood,
  type MonthPoint,
  type ReasonStat,
  type WeekdayStat,
} from "../lib/moodStats";

/** Your weather, month by month: a gentle look back at mood check-ins. */
export function MoodInsights({ onClose }: { onClose: () => void }) {
  const { snap, reduceMotion } = useStore();
  const all = useMemo(() => dailyMoods(snap?.entries ?? []), [snap?.entries]);
  const thisMonth = startOfMonth(new Date());
  const [month, setMonth] = useState(thisMonth);
  const [trendSpan, setTrendSpan] = useState<6 | 12>(6);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => sheet.current?.focus(), []);

  const firstMonth = all.length ? startOfMonth(parseISO(all[0].date)) : thisMonth;
  const canBack = month > firstMonth;
  const canForward = month < thisMonth;

  const days = useMemo(() => daysInMonth(all, month), [all, month]);
  const summary = useMemo(() => monthSummary(all, month), [all, month]);
  const report = useMemo(() => monthReport(all, month), [all, month]);
  // Patterns need more than a month of sky: look back three months from the end of this one.
  const patternEnd = format(month.getTime() === thisMonth.getTime() ? new Date() : endOfMonth(month), "yyyy-MM-dd");
  const recent = useMemo(() => daysWithin(all, parseISO(patternEnd), 92), [all, patternEnd]);
  const weekdays = useMemo(() => weekdayPattern(recent), [recent]);
  const monthReasons = useMemo(() => reasonStats(days, 2), [days]);
  const longReasons = useMemo(() => reasonStats(recent, 3), [recent]);
  const trend = useMemo(() => monthlyTrend(all, month, trendSpan), [all, month, trendSpan]);

  const monthLabel = format(month, "MMMM yyyy");
  const empty = days.length === 0;
  const common = weatherOf(summary.mostCommon);

  return (
    <motion.div className="sheet-scrim mi-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        ref={sheet}
        className="sheet mi-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Your weather"
        tabIndex={-1}
        initial={reduceMotion ? { opacity: 0 } : { y: "100%" }}
        animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { y: "100%" }}
        transition={reduceMotion ? { duration: 0.15 } : { type: "spring", stiffness: 330, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <div className="sheet-head mi-head">
          <div>
            <p className="view-kicker">Mood over time</p>
            <h2>Your weather</h2>
          </div>
          <button className="btn btn-quiet btn-icon" onClick={onClose} aria-label="Close">
            <Close size={18} />
          </button>
        </div>

        <div className="mi-switch" role="group" aria-label="Month">
          <button className="btn btn-quiet btn-icon" onClick={() => setMonth(addMonths(month, -1))} disabled={!canBack} aria-label="Previous month">
            <Chevron size={18} className="mi-flip" />
          </button>
          <span className="mi-month" aria-live="polite">
            {monthLabel}
          </span>
          <button className="btn btn-quiet btn-icon" onClick={() => setMonth(addMonths(month, 1))} disabled={!canForward} aria-label="Next month">
            <Chevron size={18} />
          </button>
        </div>

        <div className="sheet-body mi-body">
          {/* ---- hero ---- */}
          <section className="mi-hero" aria-label={`${monthLabel} at a glance`}>
            <div className="mi-tile">
              <strong>{summary.days}</strong>
              <span>
                {summary.days === 1 ? "check-in" : "check-ins"} in {summary.monthName}
              </span>
            </div>
            <div className="mi-tile">
              <strong className="mi-tile-icon" aria-hidden="true">
                {common?.icon ?? "🌱"}
              </strong>
              <span>{common ? `Mostly ${common.label.toLowerCase()}` : "No weather logged yet"}</span>
            </div>
            <p className="mi-compare">
              {summary.comparison
                ? `${summary.comparison}.`
                : empty
                  ? "Check in a few times and your weather map fills in here."
                  : summary.previous.days < 3
                    ? `Not enough from ${summary.previous.monthName} to compare. That's fine.`
                    : "A few more check-ins and we can compare months."}
            </p>
          </section>

          {/* ---- daily line ---- */}
          <section className="mi-section">
            <h3 className="section-title">Day by day</h3>
            {empty ? (
              <Empty>Check in a few times and your weather map fills in here. Rain and sun both count.</Empty>
            ) : (
              <MonthLine key={summary.month} month={month} days={days} reduceMotion={reduceMotion} />
            )}
          </section>

          {/* ---- calendar ---- */}
          <section className="mi-section">
            <h3 className="section-title">The month's sky</h3>
            <CalendarGrid key={summary.month} month={month} days={days} reduceMotion={reduceMotion} />
          </section>

          {/* ---- distribution ---- */}
          {!empty && (
            <section className="mi-section">
              <h3 className="section-title">How the weather spread</h3>
              <Distribution key={summary.month} dist={summary.distribution} total={summary.days} reduceMotion={reduceMotion} />
            </section>
          )}

          {/* ---- reasons ---- */}
          <section className="mi-section">
            <h3 className="section-title">What was going on</h3>
            <Reasons month={monthReasons} longer={longReasons} empty={empty} />
          </section>

          {/* ---- weekdays ---- */}
          <section className="mi-section">
            <h3 className="section-title">Across the week</h3>
            {weekdays ? (
              <>
                <WeekdayDots stats={weekdays} reduceMotion={reduceMotion} />
                <p className="hint">{weekdaySentence(weekdays) ?? "No weekday stands out much. Your weather comes and goes on its own schedule."} From the last three months.</p>
              </>
            ) : (
              <Empty>After a couple of weeks of check-ins, you'll see whether some days of the week tend to be sunnier.</Empty>
            )}
          </section>

          {/* ---- trend ---- */}
          <section className="mi-section">
            <div className="mi-section-head">
              <h3 className="section-title">Season by season</h3>
              <div className="chips mi-span" role="group" aria-label="How far back">
                {([6, 12] as const).map((n) => (
                  <button key={n} className={`chip ${trendSpan === n ? "is-on" : ""}`} aria-pressed={trendSpan === n} onClick={() => setTrendSpan(n)}>
                    {n} months
                  </button>
                ))}
              </div>
            </div>
            {trend.filter((p) => p.average !== null).length >= 2 ? (
              <TrendChart key={`${summary.month}-${trendSpan}`} points={trend} reduceMotion={reduceMotion} />
            ) : (
              <Empty>Once you've checked in across a couple of months, the longer view shows how the seasons have felt.</Empty>
            )}
          </section>

          {/* ---- report ---- */}
          <section className="mi-section">
            <div className="mi-report">
              <h3>Month in a sentence or six</h3>
              {report.length ? (
                <ul>
                  {report.map((s, i) => (
                    <motion.li
                      key={`${summary.month}-${i}`}
                      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: reduceMotion ? 0 : 0.15 + i * 0.08, duration: 0.35 }}
                    >
                      {s}
                    </motion.li>
                  ))}
                </ul>
              ) : (
                <p className="mi-report-empty">Nothing to say about {summary.monthName} yet, and that's okay. A single check-in starts the story.</p>
              )}
            </div>
          </section>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---- bits ------------------------------------------------------------------------------------------

function Empty({ children }: { children: ReactNode }) {
  return <p className="mi-empty">{children}</p>;
}

function useWidth<T extends HTMLElement>(fallback = 320) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth || fallback);
    const ro = new ResizeObserver(() => setW(el.clientWidth || fallback));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const dayNum = (d: DayMood) => Number(d.date.slice(8, 10));
const reasonsLine = (d: DayMood) => (d.reasons.length ? d.reasons.map(reasonText).join(", ") : "");
const describeDay = (d: DayMood) => {
  const w = weatherOf(d.value)!;
  const r = reasonsLine(d);
  return `${format(parseISO(d.date), "EEEE d MMMM")}: ${w.label}${r ? `. ${r}` : ""}`;
};

/** 1–5 → y within a plot of [top, bottom]. */
const yOf = (v: number, top: number, bottom: number) => top + ((5 - v) / 4) * (bottom - top);

/** Splits points into runs, breaking where more than [maxGap] steps separate neighbours. */
function runs<T>(items: T[], pos: (t: T) => number, maxGap: number): T[][] {
  const out: T[][] = [];
  for (const it of items) {
    const cur = out[out.length - 1];
    if (cur && pos(it) - pos(cur[cur.length - 1]) <= maxGap) cur.push(it);
    else out.push([it]);
  }
  return out;
}

const linePath = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");
const areaPath = (pts: { x: number; y: number }[], base: number) =>
  pts.length < 2 ? "" : `${linePath(pts)}L${pts[pts.length - 1].x.toFixed(1)},${base}L${pts[0].x.toFixed(1)},${base}Z`;

// ---- month line ------------------------------------------------------------------------------------

function MonthLine({ month, days, reduceMotion }: { month: Date; days: DayMood[]; reduceMotion: boolean }) {
  const [wrap, W] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const n = getDaysInMonth(month);
  const H = 210;
  const padL = 30;
  const padR = 12;
  const top = 14;
  const bottom = H - 26;
  const x = (day: number) => padL + ((day - 1) / Math.max(1, n - 1)) * (W - padL - padR);
  const pts = days.map((d) => ({ d, day: dayNum(d), x: x(dayNum(d)), y: yOf(d.value, top, bottom) }));
  // One missing day still joins up; longer quiet stretches leave a gap rather than inventing a line.
  const segs = runs(pts, (p) => p.day, 2);
  const ticks = [1, 8, 15, 22, n];
  const cur = active === null ? null : pts[active];

  const pick = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = e.clientX - box.left;
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].x - px) < Math.abs(pts[best].x - px)) best = i;
    setActive(best);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const step = e.key === "ArrowRight" ? 1 : -1;
      setActive((a) => (a === null ? (step > 0 ? 0 : pts.length - 1) : Math.min(pts.length - 1, Math.max(0, a + step))));
    } else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(pts.length - 1);
    else if (e.key === "Escape" && active !== null) {
      e.stopPropagation();
      setActive(null);
    }
  };

  const tipLeft = cur ? Math.min(Math.max(cur.x, 80), W - 80) : 0;
  const tipBelow = cur ? cur.y < 80 : false;

  return (
    <div className="mi-chart mi-line" ref={wrap}>
      <div
        className="mi-plot"
        tabIndex={0}
        role="group"
        aria-label={`Daily weather for ${format(month, "MMMM yyyy")}. Use the arrow keys to step through days.`}
        onKeyDown={onKey}
        onFocus={() => active === null && setActive(pts.length - 1)}
        onBlur={() => setActive(null)}
      >
        <svg width={W} height={H} aria-hidden="true">
          {WEATHERS.map((w) => (
            <g key={w.value}>
              <line className="mi-grid" x1={padL} x2={W - padR} y1={yOf(w.value, top, bottom)} y2={yOf(w.value, top, bottom)} />
              <text className="mi-ylabel" x={padL - 8} y={yOf(w.value, top, bottom)} textAnchor="end" dominantBaseline="central">
                {w.icon}
              </text>
            </g>
          ))}
          {ticks.map((t) => (
            <text key={t} className="mi-xlabel" x={x(t)} y={H - 6} textAnchor="middle">
              {t}
            </text>
          ))}
          {cur && <line className="mi-cross" x1={cur.x} x2={cur.x} y1={top - 6} y2={bottom} />}
          {segs.map((s, i) => (
            <g key={i}>
              {s.length > 1 && (
                <>
                  <motion.path
                    className="mi-area"
                    d={areaPath(s, bottom)}
                    initial={reduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: reduceMotion ? 0 : 0.6, duration: 0.6 }}
                  />
                  <motion.path
                    className="mi-path"
                    d={linePath(s)}
                    initial={reduceMotion ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: reduceMotion ? 0 : 0.9, ease: "easeInOut", delay: reduceMotion ? 0 : (s[0].day / n) * 0.5 }}
                  />
                </>
              )}
            </g>
          ))}
          {pts.map((p, i) => (
            <motion.circle
              key={p.d.date}
              className={`mi-dot mi-fill-${p.d.value}`}
              cx={p.x}
              cy={p.y}
              initial={reduceMotion ? false : { r: 0 }}
              animate={{ r: active === i ? 7 : 5 }}
              transition={{ delay: reduceMotion || active !== null ? 0 : 0.2 + (p.day / n) * 0.8, type: "spring", stiffness: 300, damping: 20 }}
            />
          ))}
          <rect
            className="mi-hit"
            x={padL - 10}
            y={0}
            width={W - padL - padR + 20}
            height={H}
            onPointerMove={pick}
            onPointerDown={pick}
            onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
          />
        </svg>
        <AnimatePresence>
          {cur && (
            <motion.div
              key="tip"
              className={`mi-tip ${tipBelow ? "is-below" : ""}`}
              style={{ left: tipLeft, top: tipBelow ? cur.y + 16 : cur.y - 14 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.12 }}
            >
              <Tip d={cur.d} />
            </motion.div>
          )}
        </AnimatePresence>
        <p className="sr-only" aria-live="polite">
          {cur ? describeDay(cur.d) : ""}
        </p>
      </div>
      <table className="sr-only">
        <caption>Daily weather, {format(month, "MMMM yyyy")}</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Weather</th>
            <th scope="col">Why</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <th scope="row">{format(parseISO(d.date), "EEEE d MMMM")}</th>
              <td>{weatherOf(d.value)!.label}</td>
              <td>{reasonsLine(d) || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tip({ d }: { d: DayMood }) {
  const w = weatherOf(d.value)!;
  return (
    <>
      <span className="mi-tip-date">{format(parseISO(d.date), "EEE d MMM")}</span>
      <strong className="mi-tip-value">
        <span aria-hidden="true">{w.icon}</span> {w.label}
      </strong>
      {d.reasons.length > 0 && <span className="mi-tip-reasons">{d.reasons.map(reasonText).join(" · ")}</span>}
    </>
  );
}

// ---- calendar --------------------------------------------------------------------------------------

function CalendarGrid({ month, days, reduceMotion }: { month: Date; days: DayMood[]; reduceMotion: boolean }) {
  const byDay = new Map(days.map((d) => [dayNum(d), d]));
  const n = getDaysInMonth(month);
  const pad = (month.getDay() + 6) % 7;
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const [picked, setPicked] = useState<number | null>(null);
  const pickedDate = picked === null ? null : new Date(month.getFullYear(), month.getMonth(), picked);
  const pickedMood = picked === null ? null : (byDay.get(picked) ?? null);

  return (
    <div className="mi-cal-wrap">
      <div className="mi-cal" role="group" aria-label={`Calendar for ${format(month, "MMMM yyyy")}`}>
        {["M", "T", "W", "T", "F", "S", "S"].map((l, i) => (
          <span key={i} className="mi-cal-head" aria-hidden="true">
            {l}
          </span>
        ))}
        {Array.from({ length: pad }, (_, i) => (
          <span key={`p${i}`} aria-hidden="true" />
        ))}
        {Array.from({ length: n }, (_, i) => {
          const day = i + 1;
          const date = new Date(month.getFullYear(), month.getMonth(), day);
          const key = format(date, "yyyy-MM-dd");
          const d = byDay.get(day);
          const future = key > todayKey;
          const w = d ? weatherOf(d.value) : null;
          return (
            <button
              key={day}
              className={`mi-cal-day ${d ? `has-mood mi-tint-${d.value}` : ""} ${key === todayKey ? "is-today" : ""} ${picked === day ? "is-picked" : ""}`}
              disabled={future}
              aria-pressed={picked === day}
              aria-label={d ? describeDay(d) : `${format(date, "EEEE d MMMM")}: no check-in`}
              onClick={() => setPicked(picked === day ? null : day)}
            >
              <span className="mi-cal-num">{day}</span>
              <span className="mi-cal-icon" aria-hidden="true">
                {w ? w.icon : "·"}
              </span>
            </button>
          );
        })}
      </div>
      <AutoHeight reduceMotion={reduceMotion}>
        <AnimatePresence mode="wait" initial={false}>
          {pickedDate && (
            <motion.div
              key={picked}
              className="mi-cal-detail"
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
            >
              <p className="mi-cal-detail-date">{format(pickedDate, "EEEE d MMMM")}</p>
              {pickedMood ? (
                <>
                  <p className="mi-cal-detail-weather">
                    <span aria-hidden="true">{weatherOf(pickedMood.value)!.icon}</span> {weatherOf(pickedMood.value)!.label}
                    <span className="mi-cal-detail-time"> · checked in {format(new Date(pickedMood.at), "h:mmaaa")}</span>
                  </p>
                  {pickedMood.reasons.length > 0 && (
                    <div className="chips">
                      {pickedMood.reasons.map((r) => (
                        <span key={r.label} className="chip mi-reason-chip">
                          {reasonText(r)}
                        </span>
                      ))}
                    </div>
                  )}
                  {pickedMood.note && <p className="mi-cal-detail-note">{pickedMood.note}</p>}
                </>
              ) : (
                <p className="hint">No check-in this day. Quiet days are part of the weather too.</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </AutoHeight>
    </div>
  );
}

// ---- distribution ----------------------------------------------------------------------------------

function Distribution({ dist, total, reduceMotion }: { dist: Record<Weather, number>; total: number; reduceMotion: boolean }) {
  const max = Math.max(1, ...WEATHERS.map((w) => dist[w.value]));
  return (
    <ul className="mi-dist" aria-label="Days of each weather">
      {WEATHERS.map((w, i) => {
        const c = dist[w.value];
        return (
          <li key={w.value} className="mi-dist-row" title={`${w.label}: ${c} of ${total} days`}>
            <span className="mi-dist-label">
              <span aria-hidden="true">{w.icon}</span> {w.label}
            </span>
            <span className="mi-dist-track">
              {c > 0 && (
                <motion.span
                  className={`mi-dist-bar mi-bg-${w.value}`}
                  initial={reduceMotion ? false : { width: 0 }}
                  animate={{ width: `${(c / max) * 100}%` }}
                  transition={{ delay: reduceMotion ? 0 : i * 0.06, type: "spring", stiffness: 120, damping: 20 }}
                />
              )}
              <span className="mi-dist-count">
                {c} <span className="sr-only">{c === 1 ? "day" : "days"}</span>
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ---- weekdays --------------------------------------------------------------------------------------

function WeekdayDots({ stats, reduceMotion }: { stats: WeekdayStat[]; reduceMotion: boolean }) {
  return (
    <div className="mi-week" role="list" aria-label="Usual weather by day of the week">
      {stats.map((s, i) => {
        const w = s.average === null ? null : nearestWeather(s.average);
        const label = w ? `${s.name}s: usually ${w.label.toLowerCase()}, from ${s.count} check-ins` : `${s.name}s: not enough check-ins yet`;
        return (
          <div key={s.index} className="mi-week-col" role="listitem" aria-label={label} title={label}>
            <span className="mi-week-track">
              {s.average !== null && (
                <motion.span
                  className={`mi-week-dot mi-bg-${w!.value}`}
                  style={{ top: `${((5 - s.average) / 4) * 100}%` }}
                  initial={reduceMotion ? false : { scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: reduceMotion ? 0 : i * 0.05, type: "spring", stiffness: 300, damping: 18 }}
                />
              )}
            </span>
            <span className="mi-week-icon" aria-hidden="true">
              {w ? w.icon : "–"}
            </span>
            <span className="mi-week-day" aria-hidden="true">
              {s.short}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---- reasons ---------------------------------------------------------------------------------------

function Reasons({ month, longer, empty }: { month: ReturnType<typeof reasonStats>; longer: ReturnType<typeof reasonStats>; empty: boolean }) {
  if (!month.top.length && !longer.top.length) {
    return (
      <Empty>
        {empty
          ? "When you check in, you can add a why, like 😴 Sleep or 💼 Work. Patterns show up here over time."
          : "Add a why when you check in, like 😴 Sleep or 💼 Work, and you'll start to see what tends to come with each kind of weather."}
      </Empty>
    );
  }
  const side = (title: string, list: ReasonStat[], none: string) => (
    <div className="mi-side">
      <h4>{title}</h4>
      {list.length ? (
        <ul>
          {list.slice(0, 5).map((s) => {
            const w = nearestWeather(s.average);
            return (
              <li key={s.reason.label}>
                <span className="mi-side-name">{reasonText(s.reason)}</span>
                <span className="mi-side-meta">
                  usually <span aria-hidden="true">{w.icon}</span> {w.label.toLowerCase()} · {s.count} days
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="hint">{none}</p>
      )}
    </div>
  );
  return (
    <div className="mi-reasons">
      {month.top.length > 0 ? (
        <ul className="mi-top" aria-label="Most common reasons this month">
          {month.top.slice(0, 8).map((s) => (
            <li key={s.reason.label} className="mi-top-chip">
              <span>{reasonText(s.reason)}</span>
              <strong>{s.count}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">No reasons noted this month.</p>
      )}
      <div className="mi-sides">
        {side("On brighter days", longer.brightens, "Nothing stands out yet. It takes a few check-ins with the same reason.")}
        {side("On cloudier days", longer.cloudsOver, "Nothing stands out yet. It takes a few check-ins with the same reason.")}
      </div>
      <p className="hint">From the last three months. These are patterns, not causes. Just things that tend to come along with the weather.</p>
    </div>
  );
}

// ---- trend -----------------------------------------------------------------------------------------

function TrendChart({ points, reduceMotion }: { points: MonthPoint[]; reduceMotion: boolean }) {
  const [wrap, W] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const H = 150;
  const padL = 30;
  const padR = 14;
  const top = 12;
  const bottom = H - 24;
  const step = (W - padL - padR) / Math.max(1, points.length - 1);
  const x = (i: number) => padL + i * step;
  const pts = points.map((p, i) => ({ p, i, x: x(i), y: p.average === null ? 0 : yOf(p.average, top, bottom) })).filter((q) => q.p.average !== null);
  // A month without check-ins leaves a gap.
  const segs = runs(pts, (q) => q.i, 1);
  const cur = active === null ? null : pts.find((q) => q.i === active) ?? null;
  const tipLeft = cur ? Math.min(Math.max(cur.x, 80), W - 80) : 0;

  return (
    <div className="mi-chart" ref={wrap}>
      <div className="mi-plot">
        <svg width={W} height={H} role="img" aria-label="Usual weather each month">
          {WEATHERS.map((w) => (
            <g key={w.value} aria-hidden="true">
              <line className="mi-grid" x1={padL} x2={W - padR} y1={yOf(w.value, top, bottom)} y2={yOf(w.value, top, bottom)} />
              <text className="mi-ylabel is-small" x={padL - 8} y={yOf(w.value, top, bottom)} textAnchor="end" dominantBaseline="central">
                {w.icon}
              </text>
            </g>
          ))}
          {points.map((p, i) => (
            <text key={p.month} className="mi-xlabel" x={x(i)} y={H - 6} textAnchor="middle" aria-hidden="true">
              {points.length > 8 && i % 2 === 1 && W < 420 ? "" : p.short}
            </text>
          ))}
          {cur && <line className="mi-cross" x1={cur.x} x2={cur.x} y1={top - 6} y2={bottom} />}
          {segs.map(
            (s, i) =>
              s.length > 1 && (
                <motion.path
                  key={i}
                  className="mi-path"
                  d={linePath(s)}
                  initial={reduceMotion ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: reduceMotion ? 0 : 0.8, ease: "easeInOut" }}
                />
              ),
          )}
          {pts.map((q) => (
            <motion.circle
              key={q.p.month}
              className={`mi-dot mi-fill-${nearestWeather(q.p.average!).value}`}
              cx={q.x}
              cy={q.y}
              initial={reduceMotion ? false : { r: 0 }}
              animate={{ r: active === q.i ? 6.5 : 4.5 }}
              transition={{ delay: reduceMotion || active !== null ? 0 : 0.15 + q.i * 0.05, type: "spring", stiffness: 300, damping: 20 }}
            />
          ))}
          {points.map((p, i) => (
            <rect
              key={p.month}
              className="mi-hit"
              x={x(i) - step / 2}
              y={0}
              width={step}
              height={H}
              onPointerEnter={() => setActive(i)}
              onPointerDown={() => setActive(i)}
              onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
            />
          ))}
        </svg>
        <AnimatePresence>
          {cur && (
            <motion.div
              key="tip"
              className={`mi-tip ${cur.y < 70 ? "is-below" : ""}`}
              style={{ left: tipLeft, top: cur.y < 70 ? cur.y + 14 : cur.y - 12 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.12 }}
            >
              <span className="mi-tip-date">{cur.p.long}</span>
              <strong className="mi-tip-value">
                <span aria-hidden="true">{nearestWeather(cur.p.average!).icon}</span> Usually {nearestWeather(cur.p.average!).label.toLowerCase()}
              </strong>
              <span className="mi-tip-reasons">
                {cur.p.count} {cur.p.count === 1 ? "check-in" : "check-ins"}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <ul className="sr-only">
        {points.map((p) => (
          <li key={p.month}>
            {p.long}: {p.average === null ? "no check-ins" : `usually ${nearestWeather(p.average).label.toLowerCase()}, ${p.count} check-ins`}
          </li>
        ))}
      </ul>
    </div>
  );
}
