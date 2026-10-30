import React from 'react';
import {AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {G} from './geometry';
import {COLORS, RebloomMark} from './RebloomMark';

// Logo reveal: the stem rises, a bud unfurls into the leaf, Lime flows into it,
// then the mark steps aside and "ebloom" sprouts up out of the baseline, letter by letter.
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const inOut = Easing.bezier(0.77, 0, 0.175, 1);
const out = Easing.bezier(0.23, 1, 0.32, 1);

const LOGO_W = G.rAdvance + G.wordWidth - G.stemL; // logotype width in font units
const TOP = 806; // leaf tip
const DESC_SCALE = 0.37;
const DESC_BASE = -420; // descriptor baseline (y-up), 0.42 em under the word
const BOTTOM = DESC_BASE - 0.24 * 1000 * DESC_SCALE; // lowest descender of the descriptor

export const Reveal: React.FC<{logoFraction: number; markFraction: number}> = ({logoFraction, markFraction}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();

  // 1 · the stem rises out of the ground
  const rise = interpolate(frame, [6, 46], [0, 1], {...clamp, easing: out});
  // 2 · a small folded leaf lifts and opens, overshoots a little and settles
  const unfurl = spring({frame: frame - 34, fps, config: {damping: 12, stiffness: 70, mass: 0.9}});
  const pose = {bend: 72 * (1 - unfurl), grow: 0.5 + 0.5 * unfurl, vein: interpolate(unfurl, [0.45, 1], [0, 1], clamp)};
  // 3 · Lime flows from the vein to the tip
  const bloom = interpolate(frame, [92, 160], [0, 1.16], {...clamp, easing: Easing.bezier(0.45, 0, 0.25, 1)});
  // 4 · the mark steps into its place in the word
  const move = interpolate(frame, [150, 212], [0, 1], {...clamp, easing: inOut});

  // start: mark alone, centred. end: logotype (+ descriptor) centred.
  const s0 = (Math.min(width, height) * markFraction) / TOP;
  const s1 = (width * logoFraction) / LOGO_W;
  const x0 = width / 2 - 278 * s0;
  const y0 = height / 2 + 403 * s0;
  const x1 = (width - LOGO_W * s1) / 2 - G.stemL * s1;
  const y1 = height / 2 + ((TOP + BOTTOM) / 2) * s1;
  const s = s0 + (s1 - s0) * move;
  const ox = x0 + (x1 - x0) * move;
  const oy = y0 + (y1 - y0) * move;

  return (
    <AbsoluteFill style={{backgroundColor: COLORS.olive}}>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
        <defs>
          <clipPath id="ground">
            {/* everything grows up out of the baseline */}
            <rect x={-2000} y={-3000} width={9000} height={3000} />
          </clipPath>
          <clipPath id="stem-rise">
            <rect x={-200} y={0} width={1200} height={1000 * rise} />
          </clipPath>
        </defs>
        <g transform={`translate(${ox} ${oy}) scale(${s})`}>
          <g transform="scale(1 -1)" clipPath="url(#stem-rise)">
            <RebloomMark
              id="rev"
              pose={pose}
              body={{from: COLORS.cream, to: COLORS.cream, progress: 1}}
              fold={{from: COLORS.cream, to: COLORS.lime, progress: bloom}}
            />
          </g>
          <g clipPath="url(#ground)">
            {/* glyph outlines already carry their x position inside the word */}
            {G.word.map((g, i) => {
              const grow = spring({frame: frame - 176 - i * 5, fps, config: {damping: 200}, durationInFrames: 42});
              return (
                <path
                  key={i}
                  d={g.d}
                  fill={COLORS.cream}
                  transform={`translate(${G.rAdvance} ${(1 - grow) * 620})`}
                  opacity={interpolate(grow, [0, 0.4], [0, 1], clamp)}
                />
              );
            })}
          </g>
          <path
            d={G.desc}
            fill={COLORS.sage}
            transform={`translate(${G.rAdvance + 30} ${-DESC_BASE + interpolate(frame, [236, 280], [60, 0], {...clamp, easing: out})}) scale(${DESC_SCALE})`}
            opacity={interpolate(frame, [236, 270], [0, 1], clamp)}
          />
        </g>
      </svg>
    </AbsoluteFill>
  );
};
