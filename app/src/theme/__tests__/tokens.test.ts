import { cameraColors, colors, scrim } from '../tokens';

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
    // Scan artboards (Questions, Result, sheets).
    onPrimary: '#FFFFFF',
    disabled: '#C9CDBD',
    controlBorder: '#8C9482',
    photoBg: '#CFC8B6',
  });
});

// Camera and Analyzing artboards: the dark viewfinder screens.
test('camera colors match the Camera and Analyzing artboards', () => {
  expect(cameraColors).toEqual({
    ground: '#0F140F',
    text: '#F3F4EC',
    caption: '#AEB8A4',
    preview: '#3D4A34',
    analyzing: '#2C3726',
    button: '#1E2A1C',
    buttonIcon: '#D3D9C8',
    overlay: 'rgba(15,20,15,0.6)',
  });
});

test('sheets dim the screen behind them with the artboard scrim', () => {
  expect(scrim).toBe('rgba(15,20,15,0.55)');
});
