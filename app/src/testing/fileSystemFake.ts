// Test-only: an in-memory stand-in for expo-file-system's File / Directory / Paths.
// Images can carry dimensions so the image-manipulator fake can resize them.

type Entry = { size: number; width?: number; height?: number };
type Part = string | FakeFile | FakeDirectory;
type Op = 'copy' | 'delete' | 'move';

const files = new Map<string, Entry>();
const dirs = new Set<string>();
let failures: { op: Op; error: Error }[] = [];

export const CACHE = 'file:///cache';
export const DOCUMENT = 'file:///document';

function join(parts: Part[]): string {
  const raw = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  const path = raw.replace(/^file:/, '').split('/').filter(Boolean).join('/');
  return `file:///${path}`;
}

function takeFailure(op: Op) {
  const index = failures.findIndex((f) => f.op === op);
  if (index === -1) return;
  const [{ error }] = failures.splice(index, 1);
  throw error;
}

export class FakeFile {
  readonly uri: string;
  constructor(...parts: Part[]) {
    this.uri = join(parts);
  }
  get name() {
    return this.uri.slice(this.uri.lastIndexOf('/') + 1);
  }
  get exists() {
    return files.has(this.uri);
  }
  get size() {
    return files.get(this.uri)?.size ?? 0;
  }
  create() {
    files.set(this.uri, { size: 0 });
  }
  delete() {
    takeFailure('delete');
    if (!files.has(this.uri)) throw new Error(`File not found: ${this.uri}`);
    files.delete(this.uri);
  }
  async copy(destination: FakeFile | FakeDirectory) {
    takeFailure('copy');
    const entry = files.get(this.uri);
    if (!entry) throw new Error(`File not found: ${this.uri}`);
    const target = destination instanceof FakeDirectory ? join([destination, this.name]) : destination.uri;
    files.set(target, { ...entry });
  }
  async move(destination: FakeFile | FakeDirectory) {
    takeFailure('move');
    const entry = files.get(this.uri);
    if (!entry) throw new Error(`File not found: ${this.uri}`);
    const target = destination instanceof FakeDirectory ? join([destination, this.name]) : destination.uri;
    files.delete(this.uri);
    files.set(target, entry);
  }
}

export class FakeDirectory {
  readonly uri: string;
  constructor(...parts: Part[]) {
    this.uri = join(parts);
  }
  get exists() {
    return dirs.has(this.uri) || [...files.keys()].some((uri) => uri.startsWith(`${this.uri}/`));
  }
  create() {
    dirs.add(this.uri);
  }
  list(): (FakeFile | FakeDirectory)[] {
    const prefix = `${this.uri}/`;
    return [...files.keys()]
      .filter((uri) => uri.startsWith(prefix) && !uri.slice(prefix.length).includes('/'))
      .map((uri) => new FakeFile(uri));
  }
  delete() {
    for (const uri of [...files.keys()]) if (uri.startsWith(`${this.uri}/`)) files.delete(uri);
    dirs.delete(this.uri);
  }
}

export const FakePaths = {
  get cache() {
    return new FakeDirectory(CACHE);
  },
  get document() {
    return new FakeDirectory(DOCUMENT);
  },
};

// The module jest.setup.ts installs in place of expo-file-system.
export const fileSystemModule = { File: FakeFile, Directory: FakeDirectory, Paths: FakePaths };

export const fakeFs = {
  reset() {
    files.clear();
    dirs.clear();
    failures = [];
  },
  put(uri: string, entry: Entry = { size: 1000 }) {
    files.set(uri, entry);
  },
  get(uri: string) {
    return files.get(uri);
  },
  has(uri: string) {
    return files.has(uri);
  },
  uris() {
    return [...files.keys()].sort();
  },
  under(prefix: string) {
    return [...files.keys()].filter((uri) => uri.startsWith(prefix)).sort();
  },
  failNext(op: Op, error = new Error(`${op} failed`)) {
    failures.push({ op, error });
  },
};
