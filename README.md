# Pinpoint: campaign anomaly alerts (prototype)

Media.net APM case study, Option 2: an alerting system for anomalies in ad campaign performance.

Pinpoint detects meaningful campaign anomalies, prioritises them by business context, and helps advertisers act in time through contextual notifications. All data, emails and campaign changes in this prototype are **simulated**.

## What the prototype does

| Capability | Where to see it |
|---|---|
| Campaign monitoring with campaign-specific baselines (same weekday, up to 28 days) | Overview, Campaigns → any campaign |
| Rule engine: delivery, budget pacing, CTR drop, CPA spike, zero conversions, data health | Rules & thresholds (editable), campaign rule checks |
| Minimum-data checks (impressions, conversions, low-confidence baselines) | Simulate a CTR drop on *Cold Brew Launch* |
| Severity scoring: magnitude × confidence × exposure | Any alert → "Why it fired" |
| Routing: critical → immediate email, warning → 6-hour digest, info → dashboard | Notifications |
| Contextual alerts with suggested investigation (no guessed root cause) | Any alert |
| Alert lifecycle: acknowledge → investigate → resolve / dismiss with reason | Any alert |
| Deduplication and escalation (one incident per campaign + rule) | Inject the same anomaly twice |
| Fail-safe: stale data pauses metric rules and raises a data-health alert | Simulate a data feed outage |
| Pilot metrics: timely resolution rate (North Star), time to action, precision, alerts/day | Pilot metrics |

## 2-minute demo script

1. **Overview**: one critical CPA spike on *Coffee Subscription Retargeting* ($20 → $34, +70%).
2. Open it: see what changed, the thresholds and data checks, the priority score and the investigation checklist. **Acknowledge → Mark resolved.**
3. **Simulate anomaly** → *New Arrivals Prospecting* → Delivery drop (warning). Inject again → zero delivery, escalated to critical with a new email.
4. *Cold Brew Launch* → CTR drop → skipped: too few impressions, no false alarm.
5. *Brewing Gear Search* → Data feed outage → "Insufficient data", not "Healthy".
6. **Notifications**: the immediate emails, plus "Send digest now" for warnings.
7. **Pilot metrics** update as you act.

Use **Reset demo** in the simulator to start again.

## Run locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

## Tech

Next.js 15 (App Router) · React 19 · TypeScript · Recharts. No backend: state lives in the browser (localStorage).
