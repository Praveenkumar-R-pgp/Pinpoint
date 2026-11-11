"use client";
import React, { createContext, useContext, useEffect, useReducer, useState } from "react";
import { DEFAULT_RULES, buildCampaigns, buildHistory, initialSimBase } from "./data";
import { applyInjections, buildDigest, evaluateCampaign, reconcile, simNow, RULE_NAMES, KIND_RULE } from "./engine";
import { InjectionKind, Rules, State, Status, ToastItem } from "./types";

const KEY = "pinpoint-demo-v1";
const VERSION = 1;

export type Action =
  | { type: "inject"; campaignId: string; kind: InjectionKind; level?: number }
  | { type: "repeat" }
  | { type: "restore"; campaignId: string }
  | { type: "reset" }
  | { type: "status"; id: string; status: Status; reason?: string }
  | { type: "rules"; rules: Rules }
  | { type: "digest" }
  | { type: "load"; state: State };

export function createInitialState(): State {
  const realNow = Date.now();
  const simBase = initialSimBase();
  let s: State = {
    version: VERSION,
    createdAt: realNow,
    simBase,
    seq: 0,
    campaigns: buildCampaigns(simBase),
    rules: DEFAULT_RULES,
    incidents: [],
    notifications: [],
    history: buildHistory(simBase),
  };
  // Seeded scenario: Coffee Subscription Retargeting has a CPA spike, detected 25 minutes ago
  s.campaigns = s.campaigns.map((c) => (c.id === "c1" ? applyInjections({ ...c, injections: { cpa: 2 } }) : c));
  const detectedAt = simBase - 25 * 60000;
  const r = reconcile(s, s.campaigns.map((c) => c.id), {}, detectedAt);
  s = r.state;
  return s;
}

function withToast(s: State, items: ToastItem[]): State {
  if (!items.length) return s;
  return { ...s, toast: { id: (s.toast?.id ?? 0) + 1, items } };
}

const INJECT_LABEL: Record<InjectionKind, string> = {
  delivery: "Delivery drop", overspend: "Overspend", ctr: "CTR drop", cpa: "CPA spike", zero_conv: "Zero conversions", data_outage: "Data feed outage",
};

function reducer(s: State, a: Action): State {
  if (a.type === "load") return a.state;
  if (a.type === "reset") return withToast(createInitialState(), [{ tone: "muted", text: "Demo reset to the starting scenario" }]);
  const now = simNow(s);

  switch (a.type) {
    case "inject": {
      const c0 = s.campaigns.find((c) => c.id === a.campaignId)!;
      const prev = c0.injections[a.kind] ?? 0;
      const level = a.level ?? Math.min(2, prev + 1);
      const c1 = applyInjections({ ...c0, injections: { ...c0.injections, [a.kind]: level } });
      let st: State = { ...s, campaigns: s.campaigns.map((c) => (c.id === c1.id ? c1 : c)), lastInjection: { campaignId: c1.id, kind: a.kind } };
      const r = reconcile(st, [c1.id], { repeatRule: prev > 0 ? KIND_RULE[a.kind] : undefined, focusRule: KIND_RULE[a.kind] }, now);
      const head: ToastItem = { tone: "muted", text: `Simulated: ${INJECT_LABEL[a.kind]} on ${c1.name} (level ${level})` };
      const items = r.toast.length ? r.toast : [{ tone: "ok" as const, text: "No rule triggered. Change within thresholds or below minimum data." }];
      return withToast(r.state, [head, ...items]);
    }
    case "repeat": {
      if (!s.lastInjection) return withToast(s, [{ tone: "muted", text: "Inject an anomaly first" }]);
      return reducer(s, { type: "inject", campaignId: s.lastInjection.campaignId, kind: s.lastInjection.kind });
    }
    case "restore": {
      const c0 = s.campaigns.find((c) => c.id === a.campaignId)!;
      const c1 = applyInjections({ ...c0, injections: {} });
      const st: State = { ...s, campaigns: s.campaigns.map((c) => (c.id === c1.id ? c1 : c)) };
      const r = reconcile(st, [c1.id], {}, now);
      return withToast(r.state, [{ tone: "ok", text: `${c1.name}: simulated anomalies cleared. Open alerts stay open until you resolve them.` }]);
    }
    case "status": {
      const incidents = s.incidents.map((i) => {
        if (i.id !== a.id) return i;
        const n = { ...i, log: [...i.log], status: a.status };
        const labels: Record<Status, string> = { open: "Reopened", acknowledged: "Acknowledged", investigating: "Investigation started", resolved: "Resolved", dismissed: "Dismissed" };
        n.log.push({ at: now, text: `${labels[a.status]} by Priya${a.reason ? ` · reason: ${a.reason}` : ""}` });
        if ((a.status === "acknowledged" || a.status === "investigating" || a.status === "resolved") && !n.ackAt) n.ackAt = now;
        if (a.status === "resolved") {
          n.resolvedAt = now;
          const c = s.campaigns.find((x) => x.id === i.campaignId);
          const still = c && evaluateCampaign(c, s.rules).find((r) => r.ruleId === i.ruleId && r.status === "triggered");
          if (still) n.log.push({ at: now, text: "Note: metric is still outside its normal range. A new alert is raised if it persists at the next hourly run." });
        }
        if (a.status === "dismissed") n.dismissReason = a.reason;
        return n;
      });
      return { ...s, incidents };
    }
    case "rules": {
      const st = { ...s, rules: a.rules };
      const r = reconcile(st, st.campaigns.map((c) => c.id), {}, now);
      return withToast(r.state, [{ tone: "ok", text: "Thresholds saved. All campaigns re-evaluated." }, ...r.toast]);
    }
    case "digest": {
      const r = buildDigest(s, now);
      return withToast(r.state, [r.count ? { tone: "ok", text: `Simulated digest sent with ${r.count} warning${r.count > 1 ? "s" : ""}` } : { tone: "muted", text: "No unresolved warnings queued for the digest" }]);
    }
  }
  return s;
}

const Ctx = createContext<{ state: State; dispatch: React.Dispatch<Action>; now: number } | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, null as unknown as State);
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    let loaded: State | null = null;
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p?.version === VERSION) loaded = { ...p, toast: undefined };
      }
    } catch {}
    dispatch({ type: "load", state: loaded ?? createInitialState() });
    const t = setInterval(() => setTick(Date.now()), 20000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!state) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  if (!state) return <div className="boot">Loading Pinpoint…</div>;
  return <Ctx.Provider value={{ state, dispatch, now: simNow(state, tick > Date.now() ? tick : Date.now()) }}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside provider");
  return v;
}

export { RULE_NAMES };
