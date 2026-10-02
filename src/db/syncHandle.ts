import type { SyncEngine } from './sync';

let engine: SyncEngine | null = null;

export function setSyncEngine(e: SyncEngine | null): void {
  engine = e;
}

/** Push and pull now (used before server actions that need fresh data). */
export async function syncNowGlobal(): Promise<void> {
  await engine?.now();
}
