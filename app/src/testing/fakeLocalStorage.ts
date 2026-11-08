// In-memory stand-in for the `localStorage` that `expo-sqlite/localStorage/install` puts on
// globalThis (a SQLite-backed Web Storage). Same synchronous methods; nothing persists between
// test files. Tests read it to check what the Supabase client stored.

export class FakeLocalStorage {
  private items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }

  getItem(key: string): string | null {
    return this.items.has(key) ? (this.items.get(key) as string) : null;
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.items.set(key, String(value));
  }

  keys(): string[] {
    return [...this.items.keys()];
  }
}

export const fakeLocalStorage = new FakeLocalStorage();

export function installFakeLocalStorage(): void {
  (globalThis as { localStorage?: unknown }).localStorage = fakeLocalStorage;
}
