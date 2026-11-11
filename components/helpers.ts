import { evaluateCampaign, isOpen, SEV_RANK } from "@/lib/engine";
import { Severity } from "@/lib/types";
import { Campaign, Incident, State } from "@/lib/types";

export function campaignHealth(s: State, c: Campaign): "healthy" | "critical" | "warning" | "info" | "nodata" {
  if (c.feedLagHours >= s.rules.dataHealth.staleHours) return "nodata";
  // Worst of: open incidents, and what the latest rule evaluation says right now
  const sevs: Severity[] = s.incidents.filter((i) => i.campaignId === c.id && isOpen(i)).map((i) => i.severity);
  evaluateCampaign(c, s.rules).forEach((r) => r.status === "triggered" && r.severity && sevs.push(r.severity));
  if (!sevs.length) return "healthy";
  return sevs.reduce((a, b) => (SEV_RANK[b] > SEV_RANK[a] ? b : a));
}

export function sortIncidents(list: Incident[]) {
  return [...list].sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || (b.result.score?.total ?? 0) - (a.result.score?.total ?? 0) || b.detectedAt - a.detectedAt);
}
