"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { INVESTIGATION, isOpen, nextDigestAt } from "@/lib/engine";
import { fmtAgo, fmtDateTime, fmtDelta, fmtMoney, fmtValue, fmtClock } from "@/lib/format";
import { Severity, Status } from "@/lib/types";
import { Card, Icon, PageHeader, SevPill, StatusPill } from "./ui";
import { useNav } from "./Shell";
import { sortIncidents } from "./helpers";

type Tab = "active" | "resolved" | "dismissed" | "all";

export function AlertsInbox() {
  const { state, now } = useStore();
  const { go, openSim } = useNav();
  const [tab, setTab] = useState<Tab>("active");
  const [sev, setSev] = useState<Severity | "all">("all");

  const list = sortIncidents(
    state.incidents.filter((i) => {
      if (tab === "active" && !isOpen(i)) return false;
      if (tab === "resolved" && i.status !== "resolved") return false;
      if (tab === "dismissed" && i.status !== "dismissed") return false;
      if (sev !== "all" && i.severity !== sev) return false;
      return true;
    }),
  );
  const count = (t: Tab) =>
    state.incidents.filter((i) => (t === "active" ? isOpen(i) : t === "all" ? true : i.status === t)).length;

  return (
    <>
      <PageHeader title="Alerts" sub="One incident per campaign and rule. Repeat detections update the incident instead of sending a new alert." />
      <div className="toolbar">
        <div className="tabs">
          {(["active", "resolved", "dismissed", "all"] as Tab[]).map((t) => (
            <button key={t} className={`tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
              {t === "active" ? "Active" : t[0].toUpperCase() + t.slice(1)} <span className="tab-n">{count(t)}</span>
            </button>
          ))}
        </div>
        <div className="seg">
          {(["all", "critical", "warning", "info"] as const).map((s) => (
            <button key={s} className={`seg-b ${sev === s ? "on" : ""}`} onClick={() => setSev(s)}>
              {s === "all" ? "All severities" : s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <Card pad={false}>
        {list.length === 0 ? (
          <div className="empty tall">
            <Icon name="check" size={20} />
            <p>Nothing here. <button className="link" onClick={() => openSim()}>Simulate an anomaly</button> to see the flow.</p>
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 92 }}>Severity</th>
                <th>Alert</th>
                <th>Change</th>
                <th className="r">Spend at risk</th>
                <th>Detected</th>
                <th>Routing</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id} className="click" onClick={() => go({ view: "alerts", incidentId: i.id })}>
                  <td><SevPill sev={i.severity} small /></td>
                  <td>
                    <div className="cell-main">
                      {i.ruleName}
                      {i.escalated && <span className="tag tag-red">Escalated</span>}
                      {i.occurrences > 1 && <span className="tag">×{i.occurrences}</span>}
                    </div>
                    <div className="cell-sub">{i.campaignName} · {i.id}</div>
                  </td>
                  <td className="num-text">{i.result.summary}</td>
                  <td className="r num">{i.result.spendAtRisk ? fmtMoney(i.result.spendAtRisk) : "—"}</td>
                  <td className="nowrap">{fmtAgo(i.detectedAt, now)}</td>
                  <td className="muted small">{i.routing}</td>
                  <td><StatusPill status={i.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

const DISMISS_REASONS = ["Expected change (promotion, seasonality, planned)", "Data issue, not a real change", "Not actionable for us", "Already handled outside Pinpoint"];

export function AlertDetail({ id }: { id: string }) {
  const { state, dispatch, now } = useStore();
  const { go } = useNav();
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState(DISMISS_REASONS[0]);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const i = state.incidents.find((x) => x.id === id);
  if (!i) return <p>Alert not found.</p>;
  const r = i.result;
  const set = (status: Status, why?: string) => dispatch({ type: "status", id: i.id, status, reason: why });
  const open = isOpen(i);
  const steps: { s: Status; label: string }[] = [
    { s: "open", label: "Open" },
    { s: "acknowledged", label: "Acknowledged" },
    { s: "investigating", label: "Investigating" },
    { s: "resolved", label: "Resolved" },
  ];
  const stepIdx = i.status === "dismissed" ? -1 : steps.findIndex((x) => x.s === i.status);
  const sla = i.severity === "critical" ? 120 : i.severity === "warning" ? 1440 : null;
  const ackMins = i.ackAt ? (i.ackAt - i.detectedAt) / 60000 : null;

  return (
    <>
      <button className="back" onClick={() => go({ view: "alerts" })}><Icon name="back" size={14} />Alerts</button>
      <PageHeader
        title={<><SevPill sev={i.severity} /> {i.ruleName} · {i.campaignName}</>}
        sub={<>{i.id} · detected {fmtDateTime(i.detectedAt, now)} · last seen {fmtAgo(i.lastSeenAt, now)}{i.occurrences > 1 && <> · <b>{i.occurrences} detections merged</b></>}{i.escalated && <span className="tag tag-red">Escalated</span>}</>}
        right={<StatusPill status={i.status} />}
      />

      <div className="grid-2-1">
        <div className="col">
          <Card title="What changed">
            <div className="change">
              <div>
                <span className="lbl">Baseline</span>
                <span className="big muted-num">{r.ruleId === "data_health" ? "0h lag" : r.ruleId === "zero_conv" ? `${fmtMoney(r.baseline!)} trigger` : fmtValue(r.baseline, r.fmt)}</span>
              </div>
              <span className="arrow">→</span>
              <div>
                <span className="lbl">Current</span>
                <span className="big">{r.ruleId === "data_health" ? `${r.current}h lag` : fmtValue(r.current, r.fmt)}</span>
              </div>
              {r.deltaPct != null && r.ruleId !== "zero_conv" && r.ruleId !== "data_health" && (
                <div className={`chg chg-${i.severity}`}>{fmtDelta(r.deltaPct)}</div>
              )}
            </div>
            <p className="lead">{r.summary}. {r.reason}</p>
            <p className="muted small">Metric: {r.metric}. Baseline is campaign-specific, not a universal threshold.</p>
            {i.recovered && <div className="banner mt-s">Metric is back within the normal range. Resolve the alert once you have confirmed the cause.</div>}
          </Card>

          <Card title="Why it fired">
            <div className="rule-def mono">{r.threshold}</div>
            <ul className="checklist">
              {r.checks.map((k) => (
                <li key={k.label} className={k.ok ? "ok" : "no"}><Icon name={k.ok ? "check" : "x"} size={13} />{k.label}</li>
              ))}
            </ul>
            {r.score && (
              <div className="score">
                <div className="score-h">Priority score <b>{r.score.total}</b></div>
                <div className="score-row">
                  <div><span>Magnitude</span><b>{r.score.magnitude}</b><em>size of deviation vs critical threshold</em></div>
                  <span className="op">×</span>
                  <div><span>Confidence</span><b>{r.score.confidence}</b><em>data volume & baseline quality</em></div>
                  <span className="op">×</span>
                  <div><span>Exposure</span><b>{r.score.exposure}</b><em>spend at risk {fmtMoney(r.spendAtRisk)}</em></div>
                </div>
                {r.score.downgraded && <p className="small warn-text">Downgraded from critical because confidence is below 0.7.</p>}
              </div>
            )}
          </Card>

          <Card title="Suggested investigation">
            <ul className="todo">
              {(INVESTIGATION[i.ruleId] ?? []).map((t, k) => (
                <li key={t}>
                  <label>
                    <input type="checkbox" checked={!!checked[k]} onChange={() => setChecked({ ...checked, [k]: !checked[k] })} />
                    <span>{t}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="note">Root cause not confirmed. Pinpoint shows what changed and where to look. It does not guess a cause or change the campaign for you.</p>
          </Card>
        </div>

        <div className="col">
          <Card title="Actions">
            <div className="stepper">
              {steps.map((st, k) => (
                <div key={st.s} className={`step ${k <= stepIdx ? "done" : ""} ${k === stepIdx ? "cur" : ""}`}>
                  <span className="step-dot" />
                  <span>{st.label}</span>
                </div>
              ))}
            </div>
            {i.status === "dismissed" ? (
              <>
                <p className="small">Dismissed as not actionable: <b>{i.dismissReason}</b>. Counts against alert precision.</p>
                <button className="btn" onClick={() => set("open")}>Reopen</button>
              </>
            ) : i.status === "resolved" ? (
              <>
                <p className="small">Resolved {fmtDateTime(i.resolvedAt!, now)}.</p>
                <button className="btn" onClick={() => set("open")}>Reopen</button>
              </>
            ) : (
              <div className="actions">
                {i.status === "open" && <button className="btn btn-primary" onClick={() => set("acknowledged")}>Acknowledge</button>}
                {(i.status === "open" || i.status === "acknowledged") && <button className={`btn ${i.status === "acknowledged" ? "btn-primary" : ""}`} onClick={() => set("investigating")}>Start investigating</button>}
                <button className={`btn ${i.status === "investigating" ? "btn-primary" : ""}`} onClick={() => set("resolved")}>Mark resolved</button>
                <button className="btn btn-ghost" onClick={() => setDismissing(true)}>Dismiss as false positive</button>
              </div>
            )}
            {dismissing && open && (
              <div className="dismiss">
                <label className="small">Why is this not actionable?</label>
                <select value={reason} onChange={(e) => setReason(e.target.value)}>
                  {DISMISS_REASONS.map((d) => <option key={d}>{d}</option>)}
                </select>
                <div className="actions">
                  <button className="btn btn-danger" onClick={() => { set("dismissed", reason); setDismissing(false); }}>Dismiss alert</button>
                  <button className="btn btn-ghost" onClick={() => setDismissing(false)}>Cancel</button>
                </div>
              </div>
            )}
            {sla && (
              <div className="sla">
                <span>Response SLA</span>
                <b>{sla >= 1440 ? "24h" : "2h"}</b>
                <span className={ackMins == null ? "muted" : ackMins <= sla ? "ok-text" : "warn-text"}>
                  {ackMins == null ? "not yet actioned" : ackMins <= sla ? "met" : "missed"}
                </span>
              </div>
            )}
            <button className="link mt-s" onClick={() => go({ view: "campaigns", campaignId: i.campaignId })}>View campaign <Icon name="ext" size={12} /></button>
          </Card>

          <Card title="Routing">
            <p className="small"><b>{i.routing}</b></p>
            <p className="muted small">
              {i.severity === "critical" ? "Critical alerts email immediately after confirmation and repeat only if they escalate." :
               i.severity === "warning" ? "Warnings show in-app and are batched into a 6-hour digest so the inbox stays quiet." :
               "Low-priority deviations stay on the dashboard. No email."}
            </p>
            {i.ruleId !== "data_health" && i.severity === "warning" && !i.digestSent && <p className="small">Queued for the {fmtClock(nextDigestAt(now))} digest.</p>}
            <button className="link" onClick={() => go({ view: "notifications" })}>Open notifications</button>
          </Card>

          <Card title="Activity">
            <ol className="log">
              {[...i.log].reverse().map((l, k) => (
                <li key={k}><span className="log-t">{fmtClock(l.at)}</span><span>{l.text}</span></li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
