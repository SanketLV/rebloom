import React from 'react';
import {markPaths, Pose, PIVOT} from './mark';

export const COLORS = {
  olive: '#2E3D28',
  cream: '#FAFAF5',
  lime: '#BFE23A',
  sage: '#A9B887',
  dryBody: '#D6CFBA',
  dryFold: '#9C7A4A',
};

type Sweep = {from: string; to: string; progress: number};

// A colour front that travels along a line: `to` behind it, `from` ahead of it, with a soft edge.
const SweepGradient: React.FC<{id: string; x1: number; y1: number; x2: number; y2: number; sweep: Sweep}> = ({
  id, x1, y1, x2, y2, sweep,
}) => {
  const edge = 0.14;
  const a = Math.min(1, Math.max(0, sweep.progress - edge));
  const b = Math.min(1, Math.max(0, sweep.progress));
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}>
      {/* before the sweep starts there must be no trace of the new colour, not even at offset 0 */}
      <stop offset={0} stopColor={sweep.progress > 0 ? sweep.to : sweep.from} />
      <stop offset={a} stopColor={sweep.progress > 0 ? sweep.to : sweep.from} />
      <stop offset={b} stopColor={sweep.from} />
      <stop offset={1} stopColor={sweep.from} />
    </linearGradient>
  );
};

type Props = {
  pose: Pose;
  body: Sweep; // stem + upper leaf
  fold: Sweep; // lower half of the leaf
  id: string;
};

// Renders in font units (y-up); the parent places it with a transform that flips y.
export const RebloomMark: React.FC<Props> = ({pose, body, fold, id}) => {
  const p = markPaths(pose);
  return (
    <g>
      <defs>
        {/* life flows up from the base of the stem to the leaf tip */}
        <SweepGradient id={`${id}-body`} x1={100} y1={-60} x2={p.tip[0]} y2={p.tip[1]} sweep={body} />
        <SweepGradient id={`${id}-fold`} x1={PIVOT[0]} y1={PIVOT[1] - 80} x2={p.tip[0]} y2={p.tip[1]} sweep={fold} />
      </defs>
      <path d={p.body} fill={`url(#${id}-body)`} fillRule="evenodd" />
      <path d={p.fold} fill={`url(#${id}-fold)`} />
    </g>
  );
};
