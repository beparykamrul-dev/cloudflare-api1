import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../config/environments/", import.meta.url);
const files = readdirSync(root).filter((f) => f.endsWith(".yml"));
if (files.length < 3) throw new Error("Expected dev, staging and production environment configuration");

const forbidden = /(CLOUDFLARE_API_TOKEN\s*:\s*\S+|Bearer\s+[A-Za-z0-9._-]{12,}|api[_-]?token\s*[:=]\s*['\"]?[^\s'\"]+)/i;
for (const file of files) {
  const content = readFileSync(join(root.pathname, file), "utf8");
  if (forbidden.test(content)) throw new Error(`Secret-like value detected in ${file}`);
}

console.log(`Validated ${files.length} environment files; no embedded Cloudflare credentials found.`);
