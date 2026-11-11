"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { isOpen, nextDigestAt } from "@/lib/engine";
import { fmtClock, fmtDateTime } from "@/lib/format";
import { Card, Icon, PageHeader, SevPill } from "./ui";
import { useNav } from "./Shell";

const KIND_LABEL = { immediate: "Critical · immediate", escalation: "Escalation", digest: "6-hour digest", data_health: "Data health" };

export default function Notifications() {
  const { state, dispatch, now } = useStore();
  const { go } = useNav();
  const [sel, setSel] = useState<string | null>(state.notifications[0]?.id ?? null);
  const queued = state.incidents.filter((i) => i.severity === "warning" && isOpen(i) && !i.digestSent);
  const n = state.notifications.find((x) => x.id === sel) ?? state.notifications[0];
  const incs = n ? n.incidentIds.map((id) => state.incidents.find((i) => i.id === id)).filter(Boolean) : [];

  return (
    <>
      <PageHeader title="Notifications" sub="Simulated email outbox. Critical alerts send immediately; warnings are batched; info stays in the dashboard." />
      <div className="digest-bar">
        <div>
          <b>Next warning digest at {fmtClock(nextDigestAt(now))}</b>
          <span className="muted"> · {queued.length} unresolved warning{queued.length === 1 ? "" : "s"} queued</span>
          {queued.length > 0 && <div className="small muted">{queued.map((q) => `${q.campaignName} · ${q.ruleName}`).join(" · ")}</div>}
        </div>
        <button className="btn" disabled={!queued.length} onClick={() => dispatch({ type: "digest" })}>Send digest now (simulate)</button>
      </div>

      <div className="mail">
        <Card pad={false} className="mail-list">
          {state.notifications.length === 0 && <div className="empty tall"><p>No emails yet.</p></div>}
          {state.notifications.map((x) => (
            <button key={x.id} className={`mail-i ${n?.id === x.id ? "on" : ""}`} onClick={() => setSel(x.id)}>
              <div className="mail-top">
                <span className={`kind kind-${x.kind}`}>{KIND_LABEL[x.kind]}</span>
                <span className="muted small">{fmtDateTime(x.at, now)}</span>
              </div>
              <div className="mail-s">{x.subject}</div>
            </button>
          ))}
        </Card>

        {n ? (
          <Card pad={false} className="mail-view">
            <div className="email-h">
              <div className="email-subj">{n.subject}</div>
              <div className="email-meta">
                <div><span className="muted">From</span> Pinpoint Alerts &lt;alerts@pinpoint.example&gt;</div>
                <div><span className="muted">To</span> Priya Menon &lt;priya@brewcraft.example&gt;</div>
                <div><span className="muted">Sent</span> {fmtDateTime(n.at, now)}</div>
              </div>
              <span className="sim-badge">Simulated email, not sent</span>
            </div>
            <div className="email-b">
              <p>Hi Priya,</p>
              {n.kind === "digest" ? (
                <>
                  <p>These warnings are still unresolved. None needed an immediate email, but they are worth a look today:</p>
                  <ul>{n.lines.map((l) => <li key={l}>{l}</li>)}</ul>
                </>
              ) : (
                <>
                  {incs.map((i) => (
                    <div key={i.id} className="email-card">
                      <div className="email-card-h"><SevPill sev={i.severity} small /> <b>{i.campaignName}</b></div>
                      <div className="email-card-sum">{i.result.summary}</div>
                      <p className="small">{n.lines[0]}</p>
                      <p className="small muted">Checks passed: {i.result.checks.filter((k) => k.ok).length}/{i.result.checks.length} · Suggested first look: {i.ruleId === "cpa" ? "conversion tracking, landing page, recent targeting or creative changes" : i.ruleId === "delivery" ? "approval status, billing, bid or budget caps" : i.ruleId === "data_health" ? "ad platform integration status" : "recent changes to this campaign"}.</p>
                    </div>
                  ))}
                  <p className="small">Root cause is not confirmed. Pinpoint never changes your campaigns. You decide what to do.</p>
                </>
              )}
              <button className="btn btn-primary" onClick={() => go(incs[0] ? { view: "alerts", incidentId: incs[0].id } : { view: "alerts" })}>
                View in Pinpoint <Icon name="ext" size={12} />
              </button>
            </div>
          </Card>
        ) : (
          <Card><div className="empty tall"><p>Select an email.</p></div></Card>
        )}
      </div>
    </>
  );
}
