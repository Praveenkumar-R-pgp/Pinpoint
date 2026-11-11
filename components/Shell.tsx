"use client";
import React, { createContext, useContext, useState } from "react";
import { useStore } from "@/lib/store";
import { isOpen } from "@/lib/engine";
import { fmtClock } from "@/lib/format";
import { Icon } from "./ui";
import Overview from "./Overview";
import { CampaignDetail, CampaignList } from "./Campaigns";
import { AlertDetail, AlertsInbox } from "./Alerts";
import Notifications from "./Notifications";
import RulesPage from "./RulesPage";
import Metrics from "./Metrics";
import Simulator from "./Simulator";
import Toasts from "./Toasts";

export type View = "overview" | "campaigns" | "alerts" | "notifications" | "rules" | "metrics";
type Nav = { view: View; campaignId?: string; incidentId?: string };
const NavCtx = createContext<{ nav: Nav; go: (n: Nav) => void; openSim: (campaignId?: string) => void } | null>(null);
export const useNav = () => useContext(NavCtx)!;

export default function Shell() {
  const { state, now } = useStore();
  const [nav, setNav] = useState<Nav>({ view: "overview" });
  const [sim, setSim] = useState<{ open: boolean; campaignId?: string }>({ open: false });
  const go = (n: Nav) => {
    setNav(n);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };
  const openSim = (campaignId?: string) => setSim({ open: true, campaignId });

  const open = state.incidents.filter(isOpen);
  const openCrit = open.filter((i) => i.severity === "critical").length;
  const openAll = open.filter((i) => i.severity !== "info").length;
  const items: { v: View; label: string; icon: string; badge?: number; crit?: boolean }[] = [
    { v: "overview", label: "Overview", icon: "overview" },
    { v: "campaigns", label: "Campaigns", icon: "campaigns" },
    { v: "alerts", label: "Alerts", icon: "alerts", badge: openAll, crit: openCrit > 0 },
    { v: "notifications", label: "Notifications", icon: "mail" },
    { v: "rules", label: "Rules & thresholds", icon: "rules" },
    { v: "metrics", label: "Pilot metrics", icon: "metrics" },
  ];

  let body: React.ReactNode = null;
  if (nav.view === "overview") body = <Overview />;
  if (nav.view === "campaigns") body = nav.campaignId ? <CampaignDetail id={nav.campaignId} /> : <CampaignList />;
  if (nav.view === "alerts") body = nav.incidentId ? <AlertDetail id={nav.incidentId} /> : <AlertsInbox />;
  if (nav.view === "notifications") body = <Notifications />;
  if (nav.view === "rules") body = <RulesPage />;
  if (nav.view === "metrics") body = <Metrics />;

  return (
    <NavCtx.Provider value={{ nav, go, openSim }}>
      <div className="app">
        <aside className="side">
          <div className="brand">
            <span className="brand-mark"><Icon name="target" size={18} /></span>
            <span className="brand-name">Pinpoint</span>
          </div>
          <nav>
            {items.map((it) => (
              <button key={it.v} className={`nav-i ${nav.view === it.v ? "on" : ""}`} onClick={() => go({ view: it.v })}>
                <Icon name={it.icon} />
                <span>{it.label}</span>
                {!!it.badge && <span className={`nav-badge ${it.crit ? "crit" : ""}`}>{it.badge}</span>}
              </button>
            ))}
          </nav>
          <div className="side-foot">
            <div className="acct">
              <div className="avatar">P</div>
              <div>
                <div className="acct-n">Priya Menon</div>
                <div className="acct-s">BrewCraft Coffee · D2C</div>
              </div>
            </div>
            <p className="side-note">Media.net APM case study prototype. All data, emails and campaign changes are simulated.</p>
          </div>
        </aside>
        <div className="main">
          <header className="top">
            <div className="top-l">
              <span className="crumb">BrewCraft Coffee</span>
              <span className="sep">/</span>
              <span className="crumb-strong">{items.find((i) => i.v === nav.view)?.label}</span>
            </div>
            <div className="top-r">
              <span className="clock" title="Simulated clock: the demo day is fixed at 14:05 when the demo starts">Today {fmtClock(now)} · simulated clock</span>
              <span className="sim-badge">Simulated data</span>
              <button className="btn btn-primary" onClick={() => openSim(nav.view === "campaigns" ? nav.campaignId : undefined)}>
                <Icon name="bolt" size={14} /> Simulate anomaly
              </button>
            </div>
          </header>
          <main className="content">{body}</main>
        </div>
        <Simulator open={sim.open} initialCampaign={sim.campaignId} onClose={() => setSim({ open: false })} />
        <Toasts />
      </div>
    </NavCtx.Provider>
  );
}
