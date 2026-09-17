export type PanelSection = "overview" | "inventory" | "cloudflare" | "dns" | "deployments" | "monitoring" | "audit" | "services";

export interface PanelSummary {
  service: string;
  environment: string;
  sections: PanelSection[];
  apiBase: string;
  generatedAt: string;
}
