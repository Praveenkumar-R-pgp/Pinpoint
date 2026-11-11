"use client";
import React from "react";
import { Severity, Status } from "@/lib/types";

const P: Record<string, React.ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
  campaigns: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
  alerts: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>,
  rules: <><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></>,
  metrics: <><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></>,
  bolt: <><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></>,
  x: <><path d="M18 6 6 18M6 6l12 12" /></>,
  check: <><path d="M20 6 9 17l-5-5" /></>,
  back: <><path d="M19 12H5M12 19l-7-7 7-7" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M1 12h4M19 12h4" /></>,
  skip: <><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>,
  warn: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  reset: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
  repeat: <><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></>,
  ext: <><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
};

export function Icon({ name, size = 16, className = "" }: { name: keyof typeof P | string; size?: number; className?: string }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {P[name]}
    </svg>
  );
}

export function SevPill({ sev, small }: { sev: Severity; small?: boolean }) {
  return <span className={`pill sev-${sev} ${small ? "pill-sm" : ""}`}>{sev === "critical" ? "Critical" : sev === "warning" ? "Warning" : "Info"}</span>;
}

const STATUS_LABEL: Record<Status, string> = { open: "Open", acknowledged: "Acknowledged", investigating: "Investigating", resolved: "Resolved", dismissed: "Dismissed" };
export function StatusPill({ status }: { status: Status }) {
  return <span className={`status st-${status}`}><span className="dot" />{STATUS_LABEL[status]}</span>;
}

export function HealthPill({ health }: { health: "healthy" | "critical" | "warning" | "info" | "nodata" }) {
  const label = { healthy: "Healthy", critical: "Critical", warning: "Warning", info: "Watch", nodata: "Insufficient data" }[health];
  return <span className={`health h-${health}`}><span className="dot" />{label}</span>;
}

export function Card({ title, actions, children, className = "", pad = true }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <header className="card-h">
          <h3>{title}</h3>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className={pad ? "card-b" : ""}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, sub, right }: { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="page-h">
      <div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Delta({ d, goodWhenUp = false }: { d?: number; goodWhenUp?: boolean }) {
  if (d == null || Math.abs(d) < 0.5) return <span className="delta">0%</span>;
  const up = d > 0;
  const bad = goodWhenUp ? !up : up;
  return <span className={`delta ${bad ? "bad" : "good"}`}>{up ? "▲" : "▼"} {Math.abs(Math.round(d))}%</span>;
}
