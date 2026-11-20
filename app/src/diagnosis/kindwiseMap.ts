// The diagnose function's answer (snake_case JSON) → a Diagnosis. Pure, so every field Kindwise may
// drop or change has a safe default here: missing means "not sure", never confident.

import type {
  Candidate,
  ConditionId,
  Diagnosis,
  Disease,
  KindwiseQuestion,
  Species,
  Treatment,
} from './types';

export const KINDWISE_ID = 'kindwise-v1';
const TOP = 3;

// Kindwise disease names that are one of our care problems, so our 3 questions can re-rank them.
// Kindwise publishes no class list (2026-11-20; its docs say names "can change over time"), and only
// "water deficiency" appears in them. A name here that Kindwise never sends just never matches: the
// disease then keeps Kindwise's own name and our questions don't move it. Confirm against the first
// real answers (device checklist) and add the names they show.
const CONDITION_BY_NAME: Record<string, ConditionId> = {
  'water deficiency': 'underwatering',
  'water excess or uneven watering': 'overwatering',
  overwatering: 'overwatering',
  'root rot': 'root_rot',
  'light deficiency': 'low_light',
  'insufficient light': 'low_light',
  sunburn: 'sunburn',
  'sun scorch': 'sunburn',
  'spider mites': 'spider_mites',
  tetranychidae: 'spider_mites',
};

// review.md: strip invisible characters, trim, compare case- and accent-insensitively.
const normalize = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\p{Cf}\p{Mn}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export function conditionFor(name: string): ConditionId | null {
  return CONDITION_BY_NAME[normalize(name)] ?? null;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const strs = (v: unknown): string[] => list(v).flatMap((s) => (str(s) ? [s as string] : []));
const prob = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;

function option(v: unknown): { id: string; name: string } | null {
  const o = obj(v);
  const id = str(o.id);
  const name = str(o.name);
  return id && name ? { id, name } : null;
}

/** Server or stored question JSON → the question, or null. */
export function questionFrom(v: unknown): KindwiseQuestion | null {
  const q = obj(v);
  const text = str(q.text);
  const yes = option(q.yes);
  const no = option(q.no);
  return text && yes && no ? { text, yes, no } : null;
}

/** Server or stored species JSON (snake_case) → species, most likely first, top 3. */
export function speciesFrom(raw: unknown): Species[] {
  return list(raw)
    .flatMap((s) => {
      const o = obj(s);
      const name = str(o.name);
      return name ? [{ name, commonNames: strs(o.common_names), probability: prob(o.probability) }] : [];
    })
    .sort((a, b) => b.probability - a.probability)
    .slice(0, TOP);
}

export const treatmentOf = (raw: unknown): Treatment => {
  const t = obj(raw);
  return { prevention: strs(t.prevention), biological: strs(t.biological), chemical: strs(t.chemical) };
};

/** Stored treatment JSON (`{ "<disease id>": treatment }`) → the same map, cleaned. */
export function treatmentFrom(raw: unknown): Record<string, Treatment> {
  return Object.fromEntries(Object.entries(obj(raw)).map(([id, t]) => [id, treatmentOf(t)]));
}

export function fromServer(raw: unknown): Diagnosis {
  const body = obj(raw);

  const treatment: Record<string, Treatment> = {};
  const fromKindwise: Candidate[] = list(body.diseases).flatMap((d) => {
    const o = obj(d);
    const id = str(o.id);
    const name = str(o.name);
    if (!id || !name) return [];
    treatment[id] = treatmentOf(o.treatment);
    const disease: Disease = { id, name, commonNames: strs(o.common_names), description: str(o.description) };
    return [{ conditionId: conditionFor(name), confidence: prob(o.probability), disease }];
  });

  const healthy = obj(body.is_healthy);
  let candidates: Candidate[];
  if (healthy.binary === true) {
    candidates = [{ conditionId: 'healthy', confidence: prob(healthy.probability) }];
  } else {
    // Several Kindwise diseases can be one of our conditions: keep the most likely one only.
    // Never add them up: that could lift an unsure result over the low-confidence line (review.md).
    const seen = new Set<ConditionId>();
    candidates = fromKindwise
      .sort((a, b) => b.confidence - a.confidence)
      .filter((c) => {
        if (!c.conditionId) return true;
        if (seen.has(c.conditionId)) return false;
        seen.add(c.conditionId);
        return true;
      });
  }

  const scansLeft = body.scans_left;
  return {
    diagnoserId: KINDWISE_ID,
    candidates: candidates.sort((a, b) => b.confidence - a.confidence).slice(0, TOP),
    species: speciesFrom(body.species),
    question: questionFrom(body.question),
    treatment,
    scansLeft: typeof scansLeft === 'number' && Number.isInteger(scansLeft) && scansLeft >= 0 ? scansLeft : null,
  };
}
