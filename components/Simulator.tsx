"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { InjectionKind } from "@/lib/types";
import { Icon } from "./ui";

const SCENARIOS: { kind: InjectionKind; title: string; l1: string; l2: string; zero?: boolean }[] = [
  { kind: "delivery", title: "Delivery drop", l1: "Impressions −60% in the last 2 hours → Warning", l2: "Inject again: zero impressions → escalates to Critical" },
  { kind: "overspend", title: "Overspend", l1: "Spend +30% vs pace → Warning", l2: "Inject again: +60% → Critical if overspend > $100" },
  { kind: "ctr", title: "CTR drop", l1: "CTR −30% → Warning (needs ≥ 1,000 impressions)", l2: "Inject again: −50% → Critical" },
  { kind: "cpa", title: "CPA spike", l1: "CPA +37% → Warning (needs ≥ 10 conversions)", l2: "Inject again: +72% → Critical" },
  { kind: "zero_conv", title: "Zero conversions", l1: "Spend continues, 0 conversions → separate rule", l2: "Inject again: deduplicated into the same incident" },
  { kind: "data_outage", title: "Data feed outage", l1: "Feed 3h stale → metric rules pause, data-health alert", l2: "Inject again: 7h stale → Critical data-health alert" },
];

const TRY = [
  ["Cold Brew Launch", "CTR drop", "low volume → skipped, no false alarm"],
  ["Festive Gift Bundle", "CPA spike", "new campaign → low-confidence baseline, skipped"],
  ["Brand Awareness Video", "Zero conversions", "no tracking → rule doesn't apply"],
  ["New Arrivals Prospecting", "CPA spike ×2", "few conversions → critical downgraded to warning"],
];

export default function Simulator({ open, initialCampaign, onClose }: { open: boolean; initialCampaign?: string; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const [cid, setCid] = useState(initialCampaign ?? "c2");
  useEffect(() => {
    if (open && initialCampaign) setCid(initialCampaign);
  }, [open, initialCampaign]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const c = state.campaigns.find((x) => x.id === cid)!;

  return (
    <>
      <div className={`scrim ${open ? "on" : ""}`} onClick={onClose} />
      <aside className={`drawer ${open ? "on" : ""}`} aria-hidden={!open}>
        <header className="drawer-h">
          <div>
            <h2><Icon name="bolt" size={15} /> Anomaly simulator</h2>
            <p className="small muted">Changes today's synthetic data, then re-runs the rule engine for that campaign.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </header>
        <div className="drawer-b">
          <label className="field">
            <span>Campaign</span>
            <select value={cid} onChange={(e) => setCid(e.target.value)}>
              {state.campaigns.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <div className="sim-list">
            {SCENARIOS.map((s) => {
              const lvl = c.injections[s.kind] ?? 0;
              return (
                <div key={s.kind} className={`sim ${lvl ? "active" : ""}`}>
                  <div className="sim-t">
                    <b>{s.title}</b>
                    {lvl > 0 && <span className="tag">Level {lvl} active</span>}
                  </div>
                  <div className="small muted">{lvl === 0 ? s.l1 : s.l2}</div>
                  <button className="btn btn-sm" onClick={() => dispatch({ type: "inject", campaignId: cid, kind: s.kind })}>
                    {lvl === 0 ? "Inject" : "Inject again"}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="drawer-actions">
            <button className="btn btn-sm" onClick={() => dispatch({ type: "repeat" })}><Icon name="repeat" size={13} />Repeat last anomaly</button>
            <button className="btn btn-sm" onClick={() => dispatch({ type: "restore", campaignId: cid })}>Clear this campaign</button>
            <button className="btn btn-sm btn-ghost" onClick={() => { if (confirm("Reset the whole demo to its starting state?")) dispatch({ type: "reset" }); }}><Icon name="reset" size={13} />Reset demo</button>
          </div>
          <div className="try">
            <div className="try-h">Guardrail checks to try</div>
            {TRY.map(([camp, what, why]) => (
              <div key={camp + what} className="try-i"><b>{camp}</b> · {what}<div className="tiny muted">{why}</div></div>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}
