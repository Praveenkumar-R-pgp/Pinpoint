"use client";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStore } from "@/lib/store";
import { pilotMetrics } from "@/lib/engine";
import { fmtDuration } from "@/lib/format";
import { Card, PageHeader } from "./ui";

function Tile({ label, value, target, ok, note }: { label: string; value: string; target?: string; ok?: boolean | null; note?: string }) {
  return (
    <div className="kpi static">
      <span className="kpi-l">{label}</span>
      <span className="kpi-v">{value}</span>
      {target && <span className={`kpi-t ${ok == null ? "" : ok ? "ok" : "bad"}`}>{ok == null ? "" : ok ? "✓ " : "✕ "}Target {target}</span>}
      {note && <span className="kpi-s">{note}</span>}
    </div>
  );
}

export default function Metrics() {
  const { state, now } = useStore();
  const m = pilotMetrics(state, now);
  const rate = m.timelyRate;
  return (
    <>
      <PageHeader title="Pilot metrics" sub="Seeded 14-day pilot history plus everything you do in this session. Acknowledge or dismiss alerts and watch these update." />
      <div className="kpis">
        <Tile label="Timely actionable resolution rate" value={rate == null ? "—" : `${Math.round(rate * 100)}%`} target="≥ 70%" ok={rate == null ? null : rate >= 0.7} note={`${m.timelyCount} of ${m.decidedCount} confirmed anomalies actioned within SLA`} />
        <Tile label="Median time to action" value={fmtDuration(m.tta)} note="Detection → acknowledged" />
        <Tile label="Median time to resolve" value={fmtDuration(m.ttr)} note="Detection → resolved" />
        <Tile label="Alert precision (proxy)" value={`${Math.round(m.precision * 100)}%`} target="≥ 80%" ok={m.precision >= 0.8} note={`${m.dismissed} of ${m.total} dismissed as not actionable`} />
        <Tile label="Proactive alerts / advertiser / day" value={m.perDay.toFixed(1)} target="≤ 3" ok={m.perDay <= 3} note="Critical + warning, 15-day average" />
      </div>
      <div className="grid-2-1">
        <Card title="Proactive alerts per day">
          <div className="chart">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={m.days} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="#F1F3F5" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6B7280" }} tickLine={false} axisLine={{ stroke: "#E5E7EB" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#6B7280" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #E5E7EB" }} />
                <ReferenceLine y={3} stroke="#9CA3AF" strokeDasharray="4 4" label={{ value: "fatigue guardrail (3/day)", position: "insideTopLeft", fontSize: 11, fill: "#6B7280" }} />
                <Bar dataKey="critical" name="Critical" stackId="a" fill="#C8423B" isAnimationActive={false} />
                <Bar dataKey="warning" name="Warning" stackId="a" fill="#F2A541" radius={[2, 2, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Definitions">
          <dl className="defs">
            <dt>Timely resolution rate (North Star)</dt>
            <dd>Confirmed actionable anomalies with an action recorded within SLA (critical 2h, warning 24h) ÷ all confirmed actionable anomalies. Action is not the same as recovery.</dd>
            <dt>Precision proxy</dt>
            <dd>Share of alerts not dismissed as false positives. In the pilot this is checked against an independent anomaly audit.</dd>
            <dt>Mean time to detect</dt>
            <dd>{fmtDuration(m.mttd)} average from anomaly start to alert (hourly rules + 2-hour confirmation window).</dd>
          </dl>
        </Card>
      </div>
    </>
  );
}
