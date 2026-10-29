/**
 * Tiny in-memory cache for page-level data.
 *
 * Pages seed their local state from this cache so that returning to an already
 * visited page renders instantly while the fresh request runs in the
 * background. It intentionally stays process-local: on a full reload everything
 * is fetched from scratch, and `clear()` is called on login/logout so one
 * account never sees another account's data.
 */

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 64;

const store = new Map<string, CacheEntry>();

export const pageCache = {
  get<T>(key: string): T | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      store.delete(key);
      return undefined;
    }
    return entry.data as T;
  },

  set<T>(key: string, data: T): void {
    store.delete(key);
    store.set(key, { data, expiresAt: Date.now() + TTL_MS });
    while (store.size > MAX_ENTRIES) {
      const oldest = store.keys().next().value;
      if (oldest === undefined) break;
      store.delete(oldest);
    }
  },

  delete(key: string): void {
    store.delete(key);
  },

  clear(): void {
    store.clear();
  },
};
