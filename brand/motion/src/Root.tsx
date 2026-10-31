import React from 'react';
import {Composition} from 'remotion';
import {Recovery} from './Recovery';
import {Reveal} from './Reveal';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="Recovery" component={Recovery} durationInFrames={270} fps={60} width={1080} height={1080} />
      <Composition
        id="RevealWide"
        component={Reveal}
        durationInFrames={330}
        fps={60}
        width={1920}
        height={1080}
        defaultProps={{logoFraction: 0.5, markFraction: 0.52}}
      />
      <Composition
        id="RevealSquare"
        component={Reveal}
        durationInFrames={330}
        fps={60}
        width={1080}
        height={1080}
        defaultProps={{logoFraction: 0.72, markFraction: 0.5}}
      />
      <Composition
        id="RevealTall"
        component={Reveal}
        durationInFrames={330}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{logoFraction: 0.78, markFraction: 0.5}}
      />
    </>
  );
};
