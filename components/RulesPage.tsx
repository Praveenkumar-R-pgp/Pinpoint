"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { DEFAULT_RULES } from "@/lib/data";
import { Rules } from "@/lib/types";
import { Card, PageHeader, SevPill } from "./ui";

type Field = { path: [keyof Rules, string]; label: string; unit: string };
const GROUPS: { title: string; desc: string; formula: string; minData: string; fields: Field[] }[] = [
  {
    title: "Delivery", desc: "Catches campaigns that stop or sharply reduce delivery.",
    formula: "drop % = (baseline impressions − current) ÷ baseline × 100, over the last N completed hours",
    minData: "Active campaign · historical baseline · fresh status data",
    fields: [{ path: ["delivery", "warnDropPct"], label: "Warning when impressions drop by", unit: "%" }, { path: ["delivery", "windowHours"], label: "Completed hours in window", unit: "h" }],
  },
  {
    title: "Budget pacing", desc: "Catches over- and under-spend against the planned daily pace.",
    formula: "pace % = actual spend ÷ expected spend to this hour × 100 (uniform plan in the MVP)",
    minData: "Known budget · elapsed period · budget-change log",
    fields: [{ path: ["pacing", "warnDevPct"], label: "Warning when pace deviates by more than", unit: "%" }, { path: ["pacing", "critOverPct"], label: "Critical when overspend exceeds", unit: "%" }, { path: ["pacing", "critMinAbs"], label: "…and absolute overspend exceeds", unit: "$" }],
  },
  {
    title: "CTR drop", desc: "Catches creative or audience problems that cut engagement.",
    formula: "CTR = clicks ÷ impressions × 100, compared with this campaign's own baseline",
    minData: "Minimum impressions · comparable traffic · sustained change",
    fields: [{ path: ["ctr", "warnPct"], label: "Warning at a drop of", unit: "%" }, { path: ["ctr", "critPct"], label: "Critical at a drop of", unit: "%" }, { path: ["ctr", "minImpr"], label: "Minimum impressions", unit: "" }],
  },
  {
    title: "CPA spike", desc: "Catches rising acquisition cost.",
    formula: "CPA = spend ÷ conversions, compared with this campaign's own baseline",
    minData: "Minimum conversions · reliable tracking · matured attribution",
    fields: [{ path: ["cpa", "warnPct"], label: "Warning at an increase of", unit: "%" }, { path: ["cpa", "critPct"], label: "Critical at an increase of", unit: "%" }, { path: ["cpa", "minConv"], label: "Minimum conversions", unit: "" }],
  },
  {
    title: "Zero conversions with spend", desc: "Separate rule, so CPA is never 'infinite'.",
    formula: "spend today ÷ target CPA, with 0 attributed conversions",
    minData: "Tracking enabled · matured attribution",
    fields: [{ path: ["zeroConv", "warnMultiple"], label: "Warning at spend ≥ target CPA ×", unit: "×" }, { path: ["zeroConv", "critMultiple"], label: "Critical at spend ≥ target CPA ×", unit: "×" }],
  },
  {
    title: "Data health", desc: "If data is stale or incomplete, metric rules pause and a data-health alert is raised instead.",
    formula: "feed lag = hours since the last successful data sync",
    minData: "Always on",
    fields: [{ path: ["dataHealth", "staleHours"], label: "Warning when feed is stale for", unit: "h" }, { path: ["dataHealth", "critStaleHours"], label: "Critical when stale for", unit: "h" }],
  },
];

export default function RulesPage() {
  const { state, dispatch } = useStore();
  const [draft, setDraft] = useState<Rules>(JSON.parse(JSON.stringify(state.rules)));
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.rules);
  const setVal = (g: keyof Rules, k: string, v: number) => setDraft({ ...draft, [g]: { ...(draft[g] as object), [k]: v } } as Rules);

  return (
    <>
      <PageHeader
        title="Rules & thresholds"
        sub="Explainable, configurable rules. Every alert shows which rule fired and why."
        right={
          <div className="actions">
            <button className="btn btn-ghost" onClick={() => setDraft(JSON.parse(JSON.stringify(DEFAULT_RULES)))}>Restore defaults</button>
            <button className="btn btn-primary" disabled={!dirty} onClick={() => dispatch({ type: "rules", rules: draft })}>Save & re-evaluate</button>
          </div>
        }
      />

      <div className="grid-3">
        {GROUPS.map((g) => (
          <Card key={g.title} title={g.title}>
            <p className="small muted">{g.desc}</p>
            <div className="fields">
              {g.fields.map((f) => {
                const [grp, key] = f.path;
                const v = (draft[grp] as Record<string, number>)[key];
                return (
                  <label key={key} className="field">
                    <span>{f.label}</span>
                    <span className="inp">
                      {f.unit === "$" && <i>$</i>}
                      <input type="number" min={0} value={v} onChange={(e) => setVal(grp, key, Number(e.target.value))} />
                      {f.unit && f.unit !== "$" && <i>{f.unit}</i>}
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="mono tiny formula">{g.formula}</div>
            <div className="tiny muted">Minimum data: {g.minData}</div>
          </Card>
        ))}
      </div>

      <div className="grid-2 mt">
        <Card title="Baselines">
          <ul className="plain">
            <li>Up to <b>28 days</b> of comparable history, matched on the same weekday and hour.</li>
            <li>Campaigns with fewer than
              <input className="inline-inp" type="number" min={1} value={draft.lowConfidenceDays} onChange={(e) => setDraft({ ...draft, lowConfidenceDays: Number(e.target.value) })} />
              days of history get a <b>low-confidence baseline</b> and run only delivery and pacing rules.</li>
            <li>Info-level "watch" items appear at half the warning threshold, on the dashboard only.</li>
          </ul>
        </Card>
        <Card title="Severity & routing" pad={false}>
          <table className="tbl">
            <thead><tr><th>Severity</th><th>In-app</th><th>Email</th></tr></thead>
            <tbody>
              <tr><td><SevPill sev="critical" small /></td><td>On confirmation</td><td>Immediately; repeats only on escalation</td></tr>
              <tr><td><SevPill sev="warning" small /></td><td>On confirmation</td><td>Batched into a 6-hour digest</td></tr>
              <tr><td><SevPill sev="info" small /></td><td>Dashboard only</td><td>None</td></tr>
            </tbody>
          </table>
          <p className="small muted pad">Priority score = magnitude × confidence × exposure. A critical metric alert with confidence below 0.7 (e.g. very few conversions) is downgraded to warning.</p>
        </Card>
      </div>
    </>
  );
}
