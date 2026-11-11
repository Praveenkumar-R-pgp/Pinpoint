"use client";
import { useStore } from "@/lib/store";
import { campaignSnapshot, isOpen, pilotMetrics } from "@/lib/engine";
import { fmtAgo, fmtMoney, fmtInt } from "@/lib/format";
import { CampAvatar, Card, HealthPill, Icon, IconChip, PageHeader, SevPill } from "./ui";
import { useNav } from "./Shell";
import { campaignHealth, sortIncidents } from "./helpers";

export default function Overview() {
  const { state, now } = useStore();
  const { go, openSim } = useNav();
  const open = state.incidents.filter(isOpen);
  const crit = open.filter((i) => i.severity === "critical");
  const warn = open.filter((i) => i.severity === "warning");
  const info = open.filter((i) => i.severity === "info");
  const atRisk = open.filter((i) => i.severity !== "info").reduce((a, i) => a + i.result.spendAtRisk, 0);
  const pm = pilotMetrics(state, now);
  const attention = sortIncidents(open).slice(0, 6);

  return (
    <>
      <PageHeader
        title="Overview"
        sub={`${state.campaigns.length} campaigns monitored on one ad platform · rules run every completed hour`}
      />

      <div className="kpis">
        <button className={`kpi ${crit.length ? "kpi-hot-red" : ""}`} onClick={() => go({ view: "alerts" })}>
          <span className="kpi-top"><IconChip name="warn" tone="red" /><span className="kpi-l">Open critical</span></span>
          <span className="kpi-v">{crit.length}</span>
          <span className="kpi-s">Immediate email on confirmation</span>
        </button>
        <button className={`kpi ${warn.length ? "kpi-hot-amber" : ""}`} onClick={() => go({ view: "alerts" })}>
          <span className="kpi-top"><IconChip name="alerts" tone="amber" /><span className="kpi-l">Open warnings</span></span>
          <span className="kpi-v">{warn.length}</span>
          <span className="kpi-s">Batched into the 6-hour digest</span>
        </button>
        <div className="kpi">
          <span className="kpi-top"><IconChip name="eye" tone="blue" /><span className="kpi-l">Watch items</span></span>
          <span className="kpi-v">{info.length}</span>
          <span className="kpi-s">Dashboard only, no email</span>
        </div>
        <div className="kpi">
          <span className="kpi-top"><IconChip name="dollar" tone="violet" /><span className="kpi-l">Spend at risk today</span></span>
          <span className="kpi-v">{fmtMoney(atRisk)}</span>
          <span className="kpi-s">Estimated from open critical + warning alerts</span>
        </div>
        <button className="kpi" onClick={() => go({ view: "metrics" })}>
          <span className="kpi-top"><IconChip name="target" tone="green" /><span className="kpi-l">Timely resolution rate</span></span>
          <span className="kpi-v">{pm.timelyRate == null ? "—" : `${Math.round(pm.timelyRate * 100)}%`}</span>
          <span className="kpi-s">North Star · pilot target ≥ 70%</span>
        </button>
      </div>

      <div className="grid-2-1">
        <Card title="Campaign health" pad={false}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Status</th>
                <th className="r">Spend today</th>
                <th className="r">Pace</th>
                <th className="r">CTR</th>
                <th className="r">CPA</th>
                <th className="r">Open alerts</th>
              </tr>
            </thead>
            <tbody>
              {state.campaigns.map((c) => {
                const snap = campaignSnapshot(c, state.rules);
                const h = campaignHealth(state, c);
                const n = open.filter((i) => i.campaignId === c.id && i.severity !== "info").length;
                const stale = h === "nodata";
                return (
                  <tr key={c.id} className="click" onClick={() => go({ view: "campaigns", campaignId: c.id })}>
                    <td>
                      <div className="cell-camp">
                      <CampAvatar id={c.id} name={c.name} />
                      <div>
                      <div className="cell-main">{c.name}</div>
                      <div className="cell-sub">
                        {c.objective}
                        {snap.base.lowConfidence && <span className="tag">Low-confidence baseline</span>}
                        {!c.tracking && <span className="tag">No conversion tracking</span>}
                      </div>
                      </div>
                      </div>
                    </td>
                    <td><HealthPill health={h} /></td>
                    <td className="r num">{stale ? "—" : fmtMoney(snap.totals.spend)}</td>
                    <td className="r num">{stale ? "—" : `${Math.round(snap.pace)}%`}</td>
                    <td className="r num">{stale ? "—" : `${snap.ctr.toFixed(2)}%`}</td>
                    <td className="r num">{stale || snap.cpa == null ? "—" : fmtMoney(snap.cpa, 2)}</td>
                    <td className="r num">{n || <span className="muted">0</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <Card title="Needs attention" actions={<button className="link" onClick={() => go({ view: "alerts" })}>All alerts</button>}>
          {attention.length === 0 && (
            <div className="empty">
              <Icon name="check" size={20} />
              <p>No open alerts. Use <b>Simulate anomaly</b> to inject one.</p>
            </div>
          )}
          <ul className="att">
            {attention.map((i) => (
              <li key={i.id} onClick={() => go({ view: "alerts", incidentId: i.id })}>
                <div className="att-top">
                  <SevPill sev={i.severity} small />
                  <span className="att-rule">{i.ruleName}</span>
                  {i.occurrences > 1 && <span className="tag">×{i.occurrences}</span>}
                  <span className="att-time">{fmtAgo(i.detectedAt, now)}</span>
                </div>
                <div className="att-camp">{i.campaignName}</div>
                <div className="att-sum">{i.result.summary}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="flow">
        {["Monitor", "Detect", "Validate", "Prioritise", "Notify", "Act"].map((s, k) => (
          <div key={s} className={`flow-step fs-${k + 1}`}>
            <span className="flow-n">{k + 1}</span>
            <span className="flow-t">{s}</span>
            <span className="flow-d">
              {["Hourly metrics & status", "Campaign-specific rules", "Min-data & freshness checks", "Magnitude × confidence × exposure", "Routed by severity", "Advertiser stays in control"][k]}
            </span>
          </div>
        ))}
        <button className="btn" onClick={() => openSim()}><Icon name="bolt" size={14} /> Try it: inject an anomaly</button>
      </div>
      <p className="foot-note">Sample advertiser data is synthetic. {fmtInt(state.campaigns.reduce((a, c) => a + c.historyDays, 0))} campaign-days of history power the baselines.</p>
    </>
  );
}
