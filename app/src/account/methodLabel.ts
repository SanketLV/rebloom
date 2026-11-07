// "Signed in with Google": the method this sign-in used (SessionUser.provider).
const NAMES: Record<string, string> = { email: 'email', google: 'Google', apple: 'Apple' };

export function signedInWith(provider: string | null): string {
  const name = provider && Object.prototype.hasOwnProperty.call(NAMES, provider) ? NAMES[provider] : null;
  return name ? `Signed in with ${name}` : 'Signed in';
}
