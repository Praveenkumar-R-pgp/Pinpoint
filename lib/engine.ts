import { NOW_HOUR, SHARE, cumShare } from "./data";
import {
  RuleId, Campaign, Check, Incident, InjectionKind, Metrics, Notification, RuleResult, Rules,
  ScoreBreakdown, Severity, State, ToastItem,
} from "./types";
import { fmtValue, fmtMoney, fmtClock } from "./format";

export const ZERO = (): Metrics => ({ impressions: 0, clicks: 0, spend: 0, conversions: 0 });
const add = (a: Metrics, b: Metrics): Metrics => ({
  impressions: a.impressions + b.impressions,
  clicks: a.clicks + b.clicks,
  spend: a.spend + b.spend,
  conversions: a.conversions + b.conversions,
});
const scale = (a: Metrics, f: number): Metrics => ({
  impressions: a.impressions * f, clicks: a.clicks * f, spend: a.spend * f, conversions: a.conversions * f,
});
export const sumRows = (rows: Metrics[]) => rows.reduce(add, ZERO());

export const SEV_RANK: Record<Severity, number> = { info: 1, warning: 2, critical: 3 };
export const OPEN_STATUSES = ["open", "acknowledged", "investigating"];
export const isOpen = (i: Incident) => OPEN_STATUSES.includes(i.status);

export const simNow = (s: State, real = Date.now()) => s.simBase + (real - s.createdAt);

// ---------- Baselines ----------
export function baselineInfo(c: Campaign, rules: Rules) {
  const lowConfidence = c.historyDays < rules.lowConfidenceDays;
  let rows = c.daily.filter((d) => d.weekday === c.todayWeekday);
  let basis = `same weekday over the last ${Math.min(28, c.historyDays)} days, ${rows.length} matching days`;
  if (lowConfidence || rows.length === 0) {
    rows = c.daily;
    basis = `all available history, ${rows.length} days`;
  }
  const avg = scale(sumRows(rows), 1 / Math.max(1, rows.length));
  return { avg, lowConfidence, basis, days: rows.length };
}
export const baselineHour = (avg: Metrics, h: number) => scale(avg, SHARE[h]);

export function todayTotals(c: Campaign) {
  return sumRows(c.today);
}

export function campaignSnapshot(c: Campaign, rules: Rules) {
  const t = todayTotals(c);
  const expected = c.dailyBudget * cumShare(NOW_HOUR);
  return {
    totals: t,
    ctr: t.impressions ? (t.clicks / t.impressions) * 100 : 0,
    cpa: t.conversions > 0 ? t.spend / t.conversions : null,
    pace: expected ? (t.spend / expected) * 100 : 0,
    base: baselineInfo(c, rules),
  };
}

// ---------- Injections (simulator) ----------
export const INJECTION_FACTORS: Record<InjectionKind, number[]> = {
  delivery: [0.4, 0],
  overspend: [1.3, 1.6],
  ctr: [0.7, 0.5],
  cpa: [0.73, 0.58],
  zero_conv: [0, 0],
  data_outage: [3, 7],
};

export function applyInjections(c: Campaign): Campaign {
  const rows = c.todayBase.map((r) => ({ ...r }));
  const inj = c.injections;
  const f = (k: InjectionKind) => INJECTION_FACTORS[k][(inj[k] as number) - 1];
  if (inj.overspend) rows.forEach((r, i) => (rows[i] = scale(r, f("overspend"))));
  if (inj.delivery) {
    const k = f("delivery");
    for (let h = NOW_HOUR - 2; h < NOW_HOUR; h++) rows[h] = scale(rows[h], k);
  }
  if (inj.ctr) rows.forEach((r) => (r.clicks *= f("ctr")));
  if (inj.cpa) rows.forEach((r) => (r.conversions *= f("cpa")));
  if (inj.zero_conv) rows.forEach((r) => (r.conversions = 0));
  return { ...c, today: rows, feedLagHours: inj.data_outage ? f("data_outage") : 0 };
}

// ---------- Scoring ----------
function score(deltaAbs: number, critThreshold: number, confidence: number, spendAtRisk: number): ScoreBreakdown {
  const magnitude = Math.min(100, Math.round((deltaAbs / Math.max(1, critThreshold)) * 75));
  const exposure = Math.max(0.8, Math.min(1.4, 0.8 + Math.log10(1 + Math.max(0, spendAtRisk)) / 5));
  return {
    magnitude,
    confidence: Math.round(confidence * 100) / 100,
    exposure: Math.round(exposure * 100) / 100,
    total: Math.round(magnitude * confidence * exposure),
  };
}

function classify(deltaAbs: number, warn: number, crit: number): Severity | null {
  if (deltaAbs >= crit) return "critical";
  if (deltaAbs >= warn) return "warning";
  if (deltaAbs >= warn / 2) return "info";
  return null;
}

// ---------- Rule evaluation ----------
export const KIND_RULE: Record<InjectionKind, RuleId> = {
  delivery: "delivery", overspend: "pacing", ctr: "ctr", cpa: "cpa", zero_conv: "zero_conv", data_outage: "data_health",
};

export const RULE_NAMES = {
  data_health: "Data health",
  delivery: "Delivery",
  pacing: "Budget pacing",
  ctr: "CTR drop",
  cpa: "CPA spike",
  zero_conv: "Zero conversions",
} as const;

export function evaluateCampaign(c: Campaign, rules: Rules): RuleResult[] {
  const out: RuleResult[] = [];
  const base = baselineInfo(c, rules);
  const t = todayTotals(c);
  const lag = c.feedLagHours;
  const stale = lag >= rules.dataHealth.staleHours;
  const pausedReason = `Paused: data feed is ${lag}h stale. No conclusion drawn from incomplete data.`;
  const lowConfReason = `Low-confidence baseline (${c.historyDays} days of history). Only delivery and pacing rules run until ${rules.lowConfidenceDays} days.`;

  // 1. Data health
  {
    const r: RuleResult = {
      ruleId: "data_health", ruleName: RULE_NAMES.data_health, status: "passed", metric: "Feed lag", fmt: "int",
      current: lag, baseline: 0, checks: [{ label: "Monitoring feed reachable", ok: true }],
      spendAtRisk: 0, reason: "Data fresh (updated under 1h ago)", summary: "", threshold: `Warning ≥ ${rules.dataHealth.staleHours}h stale · Critical ≥ ${rules.dataHealth.critStaleHours}h`,
    };
    if (stale) {
      r.status = "triggered";
      r.severity = lag >= rules.dataHealth.critStaleHours ? "critical" : "warning";
      r.checks = [{ label: "Monitoring feed reachable", ok: false }];
      r.reason = `No fresh data for ${lag}h. Metric checks paused instead of reporting "healthy".`;
      r.summary = `No fresh campaign data for ${lag}h`;
      r.spendAtRisk = c.dailyBudget * SHARE.slice(NOW_HOUR - lag, NOW_HOUR).reduce((a, b) => a + b, 0);
      r.score = score(lag * 25, rules.dataHealth.critStaleHours * 25, 1, r.spendAtRisk);
    }
    out.push(r);
  }

  // 2. Delivery
  let deliveryTriggered = false;
  {
    const hours = Array.from({ length: rules.delivery.windowHours }, (_, i) => NOW_HOUR - rules.delivery.windowHours + i);
    const cur = sumRows(hours.map((h) => c.today[h]));
    const bas = sumRows(hours.map((h) => baselineHour(base.avg, h)));
    const checks: Check[] = [
      { label: "Campaign active and eligible to deliver", ok: true },
      { label: `Baseline available: ${base.basis}`, ok: base.days > 0 },
      { label: "Fresh status and impression data", ok: !stale },
    ];
    const r: RuleResult = {
      ruleId: "delivery", ruleName: RULE_NAMES.delivery, status: "passed", metric: `Impressions, last ${hours.length} completed hours`, fmt: "int",
      current: cur.impressions, baseline: bas.impressions, checks, spendAtRisk: 0, reason: "", summary: "",
      threshold: `Warning: ↓ ≥ ${rules.delivery.warnDropPct}% for ${hours.length} completed hours · Critical: zero impressions while active`,
    };
    const drop = bas.impressions ? ((bas.impressions - cur.impressions) / bas.impressions) * 100 : 0;
    r.deltaPct = -drop;
    if (stale) { r.status = "skipped"; r.reason = pausedReason; }
    else {
      let sev: Severity | null = null;
      if (cur.impressions < 1) sev = "critical";
      else sev = classify(drop, rules.delivery.warnDropPct, 1000);
      if (sev) {
        r.status = "triggered"; r.severity = sev; deliveryTriggered = sev !== "info";
        r.spendAtRisk = Math.max(0, bas.spend - cur.spend);
        r.summary = cur.impressions < 1
          ? `Zero impressions in the last ${hours.length} completed hours`
          : `Impressions ${fmtValue(cur.impressions, "int")} vs ${fmtValue(bas.impressions, "int")} expected (−${Math.round(drop)}%)`;
        r.reason = cur.impressions < 1 ? "No delivery while the campaign is active and expected to deliver." : `Delivery down ${Math.round(drop)}% against the comparable baseline window.`;
        r.score = score(cur.impressions < 1 ? 100 : drop, 100, base.lowConfidence ? 0.8 : 1, r.spendAtRisk);
      } else r.reason = `Within range (${drop >= 0 ? "−" : "+"}${Math.abs(Math.round(drop))}% vs baseline)`;
    }
    out.push(r);
  }

  // 3. Budget pacing
  {
    const expected = c.dailyBudget * cumShare(NOW_HOUR);
    const dev = expected ? ((t.spend - expected) / expected) * 100 : 0;
    const over = t.spend - expected;
    const r: RuleResult = {
      ruleId: "pacing", ruleName: RULE_NAMES.pacing, status: "passed", metric: "Spend vs expected pace", fmt: "pct",
      current: expected ? (t.spend / expected) * 100 : 0, baseline: 100, deltaPct: dev,
      checks: [
        { label: `Daily budget known (${fmtMoney(c.dailyBudget)})`, ok: true },
        { label: "Elapsed period: 14 of 24 hours", ok: true },
        { label: "Budget-change log checked (no changes today)", ok: true },
      ],
      spendAtRisk: Math.abs(over), reason: "", summary: "",
      threshold: `Warning: deviates > ${rules.pacing.warnDevPct}% · Critical: overspend > ${rules.pacing.critOverPct}% and > ${fmtMoney(rules.pacing.critMinAbs)}`,
    };
    if (stale) { r.status = "skipped"; r.reason = pausedReason; }
    else {
      let sev: Severity | null = null;
      if (dev > rules.pacing.critOverPct && over > rules.pacing.critMinAbs) sev = "critical";
      else if (Math.abs(dev) > rules.pacing.warnDevPct) sev = "warning";
      else if (Math.abs(dev) > rules.pacing.warnDevPct / 2) sev = "info";
      if (sev && dev < 0 && deliveryTriggered) {
        r.status = "suppressed";
        r.reason = "Underspend explained by the open delivery alert. Not raised separately.";
      } else if (sev) {
        r.status = "triggered"; r.severity = sev;
        r.summary = `Spend ${fmtMoney(t.spend)} vs ${fmtMoney(expected)} expected by 14:00 (${dev > 0 ? "+" : ""}${Math.round(dev)}%)`;
        r.reason = dev > 0 ? `Overspending against the planned pace.` : `Underspending against the planned pace.`;
        if (dev > rules.pacing.critOverPct && over <= rules.pacing.critMinAbs)
          r.reason += ` Kept at warning: absolute overspend ${fmtMoney(over)} is below the ${fmtMoney(rules.pacing.critMinAbs)} exposure floor.`;
        r.score = score(Math.abs(dev), rules.pacing.critOverPct, 1, r.spendAtRisk);
      } else r.reason = `On pace (${dev > 0 ? "+" : ""}${Math.round(dev)}%)`;
    }
    out.push(r);
  }

  // 4. CTR drop
  {
    const cur = t.impressions ? (t.clicks / t.impressions) * 100 : 0;
    const bas = base.avg.impressions ? (base.avg.clicks / base.avg.impressions) * 100 : 0;
    const drop = bas ? ((bas - cur) / bas) * 100 : 0;
    const r: RuleResult = {
      ruleId: "ctr", ruleName: RULE_NAMES.ctr, status: "passed", metric: "CTR today", fmt: "pct2",
      current: cur, baseline: bas, deltaPct: -drop,
      checks: [
        { label: `≥ ${fmtValue(rules.ctr.minImpr, "int")} impressions (${fmtValue(t.impressions, "int")} today)`, ok: t.impressions >= rules.ctr.minImpr },
        { label: "Comparable traffic window (same hours)", ok: true },
        { label: "Sustained across the window", ok: true },
      ],
      spendAtRisk: 0, reason: "", summary: "", threshold: `Warning: ↓ ≥ ${rules.ctr.warnPct}% · Critical: ↓ ≥ ${rules.ctr.critPct}% vs campaign baseline`,
    };
    if (stale) { r.status = "skipped"; r.reason = pausedReason; }
    else if (base.lowConfidence) { r.status = "skipped"; r.reason = lowConfReason; }
    else if (t.impressions < rules.ctr.minImpr) { r.status = "skipped"; r.reason = `Insufficient data: ${fmtValue(t.impressions, "int")} impressions today, minimum is ${fmtValue(rules.ctr.minImpr, "int")}.`; }
    else {
      const sev = classify(drop, rules.ctr.warnPct, rules.ctr.critPct);
      if (sev) {
        const conf = t.impressions >= rules.ctr.minImpr * 10 ? 1 : 0.85;
        r.status = "triggered"; r.severity = sev;
        r.spendAtRisk = t.spend * (drop / 100);
        r.summary = `CTR ${cur.toFixed(2)}% vs ${bas.toFixed(2)}% baseline (−${Math.round(drop)}%)`;
        r.reason = `Click-through rate is ${Math.round(drop)}% below this campaign's baseline.`;
        r.score = score(drop, rules.ctr.critPct, conf, r.spendAtRisk);
      } else r.reason = `Within range (${drop >= 0 ? "−" : "+"}${Math.abs(Math.round(drop))}%)`;
    }
    out.push(r);
  }

  // 5. CPA spike
  {
    const conv = t.conversions;
    const cur = conv > 0 ? t.spend / conv : 0;
    const bas = base.avg.conversions > 0 ? base.avg.spend / base.avg.conversions : 0;
    const rise = bas ? ((cur - bas) / bas) * 100 : 0;
    const r: RuleResult = {
      ruleId: "cpa", ruleName: RULE_NAMES.cpa, status: "passed", metric: "CPA today", fmt: "money",
      current: cur, baseline: bas, deltaPct: rise,
      checks: [
        { label: `≥ ${rules.cpa.minConv} attributed conversions (${Math.round(conv)} today)`, ok: Math.round(conv) >= rules.cpa.minConv },
        { label: "Conversion tracking reliable", ok: c.tracking },
        { label: "Attribution matured (conversions from 3h+ ago)", ok: true },
      ],
      spendAtRisk: 0, reason: "", summary: "", threshold: `Warning: ↑ ≥ ${rules.cpa.warnPct}% · Critical: ↑ ≥ ${rules.cpa.critPct}% vs baseline`,
    };
    if (stale) { r.status = "skipped"; r.reason = pausedReason; }
    else if (!c.tracking) { r.status = "skipped"; r.reason = "Conversion tracking not enabled (awareness campaign). Delivery and engagement rules still run."; }
    else if (base.lowConfidence) { r.status = "skipped"; r.reason = lowConfReason; }
    else if (Math.round(conv) === 0) { r.status = "skipped"; r.reason = "0 conversions: CPA is undefined. Handled by the zero-conversion rule."; }
    else if (Math.round(conv) < rules.cpa.minConv) { r.status = "skipped"; r.reason = `Insufficient data: ${Math.round(conv)} conversions today, minimum is ${rules.cpa.minConv}. A large % swing on few conversions is noise, not an incident.`; }
    else {
      let sev = classify(rise, rules.cpa.warnPct, rules.cpa.critPct);
      if (sev) {
        const rc = Math.round(conv);
        const conf = rc >= 20 ? 1 : rc >= 15 ? 0.8 : 0.65;
        r.status = "triggered";
        r.spendAtRisk = Math.max(0, t.spend - conv * bas);
        r.score = score(rise, rules.cpa.critPct, conf, r.spendAtRisk);
        if (sev === "critical" && conf < 0.7) { sev = "warning"; r.score.downgraded = true; }
        r.severity = sev;
        r.summary = `CPA ${fmtMoney(cur, 2)} vs ${fmtMoney(bas, 2)} baseline (+${Math.round(rise)}%)`;
        r.reason = `Acquisition cost is ${Math.round(rise)}% above this campaign's baseline.` +
          (r.score.downgraded ? ` Downgraded from critical: only ${rc} conversions, so confidence is limited.` : "");
      } else r.reason = `Within range (${rise >= 0 ? "+" : "−"}${Math.abs(Math.round(rise))}%)`;
    }
    out.push(r);
  }

  // 6. Zero conversions with spend
  {
    const conv = Math.round(t.conversions);
    const r: RuleResult = {
      ruleId: "zero_conv", ruleName: RULE_NAMES.zero_conv, status: "passed", metric: "Spend with 0 conversions", fmt: "money",
      current: t.spend, baseline: c.targetCPA * rules.zeroConv.warnMultiple,
      checks: [
        { label: "Conversion tracking enabled", ok: c.tracking },
        { label: `Spend ≥ ${rules.zeroConv.warnMultiple}× target CPA (${fmtMoney(c.targetCPA * rules.zeroConv.warnMultiple)})`, ok: t.spend >= c.targetCPA * rules.zeroConv.warnMultiple },
        { label: "Attribution matured", ok: true },
      ],
      spendAtRisk: 0, reason: "", summary: "", threshold: `Warning: spend ≥ ${rules.zeroConv.warnMultiple}× target CPA · Critical: ≥ ${rules.zeroConv.critMultiple}× target CPA`,
    };
    if (stale) { r.status = "skipped"; r.reason = pausedReason; }
    else if (!c.tracking) { r.status = "skipped"; r.reason = "Conversion tracking not enabled."; }
    else if (conv > 0) { r.reason = `${conv} conversions recorded today`; }
    else if (t.spend < c.targetCPA * rules.zeroConv.warnMultiple) { r.status = "skipped"; r.reason = `Insufficient spend so far (${fmtMoney(t.spend)}) to conclude.`; }
    else {
      const sev: Severity = t.spend >= c.targetCPA * rules.zeroConv.critMultiple ? "critical" : "warning";
      r.status = "triggered"; r.severity = sev; r.spendAtRisk = t.spend;
      r.summary = `${fmtMoney(t.spend)} spent today with 0 conversions`;
      r.reason = `Spend is ${(t.spend / c.targetCPA).toFixed(1)}× target CPA with no attributed conversions.`;
      r.score = score((t.spend / c.targetCPA) * 10, rules.zeroConv.critMultiple * 10, 0.9, t.spend);
    }
    out.push(r);
  }
  return out;
}

export const INVESTIGATION: Record<string, string[]> = {
  data_health: ["Check the ad platform integration status", "Look for API errors or expired access tokens", "Retry the data sync once access is restored"],
  delivery: ["Campaign, ad set and ad approval status", "Billing or payment method problems", "Bid caps or budget limits reached", "Recent targeting or schedule changes"],
  pacing: ["Recent budget or bid strategy changes", "Audience expansion or new placements", "Auction competition (e.g. promotions by competitors)"],
  ctr: ["Creative fatigue or recently changed creatives", "Placement mix shift", "Audience or targeting changes", "Ad disapprovals limiting best performers"],
  cpa: ["Conversion tracking / pixel firing correctly", "Landing page or checkout issues", "Recent targeting or creative changes", "Attribution delay for late conversions"],
  zero_conv: ["Is the purchase pixel firing?", "Checkout and payment flow working", "Landing page links and stock availability"],
};

// ---------- Reconciliation: results -> incidents, routing, dedup ----------
export function nextDigestAt(sim: number) {
  const d = new Date(sim);
  const h = d.getHours();
  const next = Math.floor(h / 6) * 6 + 6;
  d.setHours(next, 0, 0, 0);
  return d.getTime();
}

export function reconcile(s: State, campaignIds: string[], opts: { repeatRule?: RuleId; focusRule?: RuleId }, now: number): { state: State; toast: ToastItem[] } {
  let seq = s.seq;
  const incidents = s.incidents.map((i) => ({ ...i, log: [...i.log] }));
  const notifications = [...s.notifications];
  const toast: ToastItem[] = [];

  const notify = (kind: Notification["kind"], subject: string, inc: Incident, lines: string[]) => {
    notifications.unshift({ id: `n${++seq}`, kind, at: now, subject, incidentIds: [inc.id], lines });
  };
  const routeLabel = (sev: Severity, ruleId: string) =>
    ruleId === "data_health" ? "Immediate email (data health)" :
    sev === "critical" ? "In-app + immediate email" : sev === "warning" ? `In-app + 6-hour digest (${fmtClock(nextDigestAt(now))})` : "Dashboard only";

  for (const cid of campaignIds) {
    const c = s.campaigns.find((x) => x.id === cid)!;
    const results = evaluateCampaign(c, s.rules);
    for (const r of results) {
      const existing = incidents.find((i) => i.campaignId === cid && i.ruleId === r.ruleId && isOpen(i));
      if (r.status !== "triggered") {
        if (existing && !existing.recovered && r.status === "passed") {
          existing.recovered = true;
          existing.log.push({ at: now, text: "Metric back within normal range. Awaiting advertiser resolution." });
        }
        if (opts.focusRule === r.ruleId && (r.status === "skipped" || r.status === "suppressed"))
          toast.push({ tone: "muted", text: `${r.ruleName} rule ${r.status}, no alert raised. ${r.reason}` });
        continue;
      }
      const sev = r.severity!;
      if (existing) {
        existing.result = r;
        existing.lastSeenAt = now;
        existing.recovered = false;
        if (SEV_RANK[sev] > SEV_RANK[existing.severity]) {
          const from = existing.severity;
          existing.severity = sev;
          existing.escalated = true;
          existing.routing = routeLabel(sev, r.ruleId);
          existing.log.push({ at: now, text: `Escalated ${from} → ${sev}: ${r.summary}` });
          if (sev === "critical") {
            existing.digestSent = true;
            notify("escalation", `[Escalated to Critical] ${c.name}: ${r.summary}`, existing, [r.reason]);
          }
          toast.push({ tone: sev, text: `Escalated to ${sev}: ${c.name} · ${r.ruleName}` });
        }
        if (opts.repeatRule === r.ruleId) {
          existing.occurrences += 1;
          existing.log.push({ at: now, text: `Repeat detection merged into this incident (occurrence ${existing.occurrences}). No duplicate alert sent.` });
          toast.push({ tone: "ok", text: `Deduplicated: ${c.name} · ${r.ruleName} updated (occurrence ${existing.occurrences}), no new alert` });
        }
        continue;
      }
      const inc: Incident = {
        id: `A-${1000 + ++seq}`,
        campaignId: cid,
        campaignName: c.name,
        ruleId: r.ruleId,
        ruleName: r.ruleName,
        severity: sev,
        status: "open",
        detectedAt: now,
        lastSeenAt: now,
        occurrences: 1,
        escalated: false,
        recovered: false,
        result: r,
        log: [{ at: now, text: `Detected: ${r.summary}` }],
        routing: routeLabel(sev, r.ruleId),
        digestSent: sev !== "warning",
      };
      inc.log.push({ at: now, text: `Validated: ${r.checks.filter((x) => x.ok).length}/${r.checks.length} data checks passed` });
      inc.log.push({ at: now, text: `Routed: ${inc.routing}` });
      incidents.unshift(inc);
      if (r.ruleId === "data_health") notify("data_health", `[Data health] ${c.name}: ${r.summary}`, inc, [r.reason]);
      else if (sev === "critical") notify("immediate", `[Critical] ${c.name}: ${r.summary}`, inc, [r.reason]);
      toast.push({ tone: sev, text: `${sev === "info" ? "Info" : sev === "warning" ? "Warning" : "Critical"} alert: ${c.name} · ${r.summary}` });
    }
  }
  return { state: { ...s, incidents, notifications, seq }, toast };
}

export function buildDigest(s: State, now: number): { state: State; count: number } {
  const queued = s.incidents.filter((i) => i.severity === "warning" && isOpen(i) && !i.digestSent);
  if (!queued.length) return { state: s, count: 0 };
  const seq = s.seq + 1;
  const n: Notification = {
    id: `n${seq}`,
    kind: "digest",
    at: now,
    subject: `Pinpoint digest: ${queued.length} unresolved warning${queued.length > 1 ? "s" : ""}`,
    incidentIds: queued.map((q) => q.id),
    lines: queued.map((q) => `${q.campaignName} · ${q.ruleName}: ${q.result.summary}`),
  };
  const incidents = s.incidents.map((i) => (queued.find((q) => q.id === i.id) ? { ...i, digestSent: true, log: [...i.log, { at: now, text: "Included in 6-hour warning digest email" }] } : i));
  return { state: { ...s, seq, incidents, notifications: [n, ...s.notifications] }, count: queued.length };
}

// ---------- Pilot metrics ----------
export function pilotMetrics(s: State, now: number) {
  const SLA = { critical: 120, warning: 1440, info: Infinity } as Record<Severity, number>;
  const M = 60000;
  type Row = { severity: Severity; detectedAt: number; ackAt?: number; resolvedAt?: number; dismissed: boolean; delay: number };
  const rows: Row[] = [
    ...s.history.map((h) => ({ severity: h.severity, detectedAt: h.detectedAt, ackAt: h.ackAt, resolvedAt: h.resolvedAt, dismissed: h.dismissed, delay: h.detectDelayMin })),
    ...s.incidents.filter((i) => i.severity !== "info").map((i) => ({
      severity: i.severity, detectedAt: i.detectedAt, ackAt: i.ackAt, resolvedAt: i.resolvedAt, dismissed: i.status === "dismissed", delay: 5,
    })),
  ];
  const actionable = rows.filter((r) => !r.dismissed);
  // count as decided: acted on, or SLA elapsed without action
  const decided = actionable.filter((r) => r.ackAt || (now - r.detectedAt) / M > SLA[r.severity]);
  const timely = decided.filter((r) => r.ackAt && (r.ackAt - r.detectedAt) / M <= SLA[r.severity]);
  const median = (xs: number[]) => {
    if (!xs.length) return null;
    const a = [...xs].sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  const tta = median(actionable.filter((r) => r.ackAt).map((r) => (r.ackAt! - r.detectedAt) / M));
  const ttr = median(actionable.filter((r) => r.resolvedAt).map((r) => (r.resolvedAt! - r.detectedAt) / M));
  const mttd = rows.length ? rows.reduce((a, r) => a + r.delay, 0) / rows.length : 0;
  const precision = rows.length ? (rows.length - rows.filter((r) => r.dismissed).length) / rows.length : 1;

  const day0 = new Date(now); day0.setHours(0, 0, 0, 0);
  const days: { label: string; critical: number; warning: number }[] = [];
  for (let d = 14; d >= 0; d--) {
    const start = day0.getTime() - d * 86400000;
    const end = start + 86400000;
    const inDay = rows.filter((r) => r.detectedAt >= start && r.detectedAt < end);
    const dt = new Date(start);
    days.push({
      label: d === 0 ? "Today" : `${dt.getDate()}/${dt.getMonth() + 1}`,
      critical: inDay.filter((r) => r.severity === "critical").length,
      warning: inDay.filter((r) => r.severity === "warning").length,
    });
  }
  const perDay = days.reduce((a, d) => a + d.critical + d.warning, 0) / days.length;
  return {
    timelyRate: decided.length ? timely.length / decided.length : null,
    timelyCount: timely.length,
    decidedCount: decided.length,
    tta, ttr, mttd, precision, perDay, days,
    total: rows.length,
    dismissed: rows.filter((r) => r.dismissed).length,
  };
}
