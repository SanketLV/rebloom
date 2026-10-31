// Lengths in code points, so one emoji counts as one and is never split.
// Multi-part emoji (flags, skin tones) can still split at the limit; accepted.
export function charCount(text: string): number {
  return Array.from(text).length;
}

export function limitChars(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max).join('');
}
