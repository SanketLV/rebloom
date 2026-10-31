import React from 'react';
import {AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {COLORS, RebloomMark} from './RebloomMark';

// Day 1 → Day 7: the drooping, dry r lifts on a soft spring, overshoots a touch and settles,
// while colour flows up the stem and the leaf turns Lime last.
export const RECOVERY = {start: 24, settled: 200}; // frames where "Day 1" and "Day 7" sit (used by the brand book)

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const flow = Easing.bezier(0.45, 0, 0.25, 1);

export const Recovery: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();

  const lift = spring({frame: frame - RECOVERY.start, fps, config: {damping: 13, stiffness: 60, mass: 1}, durationInFrames: 130});
  const pose = {
    bend: 58 * (1 - lift),
    grow: 0.9 + 0.1 * lift,
    vein: interpolate(lift, [0.35, 1], [0, 1], clamp),
  };

  // mark is 806 units tall; give it 70 % of the frame, centred on its bloom bounding box
  const s = (Math.min(width, height) * 0.7) / 806;
  const ox = width / 2 - 278 * s;
  const oy = height / 2 + 403 * s;

  return (
    <AbsoluteFill style={{backgroundColor: COLORS.olive}}>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
        <g transform={`translate(${ox} ${oy}) scale(${s} ${-s})`}>
          <RebloomMark
            id="rec"
            pose={pose}
            body={{from: COLORS.dryBody, to: COLORS.cream, progress: interpolate(frame, [40, 165], [0, 1.16], {...clamp, easing: flow})}}
            fold={{from: COLORS.dryFold, to: COLORS.lime, progress: interpolate(frame, [86, 196], [0, 1.16], {...clamp, easing: flow})}}
          />
        </g>
      </svg>
    </AbsoluteFill>
  );
};
