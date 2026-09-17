import { authorize } from "../auth/authorize.js";
import type { PanelSection, PanelSummary } from "./types.js";

const sections: PanelSection[] = ["overview", "inventory", "cloudflare", "dns", "deployments", "monitoring", "audit", "services"];

export function handleControlPanelApi(req: { method?: string; headers: Record<string, string | string[] | undefined> }, pathname: string): { status: number; body: unknown } | null {
  if (pathname !== "/api/panel" || req.method !== "GET") return null;
  const principal = authorize(req, "services:read");
  if (!principal) return { status: 401, body: { error: "unauthorized" } };
  const summary: PanelSummary = {
    service: "ftn-cloudflare-api",
    environment: process.env.FTN_ENVIRONMENT ?? "development",
    sections,
    apiBase: "/api",
    generatedAt: new Date().toISOString()
  };
  return { status: 200, body: { principal, panel: summary } };
}
