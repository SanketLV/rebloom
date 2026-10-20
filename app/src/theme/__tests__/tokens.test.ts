import { colors } from '../tokens';

// Brand & Design (Notion), palette F · Sage, Walnut & Lime.
test('colors match the brand palette exactly', () => {
  expect(colors).toEqual({
    bg: '#E8E9DF',
    surface: '#FAFAF5',
    text: '#1E2619',
    textSecondary: '#4F5947',
    line: '#D4D7C6',
    primary: '#2E3D28',
    primaryTint: '#A9B887',
    accent: '#5A3E2B',
    accentTint: '#F2DFC2',
    reward: '#BFE23A',
    healthy: '#2F7041',
    healthyBg: '#DCEBD9',
    warning: '#8A5600',
    warningBg: '#F6E3BD',
    severe: '#A8261E',
    severeBg: '#F7DEDA',
  });
});
