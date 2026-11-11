"use client";
import React from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStore } from "@/lib/store";
import { NOW_HOUR, cumShare } from "@/lib/data";
import { baselineHour, campaignSnapshot, evaluateCampaign, isOpen } from "@/lib/engine";
import { fmtDelta, fmtInt, fmtMoney, fmtValue } from "@/lib/format";
import { RuleResult } from "@/lib/types";
import { Card, HealthPill, Icon, PageHeader, SevPill } from "./ui";
import { useNav } from "./Shell";
import { campaignHealth } from "./helpers";

export function CampaignList() {
  const { state } = useStore();
  const { go } = useNav();
  return (
    <>
      <PageHeader title="Campaigns" sub="Performance campaigns connected from one ad platform" />
      <Card pad={false}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Objective</th>
              <th>Status</th>
              <th className="r">Daily budget</th>
              <th className="r">Target CPA</th>
              <th className="r">Impressions today</th>
              <th className="r">Spend today</th>
              <th>Baseline</th>
            </tr>
          </thead>
          <tbody>
            {state.campaigns.map((c) => {
              const snap = campaignSnapshot(c, state.rules);
              const h = campaignHealth(state, c);
              return (
                <tr key={c.id} className="click" onClick={() => go({ view: "campaigns", campaignId: c.id })}>
                  <td className="cell-main">{c.name}</td>
                  <td>{c.objective}</td>
                  <td><HealthPill health={h} /></td>
                  <td className="r num">{fmtMoney(c.dailyBudget)}</td>
                  <td className="r num">{c.targetCPA ? fmtMoney(c.targetCPA) : "—"}</td>
                  <td className="r num">{h === "nodata" ? "—" : fmtInt(snap.totals.impressions)}</td>
                  <td className="r num">{h === "nodata" ? "—" : fmtMoney(snap.totals.spend)}</td>
                  <td>{snap.base.lowConfidence ? <span className="tag">Low confidence · {c.historyDays}d</span> : <span className="muted">{c.historyDays} days</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}

const INJ_NAME: Record<string, string> = { delivery: "Delivery drop", overspend: "Overspend", ctr: "CTR drop", cpa: "CPA spike", zero_conv: "Zero conversions", data_outage: "Data feed outage" };
const AX = { fontSize: 11, fill: "#6B7280" };
const TT = { contentStyle: { fontSize: 12, borderRadius: 6, border: "1px solid #E5E7EB", boxShadow: "0 2px 8px rgba(0,0,0,.06)" } };

function ChartCard({ title, note, children }: { title: string; note?: string; children: React.ReactElement }) {
  return (
    <Card title={title} actions={note ? <span className="muted small">{note}</span> : undefined}>
      <div className="chart">
        <ResponsiveContainer width="100%" height={190}>{children}</ResponsiveContainer>
      </div>
    </Card>
  );
}

function Legend() {
  return (
    <div className="legend">
      <span><i className="lg-base" />Baseline</span>
      <span><i className="lg-cur" />Today</span>
      <span><i className="lg-anom" />Anomaly window</span>
    </div>
  );
}

export function RuleStatus({ r }: { r: RuleResult }) {
  if (r.status === "triggered") return <SevPill sev={r.severity!} small />;
  if (r.status === "passed") return <span className="rs rs-pass"><Icon name="check" size={12} />Passed</span>;
  if (r.status === "suppressed") return <span className="rs rs-skip"><Icon name="skip" size={12} />Suppressed</span>;
  return <span className="rs rs-skip"><Icon name="skip" size={12} />Skipped</span>;
}

export function CampaignDetail({ id }: { id: string }) {
  const { state } = useStore();
  const { go, openSim } = useNav();
  const c = state.campaigns.find((x) => x.id === id)!;
  const snap = campaignSnapshot(c, state.rules);
  const results = evaluateCampaign(c, state.rules);
  const health = campaignHealth(state, c);
  const stale = health === "nodata";
  const delivery = results.find((r) => r.ruleId === "delivery")!;
  const injected = Object.entries(c.injections).filter(([, v]) => v);

  const hourly = Array.from({ length: 24 }, (_, h) => ({
    h: `${String(h).padStart(2, "0")}:00`,
    baseline: Math.round(baselineHour(snap.base.avg, h).impressions),
    today: h < NOW_HOUR - (stale ? c.feedLagHours : 0) ? Math.round(c.today[h].impressions) : null,
  }));
  let cum = 0;
  const pacing = Array.from({ length: 25 }, (_, h) => {
    const row = { h: `${String(h).padStart(2, "0")}:00`, plan: Math.round(c.dailyBudget * cumShare(h)), actual: null as number | null };
    if (h <= NOW_HOUR - (stale ? c.feedLagHours : 0)) {
      row.actual = Math.round(cum);
      if (h < NOW_HOUR) cum += c.today[h].spend;
    }
    return row;
  });
  const days = [...c.daily].reverse();
  const ctrTrend = [
    ...days.map((d) => ({ d: d.date, v: +((d.clicks / d.impressions) * 100).toFixed(2) })),
    ...(stale ? [] : [{ d: "Today", v: +snap.ctr.toFixed(2) }]),
  ];
  const baseCtr = (snap.base.avg.clicks / snap.base.avg.impressions) * 100;
  const cpaTrend = [
    ...days.map((d) => ({ d: d.date, v: d.conversions ? +(d.spend / d.conversions).toFixed(2) : null })),
    ...(stale || snap.cpa == null ? [] : [{ d: "Today", v: +snap.cpa.toFixed(2) }]),
  ];
  const baseCpa = snap.base.avg.conversions ? snap.base.avg.spend / snap.base.avg.conversions : 0;
  const ctrR = results.find((r) => r.ruleId === "ctr")!;
  const cpaR = results.find((r) => r.ruleId === "cpa")!;
  const openForC = state.incidents.filter((i) => i.campaignId === c.id && isOpen(i));

  return (
    <>
      <button className="back" onClick={() => go({ view: "campaigns" })}><Icon name="back" size={14} />Campaigns</button>
      <PageHeader
        title={<>{c.name} <HealthPill health={health} /></>}
        sub={
          <>
            {c.objective} · Budget {fmtMoney(c.dailyBudget)}/day{c.targetCPA ? ` · Target CPA ${fmtMoney(c.targetCPA)}` : ""} · Baseline: {snap.base.basis}
            {snap.base.lowConfidence && <span className="tag">Low-confidence baseline</span>}
          </>
        }
        right={<button className="btn" onClick={() => openSim(c.id)}><Icon name="bolt" size={14} />Simulate on this campaign</button>}
      />

      {(injected.length > 0 || stale || openForC.length > 0) && (
        <div className={`banner ${stale ? "banner-warn" : ""}`}>
          {stale ? (
            <span><b>Data feed stale for {c.feedLagHours}h.</b> Metric rules are paused and the campaign shows "Insufficient data", not "Healthy".</span>
          ) : (
            <span>
              {openForC.length > 0 && <>{openForC.length} open alert{openForC.length > 1 ? "s" : ""} on this campaign. </>}
              {injected.length > 0 && <>Simulated anomalies active: {injected.map(([k, v]) => `${INJ_NAME[k]} (level ${v})`).join(", ")}.</>}
            </span>
          )}
          {openForC.length > 0 && <button className="link" onClick={() => go({ view: "alerts", incidentId: openForC[0].id })}>Open alert</button>}
        </div>
      )}

      <div className="stats">
        <div className="stat"><span>Impressions today</span><b>{stale ? "—" : fmtInt(snap.totals.impressions)}</b></div>
        <div className="stat"><span>Spend today</span><b>{stale ? "—" : fmtMoney(snap.totals.spend)}</b><em>{stale ? "" : `${Math.round(snap.pace)}% of pace`}</em></div>
        <div className="stat"><span>CTR</span><b>{stale ? "—" : `${snap.ctr.toFixed(2)}%`}</b><em>{stale ? "" : `baseline ${baseCtr.toFixed(2)}%`}</em></div>
        <div className="stat"><span>Conversions</span><b>{!c.tracking ? "Not tracked" : stale ? "—" : fmtInt(snap.totals.conversions)}</b></div>
        <div className="stat"><span>CPA</span><b>{!c.tracking || stale || snap.cpa == null ? "—" : fmtMoney(snap.cpa, 2)}</b><em>{c.tracking && baseCpa ? `baseline ${fmtMoney(baseCpa, 2)}` : ""}</em></div>
      </div>

      <Legend />
      <div className="grid-2">
        <ChartCard title="Impressions by hour" note={`Delivery rule: last ${state.rules.delivery.windowHours} completed hours`}>
          <LineChart data={hourly} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#F1F3F5" vertical={false} />
            <XAxis dataKey="h" tick={AX} interval={3} tickLine={false} axisLine={{ stroke: "#E5E7EB" }} />
            <YAxis tick={AX} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
            <Tooltip {...TT} />
            {delivery.status === "triggered" && <ReferenceArea x1={hourly[NOW_HOUR - 2].h} x2={hourly[NOW_HOUR - 1].h} fill="#C8423B" fillOpacity={0.08} />}
            <Line dataKey="baseline" name="Baseline" stroke="#9CA3AF" strokeDasharray="4 4" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            <Line dataKey="today" name="Today" stroke="#14213D" dot={false} strokeWidth={2} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ChartCard>
        <ChartCard title="Cumulative spend vs planned pace" note={`Budget ${fmtMoney(c.dailyBudget)}`}>
          <LineChart data={pacing} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#F1F3F5" vertical={false} />
            <XAxis dataKey="h" tick={AX} interval={3} tickLine={false} axisLine={{ stroke: "#E5E7EB" }} />
            <YAxis tick={AX} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v}`} />
            <Tooltip {...TT} formatter={(v: number) => fmtMoney(v)} />
            <Line dataKey="plan" name="Planned" stroke="#9CA3AF" strokeDasharray="4 4" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            <Line dataKey="actual" name="Actual" stroke="#14213D" dot={false} strokeWidth={2} isAnimationActive={false} />
          </LineChart>
        </ChartCard>
        <ChartCard title="CTR, daily" note={`Baseline ${baseCtr.toFixed(2)}%`}>
          <LineChart data={ctrTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#F1F3F5" vertical={false} />
            <XAxis dataKey="d" tick={AX} interval={Math.max(0, Math.floor(ctrTrend.length / 6))} tickLine={false} axisLine={{ stroke: "#E5E7EB" }} />
            <YAxis tick={AX} tickLine={false} axisLine={false} width={48} domain={["auto", "auto"]} tickFormatter={(v) => `${v}%`} />
            <Tooltip {...TT} formatter={(v: number) => `${v}%`} />
            <ReferenceLine y={+baseCtr.toFixed(2)} stroke="#9CA3AF" strokeDasharray="4 4" />
            <Line dataKey="v" name="CTR" stroke="#14213D" strokeWidth={2} dot={false} isAnimationActive={false} />
            {!stale && <ReferenceDot x="Today" y={+snap.ctr.toFixed(2)} r={4} fill={ctrR.status === "triggered" && ctrR.severity !== "info" ? "#C8423B" : "#14213D"} stroke="#fff" />}
          </LineChart>
        </ChartCard>
        {c.tracking ? (
          <ChartCard title="CPA, daily" note={`Baseline ${fmtMoney(baseCpa, 2)}`}>
            <LineChart data={cpaTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#F1F3F5" vertical={false} />
              <XAxis dataKey="d" tick={AX} interval={Math.max(0, Math.floor(cpaTrend.length / 6))} tickLine={false} axisLine={{ stroke: "#E5E7EB" }} />
              <YAxis tick={AX} tickLine={false} axisLine={false} width={48} domain={["auto", "auto"]} tickFormatter={(v) => `$${v}`} />
              <Tooltip {...TT} formatter={(v: number) => fmtMoney(v, 2)} />
              <ReferenceLine y={+baseCpa.toFixed(2)} stroke="#9CA3AF" strokeDasharray="4 4" />
              <Line dataKey="v" name="CPA" stroke="#14213D" strokeWidth={2} dot={false} isAnimationActive={false} />
              {!stale && snap.cpa != null && <ReferenceDot x="Today" y={+snap.cpa.toFixed(2)} r={4} fill={cpaR.status === "triggered" && cpaR.severity !== "info" ? "#C8423B" : "#14213D"} stroke="#fff" />}
            </LineChart>
          </ChartCard>
        ) : (
          <Card title="CPA, daily"><div className="empty tall"><p>Conversion tracking is not enabled for this awareness campaign. CPA and zero-conversion rules are skipped. Delivery, pacing and CTR rules still run.</p></div></Card>
        )}
      </div>

      <Card title="Rule checks, latest evaluation" pad={false} className="mt">
        <table className="tbl tbl-rules">
          <thead>
            <tr>
              <th>Rule</th>
              <th>Result</th>
              <th className="r">Current</th>
              <th className="r">Baseline</th>
              <th className="r">Change</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.ruleId}>
                <td>
                  <div className="cell-main">{r.ruleName}</div>
                  <div className="mono tiny">{r.threshold}</div>
                </td>
                <td><RuleStatus r={r} /></td>
                <td className="r num">{r.status === "skipped" && r.reason.startsWith("Paused") ? "—" : r.ruleId === "data_health" ? `${r.current}h lag` : fmtValue(r.current, r.fmt)}</td>
                <td className="r num">{r.ruleId === "data_health" || r.ruleId === "zero_conv" ? "—" : fmtValue(r.baseline, r.fmt)}</td>
                <td className="r num">{r.deltaPct != null && r.status !== "skipped" && r.ruleId !== "zero_conv" ? fmtDelta(r.deltaPct) : "—"}</td>
                <td>
                  <div className="why">{r.reason}</div>
                  <div className="checks">
                    {r.checks.map((k) => (
                      <span key={k.label} className={k.ok ? "ck ok" : "ck no"}><Icon name={k.ok ? "check" : "x"} size={11} />{k.label}</span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
