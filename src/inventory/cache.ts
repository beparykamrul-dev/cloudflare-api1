import type { InventoryItem } from "./types.js";

let snapshot: { observedAt: string; items: InventoryItem[] } | null = null;

export function getInventorySnapshot() {
  return snapshot;
}

export function setInventorySnapshot(items: InventoryItem[]) {
  snapshot = { observedAt: new Date().toISOString(), items };
  return snapshot;
}

export function clearInventorySnapshot() {
  snapshot = null;
}
