import { Campaign, DayRow, HistoryIncident, Metrics, Rules, Severity } from "./types";

export const NOW_HOUR = 14; // completed hours: 0..13, simulated clock reads 14:05

// Relative hourly traffic curve for a D2C brand (sums to 1 after normalising)
const W = [0.6, 0.4, 0.3, 0.25, 0.3, 0.6, 1.2, 2.2, 3.4, 4.6, 5.4, 5.8, 6.2, 6.0, 5.6, 5.4, 5.5, 5.9, 6.6, 7.2, 6.8, 5.4, 3.6, 2.0];
const WSUM = W.reduce((a, b) => a + b, 0);
export const SHARE = W.map((w) => w / WSUM);
export const cumShare = (h: number) => SHARE.slice(0, h).reduce((a, b) => a + b, 0);

// Weekday multipliers on traffic (Sun..Sat)
const WD = [1.08, 0.95, 0.97, 1.0, 1.02, 1.04, 1.1];

export const DEFAULT_RULES: Rules = {
  lowConfidenceDays: 7,
  delivery: { warnDropPct: 50, windowHours: 2 },
  pacing: { warnDevPct: 20, critOverPct: 40, critMinAbs: 100 },
  ctr: { warnPct: 25, critPct: 40, minImpr: 1000 },
  cpa: { warnPct: 30, critPct: 60, minConv: 10 },
  zeroConv: { warnMultiple: 2, critMultiple: 5 },
  dataHealth: { staleHours: 2, critStaleHours: 6 },
};

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Spec {
  id: string;
  name: string;
  objective: "Conversions" | "Awareness";
  dailyBudget: number;
  targetCPA: number;
  tracking: boolean;
  historyDays: number;
  impressions: number; // per day
  ctr: number; // fraction
  cvr: number; // fraction
  ctrFactorToday?: number; // seeded mild drift
  convFactorToday?: number;
}

const SPECS: Spec[] = [
  { id: "c1", name: "Coffee Subscription Retargeting", objective: "Conversions", dailyBudget: 1600, targetCPA: 22, tracking: true, historyDays: 28, impressions: 160000, ctr: 0.012, cvr: 0.0417, convFactorToday: 1.03 },
  { id: "c2", name: "New Arrivals Prospecting", objective: "Conversions", dailyBudget: 1140, targetCPA: 28, tracking: true, historyDays: 28, impressions: 260000, ctr: 0.0075, cvr: 0.026 },
  { id: "c3", name: "Brewing Gear Search", objective: "Conversions", dailyBudget: 680, targetCPA: 18, tracking: true, historyDays: 28, impressions: 45000, ctr: 0.035, cvr: 0.03, ctrFactorToday: 0.84 },
  { id: "c4", name: "Festive Gift Bundle", objective: "Conversions", dailyBudget: 600, targetCPA: 25, tracking: true, historyDays: 3, impressions: 90000, ctr: 0.01, cvr: 0.03 },
  { id: "c5", name: "Cold Brew Launch", objective: "Conversions", dailyBudget: 17, targetCPA: 12, tracking: true, historyDays: 28, impressions: 900, ctr: 0.015, cvr: 0.15 },
  { id: "c6", name: "Brand Awareness Video", objective: "Awareness", dailyBudget: 480, targetCPA: 0, tracking: false, historyDays: 28, impressions: 400000, ctr: 0.003, cvr: 0 },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function buildCampaigns(simBase: number): Campaign[] {
  const today = new Date(simBase);
  const todayWd = today.getDay();
  return SPECS.map((s, idx) => {
    const r = rng(1000 + idx * 97);
    const n = (amp: number) => 1 + (r() * 2 - 1) * amp;
    const daily: DayRow[] = [];
    for (let d = 1; d <= s.historyDays; d++) {
      const dt = new Date(simBase - d * 86400000);
      const wd = dt.getDay();
      const impressions = s.impressions * WD[wd] * n(0.05);
      const clicks = impressions * s.ctr * n(0.04);
      const spend = s.dailyBudget * n(0.03);
      const conversions = s.tracking ? s.impressions * s.ctr * s.cvr * n(0.05) : 0;
      daily.push({ date: `${MONTHS[dt.getMonth()]} ${dt.getDate()}`, weekday: wd, impressions, clicks, spend, conversions });
    }
    const todayBase: Metrics[] = [];
    for (let h = 0; h < NOW_HOUR; h++) {
      const impressions = s.impressions * WD[todayWd] * SHARE[h] * n(0.04);
      const clicks = impressions * s.ctr * (s.ctrFactorToday ?? 1) * n(0.03);
      const spend = s.dailyBudget * SHARE[h] * n(0.03);
      const conversions = s.tracking ? s.impressions * s.ctr * s.cvr * SHARE[h] * (s.convFactorToday ?? 1) * n(0.04) : 0;
      todayBase.push({ impressions, clicks, spend, conversions });
    }
    const c: Campaign = {
      id: s.id,
      name: s.name,
      objective: s.objective,
      dailyBudget: s.dailyBudget,
      targetCPA: s.targetCPA,
      tracking: s.tracking,
      historyDays: s.historyDays,
      todayWeekday: todayWd,
      daily,
      todayBase,
      today: todayBase.map((x) => ({ ...x })),
      feedLagHours: 0,
      injections: {},
    };
    return c;
  });
}

// 14 days of seeded pilot history, used only by the Pilot Metrics page
export function buildHistory(simBase: number): HistoryIncident[] {
  const H = 3600000;
  const M = 60000;
  const day0 = new Date(simBase);
  day0.setHours(0, 0, 0, 0);
  const rows: [number, number, string, Severity, number | null, number | null, boolean, number][] = [
    // daysAgo, hour, rule, severity, ackMin, resolveMin, dismissed, detectDelayMin
    [14, 10, "CPA spike", "warning", 95, 300, false, 55],
    [13, 15, "Delivery", "critical", 22, 80, false, 20],
    [13, 19, "Budget pacing", "warning", 240, 600, false, 60],
    [12, 11, "CTR drop", "warning", 180, null, true, 45],
    [11, 9, "Zero conversions", "critical", 35, 150, false, 40],
    [10, 16, "CPA spike", "critical", 140, 320, false, 50],
    [9, 13, "Budget pacing", "warning", 60, 200, false, 35],
    [8, 20, "Delivery", "warning", 1600, 1900, false, 30],
    [7, 12, "Data health", "warning", 25, 60, false, 15],
    [6, 10, "CTR drop", "warning", 300, 900, false, 70],
    [5, 14, "CPA spike", "warning", 75, 260, false, 50],
    [4, 18, "Delivery", "critical", 18, 55, false, 20],
    [3, 11, "Budget pacing", "warning", 420, null, true, 40],
    [2, 15, "CPA spike", "critical", 45, 190, false, 45],
    [1, 9, "CTR drop", "warning", 130, 480, false, 60],
    [1, 17, "Zero conversions", "warning", 210, 400, false, 55],
  ];
  return rows.map(([da, h, rule, severity, ack, res, dismissed, delay]) => {
    const detectedAt = day0.getTime() - da * 86400000 + h * H;
    return {
      rule,
      severity,
      detectedAt,
      ackAt: ack != null ? detectedAt + ack * M : undefined,
      resolvedAt: res != null ? detectedAt + res * M : undefined,
      dismissed,
      detectDelayMin: delay,
    };
  });
}

export function initialSimBase(): number {
  const d = new Date();
  d.setHours(NOW_HOUR, 5, 0, 0);
  return d.getTime();
}
