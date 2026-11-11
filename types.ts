export type Severity = "critical" | "warning" | "info";
export type RuleId = "data_health" | "delivery" | "pacing" | "ctr" | "cpa" | "zero_conv";
export type Status = "open" | "acknowledged" | "investigating" | "resolved" | "dismissed";
export type InjectionKind = "delivery" | "overspend" | "ctr" | "cpa" | "zero_conv" | "data_outage";

export interface Metrics {
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
}

export interface DayRow extends Metrics {
  date: string; // e.g. "Nov 3"
  weekday: number;
}

export interface Campaign {
  id: string;
  name: string;
  objective: "Conversions" | "Awareness";
  dailyBudget: number;
  targetCPA: number;
  tracking: boolean;
  historyDays: number;
  todayWeekday: number;
  daily: DayRow[]; // most recent first
  todayBase: Metrics[]; // completed hours 0..NOW_HOUR-1, before injections
  today: Metrics[]; // after injections
  feedLagHours: number;
  injections: Partial<Record<InjectionKind, number>>;
}

export interface Rules {
  lowConfidenceDays: number;
  delivery: { warnDropPct: number; windowHours: number };
  pacing: { warnDevPct: number; critOverPct: number; critMinAbs: number };
  ctr: { warnPct: number; critPct: number; minImpr: number };
  cpa: { warnPct: number; critPct: number; minConv: number };
  zeroConv: { warnMultiple: number; critMultiple: number };
  dataHealth: { staleHours: number; critStaleHours: number };
}

export interface Check {
  label: string;
  ok: boolean;
}

export type Fmt = "int" | "money" | "pct" | "pct2";

export interface ScoreBreakdown {
  magnitude: number;
  confidence: number;
  exposure: number;
  total: number;
  downgraded?: boolean;
}

export interface RuleResult {
  ruleId: RuleId;
  ruleName: string;
  status: "passed" | "triggered" | "skipped" | "suppressed";
  severity?: Severity;
  reason: string;
  metric: string;
  fmt: Fmt;
  current?: number;
  baseline?: number;
  deltaPct?: number;
  checks: Check[];
  spendAtRisk: number;
  score?: ScoreBreakdown;
  summary: string;
  threshold: string;
}

export interface LogEntry {
  at: number;
  text: string;
}

export interface Incident {
  id: string;
  campaignId: string;
  campaignName: string;
  ruleId: RuleId;
  ruleName: string;
  severity: Severity;
  status: Status;
  detectedAt: number;
  lastSeenAt: number;
  occurrences: number;
  escalated: boolean;
  recovered: boolean;
  result: RuleResult;
  log: LogEntry[];
  ackAt?: number;
  resolvedAt?: number;
  dismissReason?: string;
  routing: string;
  digestSent: boolean;
}

export interface Notification {
  id: string;
  kind: "immediate" | "escalation" | "digest" | "data_health";
  at: number;
  subject: string;
  incidentIds: string[];
  lines: string[];
}

export interface HistoryIncident {
  rule: string;
  severity: Severity;
  detectedAt: number;
  ackAt?: number;
  resolvedAt?: number;
  dismissed: boolean;
  detectDelayMin: number;
}

export interface ToastItem {
  tone: Severity | "ok" | "muted";
  text: string;
}

export interface State {
  version: number;
  createdAt: number; // real ms at creation
  simBase: number; // simulated ms at creation
  seq: number;
  campaigns: Campaign[];
  rules: Rules;
  incidents: Incident[];
  notifications: Notification[];
  history: HistoryIncident[];
  lastInjection?: { campaignId: string; kind: InjectionKind };
  toast?: { id: number; items: ToastItem[] };
}
