export function controlPanelHtml(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FTN Control Plane</title>
<style>
:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif}body{margin:0;background:#0b1020;color:#e7ebf3}header{padding:22px 28px;border-bottom:1px solid #20283a;background:#10172a}main{padding:24px;max-width:1200px;margin:auto}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.card{background:#121a2d;border:1px solid #263149;border-radius:12px;padding:18px}.muted{color:#9ba7bd;font-size:13px}.ok{font-size:22px;margin-top:8px}.links{display:flex;flex-wrap:wrap;gap:8px}.links a{color:#d8e2ff;text-decoration:none;border:1px solid #33415f;padding:9px 12px;border-radius:8px}pre{white-space:pre-wrap;overflow:auto}</style></head>
<body><header><strong>FTN Control Plane</strong><div class="muted">Cloudflare API management</div></header>
<main><div id="status" class="grid"><div class="card"><div class="muted">Loading</div><div class="ok">Control Plane</div></div></div><h2>Resources</h2><div class="links"><a href="/health">Health</a><a href="/health/ready">Readiness</a><a href="/metrics">Metrics</a><a href="/api/panel">Panel API</a><a href="/api/inventory">Inventory API</a><a href="/api/cloudflare/zones">Cloudflare Zones</a></div><h2>Panel data</h2><pre id="data">Loading…</pre></main>
<script>fetch('/api/panel').then(async r=>{const d=await r.json();document.getElementById('data').textContent=JSON.stringify(d,null,2);const p=d.panel||{};document.getElementById('status').innerHTML='<div class="card"><div class="muted">Service</div><div class="ok">'+p.service+'</div></div><div class="card"><div class="muted">Environment</div><div class="ok">'+p.environment+'</div></div><div class="card"><div class="muted">Sections</div><div class="ok">'+((p.sections||[]).length)+'</div></div>'}).catch(e=>document.getElementById('data').textContent=e.message)</script>
</body></html>`;
}
