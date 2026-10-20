import type { TextStyle } from 'react-native';

import { fonts } from './fonts';

// The only place hex values live. Source: Notion › Brand & Design (palette F).
export const colors = {
  bg: '#E8E9DF',
  surface: '#FAFAF5',
  text: '#1E2619',
  textSecondary: '#4F5947',
  line: '#D4D7C6',
  primary: '#2E3D28',
  primaryTint: '#A9B887',
  accent: '#5A3E2B',
  accentTint: '#F2DFC2',
  // Wins only. Never text on a light background.
  reward: '#BFE23A',
  healthy: '#2F7041',
  healthyBg: '#DCEBD9',
  warning: '#8A5600',
  warningBg: '#F6E3BD',
  severe: '#A8261E',
  severeBg: '#F7DEDA',
} as const;

export const radius = { sm: 14, md: 20, lg: 24, pill: 999 } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

// Sizes taken from the "10 Today" artboard.
export const type = {
  screenTitle: { fontFamily: fonts.display700, fontSize: 36, lineHeight: 40 },
  section: { fontFamily: fonts.body700, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: fonts.body400, fontSize: 16, lineHeight: 22 },
  caption: { fontFamily: fonts.body400, fontSize: 14, lineHeight: 19 },
  tabLabel: { fontFamily: fonts.body600, fontSize: 12, lineHeight: 16 },
  tabLabelActive: { fontFamily: fonts.body800, fontSize: 12, lineHeight: 16 },
} as const satisfies Record<string, TextStyle>;

// Minimum touch target (Apple HIG / Material).
export const touchTarget = 44;
