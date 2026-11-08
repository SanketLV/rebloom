// All onboarding photos are 832×1792.
const RATIO = 832 / 1792;

// Cover sizing, moved up by `focus` (a share of the photo's height), because the
// photos' subjects sit low and the text would otherwise cover them.
export function photoFrame(screen: { width: number; height: number }, focus: number) {
  const height = Math.max(screen.height, screen.width / RATIO);
  const width = height * RATIO;
  return {
    width,
    height,
    left: (screen.width - width) / 2,
    top: (screen.height - height) / 2 - focus * height,
  };
}
