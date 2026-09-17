import type { InventoryItem } from "./types.js";

export type DriftStatus = "MISSING" | "EXTRA" | "CHANGED" | "OK";
export type DriftItem = { key: string; status: DriftStatus; expected?: InventoryItem; observed?: InventoryItem };

function key(item: InventoryItem) { return `${item.resourceType}:${item.resourceId}`; }

export function detectDrift(expected: InventoryItem[], observed: InventoryItem[]): DriftItem[] {
  const expectedMap = new Map(expected.map((item) => [key(item), item]));
  const observedMap = new Map(observed.map((item) => [key(item), item]));
  const keys = new Set([...expectedMap.keys(), ...observedMap.keys()]);
  const result: DriftItem[] = [];
  for (const k of keys) {
    const e = expectedMap.get(k); const o = observedMap.get(k);
    if (!e) result.push({ key: k, status: "EXTRA", observed: o });
    else if (!o) result.push({ key: k, status: "MISSING", expected: e });
    else if (e.name !== o.name || e.scope !== o.scope) result.push({ key: k, status: "CHANGED", expected: e, observed: o });
    else result.push({ key: k, status: "OK", expected: e, observed: o });
  }
  return result;
}
