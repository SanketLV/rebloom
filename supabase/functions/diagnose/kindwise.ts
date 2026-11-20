// The diagnose function's pure part: request checks and the plant.id v3 → app mapping.
// No Deno or npm imports, so `node --test supabase/tests/diagnose-mapping.test.mjs` runs it as is.
// Kindwise facts: .handoff/kindwise-diagnosis.md (verified against the plant.id v3 docs, 2026-11-20).

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGES = 3;
const TOP = 3;
const MAX_TEXT = 2000;
const MAX_LIST = 10;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const DATA_URL = 'data:image/jpeg;base64,';

export type Invalid = { ok: false; status: 400 | 413; code: 'bad_request' | 'image_too_large' };
export type Valid = { ok: true; scanId: string; images: string[] };

const badRequest: Invalid = { ok: false, status: 400, code: 'bad_request' };
const tooLarge: Invalid = { ok: false, status: 413, code: 'image_too_large' };

function decodedSize(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return (b64.length / 4) * 3 - padding;
}

function isJpeg(b64: string): boolean {
  try {
    const head = atob(b64.slice(0, 8));
    return head.charCodeAt(0) === 0xff && head.charCodeAt(1) === 0xd8 && head.charCodeAt(2) === 0xff;
  } catch {
    return false;
  }
}

/** `{ scan_id, images }` → the scan id and the bare base64 of each JPEG, or why not. */
export function validateBody(body: unknown): Valid | Invalid {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return badRequest;
  const { scan_id: scanId, images } = body as { scan_id?: unknown; images?: unknown };
  if (typeof scanId !== 'string' || !UUID.test(scanId)) return badRequest;
  if (!Array.isArray(images) || images.length < 1 || images.length > MAX_IMAGES) return badRequest;
  const bare: string[] = [];
  for (const image of images) {
    if (typeof image !== 'string') return badRequest;
    const b64 = image.startsWith(DATA_URL) ? image.slice(DATA_URL.length) : image;
    // Size first, on the string length alone: never run a regex over a huge string.
    if (b64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4) return tooLarge;
    if (b64.length === 0 || b64.length % 4 !== 0 || !BASE64.test(b64)) return badRequest;
    if (decodedSize(b64) > MAX_IMAGE_BYTES) return tooLarge;
    if (!isJpeg(b64)) return badRequest;
    bare.push(b64);
  }
  return { ok: true, scanId, images: bare };
}

/** Body of the create call. Never a location (latitude/longitude): privacy. */
export function createBody(images: string[]) {
  return { images: images.map((b64) => `${DATA_URL}${b64}`), health: 'all', similar_images: false };
}

/** The create URL, or one identification's URL when `token` is given (escaped: it came from Kindwise). */
export function identificationUrl(base: string, token?: string): string {
  const root = `${base.replace(/\/+$/, '')}/api/v3/identification`;
  if (token !== undefined) return `${root}/${encodeURIComponent(token)}`;
  const query = new URLSearchParams({
    details: 'common_names,description,treatment,url,is_harmful',
    language: 'en',
    async: 'true',
  });
  return `${root}?${query.toString().replace(/%2C/g, ',')}`;
}

// Only an explicit FAILED ends a scan: one unreadable answer is treated as still running.
export function kindwiseStatus(raw: unknown): 'done' | 'running' | 'failed' {
  if (!raw || typeof raw !== 'object') return 'running';
  const { status, completed } = raw as { status?: unknown; completed?: unknown };
  if (status === 'COMPLETED' || (typeof completed === 'number' && status !== 'FAILED')) return 'done';
  if (status === 'FAILED') return 'failed';
  return 'running';
}

// ---- mapping ----

export type Treatment = { prevention: string[]; biological: string[]; chemical: string[] };
export type Species = { name: string; common_names: string[]; probability: number };
export type Disease = {
  id: string;
  name: string;
  common_names: string[];
  probability: number;
  description: string | null;
  treatment: Treatment;
};
export type QuestionOption = { id: string; name: string };
export type Question = { text: string; yes: QuestionOption; no: QuestionOption };
export type Mapped = {
  is_plant: { probability: number; binary: boolean };
  is_healthy: { probability: number; binary: boolean };
  species: Species[];
  diseases: Disease[];
  question: Question | null;
};

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Obj) : {};

const probability = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

const text = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_TEXT) : null;
};

// Kindwise documents strings but its examples send lists: accept both.
const texts = (value: unknown): string[] => {
  const items = Array.isArray(value) ? value : [value];
  return items.map(text).filter((t): t is string => t !== null).slice(0, MAX_LIST);
};

const verdict = (value: unknown) => {
  const v = obj(value);
  return { probability: probability(v.probability), binary: v.binary === true };
};

const suggestions = (value: unknown): Obj[] => {
  const list = obj(value).suggestions;
  return Array.isArray(list) ? list.map(obj) : [];
};

const byProbability = <T extends { probability: number }>(a: T, b: T) => b.probability - a.probability;

function option(value: unknown): QuestionOption | null {
  const o = obj(value);
  const id = text(o.entity_id);
  const name = text(o.name);
  return id && name ? { id, name } : null;
}

function question(value: unknown): Question | null {
  const q = obj(value);
  const questionText = text(q.text);
  const options = obj(q.options);
  const yes = option(options.yes);
  const no = option(options.no);
  return questionText && yes && no ? { text: questionText, yes, no } : null;
}

/** A finished identification → the app's body. Anything missing becomes a safe default. */
export function mapResult(raw: unknown): Mapped {
  const result = obj(obj(raw).result);

  const species = suggestions(result.classification)
    .flatMap((s): Species[] => {
      const name = text(s.name);
      return name
        ? [{ name, common_names: texts(obj(s.details).common_names), probability: probability(s.probability) }]
        : [];
    })
    .sort(byProbability)
    .slice(0, TOP);

  const disease = obj(result.disease);
  const diseases = suggestions(disease)
    .flatMap((s): Disease[] => {
      const details = obj(s.details);
      const id = text(s.id);
      const name = text(s.name);
      // Kindwise classes like "flower buds" are not problems.
      if (!id || !name || details.is_harmful === false) return [];
      const treatment = obj(details.treatment);
      return [{
        id,
        name,
        common_names: texts(details.common_names),
        probability: probability(s.probability),
        description: text(details.description),
        treatment: {
          prevention: texts(treatment.prevention),
          biological: texts(treatment.biological),
          chemical: texts(treatment.chemical),
        },
      }];
    })
    .sort(byProbability)
    .slice(0, TOP);

  return {
    is_plant: verdict(result.is_plant),
    is_healthy: verdict(result.is_healthy),
    species,
    diseases,
    question: question(disease.question ?? result.question),
  };
}
