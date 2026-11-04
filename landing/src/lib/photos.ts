// Widths of each photo's versions; the last is the original (smaller ones: scripts/make-photo-variants.py).
export const PHOTO_WIDTHS = [480, 720, 896];
export const RECOVERY_WIDTHS = [480, 600, 880];

export const srcSetFor = (photo: string, widths = PHOTO_WIDTHS) => widths
  .map((w, i) => `${i === widths.length - 1 ? photo : photo.replace(/\.webp$/, `-${w}.webp`)} ${w}w`)
  .join(', ');
