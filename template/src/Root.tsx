import React from 'react';
import {Composition} from 'remotion';
import {Review} from './Review';
import type {ReviewProps} from './types';
import dep from '../../products/dep-suc-phoi-mau-zutaniq-z4pn/props.json';

export const FPS = 30;

export const Root: React.FC = () => (
  <Composition
    id="Review"
    component={Review}
    width={1080}
    height={1920}
    fps={FPS}
    durationInFrames={FPS * 10}
    defaultProps={dep as ReviewProps}
    calculateMetadata={({props}) => ({
      durationInFrames: props.shots.reduce((sum, s) => sum + Math.round(s.duration * FPS), 0),
    })}
  />
);
