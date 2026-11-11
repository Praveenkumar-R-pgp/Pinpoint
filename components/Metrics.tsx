"use client";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStore } from "@/lib/store";
import { pilotMetrics } from "@/lib/engine";
import { fmtDuration } from "@/lib/format";
import { Card, IconChip, PageHeader } from "./ui";
import { useChartColors } from "./theme";

function Tile({ label, value, target, ok, note, icon, tone }: { label: string; value: string; target?: string; ok?: boolean | null; note?: string; icon: string; tone: "red" | "amber" | "blue" | "teal" | "green" | "violet" }) {
  return (
    <div className="kpi static">
      <span className="kpi-top"><IconChip name={icon} tone={tone} /><span className="kpi-l">{label}</span></span>
      <span className="kpi-v">{value}</span>
      {target && <span className={`kpi-t ${ok == null ? "" : ok ? "ok" : "bad"}`}>{ok == null ? "" : ok ? "✓ " : "✕ "}Target {target}</span>}
      {note && <span className="kpi-s">{note}</span>}
    </div>
  );
}

export default function Metrics() {
  const { state, now } = useStore();
  const m = pilotMetrics(state, now);
  const cc = useChartColors();
  const rate = m.timelyRate;
  return (
    <>
      <PageHeader title="Pilot metrics" sub="Seeded 14-day pilot history plus everything you do in this session. Acknowledge or dismiss alerts and watch these update." />
      <div className="kpis">
        <Tile icon="target" tone="green" label="Timely actionable resolution rate" value={rate == null ? "—" : `${Math.round(rate * 100)}%`} target="≥ 70%" ok={rate == null ? null : rate >= 0.7} note={`${m.timelyCount} of ${m.decidedCount} confirmed anomalies actioned within SLA`} />
        <Tile icon="clock" tone="teal" label="Median time to action" value={fmtDuration(m.tta)} note="Detection → acknowledged" />
        <Tile icon="check" tone="blue" label="Median time to resolve" value={fmtDuration(m.ttr)} note="Detection → resolved" />
        <Tile icon="shield" tone="violet" label="Alert precision (proxy)" value={`${Math.round(m.precision * 100)}%`} target="≥ 80%" ok={m.precision >= 0.8} note={`${m.dismissed} of ${m.total} dismissed as not actionable`} />
        <Tile icon="alerts" tone="amber" label="Proactive alerts / advertiser / day" value={m.perDay.toFixed(1)} target="≤ 3" ok={m.perDay <= 3} note="Critical + warning, 15-day average" />
      </div>
      <div className="grid-2-1">
        <Card title="Proactive alerts per day">
          <div className="chart">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={m.days} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke={cc.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: cc.axis }} tickLine={false} axisLine={{ stroke: cc.grid }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: cc.axis }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: `1px solid ${cc.tipBorder}`, background: cc.tipBg, color: cc.tipText }} cursor={{ fill: cc.grid }} />
                <ReferenceLine y={3} stroke={cc.base} strokeDasharray="4 4" label={{ value: "fatigue guardrail (3/day)", position: "insideTopLeft", fontSize: 11, fill: cc.axis }} />
                <Bar dataKey="critical" name="Critical" stackId="a" fill={cc.red} isAnimationActive={false} />
                <Bar dataKey="warning" name="Warning" stackId="a" fill={cc.amber} radius={[2, 2, 0, 0]} isAnimationActive={false} />
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
