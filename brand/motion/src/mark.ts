// The sprout-r as deformable geometry. Coordinates are Bricolage font units, y-up, baseline 0.
// Instead of rotating a cut-out leaf (which leaves a seam at the bend), every control point of the one
// outline is rotated about the neck by an angle that fades from 0 on the stem to the full angle at the
// tip. The curve bends like a real stem and stays a single, seamless shape at every frame.
import {G} from './geometry';

type Pt = readonly [number, number];
type Cmd = readonly [string, ...Pt[]];

export const PIVOT: Pt = [176, 470]; // where the leaf leaves the stem
export const TIP: Pt = G.tip as unknown as Pt;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// How much a point follows the leaf: its position along the leaf's own axis (base → tip).
// The stem and the base stay anchored, the blade bends more the further out it is.
const AX: Pt = [TIP[0] - PIVOT[0], TIP[1] - PIVOT[1]];
const AX2 = AX[0] * AX[0] + AX[1] * AX[1];
const weight = ([x, y]: Pt) => smooth(0, 0.9, ((x - PIVOT[0]) * AX[0] + (y - PIVOT[1]) * AX[1]) / AX2);

export type Pose = {
  bend: number; // degrees; positive droops the leaf (clockwise on screen)
  grow: number; // leaf size, 1 = as drawn
  vein: number; // 0 = folded shut (wilted / bud), 1 = open
};

export const deformPoint = (p: Pt, {bend, grow}: Pose): Pt => {
  const w = weight(p);
  const k = 1 + (grow - 1) * w;
  const dx = (p[0] - PIVOT[0]) * k;
  const dy = (p[1] - PIVOT[1]) * k;
  const a = (-bend * w * Math.PI) / 180; // y-up: clockwise is negative
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [PIVOT[0] + dx * c - dy * s, PIVOT[1] + dx * s + dy * c];
};

const toD = (cmds: readonly Cmd[], pose: Pose) =>
  cmds
    .map(([k, ...pts]) => k + pts.map((p) => deformPoint(p, pose).map((v) => v.toFixed(2)).join(' ')).join(' '))
    .join(' ');

// The vein's lower side closes onto its upper side as the leaf folds. VEIN = M A, C u1 u2 T, C l1 l2 A, Z.
const veinCmds = (open: number): Cmd[] => {
  const [m, upper, lower, z] = G.vein as unknown as Cmd[];
  const [, u1, u2, t] = upper;
  const [, l1, l2, a] = lower;
  return [m, ['C', u1, u2, t], ['C', lerp(u2, l1, open), lerp(u1, l2, open), a], z];
};

// LOWER starts along the vein's lower side (reversed): keep it glued to the vein.
const lowerCmds = (open: number): Cmd[] => {
  const cmds = [...(G.lower as unknown as Cmd[])];
  const [, u1, u2] = (G.vein as unknown as Cmd[])[1];
  const [, l2, l1, t] = cmds[1];
  cmds[1] = ['C', lerp(u1, l2, open), lerp(u2, l1, open), t];
  return cmds;
};

export const markPaths = (pose: Pose) => ({
  body: `${toD(G.body as unknown as Cmd[], pose)} ${toD(veinCmds(pose.vein), pose)}`,
  fold: toD(lowerCmds(pose.vein), pose),
  tip: deformPoint(TIP, pose),
});

export const BLOOM: Pose = {bend: 0, grow: 1, vein: 1};
