import { Fmt } from "./types";

export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
export const fmtMoney = (n: number, dp = 0) =>
  (n < 0 ? "−$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export function fmtValue(n: number | undefined | null, f: Fmt): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (f === "int") return fmtInt(n);
  if (f === "money") return fmtMoney(n, n < 100 ? 2 : 0);
  if (f === "pct") return `${Math.round(n)}%`;
  return `${n.toFixed(2)}%`;
}

export const fmtDelta = (d?: number) => (d == null ? "" : `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(Math.round(d))}%`);

export function fmtClock(ms: number) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function fmtDateTime(ms: number, nowMs: number) {
  const d = new Date(ms);
  const n = new Date(nowMs);
  const sameDay = d.toDateString() === n.toDateString();
  if (sameDay) return `Today ${fmtClock(ms)}`;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${fmtClock(ms)}`;
}

export function fmtAgo(ms: number, nowMs: number) {
  const m = Math.max(0, Math.round((nowMs - ms) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function fmtDuration(min: number | null | undefined) {
  if (min == null) return "—";
  if (min < 1) return "< 1 min";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}
